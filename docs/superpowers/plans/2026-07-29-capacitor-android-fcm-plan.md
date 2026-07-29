# 안드로이드 Capacitor + FCM 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 PWA(웹앱)는 그대로 두고, 안드로이드 전용 네이티브 껍데기(Capacitor)를 추가해 FCM 네이티브 푸시로 배달 신뢰성(방해금지 우회, 백그라운드 전달)을 높인다.

**Architecture:** Capacitor WebView가 라이브 URL(`https://guil-app-pi.vercel.app`)을 그대로 띄운다 — 웹 코드는 수정 없이 재사용. 클라이언트는 `Capacitor.isNativePlatform()`으로 네이티브 여부를 감지해 기존 웹푸시 구독 대신 FCM 토큰을 발급받아 새 테이블에 저장한다. 서버는 발송 시 웹 구독(web-push)과 네이티브 토큰(FCM) 양쪽에 병행 발송한다.

**Tech Stack:** Capacitor 7(core/cli/android/push-notifications), Firebase Cloud Messaging, firebase-admin(Node.js SDK), 기존 Next.js/Supabase 스택 그대로.

## Global Constraints

- 패키지명(appId) 고정: `com.guilelevator.app` (Firebase에 이미 이 이름으로 Android 앱 등록 완료, `google-services.json` 발급받아 프로젝트 루트 상위 폴더에 있음: `../google-services.json`)
- 라이브 URL 고정: `https://guil-app-pi.vercel.app` (capacitor.config의 server.url)
- **이 계획에서 Claude(에이전트)가 실행 가능한 것**: npm 패키지 설치, Capacitor 설정 파일 작성, `npx cap add android`(플랫폼 스캐폴딩 — Gradle 빌드 자체를 실행하지 않으므로 Java 없이도 가능), 클라이언트/서버 JS 코드 수정, SQL 마이그레이션 파일 작성, Gradle 설정 파일의 텍스트 편집.
- **이 계획에서 사용자가 직접 해야 하는 것**(이 저장소 개발 환경에 Java/Android SDK가 없어 Claude가 대신 못 함): 안드로이드 스튜디오 설치, 실제 APK 빌드(`./gradlew` 또는 Android Studio), keystore 생성·서명, 실기기 테스트, Firebase 서비스 계정 키 발급 및 서버 환경변수 등록, Supabase SQL 마이그레이션 실행(이 저장소 규칙상 DDL은 대시보드에서 직접 실행).
- 이 저장소 배포 규칙 준수: 코드 변경은 커밋만 하고, `[deploy]` 태그는 사용자가 배포를 명시적으로 요청할 때만 붙인다(`docs/APK-PLAN.md`와 무관하게 기존 CLAUDE.md 규칙 그대로).
- 웹앱(PWA) 기존 동작·파일은 변경하지 않는다 — 오직 "추가"만 한다(YAGNI: 네이티브 전용 UI 재구성, 딥링크, 화이트라벨은 이번 범위 아님).

---

### Task 1: Capacitor 프로젝트 스캐폴딩

**Files:**
- Modify: `package.json` (npm install로 자동 갱신)
- Create: `capacitor.config.json`
- Create: `android/` (전체 폴더, `npx cap add android`가 생성)
- Modify: `android/app/google-services.json` (파일 배치)
- Modify: `android/build.gradle` (Google services 플러그인 classpath)
- Modify: `android/app/build.gradle` (플러그인 적용)

**Interfaces:**
- Produces: `capacitor.config.json`의 `appId`(`com.guilelevator.app`)와 `server.url` — Task 2~4에서 그대로 참조.
- Produces: `android/` 폴더 존재 — 사용자가 안드로이드 스튜디오로 여는 대상.

- [ ] **Step 1: Capacitor 패키지 설치**

```bash
npm install @capacitor/core @capacitor/android @capacitor/push-notifications
npm install --save-dev @capacitor/cli
```

- [ ] **Step 2: capacitor.config.json 작성**

