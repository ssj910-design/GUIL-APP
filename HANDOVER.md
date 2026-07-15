# 구일엘리베이터(주) 현장관리 앱 — 인수인계 문서

작성일: 2026-07-15

---

## 1. 프로젝트 개요

**구일엘리베이터(주)**의 승강기 유지보수 기사·관리자를 위한 현장관리 웹앱(PWA)입니다. 모바일 브라우저에서 "앱처럼" 쓸 수 있도록 만들어졌고(홈 화면 추가 가능), 관리자와 현장 기사가 같은 앱을 역할에 따라 다르게 봅니다.

### 주요 기능

| 영역 | 내용 |
|---|---|
| 홈 | 내 담당(또는 미배정) 고장 처리 현황, 집중 관리 현장(고장 3회 이상/지원요청/운행정지), 국가승강기정보센터 실시간 검사 현황 |
| 현장관리 | 담당 현장 목록/상세, 승강기(호기)별 상세정보·고장이력·검사이력·부품교체내역, 담당자(보수업체) 여러 명 등록 |
| 고장접수 | 접수등록 → 미배정/처리등록에서 배정·출동·도착·처리결과(처리완료 시 원인/처리내용/비고/사진) 입력, 고객 도착예정시간 SMS 발송 시뮬레이션, 처리현황 조회 |
| 정기점검·검사관리 | 검사도래현장(60일 이내)/조건부·불합격 현장 관리, **국가승강기정보센터 Open API 연동**으로 승강기고유번호가 등록된 현장은 실시간 판정결과·부적합 상세 항목 자동 조회, 미등록 현장은 수기입력 병행 |
| 자재·견적 | 자재 신청(호기 지정)→관리자 지급완료→기사 확인, 견적 신청, 상비부품 보충요청 |
| 비용청구 | 자재 지급건 기반 청구 또는 직접 입력(상비부품 사용 포함), 호기별로 구분 |
| 할일관리 | 자재 지급/견적 완료 시 자동 생성되는 할일 + 관리자가 직접 부여하는 할일(여러 명에게 동시 배정 가능) |
| 우리방 | 기사들끼리 공유하는 간단한 피드/채팅 |
| 관리자 모드 | 관리자 계정에만 보이는 별도 하단 탭: 현장관리(현장 등록/수정/삭제/담당기사 배정/담당자 관리), 기사관리(기사별 연락처 등록), 자재/견적/할일/비용청구 관리 전체 |

### 특징 / 설계 원칙
- **역할 기반 화면 분리**: `role`이 `admin`이면 전체 현장/데이터, `engineer`면 본인 배정 현장·업무만 보임.
- **호기(승강기 1대) 단위 데이터 분리**: 고장, 검사, 부품교체 이력이 현장 단위가 아니라 승강기 1대(호기) 단위로 구분됨.
- **국가승강기정보센터 실시간 연동**: 현장마다 실제 정부 발급 승강기고유번호를 등록하면, 그 승강기의 검사판정결과·부적합 상세 항목을 실시간으로 가져옴. 미등록 시 기존 수기입력 방식으로 자동 대체(fallback).
- **시뮬레이션 요소**: 사진 첨부는 실제 업로드가 아니라 개수만 세는 방식, SMS 발송은 콘솔 로그 + 화면 토스트로 시뮬레이션(실제 문자 발송 아님).

---

## 2. 기술 스택

