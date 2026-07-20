-- 022: 우리방 게시글 공지 등록 (2026-07-20)
-- 앱은 컬럼이 없어도 안전하게 동작 — mapFeedPost가 undefined로 매핑하고
-- RoomTab은 이를 감지해 "공지로 등록" 클릭 시 안내만 하고 쓰기는 건너뛴다.
alter table public.feed_posts add column if not exists is_notice boolean not null default false;
