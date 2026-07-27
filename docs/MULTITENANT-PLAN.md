# 멀티테넌트(타사 입주) + QA 더미업체 — 계획 (2026-07-27)

> 구현 아님. "타사가 들어오면 데이터가 어떻게 분리되나"에 대한 설계와 단계.
> 관련 메모리: super-admin-design(플랫폼 운영자 콘솔), excel-matching-upload-design(온보딩 업로드).

## 1. 지금 상태 = 단일 테넌트(구일엘리베이터 전용)
- 모든 테이블에 회사 구분 컬럼이 없다. profiles·sites·units·failures… 전부 "구일" 데이터라고 암묵 가정.
- 역할 분리(admin/engineer)만 있고 **회사 분리는 없음**. 타사 직원을 그냥 추가하면 서로의 현장·고장·기사가 다 섞여 보인다. → 그대로 타사를 넣으면 안 됨.

## 2. 핵심 결정 — 어떻게 분리할까
**tenant_id(회사 id) 한 개를 모든 최상위 테이블에 붙인다.** (= 표준 멀티테넌트)
- 새 테이블 `tenants(id, name, is_demo, created_at, …)`.
- `profiles`, `sites`, `units`, `failures`, `inspections`, `material_requests`, `quote_requests`, `billings`, `todos`, `restock_requests`, `feed_posts`, `duty_schedules`, `self_checks` 등에 `tenant_id` 추가.
- 로그인하면 그 사람의 `profiles.tenant_id`를 세션에 담고, **모든 조회를 tenant_id로 필터**한다.

**격리 수준 2안:**
- (A, 지금 앱과 같은 수준) 클라이언트에서 tenant_id로 스코프. RLS 여전히 off. 빠르지만 "화면 분리"일 뿐 — anon 키로 남의 회사 데이터에 접근 가능.
- (B, 제대로) RLS on + tenant 정책. 타사 데이터가 진짜 격리됨. 단 지금 앱이 anon 키로 전 테이블 접근하는 구조라 **RLS 켜면 대량 재작업**. 로그인(login_id) 깔아둔 게 그 전제.
→ **추천**: 타사 실입주 전까진 A로 만들고, 실입주 시점에 B로 승격. 단 처음부터 tenant_id는 다 넣어둔다(나중에 컬럼 추가가 제일 아픔).

**이미 깔아둔 유리한 것**: 로그인을 minwon_id가 아니라 `login_id`로 분리해둠 → 타사 직원은 민원24 체계와 무관하게 로그인 가능. login_id 유일성은 나중에 **테넌트별 유일**로 바꾼다(`unique(tenant_id, login_id)`).

## 3. QA 더미업체 (테스트 전용 테넌트)
목적: 실운영(구일) 데이터를 안 건드리고 로그인·고장·자재·비용청구·검사 전 기능을 마음껏 테스트.
- `tenants`에 `is_demo=true`인 "테스트유지보수(주)" 한 개.
- 그 밑에 더미 기사 몇 명(login_id 예: `qa1`/1234), 더미 현장 5~10개, 더미 호기, 샘플 고장·자재·청구.
- QA 계정으로 로그인하면 **그 테넌트 데이터만** 보임 → 실데이터와 완전 분리. 지금처럼 매번 더미 만들고 지우는 수고가 사라짐.
- 배포본에서도 안전(is_demo 테넌트라 실업체 목록/집계에서 제외). 슈퍼관리자 콘솔에서 데모 테넌트는 숨김 처리.
- **멀티테넌트의 첫 실사용처가 곧 QA 업체** — 타사 입주 전에 이걸로 격리를 실검증하는 셈이라 일석이조.

## 4. 단계 (큰 작업, 순서대로)
- **Phase 0 (준비, 지금 해둬도 무해)**: `tenants` 테이블 + 모든 최상위 테이블에 `tenant_id` 컬럼 추가(nullable). 기존 데이터는 전부 "구일" 테넌트 id로 백필. 앱은 아직 tenant_id 안 봐도 동작(단일 테넌트라 결과 동일).
- **Phase 1 (스코프 적용)**: loadData가 로그인 사용자의 tenant_id로 전 조회를 필터. 세션에 tenant_id 추가. 여기서부터 QA 더미업체 생성 가능.
- **Phase 2 (온보딩)**: 슈퍼관리자 콘솔(super-admin-design 메모)에서 새 테넌트 생성 + 기사/현장 업로드(excel-matching-upload-design 메모). 로그인은 login_id를 `unique(tenant_id, login_id)`로.
- **Phase 3 (진짜 격리)**: RLS on + tenant 정책. anon 키 접근을 테넌트로 제한. 앱을 authenticated 세션(현재 커스텀 세션 → 서버 검증 세션/JWT)로 승격 필요.

## 5. 지금 당장 vs 나중
- **지금 당장 할 필요 없음.** 타사 실입주 일정이 잡히면 Phase 0부터.
- 단 **새 테이블·컬럼을 만들 때 tenant_id를 습관적으로 같이 넣기 시작**하면 나중 마이그레이션이 훨씬 쉬워짐.
- QA 더미업체가 필요해지면 Phase 0+1만 먼저 해도 큰 효용(테스트 격리). 반나절~하루 규모.

## 6. 리스크
- 컬럼을 나중에 일괄 추가하는 게 제일 위험·번거로움 → Phase 0을 되도록 빨리.
- 지금 코드 곳곳이 "전체가 곧 구일"을 가정(예: `sites` 전체 로드). tenant 필터 누락 한 곳이 곧 데이터 유출 → Phase 1에서 loadData 한 곳으로 조회를 모으면 실수 줄어듦.
- 로그인 세션이 지금은 localStorage 소프트 세션 → Phase 3 RLS 격리엔 서버 검증 세션이 필요(로그인 3단계 이후 과제).
