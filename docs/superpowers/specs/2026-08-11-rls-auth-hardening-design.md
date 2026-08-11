# RLS 기반 인증 강화 설계

## 배경

관리자 콘솔(`AdminApp.jsx`)에서 로그인 화면이 떠 있는 동안에도 전체 회사 데이터(현장·고장·견적·청구·직원정보 포함)가 이미 서버에서 조회되고 있는 문제를 발견해 수정했다(로그인 여부로 데이터 로딩 자체를 가드). 이어서 API 라우트를 감사한 결과 인증 없이 실제 데이터를 반환하거나 회사 채널로 실제 발송을 수행하는 라우트 5개(`geocode-sites`, `elevator-fail-detail`, `elevator-info`, `push/send`, `send-quote`)를 확인했다.

이 5개를 개별적으로 막는 것보다 더 근본적인 문제가 있다: 이 앱은 대부분의 화면이 Next.js API 라우트를 거치지 않고 브라우저에서 Supabase에 직접 쿼리한다(`supabase.from(...)`). Supabase RLS(Row Level Security)가 꺼져 있고 anon key는 모든 페이지 JS 번들에 공개돼 있어, 로그인 화면을 아무리 막아도 브라우저 개발자도구나 직접 API 호출로 anon key만으로 전체 테이블을 읽고 쓸 수 있는 상태다.

이 스펙은 API 라우트 5개만 패치하는 대신, Supabase RLS를 켜서 DB 자체가 접근을 판단하도록 근본적으로 바꾸는 작업을 다룬다.

## 목표

- 유효하지 않은 요청(로그인하지 않은 사용자, anon key만 가진 임의의 클라이언트)이 어떤 경로(화면 직접 접근, API 라우트, curl 등)로도 실제 데이터를 읽거나 쓸 수 없게 한다.
- 기존 로그인 UX(아이디/비밀번호 화면, `verify_login` DB 함수를 통한 비밀번호 확인)는 변경하지 않는다.
- 기존 접근 범위(로그인만 하면 관리자·기사 구분 없이 전체 데이터 열람 가능)를 그대로 유지한다 — 이번 작업은 권한 세분화가 아니라 "로그인 여부 검증"을 실제로 작동하게 만드는 것이 목적이다.
- 예외: `profiles`(직원 정보, 개인정보 포함) 테이블은 `role='admin' AND admin_tier IN ('super','manager')`만 읽고 쓸 수 있게 한다(자재담당관리자·기사 제외).

## 범위 밖

- 기사별 담당 현장으로 열람 범위를 좁히는 것 (이번엔 안 함, 필요해지면 별도 스펙)
- Supabase Auth(auth.users)로의 전면 이전 — 대신 프로젝트 JWT 시크릿으로 서명한 커스텀 토큰을 발급해 기존 `profiles` 기반 로그인과 맞물리게 한다.
- 세션 갱신(refresh token) 흐름 — 토큰 만료 시 재로그인으로 처리한다(현재도 세션 만료 처리가 없었으므로 퇴행이 아니다).

## 아키텍처

```
[로그인 화면] --(아이디/비번)--> [POST /api/login]
                                      |
                                      v
                          verify_login(아이디, 비번) RPC
                                      |  (성공)
                                      v
                     profiles에서 role/admin_tier 조회
                                      |
                                      v
                    SUPABASE_JWT_SECRET으로 JWT 서명
                    { sub, role:"authenticated", profile_id, app_role, admin_tier, exp }
                                      |
                                      v
                          클라이언트로 JWT 반환 (JSON body)
                                      |
                                      v
              localStorage(guilAuthTokenV1)에 저장 + Supabase 클라이언트에 부착
                                      |
                                      v
        이후 모든 supabase.from(...) 호출(화면 직접/새 API 라우트 경유)에
        Authorization: Bearer <JWT> 자동 포함
                                      |
                                      v
              PostgREST가 JWT 검증 → RLS 정책이 auth.role()/auth.jwt() 확인
```

## 로그인 흐름 변경

### 새 라우트: `app/api/login/route.js`

- POST, body `{ loginId, password }`.
- 서버(Supabase 서비스 롤 클라이언트)에서 기존 `verify_login` RPC 호출 — 로직 변경 없음.
- 성공하면 `profiles`에서 `id, name, role, admin_tier, is_active, deleted_at`을 다시 조회해 최신 상태 확인(비활성/삭제 계정 재확인 — 기존 `AdminApp.jsx`의 재확인 로직과 동일한 목적).
- JWT를 만들어 반환:
  ```js
  {
    sub: profile.id,
    role: "authenticated",   // PostgREST가 이 클레임으로 anon/authenticated를 구분한다
    profile_id: profile.id,
    app_role: profile.role,        // "admin" | "engineer"
    admin_tier: profile.admin_tier ?? null,  // "super" | "manager" | "material" | null
  }
  ```
  만료 24시간. 서명은 `SUPABASE_JWT_SECRET`(신규 서버 전용 env var — Supabase 대시보드 Settings → API → JWT Settings에서 확인)으로 `jsonwebtoken` 패키지(신규 의존성 추가) 사용.
- 응답 형식: `{ ok: true, token, profile: {...} }` / 실패 시 기존 `loginFailReason()` 문구 유지.

### 클라이언트 변경

