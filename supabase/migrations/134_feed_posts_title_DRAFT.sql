-- 134: 게시판 공지 제목 — 공지로 등록할 때 별도 제목을 받아 상단 고정 영역엔 제목만 보여준다.
-- nullable, 일반 글(공지 아닌 글)은 계속 null.
alter table feed_posts add column if not exists title text;
