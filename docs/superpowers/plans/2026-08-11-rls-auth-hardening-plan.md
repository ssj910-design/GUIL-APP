# RLS 기반 인증 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 여부와 무관하게 anon key만으로 전체 데이터에 접근 가능하던 문제를, 로그인 시 발급하는 서명된 토큰 + Supabase RLS로 DB 단에서 실제로 막는다.

**Architecture:** 기존 아이디/비밀번호 로그인(`verify_login` DB 함수)은 그대로 두고, 로그인 성공 직후 서버가 `SUPABASE_JWT_SECRET`으로 서명한 JWT를 발급한다. 브라우저는 이 토큰을 Supabase 클라이언트와 자체 API 라우트 호출(`fetch`) 양쪽에 자동으로 붙인다. Supabase 테이블에는 RLS를 켜서 "유효한 토큰이 있는 요청만" 통과시키고(`profiles`만 관리자 전용 예외), 5개 API 라우트에는 서버 측 토큰 검증을 추가한다.

**Tech Stack:** Next.js 16 App Router, `@supabase/supabase-js`, 신규 의존성 `jsonwebtoken`.

## Global Constraints

- 기존 로그인 화면·UX는 변경하지 않는다 (스펙 "목표" 섹션).
- 로그인만 하면 관리자·기사 구분 없이 전체 데이터 열람 가능한 기존 범위를 유지한다 — `profiles` 테이블만 예외로 `role='admin' AND admin_tier IN ('super','manager')`만 허용한다.
- JWT 클레임 형태는 정확히 `{ sub, role: "authenticated", profile_id, app_role, admin_tier, exp }` — `role: "authenticated"`는 PostgREST가 anon/authenticated를 구분하는 데 쓰는 예약 클레임이라 이름을 바꾸면 안 된다.
- 토큰 만료 24시간, 갱신(refresh) 로직 없음 — 만료되면 재로그인.
- DDL(RLS 정책)은 이 프로젝트 관례대로 마이그레이션 파일로 작성만 하고, 실제 실행은 사용자가 Supabase 대시보드 SQL Editor에서 직접 한다(`supabase/CLAUDE.md`).
- 배포는 반드시 아래 순서(1단계 토큰 발급/부착 → 2단계 RLS 활성화 → 3단계 API 라우트 가드)를 지킨다 — RLS를 먼저 켜면 토큰 없는 기존 화면이 즉시 멈춘다.
- 커밋 메시지에 `[deploy]` 태그를 넣어야 Vercel이 빌드한다(`vercel.json`의 `ignoreCommand`) — 앱 코드가 바뀌는 커밋마다 필수. SQL 마이그레이션 파일만 추가하는 커밋(사용자가 직접 SQL Editor에서 실행)에는 필요 없다.

## 스펙과 다르게 조사 중 확정한 부분

- 스펙은 "`send-quote`·`push/send`처럼 실제 발송하는 라우트는 관리자만"이라고 했지만, 실제 호출부를 확인해보니 `push/send`(`lib/push.js`의 `notify()`)는 기사용 모바일 화면(`ElevatorFieldApp.jsx`)에서도 호출된다. "로그인만 하면 전체 접근"이라는 이번 작업의 핵심 원칙에 맞춰, **`push/send`는 관리자 제한 없이 로그인한 아무 사용자면 허용**하고, **`send-quote`만 관리자 전용**으로 남긴다(호출부가 `app/components/admin/`뿐이라 실제로 관리자만 부름).
- 계획 작성 도중 협업자가 `QuoteItemsModal.jsx`의 "바로 발송하기"(alsoSend) 기능을 통째로 제거하는 커밋을 올렸다 — 그 자리에 있던 `/api/send-quote` 호출부도 같이 사라졌다. 그래서 `send-quote`의 실제 클라이언트 호출부는 이제 `QuoteSendModal.jsx` 한 곳뿐이다(아래 Task 6에 반영).
- `push/send`는 서버 크론 6개(`check-selfcheck`, `check-inspections`, `check-failures`, `check-duty-tomorrow`, `check-attendance`, `check-contracts`)에서도 내부적으로 호출한다 — 이 호출들은 로그인 토큰이 없으므로, `push/send`는 **유효한 로그인 토큰 OR `CRON_SECRET`** 둘 중 하나를 허용한다.
- 조사 중 `sync-holidays`(CRON_SECRET 체크 자체가 없음)와 `sync-inspection-cache`(체크가 "설정 안 돼있으면 건너뜀"이라 사실상 무력화될 수 있는 구조)도 발견했다 — 이번 작업과 같은 종류의 문제라 마지막 태스크로 같이 정리한다.

---

## Task 1: 로그인 시 JWT 발급 (`/api/login`)

**Files:**
- Create: `app/api/login/route.js`
- Modify: `package.json` (jsonwebtoken 의존성 추가)
- Modify: `.env.local` (신규 env var — 로컬 개발용, 값은 사용자가 직접 채움)

**Interfaces:**
- Produces: `POST /api/login` — body `{ loginId, password }` → 성공 시 `{ ok: true, token: string, profile: { id, name, role, adminTier, mustChange } }`, 실패 시 `{ ok: false, reason: string }`.
- 이후 태스크가 이 라우트를 호출한다.

- [ ] **Step 1: jsonwebtoken 설치**

```bash
cd "C:\projects\elevator-field-app"
npm install jsonwebtoken
```

- [ ] **Step 2: Supabase 프로젝트 JWT 시크릿을 로컬 env에 추가**

Supabase 대시보드 → 프로젝트(kdptzotxnzpuwzdguzgh) → Settings → API → "JWT Settings" 섹션의 "JWT Secret" 값을 복사해서 `.env.local`에 추가:

