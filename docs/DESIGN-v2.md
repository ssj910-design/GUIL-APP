# 구일엘리베이터 현장관리 앱 — v2 설계서 (우리 설계)

작성: 2026-07-15 · 작성자: 차씨 + Claude
기준 문서: HANDOVER.md (2026-07-15, 친구 클로드코드 작성)

> 이 문서의 목적: 인수인계 받은 현행 앱을 v2 구조로 개조하기 위한 설계 기준.
> 결정이 바뀌면 이 문서를 먼저 고치고, 코드는 문서를 따라간다.

---

## 1. 현재 상태 요약 (HANDOVER 기준)

- 스택: Next.js 16 + React 19 + Tailwind v4 + Supabase (별도 백엔드 서버 없음)
- 코드: `app/components/ElevatorFieldApp.jsx` 단일 파일 5,300줄+
- 배포: GitHub(ssj910-design/GUIL-APP) main 푸시 → Vercel 자동 배포
- DB: Supabase (ref: kdptzotxnzpuwzdguzgh), 마이그레이션 도구 없음 → SQL Editor에서 직접 실행
- 로그인: 구현돼 있으나 꺼짐 (`SKIP_LOGIN = true`), RLS 전부 꺼짐
- 시뮬레이션 상태: 사진 업로드(개수만 카운트), SMS 발송(콘솔 로그)

### 현행 구조의 핵심 문제 3가지
1. **units(호기) 테이블 없음** — sites.unit_count 숫자 + gov_elevator_nos 배열로 때움.
   모든 기록이 elevator_no 텍스트("1-1")를 들고 다님. 호기별 모델/설치일 관리 불가.
2. **이름(텍스트)으로 연결** — assignee, assigned_engineer, site_name 복사 저장.
   billings/restock_requests는 site_id조차 없음. 이름 바뀌면/동명이인이면 연결 깨짐.
3. **계산값을 수동 저장** — failures_30d (30일 고장횟수). 자동 갱신 안 됨.

---

## 2. 설계 원칙

1. **마스터와 기록을 구분한다.** 마스터(sites, units, profiles)는 잘 안 바뀌는 기본 정보,
   기록(failures 등)은 매일 쌓이는 사건. 기록은 마스터를 베끼지 않고 가리킨다.
2. **연결은 항상 id(FK)로.** 이름·라벨 텍스트 복사 저장 금지.
   `_id`로 끝나는 컬럼 = 다른 테이블로 가는 링크.
3. **계산하면 나오는 값은 저장하지 않는다.** 고장횟수, 호기 수 등은 COUNT로 계산.
4. **삭제하지 않고 끈다.** 마스터에는 is_active를 두고, 과거 기록 보존을 위해 soft delete.
5. **PK는 uuid.** Supabase 기본 `gen_random_uuid()` 사용.

### 역할 체계
- 현행: `admin`(관리자) / `engineer`(기사) — profiles.role
- 향후: `customer`(건물주/고객) 추가 예정. v2 스키마는 이를 수용 가능하게 설계.

---

## 3. v2 목표 스키마

### 마스터

```
profiles (직원 계정) — 현행 유지 + 보강
├─ id         uuid PK → auth.users FK
├─ name, phone, email
├─ role       'admin' | 'engineer'   (향후 'customer')
├─ department 부서 (신규 — 점검/통계 필터는 기사를 타고 부서 조회)
├─ region     담당 지역 (기사용, 신규)
├─ is_active  boolean (신규)
└─ created_at

sites (현장 마스터) — 승강기 정보 전부 제거, 순수 건물 정보만
├─ id             uuid PK
├─ name           현장명
├─ address        주소
├─ contract_type  'POG' | 'FM'
├─ manager_id     → profiles FK (사무실 담당자, 신규)
├─ notes          비고
├─ is_active      boolean
└─ created_at
   ✂ 삭제: elevator_model, unit_count, gov_elevator_nos, elevator_no,
     assigned_engineer, failures_30d, site_code, region, phone,
     manager, manager_phone, overdue_long, overdue_total, gov_elevator_no

units (호기 = 승강기 1대) ★ 신설
├─ id           uuid PK
├─ site_id      → sites FK
├─ unit_no      호기명 '1호기' (라벨은 여기서만 관리)
├─ unit_type    '엘리베이터' | '에스컬레이터' | '휠체어리프트' | '카리프트'
├─ model        모델명 (호기별)
├─ install_date 설치일
├─ gov_no       승강기고유번호 (국가승강기정보센터 API 키값)
├─ is_active    boolean
└─ created_at

site_assignments (현장-기사 배정, N:M) ★ 신설
├─ id PK
├─ site_id  → sites FK
├─ tech_id  → profiles FK
└─ is_lead  boolean (주담당)

site_contacts (현장 연락처) — 현행 site_managers 확장/개명
├─ id PK
├─ site_id → sites FK
├─ name, phone, email, fax
├─ role       '건물주' | '관리소장' | '경비실' 등 (신규)
├─ is_primary boolean (신규)
└─ profile_id → profiles FK, null 허용 (신규)
   ※ Phase 3 고객 로그인 대비: 이 연락처가 계정을 만들면 여기 연결.
     고객의 "내 건물" = site_contacts에서 profile_id가 본인인 현장.
```

