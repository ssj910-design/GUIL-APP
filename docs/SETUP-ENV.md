# 배포 환경변수 설정 (Vercel)

> **📌 요청 — ssj910-design(또는 그쪽 Claude)에게**
> 웹 푸시 알림을 붙였는데 **Vercel 환경변수가 없어서 배포본에서 동작하지 않습니다.**
> 아래 3번(VAPID) 항목만 등록 + Redeploy 해주시면 알림이 켜집니다.
> 차호근 로컬에는 이미 설정돼 있어 개발 환경에서는 정상 동작 확인했습니다.
> (2026-07-20, 차호근 / nonexpertchassi-creator)

## 왜 필요한가

`.env*` 는 `.gitignore`에 걸려 있어 저장소에 올라가지 않습니다(비밀키라 올리면 안 됨).
그래서 로컬에서 되는 기능도 **Vercel에 같은 값을 따로 넣어야** 배포본에서 동작합니다.

## 등록 위치

vercel.com → **guil-app** 프로젝트 → **Settings** → **Environment Variables**
→ Production·Preview·Development **모두 체크** → Save
→ 전부 넣은 뒤 **Deployments → 맨 위 배포 ⋯ → Redeploy** (환경변수는 배포 시점에 주입됨)

---

## 1. Supabase (이미 설정돼 있을 것)

| Key | 비고 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | |

## 2. 공공데이터 / 티맵

| Key | 용도 | 없으면 |
|---|---|---|
| `ELEVATOR_API_SERVICE_KEY` | 국가승강기정보센터 (검사 캐시 크론) | 실시간 검사정보 미표시 |
| `TMAP_APP_KEY` | 현장 주소 → 좌표 변환 (`/api/geocode-sites`) | 신규 현장 좌표 미생성 (기존 711개는 이미 변환 완료) |
| `HOLIDAY_API_KEY` | 공휴일 자동 동기화 (`/api/cron/sync-holidays`) | `lib/holidays.json` 폴백 사용 (2026년만) |

`HOLIDAY_API_KEY`는 아직 발급 전입니다. data.go.kr에서 **"특일정보"** 활용신청(무료·즉시 승인)
후 넣으면 매월 1일 크론이 공휴일을 자동 갱신합니다. 없어도 앱은 정상 동작합니다.

---

## 3. ⭐ 웹 푸시 (VAPID) — **지금 필요한 작업**

| Key | 설명 |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 브라우저에 노출되는 공개키 |
| `VAPID_PRIVATE_KEY` | **비밀키** — 절대 커밋 금지 |
| `VAPID_SUBJECT` | `mailto:운영자이메일` 형식 |

### 키 만드는 법

저장소에서 아래를 실행하면 새 키 쌍이 나옵니다 (`web-push`는 이미 의존성에 있음):

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

출력된 `publicKey` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`privateKey` → `VAPID_PRIVATE_KEY` 로 넣고,
`VAPID_SUBJECT` 는 `mailto:non.expert.cha.ssi@gmail.com` (또는 운영자 메일).

> **새로 만들어도 됩니다.** 현재 실제 구독자가 0명이라 기존 키와 달라도 문제 없습니다.
> 다만 **직원들이 알림을 켠 뒤에는 키를 바꾸지 마세요** — 기존 구독이 전부 무효가 되어
> 전원이 다시 켜야 합니다.

### 설정 후 확인

1. Redeploy 완료 대기
2. 폰에서 `guil-app-pi.vercel.app` 접속
   - **안드로이드**: 크롬에서 바로 가능
   - **아이폰**: `공유 → 홈 화면에 추가` 후 **그 아이콘으로 열어야** 푸시 가능 (iOS 제약)
3. 마이페이지(우상단 사람 아이콘) → **이 기기에서 알림 받기** → `켜짐` 확인
4. 다른 기기에서 김기사 계정으로 고장 배정/출동 거부 → 알림 도착 확인

동작 안 하면 `/api/push/send` 응답을 보면 원인이 나옵니다:
- `VAPID 키 미설정` → 환경변수 누락 또는 Redeploy 안 함
- `구독 기기 없음` → 아무도 알림을 켜지 않음
- `회사 설정에서 꺼짐` → 관리자 콘솔 → 알림 설정에서 해당 항목이 꺼짐
- `sent: N` → 정상 발송

---

## 알림 구조 요약 (참고)

- 알림 종류 카탈로그: `lib/notifications.js` (23종, 단일 원본)
- 회사 기본값: 관리자 콘솔 → **알림 설정** (`notify_settings` 테이블)
- 개인 on/off: 마이페이지 → 알림 설정 (`profiles.notify_prefs`)
- 회사가 끈 알림은 개인이 켤 수 없음. 자세한 판정은 `isEnabled()` 참고
- 자세한 설계·미연결 트리거 목록: [NOTIFICATIONS.md](NOTIFICATIONS.md)
