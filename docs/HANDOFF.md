# 처리 요청 (차호근 쪽 → ssj910-design 쪽)

> 이 문서는 **한쪽 권한으로 막혀 상대가 처리해야 하는 작업**을 모읍니다.
> 두 사람이 같은 앱을 만들다 보니, 내 권한 밖(예: 상대의 Vercel 계정)에서만 되는 일이 생깁니다.
> 처리한 항목은 **완료 표시 후 삭제**해 주세요. 급한 건은 커밋 메시지 제목에도 `[요청]`으로 남깁니다.

---

## 🔴 대기 중

### 1. Vercel 환경변수 — 웹 푸시 알림 활성화 (2026-07-21, 차호근)

**상태:** 로컬(차호근 환경)에서는 발송·수신 확인 완료. 배포본은 키가 없어 동작 안 함.
푸시를 제외한 나머지 기능은 배포본에서 정상.

**해야 할 일** — `docs/SETUP-ENV.md` 3번 항목 참고:
1. 저장소에서 키 생성:
   ```bash
   node -e "console.log(require('web-push').generateVAPIDKeys())"
   ```
2. Vercel → guil-app → Settings → Environment Variables 에 3개 등록
   (Production·Preview·Development 모두 체크):
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = 위 publicKey
   - `VAPID_PRIVATE_KEY` = 위 privateKey
   - `VAPID_SUBJECT` = `mailto:운영자메일`
3. Deployments → 맨 위 배포 ⋯ → Redeploy

> 키는 새로 만들어도 무방 (현재 실제 구독자 0명). 단 **직원들이 알림을 켠 뒤에는 교체 금지** — 기존 구독이 전부 무효화됩니다.

**확인:** 폰(안드로이드는 크롬 그대로, 아이폰은 홈 화면 추가 후)에서 마이페이지 → "이 기기에서 알림 받기" 켜고, 김기사 계정으로 고장 배정/출동 거부 시 알림 도착.

---

## 🟡 선택 (없어도 앱은 정상)

### 2. HOLIDAY_API_KEY — 공휴일 자동 동기화

data.go.kr에서 **"특일정보"** 활용신청(무료·즉시) → 발급된 키를 Vercel 환경변수 `HOLIDAY_API_KEY`에 등록.
없으면 `lib/holidays.json`(2026년만) 폴백 사용. 등록하면 매월 1일 크론이 공휴일 자동 갱신.

---

## ✅ 완료 (기록용, 다음 정리 때 삭제 가능)

- (아직 없음)

---

## 우리(차호근 쪽)가 직접 하는 것 — 여기 적지 않음

- Supabase 스키마 변경: pooler로 직접 psql 실행 가능
- 코드·마이그레이션 작성, 커밋, 푸시