### 기록 — 전부 unit_id에 매달림

```
failures (고장접수)
├─ id uuid PK
├─ unit_id      → units FK  (site_id + site_name + elevator_no 대체)
├─ symptom      고장구분 / symptom_detail 상세내역
├─ status       '미처리' | '진행중' | '완료' (현행 유지)
├─ assignee_id  → profiles FK (null = 미배정)
├─ escalation   '지원요청' | '운행정지' | null
├─ not_fault    boolean, reporter_phone, eta_minutes
├─ reported_at, dispatched_at, arrived_at, completed_at
├─ fault_cause, process_content, process_result, process_note
├─ photos       text[] (Storage URL 배열 — photo_count 대체)
└─ created_by   → profiles FK (접수자)

inspections (검사 수기입력)
├─ id PK, unit_id → units FK
├─ type, org, due_date
├─ result 'pass' | 'conditional' | 'fail'
└─ notes, created_at
   ※ gov_no 있는 호기는 공단 실시간 API 우선 (현행 fallback 유지)

self_checks (자체점검 — 월별 출석부) ★ 신설, 7-3 참고
├─ id PK
├─ unit_id      → units FK
├─ ym           점검 년월 '2026-07' — unique(unit_id, ym), 호기당 월 1건
├─ assignee_id  → profiles FK
├─ planned_date 예정일 (선택)
├─ done_date    완료일
├─ status       '예정' | '완료' | '누락'
└─ photos text[], notes

material_requests (자재신청)
├─ id PK, unit_id → units FK
├─ requester_id → profiles FK (engineer 이름 대체)
├─ part, urgency, note, photos text[]
├─ status, requested_date, supplied_date
└─ reject_reason, rejected_date

quote_requests (견적요청)
├─ id PK, unit_id → units FK
├─ requester_id → profiles FK
├─ construction_type, contact_phone, note, photos text[]
└─ status, requested_date, quote_issued_date, approved_date, supplied_date

todos (할일)
├─ id PK
├─ material_request_id FK / quote_request_id FK
├─ source 'material' | 'quote' | 'manual'
├─ title, part  (site_name·elevator_no 복사 삭제 — FK 타고 조회)
├─ assignee_id → profiles FK (여러 명 배정 = 사람 수만큼 줄 생성)
├─ assigned_date, due_date, done
└─ photos text[], created_at

billings (비용청구)
├─ id PK
├─ unit_id → units FK ✓ (site_name만 있던 것 수리)
├─ type 'material' | 'manual'
├─ material_request_id FK (자재 지급건 기반일 때, 신규)
├─ part, cost, replace_date, contact_phone
├─ engineer_id → profiles FK
└─ submitted_at

restock_requests (상비부품 보충)
├─ id PK
├─ engineer_id → profiles FK ✓
├─ part, status '대기' | '완료'
└─ requested_date, supplied_date

feed_posts (우리방)
└─ id PK, author_id → profiles FK, body, created_at

✂ engineers 테이블 삭제 (레거시, 미사용)
```

---

## 4. 현행 → v2 변경 매핑

| 현행 | v2 | 방법 |
|---|---|---|
| sites.unit_count + gov_elevator_nos[] | units 테이블 N줄 | 배열 순서대로 '1호기','2호기'... 생성, gov_no 채움 |
| 기록.elevator_no "1-1" 텍스트 | 기록.unit_id FK | "1-1" = 1번째 현장 첫 호기 규칙으로 매칭 스크립트 |
| 기록.site_id + site_name | unit_id 하나로 통합 | unit → site 경유 조회 |
| assignee / engineer / author (이름) | *_id → profiles FK | 이름 → profiles.name 매칭 (동명이인 수동 확인) |
| sites.assigned_engineer (이름 1명) | site_assignments N:M | 기존 값을 is_lead=true 1줄로 이관 |
| site_managers | site_contacts | 테이블 개명 + role, is_primary 컬럼 추가 |
| sites.failures_30d (수동) | 저장 안 함 | 화면에서 failures COUNT 쿼리로 계산 |
| photo_count (개수) | photos text[] | Supabase Storage 연동 후 실제 업로드 |
| billings.site_name | billings.unit_id | site_name → site → unit 매칭 (호기 불명건은 수동 지정) |
| engineers 테이블 | 삭제 | 마지막 단계에서 DROP |

