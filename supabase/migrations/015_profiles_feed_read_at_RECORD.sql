-- 015: 우리방(사내 피드) 안읽음 배지용 — 사용자별 마지막 읽은 시각.
-- 안읽음 수 = created_at > feed_read_at 인 feed_posts (본인 글 제외). 실행: 2026-07-16 (prod + 리허설)
alter table profiles add column if not exists feed_read_at timestamptz;