| 항목 | 내용 |
|---|---|
| 프레임워크 | **Next.js 16.2.10** (App Router, `next dev`/`next build`는 Turbopack 사용) — ⚠️ 최신 메이저 버전이라 이전 Next.js 지식과 다른 부분이 있음(`node_modules/next/dist/docs/` 참고) |
| 언어 | JavaScript (TypeScript 아님, `jsconfig.json`만 있음) |
| UI | React 19.2.4, Tailwind CSS v4 (`@tailwindcss/postcss`), 아이콘은 `lucide-react` |
| 백엔드/DB | Supabase (PostgreSQL + PostgREST + Auth), 클라이언트에서 `@supabase/supabase-js` v2로 직접 REST 호출 (별도 백엔드 서버 없음) |
| 외부 API | 공공데이터포털 국가승강기정보센터(한국승강기안전공단) Open API 2종 — 서버(Next.js Route Handler)에서 프록시 호출 |
| 배포 | Vercel (GitHub 연동, main 브랜치 push 시 자동 배포) |
| PWA | `app/manifest.js`(메타데이터 라우트) + `app/icon.png`/`apple-icon.png` 파비콘 컨벤션. 실제 서비스워커(next-pwa 등)는 **적용 안 되어 있음** — 오프라인 캐싱 없이 "홈 화면에 추가" 정도만 지원 |
| Node.js | 로컬 개발 시 Node.js LTS 필요 (버전 고정 파일(`.nvmrc` 등) 없음, npm 사용) |

package.json 기준 정확한 버전:
```json
"dependencies": {
  "@supabase/supabase-js": "^2.110.2",
  "lucide-react": "^1.24.0",
  "next": "16.2.10",
  "react": "19.2.4",
  "react-dom": "19.2.4"
},
"devDependencies": {
  "@tailwindcss/postcss": "^4",
  "eslint": "^9",
  "eslint-config-next": "16.2.10",
  "tailwindcss": "^4"
}
```

---

## 3. GitHub

- **리포지토리**: https://github.com/ssj910-design/GUIL-APP.git
- **브랜치 구조**: `main` 브랜치 하나만 사용 (`git remote -v` / `git branch -a` 로 확인, 다른 브랜치 없음). PR 없이 `main`에 직접 커밋/푸시하는 방식으로 작업해왔음.
- 리포지토리 루트는 프로젝트 폴더가 아니라 그 안의 **`elevator-field-app/`** 폴더입니다 (한글 경로 상위 폴더는 git 관리 대상 아님).

---

## 4. Vercel

- **프로젝트명**: `guil-app` (팀/스코프: `guil`)
- **배포 URL**: https://guil-app-pi.vercel.app
- GitHub `main` 브랜치와 연동되어 있어 push할 때마다 자동 배포됩니다.
- **환경변수** (`npx vercel env ls`로 직접 확인, 값은 모두 Encrypted라 CLI로도 원문 조회 불가 — 아래는 이름/적용 환경만):

| 변수명 | 적용 환경 | 등록 시점 | 용도 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | 2일 전 | Supabase 프로젝트 REST 엔드포인트 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | 2일 전 | Supabase anon(공개) 키 |
| `ELEVATOR_API_SERVICE_KEY` | Production, Preview | 21시간 전 | 국가승강기정보센터 공공데이터포털 인증키(서버 전용) |

세 변수 모두 **Production 환경에 정상 등록되어 있음을 확인했습니다** (Development 환경에는 없음 — 로컬 개발은 `.env.local` 파일로 대체하므로 문제 없음).