```json
{
  "appId": "com.guilelevator.app",
  "appName": "구일엘리베이터",
  "webDir": "public",
  "server": {
    "url": "https://guil-app-pi.vercel.app",
    "cleartext": false
  }
}
```

`webDir`은 Capacitor CLI가 값 존재를 요구해서 넣는 자리표시일 뿐이다 — `server.url`이 있으면 실제로는 이 로컬 폴더 대신 라이브 URL을 로드하므로 `public`(이미 존재하는 폴더) 지정으로 충분하다.

- [ ] **Step 3: Android 플랫폼 추가**

```bash
npx cap add android
```

Expected: `android/` 폴더가 새로 생기고, `android/app/src/main/AndroidManifest.xml` 등 표준 Capacitor 템플릿 파일들이 들어있다. (Gradle을 실제로 실행하지 않는 스캐폴딩 단계라 Java 없이도 완료된다.)

- [ ] **Step 4: google-services.json 배치**

```bash
cp "../google-services.json" android/app/google-services.json
```

- [ ] **Step 5: Google services Gradle 플러그인 연결**

`android/build.gradle` 최상단 `buildscript { dependencies { ... } }` 블록 안에 아래 줄을 추가한다 (기존 `com.android.tools.build:gradle` 줄 바로 아래):

```gradle
classpath 'com.google.gms:google-services:4.4.2'
```

`android/app/build.gradle` 맨 아래(파일 끝)에 추가한다:

```gradle
apply plugin: 'com.google.gms.google-services'
```

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json capacitor.config.json android
git commit -m "feat: Capacitor 안드로이드 플랫폼 스캐폴딩 추가"
git push
```

---

### Task 2: 네이티브 푸시 토큰 저장용 테이블 + 등록 API

**Files:**
- Create: `supabase/migrations/078_native_push_tokens.sql`
- Create: `app/api/push/register-native/route.js`

**Interfaces:**
- Produces: 테이블 `public.native_push_tokens(token text primary key, profile_id uuid, platform text, created_at timestamptz, last_used_at timestamptz)`.
- Produces: `POST /api/push/register-native` — body `{ profileId, token, platform }` → `{ ok: boolean, reason?: string }`. Task 3의 클라이언트 코드가 이 엔드포인트를 호출한다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 038_push_subscriptions.sql(웹푸시 구독)과 별개로, 네이티브(FCM) 토큰은 스키마가 다르다
-- (p256dh/auth 같은 웹푸시 암호화 키가 없고 토큰 문자열 하나뿐) — 별도 테이블로 관리한다.
create table if not exists public.native_push_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists native_push_tokens_profile_idx on public.native_push_tokens (profile_id);
```

- [ ] **Step 2: 실행 요청**

이 저장소 규칙상(`supabase/CLAUDE.md`) DDL은 대시보드 SQL Editor에서 직접 실행해야 한다 — 사용자에게 위 SQL을 Supabase 대시보드에서 실행해달라고 요청한다.

- [ ] **Step 3: 등록 API 라우트 작성**

`app/api/push/register-native/route.js`:

```js
// 네이티브(Capacitor/FCM) 푸시 토큰 저장 — app/api/push/subscribe/route.js(웹푸시)의 네이티브 버전.
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function POST(request) {
  const { profileId, token, platform } = await request.json().catch(() => ({}));
  if (!profileId || !token) {
    return Response.json({ ok: false, reason: "잘못된 요청" }, { status: 400 });
  }
  const { error } = await db().from("native_push_tokens").upsert(
    { profile_id: profileId, token, platform: platform || "android" },
    { onConflict: "token" }
  );
  if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: 빌드로 문법 확인**

```bash
npm run build
```

Expected: 에러 없이 성공.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/078_native_push_tokens.sql app/api/push/register-native/route.js
git commit -m "feat: 네이티브 푸시 토큰 저장 테이블·API 추가"
git push
```

---

### Task 3: 클라이언트 — 네이티브 환경에서 FCM 토큰 등록