---

## 5. 이행(마이그레이션) 순서 — 반드시 이 순서로

이미 실데이터가 있는 DB의 개조이므로 순서가 틀리면 기존 이력이 미아가 된다.

1. **백업**: Supabase 대시보드에서 전체 백업(또는 각 테이블 CSV 내보내기).
2. **units 생성 + 채우기**: 테이블 만들고, sites의 unit_count/gov_elevator_nos로 데이터 생성.
3. **기록 테이블에 unit_id 컬럼 추가** (기존 컬럼은 아직 유지 — 병행 기간).
4. **변환 스크립트**: elevator_no 텍스트 → unit_id 매칭해서 채움. 매칭 실패 건 목록 뽑아 수동 처리.
5. **이름 → id 변환**: assignee 등 이름 컬럼 → *_id 채움.
6. **앱 코드 수정**: ElevatorFieldApp.jsx가 새 컬럼을 읽고 쓰도록 변경. 배포 후 동작 확인.
7. **옛 컬럼/테이블 제거**: 충분히 검증한 뒤 elevator_no, site_name, 이름 컬럼, engineers 등 DROP.
8. 각 단계 사이에 `npm run build` + 실제 화면 확인.

---

## 6. 화면(폼)에 미치는 영향

- **현장 등록 폼**: 현재 대수만 입력 → v2에서는 호기별 입력줄 (호기명/종류/모델/고유번호).
  또는 현장 저장 → 호기 개별 추가 2단계 방식. ★현행 버그: 대수 3이어도 고유번호 입력칸 1개.
- **현장 등록 자동화 (공단 API)**: 주소 입력 → 건물별승강기정보 API → 그 건물의 승강기
  목록(고유번호·검사유효기간) 표시 → 관리자가 계약 대상 호기만 체크 → units 자동 생성.
  호기별로 승강기설치정보 API 추가 호출 시 모델명·설치일자도 자동 입력.
  주의: ① 전부 자동등록이 아니라 "체크 선택" 단계 필수 (계약 외 호기 제외)
       ② 주소 미매칭/API 장애 대비 수기입력 fallback 유지 (현행 검사 쪽과 같은 패턴)
- **마스터 초기 구축**: 공단 국가승강기정보센터 업체계정에서 담당 승강기 목록(엑셀)
  다운로드 → 일괄 임포트 스크립트로 sites + units 최초 생성 (수기입력 불필요).
  이후 신규 계약 건만 위 API 자동 등록 사용.
- **고장접수 폼**: 호기 선택이 "1-1" 라벨 생성 방식 → units 테이블에서 실제 호기 선택.
- **홈 집중관리**: failures_30d 수동값 → 최근 30일 failures COUNT 자동 계산.
- **기사 배정 드롭다운**: 이름 문자열 → profiles 목록에서 선택, assignee_id 저장.
- **승강기 상세 화면**: 호기별 모델/설치일/이력 표시 가능해짐 (현재는 현장 공통값뿐).

---

## 7. 핵심 유저플로우 — 고장 처리 (역할 스윔레인)

```
고객/건물주 : 고장 신고 (전화·문자)
관리자     : 접수 등록          → failures INSERT (status=미처리)
관리자     : 기사 배정          → assignee_id 채움 → 기사에게 알림
기사       : 출동 (ETA 입력)    → dispatched_at, eta_minutes → 고객 SMS
기사       : 도착              → arrived_at
기사       : 처리 등록          → 원인/내용/사진 → status=완료, completed_at
관리자     : 처리 확인 → 비용청구 → billings 생성 (자재 사용 시 연결)
고객/건물주 : 완료 안내 수신
```

각 탭 = 같은 failures 테이블의 status 필터 뷰:
접수등록(INSERT) / 미배정(assignee_id IS NULL) / 처리등록(진행중) / 처리현황(전체)

## 7-2. 자재 루프 — 자재 로스 방지 로직

목적: 지급된 자재는 반드시 비용청구로 끝나야 한다. 안 닫힌 루프 = 로스 후보.

```
기사: 자재신청 (호기 지정)         → material_requests 생성 (unit_id 포함)
관리자: 지급완료                   → status 변경 + todos 자동생성 (assignee=신청 기사)
기사: 교체 작업 후 비용청구         → billings 생성, material_request_id 연결 필수
시스템: 청구 생성 시 해당 todo 자동완료 (done=true — 삭제 아님, 기록 보존)
로스 리포트 = "지급 후 N일 지난 미완료 todo" 필터 (별도 테이블 불필요)
```