```
SUPABASE_JWT_SECRET=<대시보드에서 복사한 값>
```

(`NEXT_PUBLIC_` 접두어 없음 — 서버에서만 쓰고 클라이언트에 노출되면 안 되는 값이라서.)

- [ ] **Step 3: `app/api/login/route.js` 작성**

```js
// 로그인 — 기존 verify_login DB 함수로 아이디/비번을 그대로 확인하고, 성공하면
// Supabase가 RLS에서 알아볼 수 있는 서명된 JWT를 발급한다. 로그인 화면·과정 자체는
// 안 바뀐다 — 이 라우트가 기존 클라이언트 직접 rpc 호출을 대신할 뿐이다.
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const loginId = (body?.loginId || "").trim();
  const password = body?.password || "";
  if (!loginId || !password) {
    return Response.json({ ok: false, reason: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return Response.json({ ok: false, reason: "서버 설정 오류 — SUPABASE_JWT_SECRET 미설정" }, { status: 500 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const { data, error } = await supabase.rpc("verify_login", { p_login_id: loginId, p_password: password });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return Response.json({ ok: false, reason: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }

  // 비활성·삭제된 계정은 verify_login 통과 후에도 다시 막는다 — 기존 AdminApp.jsx/
  // ElevatorFieldApp.jsx의 세션 재확인 로직과 같은 목적.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,name,role,admin_tier,is_active,deleted_at")
    .eq("id", row.id)
    .single();
  if (!profile || profile.is_active === false || profile.deleted_at) {
    return Response.json({ ok: false, reason: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }

  const token = jwt.sign(
    {
      sub: profile.id,
      role: "authenticated",
      profile_id: profile.id,
      app_role: profile.role,
      admin_tier: profile.admin_tier ?? null,
    },
    secret,
    { expiresIn: "24h" }
  );

  return Response.json({
    ok: true,
    token,
    profile: { id: profile.id, name: profile.name, role: profile.role, adminTier: profile.admin_tier, mustChange: row.must_change },
  });
}
```

- [ ] **Step 4: 로컬에서 실제 로그인 계정으로 확인**

```bash
curl -s -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d "{\"loginId\":\"<실제 관리자 아이디>\",\"password\":\"<실제 비밀번호>\"}"
```

Expected: `{"ok":true,"token":"eyJ...","profile":{...}}` — `token`이 `.`으로 구분된 3부분짜리 문자열인지 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/api/login/route.js package.json package-lock.json
git commit -m "로그인 시 JWT 발급 라우트(/api/login) 추가"
```

(`.env.local`은 `.gitignore`에 있어 커밋 대상 아님 — 확인만 하고 넘어간다.)

---

## Task 2: Supabase 클라이언트에 토큰 부착 (`lib/supabaseClient.js`)

**Files:**
- Modify: `lib/supabaseClient.js`

**Interfaces:**
- Consumes: 없음 (독립적인 유틸리티 변경)
- Produces: `setAuthToken(token: string)`, `clearAuthToken()`, `getAuthToken(): string | null` — Task 4/5(로그인 흐름)와 Task 3(authFetch)이 이 함수들을 쓴다. `supabase` export는 그대로 유지하되 내부적으로 `let` 바인딩으로 바뀐다(다른 모든 파일의 `import { supabase }`는 코드 변경 없이 그대로 최신 인스턴스를 참조한다 — ES 모듈의 라이브 바인딩 특성).

- [ ] **Step 1: `lib/supabaseClient.js` 상단부 교체**

기존:
```js
import { createClient } from "@supabase/supabase-js";

// .env.local 파일에 있는 두 값을 읽어옵니다.
// (이 파일은 Supabase와 대화하는 통로 하나를 만들어두는 것뿐이라,
//  실제 데이터를 읽고 쓰는 코드는 각 화면 컴포넌트에서 이 supabase를
//  import 해서 사용합니다.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

다음으로 교체:
```js
import { createClient } from "@supabase/supabase-js";

// .env.local 파일에 있는 두 값을 읽어옵니다.
// (이 파일은 Supabase와 대화하는 통로 하나를 만들어두는 것뿐이라,
//  실제 데이터를 읽고 쓰는 코드는 각 화면 컴포넌트에서 이 supabase를
//  import 해서 사용합니다.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 로그인 성공 시 발급받은 토큰을 붙여 재생성한다(RLS가 이 토큰으로 접근을 판단한다).
// `let`로 선언해 재할당해도, 다른 파일의 `import { supabase }`는 ES 모듈 라이브 바인딩
// 덕분에 코드 변경 없이 항상 최신 인스턴스를 참조한다.
export let supabase = createClient(supabaseUrl, supabaseAnonKey);

const TOKEN_KEY = "guilAuthTokenV1";

export function setAuthToken(token) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken() {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}
```

- [ ] **Step 2: 개발 서버 재시작 후 콘솔에서 확인**

```bash
npm run dev
```

브라우저 콘솔에서:
```js
const { setAuthToken, getAuthToken, supabase } = await import("/lib/supabaseClient.js");
```
(실제로는 이렇게 직접 import 안 되니, 대신 Task 4/5에서 실제 로그인으로 확인한다 — 이 스텝은 문법 오류 없이 `npm run dev`가 정상 기동하는지만 확인.)

Expected: 서버가 에러 없이 뜬다.

- [ ] **Step 3: 커밋**

```bash
git add lib/supabaseClient.js
git commit -m "Supabase 클라이언트에 로그인 토큰 부착하는 setAuthToken/clearAuthToken 추가"
```

---

## Task 3: API 라우트 호출용 `authFetch` 헬퍼

**Files:**
- Create: `lib/apiFetch.js`