**Files:**
- Modify: `lib/push.js`

**Interfaces:**
- Consumes: Task 2의 `POST /api/push/register-native`.
- Produces: 기존 `enablePush(profileId)`의 시그니처·반환값(`{ok, reason?}`)은 그대로 유지 — 호출하는 화면 쪽 코드는 수정할 필요 없음(웹/네이티브 분기는 함수 내부에서 처리).

- [ ] **Step 1: import 추가 및 네이티브 분기 함수 작성**

`lib/push.js` 최상단에 추가:

```js
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
```

`enablePush` 함수 바로 위에 새 함수를 추가한다:

```js
/** 네이티브(Capacitor) 앱에서 FCM 토큰을 받아 서버에 저장한다. enablePush()가 네이티브일 때 이걸 대신 부른다. */
async function enablePushNative(profileId) {
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") {
    return { ok: false, reason: "알림 권한이 허용되지 않았습니다" };
  }
  await PushNotifications.register();
  return new Promise((resolve) => {
    PushNotifications.addListener("registration", async (token) => {
      const res = await fetch("/api/push/register-native", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, token: token.value, platform: "android" }),
      });
      resolve(res.ok ? { ok: true } : { ok: false, reason: "구독 저장에 실패했습니다" });
    });
    PushNotifications.addListener("registrationError", () => {
      resolve({ ok: false, reason: "네이티브 알림 등록에 실패했습니다" });
    });
  });
}
```

- [ ] **Step 2: enablePush()가 네이티브면 위 함수로 위임**

기존 `enablePush` 함수의 첫 줄(`if (!pushSupported()) return ...` 앞)에 추가:

```js
export async function enablePush(profileId) {
  if (Capacitor.isNativePlatform()) return enablePushNative(profileId);
  if (!pushSupported()) return { ok: false, reason: "이 브라우저는 알림을 지원하지 않습니다" };
  // ... 이하 기존 코드 그대로
```

- [ ] **Step 3: pushSupported()/isSubscribed()도 네이티브 인지하게 보완**

`pushSupported` 함수를 다음으로 교체(네이티브면 브라우저 PushManager 유무와 무관하게 지원되는 것으로 본다):

```js
export function pushSupported() {
  if (Capacitor.isNativePlatform()) return true;
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
```

- [ ] **Step 4: 빌드로 문법 확인**

```bash
npm run build
```

Expected: 에러 없이 성공. (`@capacitor/core`는 웹 환경에서도 import 자체는 문제없이 되고 `isNativePlatform()`이 `false`를 반환하므로 기존 웹 동작은 변화 없음.)

- [ ] **Step 5: 커밋**

```bash
git add lib/push.js
git commit -m "feat: 네이티브(Capacitor) 환경에서 FCM 토큰 등록 분기 추가"
git push
```

---

### Task 4: 서버 — FCM 발송 분기 추가

**Files:**
- Modify: `app/api/push/send/route.js`
- Modify: `.env.local` (사용자가 값 채움)

**Interfaces:**
- Consumes: Task 2의 테이블 `native_push_tokens`.
- Consumes(신규 환경변수): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — Firebase 콘솔 "프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성"으로 받는 JSON 안의 값. **google-services.json과는 다른 파일**이니 헷갈리지 않는다(그건 클라이언트용, 이건 서버 발송용).

- [ ] **Step 1: firebase-admin 설치**

```bash
npm install firebase-admin
```

- [ ] **Step 2: 서버 라우트에 FCM 발송 분기 추가**

`app/api/push/send/route.js` 상단 import에 추가:

```js
import admin from "firebase-admin";
```

같은 파일에 헬퍼 함수 추가(파일 상단, `CATALOG` 선언 아래):

```js
function firebaseApp() {
  if (admin.apps.length) return admin.apps[0];
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}
```

기존 `if (gone.length) await db.from("push_subscriptions").delete()...` 줄과 `return Response.json({ ok: true, sent, removed: gone.length });` 사이에 아래 블록을 추가한다:

```js
  // 네이티브(Capacitor) 앱 사용자는 web-push 대신 FCM으로 받는다 — 같은 대상(targets)에 병행 발송.
  const { data: nativeTokens } = await db
    .from("native_push_tokens")
    .select("token")
    .in("profile_id", targets.map((p) => p.id));
  if (nativeTokens?.length && process.env.FIREBASE_PROJECT_ID) {
    const app = firebaseApp();
    const goneNative = [];
    await Promise.all(nativeTokens.map(async (t) => {
      try {
        await admin.messaging(app).send({
          token: t.token,
          notification: { title: title || item.label, body: body || "" },
          data: { url: url || "/", tag: tag || key },
          android: { priority: urgency === "high" ? "high" : "normal" },
        });
        sent++;
      } catch (e) {
        if (e.code === "messaging/registration-token-not-registered") goneNative.push(t.token);
      }
    }));
    if (goneNative.length) await db.from("native_push_tokens").delete().in("token", goneNative);
  }
```

- [ ] **Step 3: 환경변수 자리 만들기(.env.local)**

`.env.local`에 아래 3줄을 추가한다(사용자가 실제 값을 Firebase 서비스 계정 JSON에서 복사해 채워야 함 — 값은 Claude가 모름):

```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

- [ ] **Step 4: 빌드로 문법 확인**

```bash
npm run build
```

Expected: 에러 없이 성공. (환경변수가 비어 있으면 `nativeTokens?.length && process.env.FIREBASE_PROJECT_ID` 조건에서 걸러져 기존 web-push 발송 동작에는 영향 없음 — 안전하게 값 채우기 전에도 배포 가능하다.)

- [ ] **Step 5: 커밋**

```bash
git add app/api/push/send/route.js
git commit -m "feat: /api/push/send에 FCM(네이티브) 발송 분기 추가"
git push
```

`.env.local`은 `.gitignore`에 있어 커밋되지 않는다 — Vercel 쪽 환경변수는 사용자가 실제 값을 받은 뒤 별도로 등록해야 한다(아래 사용자 가이드 참고).

---

## 사용자 실행 가이드 (Claude가 대신 할 수 없는 부분)

위 Task 1~4를 완료하면 코드는 준비되지만, 아래는 이 개발 환경(Java/Android SDK 없음)에서 Claude가 실행할 수 없어 사용자가 직접 해야 한다.

1. **Firebase 서비스 계정 키 발급** (Task 4용, google-services.json과 별개):
   Firebase 콘솔 → 프로젝트 설정(⚙️) → 서비스 계정 탭 → "새 비공개 키 생성" → JSON 다운로드.
   그 JSON 안의 `project_id`/`client_email`/`private_key` 값을 `.env.local`의 `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`에 채워 넣고, Vercel 대시보드 Production 환경변수에도 동일하게 등록.
2. **Supabase SQL 실행**: Task 2의 `078_native_push_tokens.sql` 내용을 Supabase 대시보드 SQL Editor에서 실행.
3. **안드로이드 스튜디오 설치**: Java/Android SDK가 함께 설치된다.
4. **프로젝트 열기**: 안드로이드 스튜디오에서 `android/` 폴더 열기 → Gradle 동기화.
5. **keystore 생성·서명**: Android Studio의 Build → Generate Signed Bundle/APK 마법사 사용(keystore 파일은 분실하면 이후 업데이트 배포가 불가능하니 안전한 곳에 백업).
6. **실기기 테스트**: 갤럭시 실기기에 설치해 잠금화면/방해금지 상태에서 알림 확인. (배터리 절전 예외 안내도 첫 실행 시 함께 안내하면 좋음 — `docs/APK-PLAN.md` 0번 항목 참고)
7. **사이드로드 배포**: 완성된 APK를 웹사이트나 카카오톡 등으로 직원들에게 배포(`docs/APK-PLAN.md` 3-1 참고 — "출처를 알 수 없는 앱 허용" 안내 필요).