값 자체(마스킹):
- `NEXT_PUBLIC_SUPABASE_URL` = `https://kdptzotxnzpuwzdguzgh.supabase.co` (URL이라 비밀은 아님)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJhbGci...FMSQ`
- `ELEVATOR_API_SERVICE_KEY` = `7c2c5c9c...36e8e7`

CLI로 재확인하려면: `npx vercel login` → 프로젝트 폴더에서 `npx vercel link` → `npx vercel env ls`

---

## 5. Supabase

- **프로젝트 URL**: `https://kdptzotxnzpuwzdguzgh.supabase.co` (프로젝트 ref: `kdptzotxnzpuwzdguzgh`)
- **사용 중인 키**: **anon(공개) key만 사용**. `service_role` 키는 이 프로젝트 어디에서도 쓰지 않습니다 — 클라이언트(`lib/supabaseClient.js`)와 서버 API 라우트 모두 `NEXT_PUBLIC_SUPABASE_ANON_KEY`로 접근합니다.
- **RLS(Row Level Security)**: **모든 테이블에서 비활성화(꺼짐) 상태**입니다. `supabase/schema.sql`에 "로그인 기능이 없어 RLS를 켜지 않았다"고 명시되어 있고, 이후 세션에서도 RLS를 켜는 작업은 하지 않았습니다. 즉 **anon key만 있으면 모든 테이블을 자유롭게 읽고 쓸 수 있는 상태**입니다. 이 세션에서는 Supabase 대시보드/서비스롤 키 접근 권한이 없어 RLS 상태를 SQL로 재확인하지는 못했습니다 — **실서비스 전환 전 Supabase 대시보드(Authentication → Policies)에서 반드시 재확인하고, 로그인 기능을 켤 때 RLS 정책도 함께 설계해야 합니다.**
- **스키마 관리 방식**: 최초 스키마는 `supabase/schema.sql`(전체 테이블+샘플데이터)로 만들었고, 이후 기능 추가마다 `ALTER TABLE`을 사용자에게 Supabase SQL Editor에서 직접 실행하도록 안내하며 진행했습니다. **별도 마이그레이션 파일로 정리되어 있지 않으므로, 아래 "현재 스키마" 표가 유일하게 정리된 최신 스키마입니다.**

### 현재 테이블 목록과 스키마 (2026-07-15 기준, REST API로 실제 컬럼 확인)

#### `sites` — 현장 마스터
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | text (PK) | |
| site_code | text | 레거시, UI에서 더 이상 입력 안 함(빈 값 저장 시 `null` 처리, unique 제약 있음 — **빈 문자열로 저장하면 두 번째 신규 현장부터 저장 실패하는 버그가 있었으므로 반드시 null로 저장할 것**) |
| name | text | 현장명 |
| elevator_no | text | 레거시(대표 호기), 관리자 폼에 "승강기 번호"로 표시되지만 실제로는 site 레벨 값 |
| address | text | |
| region | text | 레거시, 필터 UI는 제거됨 |
| contract_type | text | "POG(일반계약)" / "FM(종합계약)" 중 선택(드롭다운). FM일 때만 빨간 볼드로 표시 |
| phone | text | 레거시 |
| elevator_model | text | 승강기 모델명 (승강기정보 "정보" 탭에서 사용) |
| unit_count | int | 이 현장의 승강기 대수(호기 수) — `siteUnits()` 헬퍼가 이 값으로 "1-1","1-2"... 호기 라벨을 생성 |
| manager / manager_phone | text | 레거시(단일 담당자), 실제 담당자 데이터는 `site_managers` 테이블로 이관됨 |
| overdue_long / overdue_total | numeric | 연체금액(현재 UI에서 미사용) |
| failures_30d | int | 최근 30일 고장횟수 집계값(수동 값, 자동 계산 아님) |
| assigned_engineer | text | 담당 기사 이름(profiles.name과 매칭, FK 아님) |
| notes | text | 비고(전달사항), 로그인한 누구나 수정 가능 |
| gov_elevator_no | text | **레거시**(호기 1개짜리 구버전 컬럼, 더 이상 앱에서 안 씀) |
| gov_elevator_nos | text[] | **현재 사용 중** — 호기 개수(unit_count)만큼 국가승강기정보센터 승강기고유번호를 배열로 저장. 인덱스 순서가 "1-1","1-2"... 순서와 대응 |

#### `site_managers` — 현장별 담당자(보수업체 담당자, 여러 명 가능)
`id`(PK), `site_id`(FK→sites), `name`, `phone`, `email`, `fax`, `created_at`

#### `failures` — 고장접수
`id`(PK), `site_id`(FK→sites), `site_name`, `elevator_no`(호기 라벨, 예 "1-1"), `error_code`("고장구분 (고장상세내역)" 형태 텍스트), `status`(미처리/진행중/완료), `reported_at`, `assignee`(배정 기사, null=미정), `not_fault`, `reporter_phone`, `arrival_time`, `complete_time`, `process_result`, `process_note`, `eta_minutes`, `dispatched_at`, `escalation`(지원요청/운행정지), `fault_cause`, `process_content`, `photo_count`, `created_at`