**Interfaces:**
- Consumes: `getAuthToken()` (Task 2)
- Produces: `authFetch(url, options)` — `fetch`와 동일한 시그니처, `Authorization` 헤더만 자동으로 붙여준다. Task 6이 이걸 쓴다.

- [ ] **Step 1: `lib/apiFetch.js` 작성**

```js
// /api/* 라우트를 호출할 때 로그인 토큰을 자동으로 붙이는 fetch.
// Supabase 직접 호출(supabase.from(...))은 lib/supabaseClient.js의 setAuthToken()이
// 이미 커버하지만, 우리 자체 API 라우트를 부르는 일반 fetch()는 별개라 각자 붙여야 한다.
import { getAuthToken } from "@/lib/supabaseClient";

export function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(url, { ...options, headers });
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/apiFetch.js
git commit -m "API 라우트 호출용 authFetch 헬퍼 추가"
```

---

## Task 4: 관리자 콘솔 로그인 흐름 교체 (`AdminApp.jsx`)

**Files:**
- Modify: `app/components/admin/AdminApp.jsx`

**Interfaces:**
- Consumes: `POST /api/login` (Task 1), `setAuthToken`/`clearAuthToken`/`getAuthToken` (Task 2)

- [ ] **Step 1: 부팅 시 세션 복원 effect에 토큰 복원 추가**

기존 (파일 상단 근처, `useEffect(() => { if (SKIP_LOGIN) {...} ... })` 블록):
```js
  useEffect(() => {
    if (SKIP_LOGIN) { setAuthChecked(true); return; }
    let alive = true;
    (async () => {
      try {
        const raw = localStorage.getItem("guilAuthV1");
        if (!raw) { if (alive) setAuthChecked(true); return; }
        const s = JSON.parse(raw);
        const { data } = await supabase.from("profiles").select("id,name,role,admin_tier,is_active,deleted_at").eq("id", s.id).single();
        if (!alive) return;
        if (data && data.role === "admin" && data.is_active !== false && !data.deleted_at) {
          setMe({ id: data.id, name: data.name, role: data.role, adminTier: data.admin_tier, mustChange: s.mustChange });
        }
      } catch { /* 무시 — 로그인 화면으로 */ }
      if (alive) setAuthChecked(true);
    })();
    return () => { alive = false; };
  }, []);
```

다음으로 교체 — 저장된 토큰이 있으면 프로필 재확인 쿼리를 보내기 *전에* 먼저 복원한다:
```js
  useEffect(() => {
    if (SKIP_LOGIN) { setAuthChecked(true); return; }
    let alive = true;
    (async () => {
      try {
        const raw = localStorage.getItem("guilAuthV1");
        const token = getAuthToken();
        if (!raw || !token) { if (alive) setAuthChecked(true); return; }
        setAuthToken(token);
        const s = JSON.parse(raw);
        const { data } = await supabase.from("profiles").select("id,name,role,admin_tier,is_active,deleted_at").eq("id", s.id).single();
        if (!alive) return;
        if (data && data.role === "admin" && data.is_active !== false && !data.deleted_at) {
          setMe({ id: data.id, name: data.name, role: data.role, adminTier: data.admin_tier, mustChange: s.mustChange });
        }
      } catch { /* 무시 — 로그인 화면으로 */ }
      if (alive) setAuthChecked(true);
    })();
    return () => { alive = false; };
  }, []);
```

- [ ] **Step 2: import에 `setAuthToken`/`clearAuthToken`/`getAuthToken` 추가**

기존:
```js
import { supabase, fetchAll, loginFailReason } from "@/lib/supabaseClient";
```

다음으로 교체:
```js
import { supabase, fetchAll, loginFailReason, setAuthToken, clearAuthToken, getAuthToken } from "@/lib/supabaseClient";
```

- [ ] **Step 3: `handleAdminLogin`을 `/api/login` 호출로 교체**

기존:
```js
  async function handleAdminLogin(loginId, password) {
    setAuthSubmitting(true); setAuthError("");
    const { data, error } = await supabase.rpc("verify_login", { p_login_id: (loginId || "").trim(), p_password: password });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) { setAuthError(await loginFailReason(loginId)); setAuthSubmitting(false); return; }
    if (row.role !== "admin") { setAuthError("관리자만 접근할 수 있는 페이지입니다."); setAuthSubmitting(false); return; }
    const { data: p } = await supabase.from("profiles").select("admin_tier").eq("id", row.id).single();
    // 자재담당관리자는 모바일 앱 관리자 모드(자재출하관리·상비부품보충)만 쓰고 PC 콘솔은 못 들어온다 —
    // 기사가 role!=='admin'이라 못 들어오는 것과 같은 구조(로그인 성공 직후 클라이언트에서 차단).
    if (p?.admin_tier === "material") {
      setAuthError("이 계정은 PC 관리자 콘솔에 접근할 수 없습니다. 모바일 앱을 이용해주세요.");
      setAuthSubmitting(false);
      return;
    }
    localStorage.setItem("guilAuthV1", JSON.stringify({ id: row.id, name: row.name, role: row.role, mustChange: row.must_change }));
    setMe({ id: row.id, name: row.name, role: row.role, adminTier: p?.admin_tier, mustChange: row.must_change });
    setAuthSubmitting(false);
  }
```

