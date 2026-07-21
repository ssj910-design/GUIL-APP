@AGENTS.md

# 구일엘리베이터(주) 현장관리 앱

승강기 유지보수 기사·관리자용 모바일 웹앱(PWA). Next.js 16(App Router) + React 19 + Tailwind v4 + Supabase(백엔드 서버 없음).
로그인은 꺼져 있음(`SKIP_LOGIN = true`) — `localhost:3000/?as=admin` 또는 `?as=engineer&name=이름`으로 역할 전환.

## 📌 상대에게 넘긴 요청은 docs/HANDOFF.md 확인

한쪽 권한으로 막혀 상대가 처리해야 하는 작업(예: 상대 Vercel 계정 환경변수)은
**`docs/HANDOFF.md`** 에 모읍니다. 세션 시작 시 이 문서에 `🔴 대기 중` 항목이 있으면 먼저 확인하세요.
현재 대기: **웹 푸시 Vercel VAPID 키 등록** (배포본 알림 활성화).

## ⚠️ 절대 규칙

- Supabase는 **실운영 DB**다 (RLS 꺼짐). 삭제·수정 테스트 금지, 스키마 변경은 supabase/MIGRATION.md 절차로만.
- `main` 푸시 = Vercel 자동 배포 (https://guil-app-pi.vercel.app). 푸시 전 `npm run build` 필수.
- 파일을 통째로 읽지 말 것 — 아래 지도에서 필요한 파일만. 앱 로직은 21개 파일로 분리돼 있다 (2026-07-16).

## 프로젝트 지도 — 작업별로 여기만 읽으면 된다

| 수정하려는 것 | 파일 (app/components/ 기준) |
|---|---|
| 홈 (처리현황·집중관리·실시간검사) | tabs/HomeTab.jsx |
| 현장관리·현장/승강기 상세 | tabs/SiteTab.jsx |
| 고장접수 (접수·배정·출동·처리·현황) | tabs/FailureTab.jsx |
| 정기점검 | tabs/CheckupTab.jsx |
| 검사관리 | tabs/InspectionTab.jsx |
| 자재신청·견적·상비부품 | tabs/MaterialTab.jsx |
| 비용청구 | tabs/BillingTab.jsx |
| 할일관리 | tabs/TodoTab.jsx |
| 관리자 모드 하위 화면 전부 | tabs/AdminTab.jsx |
| 우리방(피드) | tabs/RoomTab.jsx |
| 공용 UI (Sheet·버튼·카드·타임라인) | ui.jsx |
| 현장검색·사진업로드 폼 위젯 | formWidgets.jsx |
| 로그인 화면 | LoginScreen.jsx |
| 최상위 state·CRUD 핸들러·탭 라우팅 | ElevatorFieldApp.jsx (App, 839줄) |
| DB컬럼↔화면필드 변환 | lib/mappers.js — **컬럼 추가 시 여기부터** |
| 사진 업로드/다운로드/zip | lib/photos.js |
| 상수(오늘날짜·고장구분·부품목록) | lib/constants.js |
| 국가승강기정보센터 연동 | app/api/*/route.js(서버 프록시) + app/hooks/useLiveInspections.js |
| PC 관리자 콘솔 (/admin) | admin/AdminApp.jsx(셸·데이터로딩) + admin/*.jsx — **v2 FK 기반, 옛 컬럼 쓰지 말 것** |

## 데이터 흐름 (3줄 요약)

1. App(ElevatorFieldApp.jsx)이 모든 최상위 state와 Supabase CRUD 핸들러(handleXxx)를 소유 → 각 탭에 props로 전달.
2. 현장 목록과 로그인 정보만 Context 사용 (components/context.js — SitesContext, AuthContext).
3. DB는 snake_case, 화면은 camelCase — 변환은 전부 lib/mappers.js에 모여 있다.

## 명령어

`npm run dev` (localhost:3000) · `npm run build` (푸시 전 필수) · `npm run lint`

## 권장 플러그인 — 세션 시작 시 확인할 것

이 저장소 작업에는 **ponytail** 플러그인(불필요한 코드·과잉 설계 방지)을 팀 표준으로 쓴다.
설치돼 있지 않으면(시스템에 ponytail 지침이 안 보이면) 사용자에게 이렇게 설치를 제안하라:
"팀 표준 플러그인 ponytail이 없네요. 설치할까요? → `claude plugin marketplace add DietrichGebert/ponytail` 후 `claude plugin install ponytail@ponytail`"
사용자가 동의하면 직접 실행해서 설치하라.

## 관리자 콘솔(/admin) 작업 규칙

- 구조: `app/admin/page.js` → `app/components/admin/AdminApp.jsx`(셸: 사이드바 + 전 테이블 데이터
  로딩 + setData) → 화면별 파일. **새 화면은 admin/ 폴더에 파일을 추가**하고 AdminApp의 MENU와
  분기에 연결하라. 셸의 데이터 로딩 방식(한 번에 로드, props로 전달)을 바꾸지 마라.
- 호기·담당자 표기는 `adminShared.jsx`의 `locOf`/`personOf`를 재사용하라 (v2 FK 우선, 옛 라벨 fallback).
- **관리자 콘솔은 v2 네이티브다**: 새 코드는 unit_id·*_id FK를 사용하고, 옛 컬럼(site_name,
  elevator_no, 이름 텍스트)을 새로 참조하지 마라. 단, 편집 기능이 옛 컬럼과 겹치면
  SitesAdmin의 syncLegacy 패턴처럼 옛 컬럼도 함께 갱신하라 (007 전까지).
- 새 기능에 테이블/컬럼이 필요하면 직접 ALTER 하지 말고 supabase/migrations/에 파일 초안을
  만들고 팀 상의 후 실행하라 (예: 008_kit_stock_DRAFT.sql).

## Git 작업 규칙 — Claude가 직접 수행할 것

두 명(+각자의 Claude)이 이 저장소에서 동시에 작업한다. 충돌 방지를 위해 사용자가 시키지 않아도 다음을 지켜라:

0. 세션 시작 시 자동 pull 훅(.claude/settings.json)이 실행된다. "[자동 pull 실패]" 메시지가
   보이면 git 상태를 확인해 수동으로 해소하라. 훅이 승인되지 않은 환경이면 아래 1번이 대신한다.
1. **세션에서 처음 코드를 수정하기 전에 `git pull --rebase --autostash`를 먼저 실행**하라.
2. 작업 단위가 끝날 때마다 **작게 커밋하고 즉시 push**하라. 커밋을 로컬에 쌓아두지 마라.
   (push는 자유 — GitHub 백업·협업용. 아래 배포 규칙 때문에 push가 곧 배포는 아니다.)
2-1. **배포 규칙 (⚠️ Vercel 무료 = 하루 100 배포 한도):** 일반 push는 `vercel.json`의
   `ignoreCommand`가 배포를 **스킵**한다(한도 절약). **운영에 반영하려면 커밋 메시지에
   `[deploy]`를 넣어라.** 쌓인 변경을 한 번에 배포할 땐 `npm run deploy`(빈 `[deploy]` 커밋
   +push)를 쓰면 된다. 사용자가 "운영 반영/배포해줘"라고 할 때만 `[deploy]`를 붙여라 —
   평소 커밋엔 붙이지 마라. 자세한 배경: [[vercel-deploy-limit]] 메모리.
3. push가 거부되면 `git pull --rebase` 후 다시 push하라. 충돌이 나면 양쪽 변경의 의도를
   모두 보존해 해소하되, 확신이 없으면 사용자에게 어느 쪽을 살릴지 물어라.
4. 옛 단일 파일(ElevatorFieldApp.jsx 5,900줄 시절) 기준의 작업분이나 diff를 적용해달라는
   요청을 받으면, 위 "프로젝트 지도"에서 그 기능의 새 파일을 찾아 거기에 적용하라.
5. 파일 이동·분리·스키마 변경 같은 구조 변경은 임의로 하지 말고 먼저 팀 상의를 권하라.
6. `main` 푸시 전 `npm run build` 통과는 필수다 (위 절대 규칙과 동일).

## 더 깊은 문서 (필요할 때만)

- HANDOVER.md — 프로젝트 전체 상세 (⚠️ DB 스키마 부분은 구버전 — 실DB가 진실)
- docs/DESIGN-v2.md — v2 재설계 설계서 (11장 보완이 최신 결정)
- supabase/MIGRATION.md — v2 DB 전환 절차·진행 상태