#### `inspections` — 검사 이력(수기입력용)
`id`(PK), `site_id`(FK→sites), `site_name`, `elevator_no`, `type`, `org`, `due_date`, `result`(pass/conditional/fail), `notes`, `created_at`
> 국가승강기정보센터에 승강기고유번호가 등록된 호기는 이 테이블 대신 실시간 API 결과를 우선 사용(fallback 구조)

#### `material_requests` — 자재신청
`id`(PK), `site_id`(FK→sites), `site_name`, `elevator_no`(호기), `part`, `urgency`, `note`, `photo_count`, `engineer`, `requested_date`, `status`, `supplied_date`, `reject_reason`, `rejected_date`, `has_supply_photo`, `created_at`

#### `quote_requests` — 견적요청
`id`(PK), `site_id`(FK→sites), `site_name`, `elevator_no`(호기), `construction_type`, `contact_phone`, `note`, `photo_count`, `engineer`, `requested_date`, `status`, `quote_issued_date`, `approved_date`, `supplied_date`, `has_supply_photo`, `created_at`

#### `todos` — 할일관리
`id`(PK), `material_request_id`(FK), `quote_request_id`(FK), `source`(material/quote/manual), `title`, `site_name`, `elevator_no`(호기, 자재/견적 건에서 복사됨), `part`, `assignee`, `assigned_date`, `due_date`, `done`, `photo_count`, `created_at`

#### `billings` — 비용청구
`id`(PK), `type`(material/manual), `site_name`, `elevator_no`(호기), `part`, `cost`, `replace_date`, `contact_phone`, `engineer`, `submitted_at`, `created_at`
> 호기가 없는(레거시) 청구건은 해당 현장의 모든 호기 화면에 그대로 표시됨(fallback)

#### `restock_requests` — 상비부품 보충요청
`id`(PK), `engineer`, `part`, `site_name`, `requested_date`, `status`(대기/완료), `supplied_date`, `has_supply_photo`, `created_at`

#### `feed_posts` — 우리방 피드
`id`(PK), `author`, `body`, `created_at`

#### `profiles` — 로그인 계정 프로필 (Supabase Auth 연동)
`id`(PK, uuid, FK→auth.users), `name`, `role`(engineer/admin), `created_at`, `phone`, `email`
- `phone`/`email`은 관리자모드 "기사관리" 화면에서 입력 가능(기사 개인 연락처)

#### `engineers` — **레거시 테이블, 앱에서 더 이상 사용하지 않음**
최초 스키마에 있었으나, 로그인 기능 추가 후 기사 목록은 `profiles`(role='engineer')에서 가져오도록 바뀌었습니다. 삭제해도 앱 동작에 영향 없지만, 이번 인수인계에서는 그대로 남겨두었습니다.

---

## 6. 인증

- **로그인 방식**: Supabase Auth 이메일/비밀번호 로그인 기능이 **구현은 되어 있으나 현재 코드상 꺼져 있는 상태**입니다.
- `ElevatorFieldApp.jsx` 안에 다음 스위치가 있습니다:
  ```js
  const SKIP_LOGIN = true;
  const DEV_FAKE_PROFILE = { name: "관리자", role: "admin" };
  ```
  `SKIP_LOGIN = true`이면 실제 로그인 화면을 건너뛰고 항상 `DEV_FAKE_PROFILE`(관리자)으로 로그인된 것처럼 동작합니다. **실서비스로 전환하려면 `SKIP_LOGIN`을 `false`로 바꿔야 합니다.**