다음으로 교체:
```js
  async function handleAdminLogin(loginId, password) {
    setAuthSubmitting(true); setAuthError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) { setAuthError(json.reason || await loginFailReason(loginId)); setAuthSubmitting(false); return; }
    const { profile: p, token } = json;
    if (p.role !== "admin") { setAuthError("관리자만 접근할 수 있는 페이지입니다."); setAuthSubmitting(false); return; }
    // 자재담당관리자는 모바일 앱 관리자 모드(자재출하관리·상비부품보충)만 쓰고 PC 콘솔은 못 들어온다 —
    // 기사가 role!=='admin'이라 못 들어오는 것과 같은 구조(로그인 성공 직후 클라이언트에서 차단).
    if (p.adminTier === "material") {
      setAuthError("이 계정은 PC 관리자 콘솔에 접근할 수 없습니다. 모바일 앱을 이용해주세요.");
      setAuthSubmitting(false);
      return;
    }
    setAuthToken(token);
    localStorage.setItem("guilAuthV1", JSON.stringify({ id: p.id, name: p.name, role: p.role, mustChange: p.mustChange }));
    setMe({ id: p.id, name: p.name, role: p.role, adminTier: p.adminTier, mustChange: p.mustChange });
    setAuthSubmitting(false);
  }
```

- [ ] **Step 4: `adminLogout`에 토큰 정리 추가**

기존:
```js
  function adminLogout() { localStorage.removeItem("guilAuthV1"); setMe(null); }
```

다음으로 교체:
```js
  function adminLogout() { localStorage.removeItem("guilAuthV1"); clearAuthToken(); setMe(null); }
```

- [ ] **Step 5: 브라우저에서 실제 로그인/로그아웃 확인**

`npm run dev` 후 `/admin`에서 실제 계정으로 로그인 → 개발자도구 네트워크 탭에서 `supabase.co`로 가는 요청 중 아무거나 하나 열어서 Request Headers에 `Authorization: Bearer eyJ...`가 있는지 확인. 로그아웃 후 다시 로그인 화면이 뜨는지 확인.

Expected: 토큰 부착 확인, 로그인/로그아웃 정상 동작(RLS는 아직 꺼져 있어 데이터도 그대로 다 보임).

- [ ] **Step 6: 커밋**

```bash
git add app/components/admin/AdminApp.jsx
git commit -m "[deploy] 관리자 콘솔 로그인 — /api/login으로 JWT 발급받아 부착"
```

---

## Task 5: 모바일 앱 로그인 흐름 교체 (`ElevatorFieldApp.jsx`)

**Files:**
- Modify: `app/components/ElevatorFieldApp.jsx`

**Interfaces:**
- Consumes: `POST /api/login` (Task 1), `setAuthToken`/`clearAuthToken`/`getAuthToken` (Task 2)
- Task 4와 동일한 패턴을 이 파일에도 적용한다.

- [ ] **Step 1: import에 `setAuthToken`/`clearAuthToken`/`getAuthToken` 추가**

기존:
```js
import { supabase, writeOk, fetchAll, loginFailReason } from "@/lib/supabaseClient";
```

다음으로 교체:
```js
import { supabase, writeOk, fetchAll, loginFailReason, setAuthToken, clearAuthToken, getAuthToken } from "@/lib/supabaseClient";
```

- [ ] **Step 2: 세션 복원 시 토큰도 같이 복원**

기존 (187~197행):
```js
  // 로그인 세션 — Supabase Auth 대신 자체 로그인(민원24 아이디+비번, verify_login RPC) 결과를
  // localStorage에 담아둔다. 여기서 읽어와 로그인 여부를 판단한다. { id, name, role, mustChange }
  useEffect(() => {
    if (skipLogin) return;
    try {
      const raw = localStorage.getItem("guilAuthV1");
      setSession(raw ? JSON.parse(raw) : null);
    } catch {
      setSession(null);
    }
  }, [skipLogin]);
```

다음으로 교체:
```js
  // 로그인 세션 — Supabase Auth 대신 자체 로그인(민원24 아이디+비번, verify_login RPC) 결과를
  // localStorage에 담아둔다. 여기서 읽어와 로그인 여부를 판단한다. { id, name, role, mustChange }
  useEffect(() => {
    if (skipLogin) return;
    try {
      const raw = localStorage.getItem("guilAuthV1");
      const token = getAuthToken();
      if (raw && token) setAuthToken(token);
      setSession(raw && token ? JSON.parse(raw) : null);
    } catch {
      setSession(null);
    }
  }, [skipLogin]);
```

- [ ] **Step 3: `handleLogin`을 `/api/login` 호출로 교체**

기존 (340~358행):
```js
  async function handleLogin(loginId, password) {
    setAuthSubmitting(true);
    setAuthError("");
    // 민원24 아이디 + 비번을 DB 함수(verify_login)로 검증한다. 해시는 클라이언트로 안 나온다.
    const { data, error } = await supabase.rpc("verify_login", { p_login_id: (loginId || "").trim(), p_password: password });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      setAuthError(await loginFailReason(loginId));
      setAuthSubmitting(false);
      return;
    }
    const sess = { id: row.id, name: row.name, role: row.role, mustChange: row.must_change };
    localStorage.setItem("guilAuthV1", JSON.stringify(sess));
    setSession(sess);
    setAuthSubmitting(false);
    // 네이티브 앱은 로그인 직후 알림 권한을 바로 물어본다 — 마이페이지까지 찾아가서 직접
    // 켜야 하는 불편을 없앤다. 이미 허용/거부된 상태면 시스템이 조용히 넘어간다.
    if (Capacitor.isNativePlatform()) enablePush(row.id).catch(() => {});
  }
```

