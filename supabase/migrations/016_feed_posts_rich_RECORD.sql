-- 016: 우리방 리치 메시지 — 사진/영상 첨부, 답장, 좋아요.
-- reactions 예: {"👍": ["차호근","김기사"]}. 실행: 2026-07-17 (prod + 리허설)
alter table feed_posts add column if not exists photo_urls text[];
alter table feed_posts add column if not exists reply_to_id text;
alter table feed_posts add column if not exists reactions jsonb;