- 로그인 없이도 URL 파라미터로 관리자/기사 화면을 미리 볼 수 있는 개발용 우회 기능이 있습니다 (`SKIP_LOGIN`이 `true`일 때만 동작):
  - `?as=admin` → 관리자로 표시
  - `?as=engineer` 또는 `?as=engineer&name=기사이름` → 해당 기사로 표시(기본값 "신석주")
- **실제 로그인 계정**: Supabase Auth에 실제 계정 몇 개가 생성되어 있고(`profiles` 테이블에 `신석주`(engineer), `관리자(신석주)`(admin) 확인됨), `SKIP_LOGIN`을 끄면 이 계정들로 로그인 테스트 가능합니다. 계정 생성은 Supabase 대시보드(Authentication → Users)에서 수동으로 하며, 생성 시 User Metadata에 `name`/`role`을 넣으면 `handle_new_user()` 트리거가 자동으로 `profiles`에 반영합니다.
- **권한 분리**: 로그인 여부와 별개로, 앱 내부에서는 `profile.role`이 `admin`이면 전체 데이터·"관리자 모드" 탭이 보이고, `engineer`면 `sites.assigned_engineer`가 본인 이름인 현장/업무만 보입니다. 이 필터링은 **클라이언트 코드에서만** 이루어지며 RLS로 강제되지 않으므로, 로그인을 켜더라도 anon key를 아는 사람은 여전히 API로 다른 사람 데이터에 접근 가능합니다(5번 항목의 RLS 경고 참고).

---

## 7. 폴더 구조와 핵심 파일

```
elevator-field-app/            ← 실제 git 리포지토리 루트
├── app/
│   ├── page.js                 홈 라우트, ElevatorFieldApp만 렌더링하는 얇은 진입점
│   ├── layout.js                루트 레이아웃, 폰트/메타데이터
│   ├── manifest.js               PWA manifest (metadata route)
│   ├── globals.css               Tailwind 전역 스타일
│   ├── icon.png / apple-icon.png  파비콘(Next.js 자동 인식 컨벤션)
│   ├── components/
│   │   └── ElevatorFieldApp.jsx  ★ 앱 전체 로직/화면이 들어있는 단일 파일 (5,300줄+)
│   └── api/                      Next.js Route Handler (서버 전용 API)
│       ├── elevator-info/route.js         국가승강기정보센터 "건물별승강기정보" 프록시
│       └── elevator-fail-detail/route.js  검사이력→부적합코드→부적합상세 3단계 체이닝 프록시
├── lib/
│   └── supabaseClient.js        supabase-js 클라이언트 생성(anon key)
├── scripts/
│   ├── icon.svg / gen-icons.js   PWA 아이콘 생성용 1회성 스크립트
├── public/                       정적 파일(아이콘 등)
├── .env.local                    환경변수(gitignore 대상, 커밋 안 됨)
├── AGENTS.md / CLAUDE.md          "이 Next.js 버전은 학습 데이터와 다르니 문서 먼저 확인" 경고
├── next.config.mjs, jsconfig.json, eslint.config.mjs, postcss.config.mjs  설정 파일(대부분 기본값)
└── package.json
```

### 왜 파일이 하나(`ElevatorFieldApp.jsx`)로 되어 있나
원래 정적 React 프로토타입(`ElevatorFieldApp.jsx`, 단일 파일)에서 출발해 기능을 계속 이어붙이며 발전했습니다. 컴포넌트를 파일로 분리하지 않고 한 파일 안에 전부 두는 방식으로 작업해왔습니다(리팩터링 요청 없었음). 파일이 매우 크므로(5,300줄+) 특정 기능을 찾을 때는 아래 방식을 추천합니다.