다음으로 교체:
```js
  async function handleLogin(loginId, password) {
    setAuthSubmitting(true);
    setAuthError("");
    // 민원24 아이디 + 비번을 서버(/api/login)가 verify_login DB 함수로 검증한다.
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) {
      setAuthError(json.reason || await loginFailReason(loginId));
      setAuthSubmitting(false);
      return;
    }
    const { profile: p, token } = json;
    setAuthToken(token);
    const sess = { id: p.id, name: p.name, role: p.role, mustChange: p.mustChange };
    localStorage.setItem("guilAuthV1", JSON.stringify(sess));
    setSession(sess);
    setAuthSubmitting(false);
    // 네이티브 앱은 로그인 직후 알림 권한을 바로 물어본다 — 마이페이지까지 찾아가서 직접
    // 켜야 하는 불편을 없앤다. 이미 허용/거부된 상태면 시스템이 조용히 넘어간다.
    if (Capacitor.isNativePlatform()) enablePush(p.id).catch(() => {});
  }
```

- [ ] **Step 4: `handleLogout`에 토큰 정리 추가**

기존 (685~689행):
```js
  function handleLogout() {
    localStorage.removeItem("guilAuthV1");
    setSession(null);
    setProfile(null);
  }
```

다음으로 교체:
```js
  function handleLogout() {
    localStorage.removeItem("guilAuthV1");
    clearAuthToken();
    setSession(null);
    setProfile(null);
  }
```

- [ ] **Step 5: 브라우저에서 실제 로그인/로그아웃 확인**

모바일 화면(`/`)에서 실제 계정으로 로그인 → 네트워크 탭에서 Authorization 헤더 확인 → 로그아웃 확인.

Expected: Task 4와 동일하게 정상 동작.

- [ ] **Step 6: 커밋**

```bash
git add app/components/ElevatorFieldApp.jsx
git commit -m "[deploy] 모바일 앱 로그인 — /api/login으로 JWT 발급받아 부착"
```

---

## Task 6: API 라우트 호출부 6곳에 토큰 부착

**Files:**
- Modify: `lib/push.js`
- Modify: `app/hooks/useLiveInspections.js`
- Modify: `app/components/InspectionFailDetailSheet.jsx`
- Modify: `app/components/admin/SitesAdmin.jsx`
- Modify: `app/components/admin/QuoteSendModal.jsx`

**Interfaces:**
- Consumes: `authFetch` (Task 3)

이 6개 파일은 `/api/push/send`, `/api/elevator-info`, `/api/elevator-fail-detail`, `/api/geocode-sites`, `/api/send-quote`를 일반 `fetch()`로 부른다 — `supabase.from(...)` 호출과 달리 토큰이 자동으로 안 붙으므로 각자 `authFetch`로 바꿔야 한다.

- [ ] **Step 1: `lib/push.js`의 `notify()` 수정**

파일 상단에 import 추가:
```js
import { authFetch } from "@/lib/apiFetch";
```

기존 (`notify()` 함수 내부):
```js
  fetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, profileIds, title, body, url, tag: uniqueTag }),
  }).catch(() => {});
```

다음으로 교체:
```js
  authFetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, profileIds, title, body, url, tag: uniqueTag }),
  }).catch(() => {});
```

(같은 파일의 `/api/push/register-native`, `/api/push/subscribe` 호출들은 이번 작업 대상이 아니므로 그대로 둔다.)

- [ ] **Step 2: `app/hooks/useLiveInspections.js`의 5개 fetch 호출 교체**

파일 상단에 import 추가:
```js
import { authFetch } from "@/lib/apiFetch";
```

38행 기존:
```js
    const res = await fetch(`/api/elevator-info?elevatorNo=${encodeURIComponent(q.govElevatorNo)}`);
```
교체:
```js
    const res = await authFetch(`/api/elevator-info?elevatorNo=${encodeURIComponent(q.govElevatorNo)}`);
```

97행 기존:
```js
    const res = await fetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}`);
```
교체:
```js
    const res = await authFetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}`);
```

134행 기존:
```js
    const res = await fetch(url);
```
교체:
```js
    const res = await authFetch(url);
```

151행 기존:
```js
    const res2 = await fetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}&anchorDate=${encodeURIComponent(latestAnchor)}`);
```
교체:
```js
    const res2 = await authFetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}&anchorDate=${encodeURIComponent(latestAnchor)}`);
```

183행 기존:
```js
    fetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}&latestOnly=1`)
      .then((res) => res.json())
```
교체:
```js
    authFetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(govElevatorNo)}&latestOnly=1`)
      .then((res) => res.json())
```

- [ ] **Step 3: `app/components/InspectionFailDetailSheet.jsx`의 2개 fetch 호출 교체**

파일 상단에 import 추가:
```js
import { authFetch } from "@/lib/apiFetch";
```

42행 기존:
```js
    const res = await fetch(url);
```
교체:
```js
    const res = await authFetch(url);
```

61행 기존:
```js
    const res2 = await fetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(inspection.govElevatorNo)}&anchorDate=${encodeURIComponent(latestAnchor)}`);
```
교체:
```js
    const res2 = await authFetch(`/api/elevator-fail-detail?elevatorNo=${encodeURIComponent(inspection.govElevatorNo)}&anchorDate=${encodeURIComponent(latestAnchor)}`);
```

- [ ] **Step 4: `app/components/admin/SitesAdmin.jsx`의 geocode-sites 호출 교체**

파일 상단에 import 추가 (다른 import들 근처):
```js
import { authFetch } from "@/lib/apiFetch";
```

598행 기존:
```js
    fetch("/api/geocode-sites?limit=5")
```
교체:
```js
    authFetch("/api/geocode-sites?limit=5")