규칙:
1. todo는 삭제하지 않고 완료 처리한다 (추적 기록 보존 — 설계 원칙 4).
2. 루프는 이름이 아니라 FK로 닫는다: billings.material_request_id가 심장.
3. 우회 금지: 지급받은 자재의 청구는 반드시 "내 지급완료 목록에서 선택"으로 시작.
   billings type='manual'(직접 입력)은 상비부품·기타 전용.
4. 완료 권한 (source별):
   - source='material'/'quote' → 수동 완료 불가 (완료 버튼 없음).
     비용청구 생성이 유일한 완료 경로 = 자동완료.
   - source='manual' (관리자 부여 할일) → 담당자가 직접 완료 체크 가능.
5. 호기 이력: 자재신청의 unit_id를 타고 "이 호기의 부품교체내역+원가"가 자동 완성.
   (견적요청→할일도 동일 패턴)

---

## 7-3. 정기점검 — 월별 출석부 모델

자체점검은 법정 월 1회 의무 → 일정을 사람이 등록하는 게 아니라 시스템이 만든다.

```
매월 1일: 활성 호기 전체에 대해 self_checks 줄 자동 생성 (출석부 인쇄)
기사:    내 목록에서 [완료 처리] — 이때 사진·특이사항 입력
월말:    status='예정'으로 남은 줄 = 누락 명단 (자동)
```

이월 규칙:
- "오늘 목록" = 예정일이 오늘이거나 지났는데 아직 완료 안 된 것.
  못 한 점검은 완료될 때까지 지연 뱃지(D+n) 달고 자동으로 다음 날 목록 상단에 남음
  (별도 이월 로직 불필요 — 상태 기반이라 공짜).
- 월말 누락 확정: 해당 월 안에 완료 못 한 건은 다음 달로 이월하지 않고
  status='누락'으로 박제 (법정 월 1회 — 8월에 2번 해도 7월 누락은 누락).
  다음 달 1일에 새 출석부가 별도 생성. 누락 건은 관리자 리포트(부서별 누락률)에 표시.

화면 단순화 (현행 달력/계획/처리 3탭 → 목록 1개):
- 기사: "7월 점검 — 완료 12 / 남음 8" 진행바 + 목록 (남은 것 위). 필터 없음.
- 관리자: 같은 목록 + 필터 2개(부서 → 담당자), 부서별 진행률 표시.
  달력은 보조 뷰로 강등 (예정일 잡힌 건 표시).
- 예정일 지정은 선택사항 (계획과 결과 입력 분리 — 현행 모달은 혼합되어 있음)

현행 문제: 수동 일정 등록(안 만든 점검은 누락 감지 불가), 달력에 표시 없음,
등록 모달에 계획+결과 혼합, 필터 4종 과잉, 통계 중복, 처리 탭 기본 필터로 빈 화면.

Phase 2+: 공단 자체점검결과 API와 월별 대조 → "앱 완료 but 공단 등록 누락" 자동 감지.

## 8. 페이즈 로드맵

- **Phase 1 — 구조 개조 (v2)**: 이 문서 3~6번 실행. 직원용 기능은 현행 유지.
- **Phase 2 — 보안/실기능 전환**:
  - [ ] `SKIP_LOGIN = false` 로 로그인 활성화
  - [ ] 모든 테이블 RLS 켜기 + 3단 정책 작성:
        admin=전체 / engineer=배정 현장만 / customer=site_contacts.profile_id 연결 현장만
        (customer 기능은 Phase 3이지만 정책은 지금 3단으로 — 나중에 보안 재작업 방지)
  - [ ] role 기반 필터가 클라이언트에만 있음 → RLS로 서버 강제
  - [ ] 사진 업로드: Supabase Storage 버킷 + 접근 정책 (photos text[] 활용)
  - [ ] SMS: 실제 발송 연동 (현재 시뮬레이션)
- **Phase 3 — 고객(건물주) 진입**:
  - profiles.role에 'customer' 사용 시작, 계정 생성 → site_contacts.profile_id 연결
  - 고객 직접 고장 신고 (failures.created_by가 고객 계정)
  - 내 건물 처리현황/이력 조회 (RLS가 Phase 2에서 이미 준비됨)
  - 처리 완료 알림 (SMS 또는 앱 내)
  - 구조는 Phase 1~2에서 전부 준비되므로 이 단계는 화면 추가만.

---

