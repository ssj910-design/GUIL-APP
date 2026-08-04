-- 건의함: 마이페이지 건의를 메일 발송뿐 아니라 DB에도 남겨,
-- 본인과 관리자가 앱 안에서 댓글로 주고받을 수 있게 한다 (비공개 — 본인+관리자만 열람).
-- 게시판(posts)과 같은 원글/댓글 한 테이블 구조: reply_to_id가 null이면 건의 원글, 있으면 그 건의의 댓글.
create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  message text not null,
  reply_to_id uuid references feedbacks(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists feedbacks_reply_idx on feedbacks(reply_to_id);