```

- [ ] **Step 5: `app/components/admin/QuoteSendModal.jsx`의 send-quote 호출 교체**

파일 상단에 import 추가:
```js
import { authFetch } from "@/lib/apiFetch";
```

25행 기존:
```js
    const res = await fetch("/api/send-quote", {
```
교체:
```js
    const res = await authFetch("/api/send-quote", {
```

- [ ] **Step 6: 브라우저에서 5개 라우트 각각 한 번씩 실제로 동작시켜 네트워크 탭 확인**

- 검사관리 화면에서 실시간 검사 정보 있는 현장 하나 열기 → `/api/elevator-info`, `/api/elevator-fail-detail` 요청에 Authorization 헤더 확인
- 현장정보에서 새 현장 추가 → `/api/geocode-sites` 요청 확인
- 자재·견적 신청내역에서 견적 발송(발행된 견적 재발송, `QuoteSendModal`) → `/api/send-quote` 요청 확인
- 아무 알림 트리거(예: 할일 배정) → `/api/push/send` 요청 확인

Expected: 5개 요청 모두 Authorization 헤더 부착, 기능 자체는 지금까지와 동일하게 작동.

- [ ] **Step 7: 커밋**

```bash
git add lib/push.js app/hooks/useLiveInspections.js app/components/InspectionFailDetailSheet.jsx app/components/admin/SitesAdmin.jsx app/components/admin/QuoteSendModal.jsx
git commit -m "[deploy] API 라우트 5종 호출부에 로그인 토큰 부착 (authFetch)"
```

---

**[1단계 배포 체크포인트]** 여기까지 배포하고, 실제 로그인 상태에서 전체 화면이 지금까지와 똑같이 동작하는지 한 번 확인한 뒤 다음 단계로 넘어간다. RLS는 아직 꺼져 있으므로 토큰이 없어도(구버전 캐시 등) 여전히 다 보이는 게 정상 — 2단계에서 비로소 강제된다.

---

## Task 7: RLS 정책 SQL 작성

**Files:**
- Create: `supabase/migrations/105_rls_policies.sql`

**Interfaces:**
- 이 SQL은 자동 실행되지 않는다 — 사용자가 Supabase 대시보드 SQL Editor에서 직접 실행한다(프로젝트 관례, `supabase/CLAUDE.md`).
- Task 1단계(토큰 발급·부착)가 실제로 배포되고 검증된 뒤에만 실행해야 한다.

- [ ] **Step 1: SQL 파일 작성**

```sql
-- RLS 활성화 — 로그인(유효한 JWT)한 사용자만 데이터 접근 가능하게 한다.
-- 실행 전 필수 확인: 1단계(로그인 시 JWT 발급 + 클라이언트 부착)가 이미 배포되고
-- 실제로 Authorization 헤더가 붙는 것까지 확인된 뒤에 이 파일을 실행할 것 —
-- 순서를 지키지 않으면 실행 즉시 앱 전체가 멈춘다.

-- profiles를 제외한 모든 테이블: 로그인(authenticated)만 하면 읽기·쓰기 전부 허용.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sites', 'units', 'site_managers', 'failures', 'inspections',
    'material_requests', 'quote_requests', 'restock_requests', 'todos', 'billings',
    'self_checks', 'self_check_items', 'feed_posts', 'error_codes', 'kit_stock',
    'attendances', 'duty_schedules', 'duty_swaps', 'leaves', 'holidays',
    'inspection_fail_cache', 'push_subscriptions', 'native_push_tokens', 'notify_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated_full_access" on public.%I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
  end loop;
end $$;

-- profiles만 예외 — 직원 개인정보라 최고관리자·중간관리자만 (자재담당관리자·기사 제외).
alter table public.profiles enable row level security;

create policy "admin_only_access" on public.profiles
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

- [ ] **Step 2: 커밋 (SQL 파일만 — 앱 코드 변경 없으므로 `[deploy]` 태그 불필요)**

```bash
git add supabase/migrations/105_rls_policies.sql
git commit -m "RLS 정책 SQL 작성 (실행은 Supabase SQL Editor에서 별도)"
```

- [ ] **Step 3: 사용자가 Supabase 대시보드 SQL Editor에서 직접 실행**

이 스텝은 코드로 자동화하지 않는다 — 담당자가 대시보드에 로그인해 SQL Editor에 위 내용을 붙여넣고 실행한다.

- [ ] **Step 4: 실행 후 검증 — 로그인 상태 정상 동작**

로그인한 상태로 관리자 콘솔의 주요 화면(대시보드, 현장정보, 고장관리, 자재·견적 신청내역, 인사관리)을 열어 데이터가 그대로 보이는지 확인.

Expected: 1단계 배포 이전과 동일하게 전부 정상 표시.

- [ ] **Step 5: 실행 후 검증 — 로그인 없이 anon key로 직접 조회하면 막히는지 확인**

```bash
curl -s "https://kdptzotxnzpuwzdguzgh.supabase.co/rest/v1/sites?select=id,name&limit=1" -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY 값>" -H "Authorization: Bearer <같은 anon key 값>"
```

Expected: 빈 배열 `[]` (RLS가 authenticated 롤이 아닌 요청을 걸러내서 행이 하나도 안 옴 — anon key 자체는 유효한 API 키라 401은 아니고, 조건에 안 맞아 0행이 되는 게 정상).

---

## Task 8: 서버용 토큰 검증 헬퍼

**Files:**
- Create: `lib/verifyToken.js`

**Interfaces:**
- Consumes: 없음
- Produces: `verifyAuthToken(request): { profileId, appRole, adminTier } | null` — Task 9가 이 함수를 쓴다.

- [ ] **Step 1: `lib/verifyToken.js` 작성**

```js
// API 라우트에서 로그인 토큰(Authorization: Bearer ...)을 검증하는 서버 전용 헬퍼.
// /api/login이 발급한 것과 같은 SUPABASE_JWT_SECRET으로 서명을 확인한다.
import jwt from "jsonwebtoken";

export function verifyAuthToken(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret);
    return { profileId: payload.profile_id, appRole: payload.app_role, adminTier: payload.admin_tier ?? null };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/verifyToken.js
git commit -m "API 라우트용 토큰 검증 헬퍼(verifyAuthToken) 추가"
```

---

## Task 9: 5개 API 라우트에 인증 가드 추가

**Files:**
- Modify: `app/api/geocode-sites/route.js`
- Modify: `app/api/elevator-fail-detail/route.js`
- Modify: `app/api/elevator-info/route.js`
- Modify: `app/api/send-quote/route.js`
- Modify: `app/api/push/send/route.js`

**Interfaces:**
- Consumes: `verifyAuthToken` (Task 8)

- [ ] **Step 1: `app/api/geocode-sites/route.js` — 로그인 사용자면 통과**

기존 (19행 `export async function GET(request) {` 바로 다음 줄부터):
```js
export async function GET(request) {
  const key = process.env.TMAP_APP_KEY;
```

다음으로 교체:
```js
import { verifyAuthToken } from "@/lib/verifyToken";

export async function GET(request) {
  if (!verifyAuthToken(request)) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const key = process.env.TMAP_APP_KEY;
```

(import는 파일 최상단 다른 import들 옆으로 옮겨도 되지만, 위치보다 "파일 최상단에 있어야 한다"는 점만 지키면 된다 — 아래 예시들도 동일.)

- [ ] **Step 2: `app/api/elevator-fail-detail/route.js` — 로그인 사용자면 통과**

기존 (18행):
```js
export async function GET(request) {
  const { searchParams } = new URL(request.url);
```

다음으로 교체:
```js
import { verifyAuthToken } from "@/lib/verifyToken";

export async function GET(request) {
  if (!verifyAuthToken(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
```

- [ ] **Step 3: `app/api/elevator-info/route.js` — 로그인 사용자면 통과**

기존 (15행):
```js
export async function GET(request) {
  const { searchParams } = new URL(request.url);
```

다음으로 교체:
```js
import { verifyAuthToken } from "@/lib/verifyToken";

export async function GET(request) {
  if (!verifyAuthToken(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
```

- [ ] **Step 4: `app/api/send-quote/route.js` — 관리자만 통과**

기존 (7행):
```js
export async function POST(request) {
  const body = await request.json().catch(() => null);
```

다음으로 교체:
```js
import { verifyAuthToken } from "@/lib/verifyToken";

export async function POST(request) {
  const auth = verifyAuthToken(request);
  if (!auth || auth.appRole !== "admin") return Response.json({ results: {}, reason: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
```

- [ ] **Step 5: `app/api/push/send/route.js` — 로그인 사용자 OR CRON_SECRET**

기존 (36~38행):
```js
export async function POST(request) {
  try {
    return await handlePost(request);
```

다음으로 교체:
```js
import { verifyAuthToken } from "@/lib/verifyToken";

function isAuthorized(request) {
  if (verifyAuthToken(request)) return true;
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  return !!secret && header === `Bearer ${secret}`;
}

export async function POST(request) {
  if (!isAuthorized(request)) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  try {
    return await handlePost(request);
```

(`import { createClient } from "@supabase/supabase-js";` 등 기존 import들은 그대로 두고 `verifyAuthToken` import만 추가한다.)

- [ ] **Step 6: 각 라우트를 인증 없이/틀린 토큰으로 호출해 401 확인**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/geocode-sites?limit=1"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/elevator-info?elevatorNo=1"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/elevator-fail-detail?elevatorNo=1"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/send-quote" -H "Content-Type: application/json" -d "{}"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/push/send" -H "Content-Type: application/json" -d "{}"
```

Expected: 5개 모두 `401`.

- [ ] **Step 7: 로그인 상태로 실제 화면에서 각 기능이 정상 동작하는지 재확인 (Task 6 Step 7과 동일한 5가지 시나리오)**

- [ ] **Step 8: 커밋**

```bash
git add app/api/geocode-sites/route.js app/api/elevator-fail-detail/route.js app/api/elevator-info/route.js app/api/send-quote/route.js app/api/push/send/route.js
git commit -m "[deploy] API 라우트 5종에 로그인 토큰 검증 추가"
```

---

## Task 10: 크론 6개 라우트의 push/send 내부 호출에 CRON_SECRET 부착

**Files:**
- Modify: `app/api/cron/check-selfcheck/route.js`
- Modify: `app/api/cron/check-inspections/route.js`
- Modify: `app/api/cron/check-failures/route.js`
- Modify: `app/api/cron/check-duty-tomorrow/route.js`
- Modify: `app/api/cron/check-attendance/route.js`
- Modify: `app/api/cron/check-contracts/route.js`

**Interfaces:**
- Task 9에서 `/api/push/send`가 CRON_SECRET을 인증 수단으로 받아들이게 했으므로, 이 6개 라우트의 내부 호출에 그 헤더를 실제로 실어 보낸다.

- [ ] **Step 1: `check-selfcheck`, `check-inspections`, `check-duty-tomorrow`, `check-attendance` — 공통 `send` 헬퍼 패턴**

4개 파일 모두 아래와 동일한 형태의 `send` 헬퍼를 갖고 있다. 각 파일에서 기존:
```js
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);
```

다음으로 교체:
```js
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);
```

(각 파일 상단의 `CRON_SECRET` 체크에서 이미 `const secret = process.env.CRON_SECRET;`로 변수를 만들어 쓰고 있으므로 그 변수를 그대로 재사용한다 — 새로 선언하지 않는다.)

- [ ] **Step 2: `check-failures` — 동일 패턴이지만 파일 안에 `send` 헬퍼가 있는 위치 확인 후 동일하게 교체**

`check-failures/route.js`도 같은 `send = (body) => fetch(...)` 패턴을 쓴다 — Step 1과 동일하게 `Authorization: Bearer ${secret}` 헤더만 추가한다.

- [ ] **Step 3: `check-contracts` — 인라인 호출 교체**

기존:
```js
  const ok = await fetch(`${origin}/api/push/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: "contract_expiring",
      title: "계약 만료 임박 현장",
      body: sites.map((s) => `${s.name}(${s.contract_end})`).join(", "),
      url: "/admin?openContract=1",
    }),
  }).then((r) => r.ok).catch(() => false);
```

다음으로 교체:
```js
  const ok = await fetch(`${origin}/api/push/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      key: "contract_expiring",
      title: "계약 만료 임박 현장",
      body: sites.map((s) => `${s.name}(${s.contract_end})`).join(", "),
      url: "/admin?openContract=1",
    }),
  }).then((r) => r.ok).catch(() => false);