- `lib/supabaseClient.js`: 토큰을 받아 Supabase 클라이언트에 `Authorization: Bearer <token>` 헤더를 실어 보내도록 재구성하는 함수(`setAuthToken(token)` / `clearAuthToken()`) 추가. 내부적으로는 헤더가 포함된 새 클라이언트를 만들어 기존 export를 교체하는 방식.
- `handleAdminLogin`(`AdminApp.jsx`)과 `handleLogin`(`ElevatorFieldApp.jsx`): 기존 `verify_login` 직접 호출을 `/api/login` 호출로 교체. 성공 시 받은 토큰을 `localStorage`(`guilAuthTokenV1`)에 저장하고 `setAuthToken()` 호출.
- 앱 부팅 시(두 셸의 세션 복원 useEffect): `guilAuthTokenV1`이 있으면 `setAuthToken()`으로 먼저 복원한 뒤 프로필 재확인 쿼리를 보낸다(지금은 순서가 반대라 토큰 없이 조회하게 됨 — 이 부분이 이번 작업의 핵심 변경점).
- 로그아웃(`adminLogout`, 기존 로그아웃 핸들러): `guilAuthTokenV1` 제거 + `clearAuthToken()` 호출 추가.
- 기존 `guilAuthV1`(이름·역할 등 화면 표시용 세션 마커)은 그대로 유지 — 토큰은 별도 키로 분리 보관한다.

## RLS 정책

- 아래 표의 모든 테이블에 RLS를 켠다: `sites, units, site_managers, failures, inspections, material_requests, quote_requests, restock_requests, todos, billings, self_checks, self_check_items, feed_posts, error_codes, kit_stock, attendances, duty_schedules, duty_swaps, leaves, holidays, inspection_fail_cache, push_subscriptions, native_push_tokens, notify_settings`.
- `profiles`를 제외한 위 테이블 전부에 동일한 정책 하나만 건다:
  ```sql
  create policy "authenticated_full_access" on <table>
    for all
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
  ```
- `profiles`는 예외로 관리자 전용 정책:
  ```sql
  create policy "admin_only_access" on profiles
    for all
    using (
      (auth.jwt() ->> 'app_role') = 'admin'
      and (auth.jwt() ->> 'admin_tier') in ('super', 'manager')
    )
    with check (
      (auth.jwt() ->> 'app_role') = 'admin'
      and (auth.jwt() ->> 'admin_tier') in ('super', 'manager')
    );
  ```
- `verify_login` RPC 자체는 로그인 시점(토큰이 아직 없음)에 호출돼야 하므로 RLS와 무관하게 계속 호출 가능해야 한다 — RPC 함수는 테이블 RLS와 별개로 동작하므로 손댈 필요 없음(기존처럼 최소 정보만 반환하는 함수 형태 유지).

## API 라우트

- 서버 전용 헬퍼 `lib/verifyToken.js` 신규 추가: `Authorization` 헤더에서 JWT를 꺼내 `SUPABASE_JWT_SECRET`으로 검증하고, 유효하면 `{ profileId, appRole, adminTier }`를 반환, 무효하면 `null`.
- 대상 라우트(`geocode-sites`, `elevator-fail-detail`, `elevator-info`, `push/send`, `send-quote`)는 각 핸들러 시작부에서 이 헬퍼로 검증하고, 실패 시 `401` 반환.
- `send-quote`, `push/send`처럼 실제 발송을 수행하는 라우트는 추가로 `appRole === "admin"` 확인(발송은 관리자만).
- 이 라우트들은 서버 코드이므로 Supabase 호출 자체는 지금처럼 anon key 클라이언트를 계속 써도 되고(RLS가 이미 막아주므로 이중 방어), 혹은 서비스 롤 키로 바꿔도 된다 — 이번 스펙에서는 기존 anon 클라이언트 유지로 최소 변경.
- 그 외 조회 전용 라우트(`geocode-address`, `solapi-webhook` 등 감사에서 이미 "문제없음"으로 확인된 것들)는 변경하지 않는다.

## 배포 순서 (필수 — 순서를 지키지 않으면 RLS를 켜는 순간 전체 화면이 멈춘다)

1. **1단계 — 토큰 발급·부착 (RLS 켜지 않은 상태로 배포)**
   `/api/login` 라우트, 클라이언트 토큰 저장/부착, 로그인 흐름 변경을 배포한다. 이 시점엔 RLS가 꺼져 있어 토큰이 없어도 기존처럼 전부 동작 — 안전하게 검증 가능한 단계.
2. **검증** — 실제 로그인 후 브라우저 네트워크 탭에서 Supabase 요청에 `Authorization: Bearer ...` 헤더가 실제로 붙는지 확인한다.
3. **2단계 — RLS 정책 생성 + 활성화**
   위 정책들을 SQL로 생성하고 테이블별로 RLS를 켠다. 이 시점부터 토큰 없는 요청은 즉시 차단된다.
4. **검증** — 로그인한 상태에서 모든 주요 화면(대시보드·현장정보·고장관리·자재견적·인사관리 등)이 정상 동작하는지, 로그아웃 상태에서 직접 API를 두드리면 빈 결과/에러가 오는지 확인한다.
5. **3단계 — API 라우트 5개 인증 체크 추가**
   `lib/verifyToken.js` + 각 라우트 가드 배포.

## 열린 질문 / 후속 과제 (이번 스펙 범위 밖, 기록만)

- 토큰이 `localStorage`에 평문 저장되므로 XSS 공격 시 탈취 가능 — HttpOnly 쿠키로 옮기면 더 안전하지만 Supabase JS 클라이언트가 쿠키를 자동으로 읽지 않아 별도 프록시가 필요해진다. 지금은 범위 밖으로 둔다.
- `verify_login` RPC는 인증 없이(anon key로) 누구나 호출 가능해 비밀번호 무차별 대입 시도에 노출돼 있다 — 별도 과제.
- 기사별 담당 현장으로 열람 범위를 좁히는 것은 이번엔 하지 않는다(위 범위 밖 참고).
