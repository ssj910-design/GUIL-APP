-- 149: 고장접수 처리입력 누적 이력(responses) — 지원요청으로 티켓이 미배정 복귀된 뒤
-- 지원자가 또 처리입력을 하면, 기존 fault_symptom/process_content/photo_urls 같은 단일
-- 스냅샷 컬럼이 이번 제출로 통째로 덮어써져 최초배정자가 적은 증상·원인·처리내용·사진이
-- 사라지는 버그가 있었다(승빌딩 사례로 확인). 단일 스냅샷 컬럼은 그대로 두고(목록·통계·
-- 알림 등 기존 코드가 "최신 처리결과"로 계속 읽음), responses에는 제출할 때마다 새 응답을
-- 추가해서 예전 내용이 보존되게 한다. 앱 쪽은 ElevatorFieldApp.jsx의 handleFailureResult에서
-- 이미 responsesReady 가드로 처리(이 컬럼이 없어도 기존 동작 그대로 유지).

alter table public.failures add column if not exists responses jsonb not null default '[]'::jsonb;

-- 검증:
-- select id, jsonb_array_length(responses) from public.failures where responses <> '[]'::jsonb limit 5;