```

- [ ] **Step 4: 6개 라우트 중 하나를 실제로 호출해 push/send까지 성공하는지 확인**

```bash
curl -s -X POST "http://localhost:3000/api/cron/check-attendance" -H "Authorization: Bearer <로컬 .env.local의 CRON_SECRET 값>"
```

Expected: `{"ok":true,...}` 형태 응답 (라우트 자체 로직에 따라 발송 대상이 없으면 `sent:0`일 수 있음 — 그건 정상, 확인 포인트는 401/500 없이 정상 흐름으로 끝나는 것).

- [ ] **Step 5: 커밋**

```bash
git add app/api/cron/check-selfcheck/route.js app/api/cron/check-inspections/route.js app/api/cron/check-failures/route.js app/api/cron/check-duty-tomorrow/route.js app/api/cron/check-attendance/route.js app/api/cron/check-contracts/route.js
git commit -m "[deploy] 크론 라우트 6개 — push/send 내부 호출에 CRON_SECRET 부착"
```

---

## Task 11: 크론 인증 구멍 2개 마무리 (스펙 범위 밖이지만 조사 중 발견 — 같은 종류 문제라 같이 정리)

**Files:**
- Modify: `app/api/cron/sync-holidays/route.js`
- Modify: `app/api/cron/sync-inspection-cache/route.js`

**Interfaces:**
- 없음 (독립적인 방어 강화)

- [ ] **Step 1: `sync-holidays/route.js` — CRON_SECRET 체크 신규 추가**

기존:
```js
export async function GET() {
  const key = process.env.HOLIDAY_API_KEY;
```

다음으로 교체:
```js
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const key = process.env.HOLIDAY_API_KEY;
```

- [ ] **Step 2: `sync-inspection-cache/route.js` — fail-open을 fail-closed로 교체**

기존:
```js
export async function GET(request) {
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }
```

다음으로 교체:
```js
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
```

- [ ] **Step 3: 두 라우트를 인증 없이/올바른 시크릿으로 각각 호출해 확인**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/cron/sync-holidays"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/cron/sync-inspection-cache"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/cron/sync-holidays" -H "Authorization: Bearer <CRON_SECRET 값>"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/cron/sync-inspection-cache" -H "Authorization: Bearer <CRON_SECRET 값>"
```

Expected: 시크릿 없이는 둘 다 `401`, 시크릿과 함께면 정상 처리(`200`).

- [ ] **Step 4: vercel.json의 두 cron 항목이 실제로 CRON_SECRET을 헤더로 보내는지 확인**

Vercel Cron은 기본적으로 `Authorization: Bearer $CRON_SECRET`을 자동으로 붙여 보낸다(Vercel 플랫폼 자체 기능, `CRON_SECRET` 환경변수가 Vercel 프로젝트에 설정돼 있으면 자동 적용) — 이미 `sync-inspection-cache`가 같은 패턴으로 지금까지 정상 동작해왔으므로 새로 설정할 것은 없다. 배포 후 다음 스케줄(매일 19:00, 매월 1일 03:00)에 정상 실행되는지 Vercel 대시보드 → Cron Jobs 로그로 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/api/cron/sync-holidays/route.js app/api/cron/sync-inspection-cache/route.js
git commit -m "[deploy] 크론 인증 누락(sync-holidays)·fail-open(sync-inspection-cache) 수정"
```

---

## Self-Review

**스펙 커버리지 확인:**
- 로그인 UX 불변 — Task 1/4/5 (화면 코드 무변경, 흐름만 뒤에서 교체) ✅
- 기존 접근 범위(로그인만 하면 전체) 유지 — Task 7의 RLS 정책 ✅
- `profiles` 관리자 전용 예외 — Task 7 ✅
- 5개 API 라우트 가드 — Task 9 ✅
- 배포 순서(1단계→2단계→3단계) — Task 1~6(1단계) / Task 7(2단계) / Task 8~11(3단계) 순서로 명시 ✅
- 스펙의 "열린 질문"(localStorage 평문 토큰, verify_login 무차별 대입)은 범위 밖으로 스펙에 이미 명시돼 있어 이 계획에도 포함하지 않음 — 의도된 누락.

**플레이스홀더 스캔:** 전체 스텝에 "TODO"·"적절히 처리" 같은 표현 없음, 모든 코드 스텝에 실제 코드 포함 확인.

**타입/이름 일관성:** `setAuthToken`/`clearAuthToken`/`getAuthToken`(Task 2 생성) → Task 4/5/6에서 동일한 이름으로 사용. `verifyAuthToken`(Task 8 생성, 반환 형태 `{profileId, appRole, adminTier}`) → Task 9에서 `auth.appRole` 형태로 정확히 일치해 사용. `authFetch`(Task 3 생성) → Task 6에서 동일 이름 사용. 일관성 확인 완료.