### 핵심 구조 (모두 `ElevatorFieldApp.jsx` 안에 있음)
- **Context**: `SitesContext`(현장 목록), `AuthContext`(로그인 사용자 이름/역할/기사목록/기사연락처)
- **매퍼 함수들**: `mapSite`, `mapFailure`, `mapInspection`, `mapMaterialRequest`, `mapTodo`, `mapQuoteRequest`, `mapBilling`, `mapRestockRequest`, `mapFeedPost`, `mapSiteManager` — DB의 snake_case 컬럼을 JS camelCase로 변환
- **커스텀 훅**: `useLiveInspections(queries)` — 국가승강기정보센터 실시간 검사결과 조회(호기 단위)
- **주요 화면 컴포넌트**: `HomeTab`, `SiteTab`/`SiteDetailScreen`/`ElevatorDetailScreen`, `FailureTab`(접수등록/미배정/처리등록/처리현황), `InspectionTab`, `MaterialTab`, `BillingTab`, `TodoTab`, `RoomTab`, `AdminTab`(관리자 전용 하위 화면들)
- **최상위 컴포넌트**: `App`(default export) — 모든 최상위 state, Supabase CRUD 핸들러(`handleAddSite`, `handleDispatchFailure` 등), 로그인 상태, 탭 라우팅을 담당

---

## 8. 로컬에서 실행하는 방법

```bash
# 1. 리포지토리 클론 (elevator-field-app 폴더가 실제 루트)
git clone https://github.com/ssj910-design/GUIL-APP.git
cd GUIL-APP

# 2. 의존성 설치
npm install

# 3. 환경변수 파일 만들기 — .env.local (프로젝트 루트에 직접 생성, git에 올라가지 않음)
#    아래 3개 값이 필요합니다 (Supabase 대시보드 Settings→API, Vercel 환경변수 참고)
#    NEXT_PUBLIC_SUPABASE_URL=https://kdptzotxnzpuwzdguzgh.supabase.co
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
#    ELEVATOR_API_SERVICE_KEY=<공공데이터포털 인증키>

# 4. 개발 서버 실행 (Turbopack, 기본 포트 3000)
npm run dev

# 5. 프로덕션 빌드 확인 (배포 전 항상 이걸로 에러 유무 확인)
npm run build

# 6. 빌드된 결과 로컬에서 실행해보기 (선택)
npm run start

# 7. 린트
npm run lint
```

- Windows에서 PowerShell 사용 시 Node/npm이 PATH에 안 잡히는 경우가 있었습니다. 그럴 때는 아래처럼 PATH를 새로고침하고 명령을 실행하세요:
  ```powershell
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  ```
- 로그인 없이 바로 테스트하려면 `SKIP_LOGIN = true`(기본값) 상태에서 `http://localhost:3000/?as=admin` 또는 `?as=engineer`로 접속하면 됩니다.
- Supabase 테이블에 새 컬럼을 추가해야 하는 기능을 개발할 때는, 이 프로젝트에는 마이그레이션 파일/도구가 없으므로 Supabase 대시보드의 **SQL Editor**에서 직접 `ALTER TABLE`을 실행해야 합니다(이 문서 5번 항목의 스키마가 그 결과를 반영한 최신 상태입니다).

---

## 참고: 아직 안 되어 있거나 알아둘 점 (인수인계 시 우선순위 판단용)

- **RLS 비활성화**: 5번 항목 참고. 실서비스 전환 전 최우선으로 처리 필요.
- **로그인 기능 꺼짐**: `SKIP_LOGIN = true`. 앱 구성이 어느 정도 완료된 시점에 켜기로 사용자와 합의된 상태.
- **네이티브 앱(APK) 미착수**: PWA까지만 구현, Capacitor 등을 이용한 실제 Android APK 빌드는 시작 전.
- **PC/데스크톱 전용 관리자 웹페이지**: 시각적 목업만 만들어졌고 실제 구현은 보류된 상태.
- **사진 첨부는 전부 시뮬레이션**: 실제 파일 업로드/스토리지 연동 없음(개수만 카운트).
- **SMS 발송은 시뮬레이션**: 실제 문자 발송 연동 없음(console.log + 화면 토스트).
- **`engineers` 테이블은 레거시**: 삭제 후보(앱에서 참조 안 함).