## 9. 미결정 사항 (차씨 확인 필요)

- [ ] status 값: '미처리/진행중/완료' 현행 유지로 가정 — 실무 용어와 맞는지
- [ ] todos 여러 명 배정: 사람 수만큼 줄 생성(각자 완료 체크) 방식 — 업무와 맞는지
- [ ] site_contacts: 현장당 연락처가 실제로 여러 명인 경우가 흔한지
- [x] customer 역할: 구조만 Phase 1에 포함(site_contacts.profile_id), 기능은 Phase 3 (8번 참고)
- [ ] 실제 관리 현장 수 (샘플 720개는 임의값)
- [ ] 자재 수량(quantity) 개념 필요 여부 — "도어슈 5개 지급, 3개 사용" 추적이 필요하면
      material_requests·billings에 quantity 컬럼 추가, "1건=1작업"이면 불필요
- [ ] 기사 실시간 위치/자동 배정: v3 후보

## 10. 용어 정리 (배운 것)

- **PK** 기본키: 각 줄의 고유번호. **uuid**: 랜덤 방식 고유번호.
- **FK** 외래키: 다른 테이블의 PK를 가리키는 컬럼 (`_id`로 끝남).
- **정규화**: 같은 값을 두 곳에 저장하지 않기. 베끼지 말고 가리키기.
- **연결 테이블(N:M)**: 여러↔여러 관계를 잇는 얇은 테이블 (예: site_assignments).
- **RLS**: DB가 직접 "누가 어느 줄을 볼 수 있나"를 강제하는 Supabase 보안 장치.
- **soft delete**: 지우지 않고 is_active=false로 숨기기.

---

## 11. v2.1 보완 — 마이그레이션 준비 중 확정된 결정 (2026-07-15)

실DB 조사(GUIL-APP `supabase/MIGRATION.md` 참고) 결과를 반영한 수정. 위 3장 스키마와 다른 부분은 이 장이 우선한다.

1. **profiles ↔ auth 분리**: profiles.id는 자체 uuid PK로 전환, 로그인 계정 연결은
   별도 `auth_user_id`(→auth.users, null 허용) 컬럼. 이유: 계정 없는 기사(김기사 등)도
   프로필 행이 있어야 기록의 이름 컬럼을 FK로 바꿀 수 있음. 가입 트리거는 "같은 이름의
   미연결 프로필이 있으면 연결, 없으면 생성"으로 갱신. **Phase 2 로그인 활성화 시
   앱은 auth_user_id로 프로필을 조회해야 함(주의).**
2. **사진 마이그레이션 불필요**: 실DB에 photo_urls(배열)·supply_photo_url(s)·
   before/after/confirm_photo_url이 이미 존재하고 실제 Storage 업로드 동작 중
   (전임자 2026-07-15 구현). 3장의 `photos text[]` 신설 대신 기존 컬럼명 유지.
   Phase 2의 "사진 업로드" 항목은 사실상 완료됨 → 버킷 접근 정책만 남음.
3. **컬럼 개명 안 함**: arrival_time→arrived_at, error_code→symptom/symptom_detail 등
   이름 변경은 하지 않는다. 매퍼(lib/mappers.js)가 이름 차이를 흡수 — 실DB에는 이미
   fault_symptom·fault_error_code가 별도 존재하므로 그대로 활용.
4. **uuid PK는 신설 테이블만** (units, site_assignments, self_checks). 기존 테이블의
   text PK는 유지 — 전환 비용 대비 이득 없음.
5. **todos.unit_id 추가 (null 허용)**: 관리자가 직접 부여하는 manual 할일도 현장을
   연결할 수 있게. 원천(자재/견적) 있는 할일은 원천에서 상속.
6. **units.seq(순번) 컬럼**: 호기 라벨 변환·정렬 기준. 실DB 라벨이 '1-N'과 'N호기'
   두 형식 혼재 → 둘 다 seq로 변환.
7. **'관리자' 이름 병합**: 기록의 '관리자'는 개발용 가짜 프로필 이름 → '관리자(신석주)'
   프로필로 매핑.
8. **동명 현장 주의**: '동일빌딩'이 2곳(양재/은평) — site_name 기반 자동매칭은
   이름이 유일한 현장만 수행, 나머지는 수동 지정.
9. **site_managers → site_contacts 개명은 마지막(007)에**: 병행 기간에는 배포된
   기존 앱이 site_managers를 읽으므로 컬럼(role, is_primary, profile_id)만 먼저 추가.

마이그레이션 SQL: GUIL-APP 리포 `supabase/migrations/001~007` (실행 가이드: `supabase/MIGRATION.md`)
