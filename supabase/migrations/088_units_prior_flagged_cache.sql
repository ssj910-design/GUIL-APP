-- 검사도래현장 카드의 "직전검사 조건부합격/조건후합격" 배지 캐싱 (2026-08-01)
-- 지금까지는 홈·검사관리 화면의 검사도래현장 카드마다 국가승강기정보센터 검사이력을
-- 실시간으로(카드 렌더될 때마다) 조회해서 느렸다. sync-inspection-cache 크론이 매일
-- 도래현장 호기만 골라 미리 조회해서 여기 캐싱해두고, 화면은 이 값을 먼저 쓴다.

alter table units add column if not exists prior_flagged_label text;
alter table units add column if not exists prior_flagged_anchor_date date;
alter table units add column if not exists prior_flagged_checked_at timestamptz;
