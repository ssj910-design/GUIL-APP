-- 033: 직원 제외(삭제) 이력 (2026-07-20)
-- 인사관리에서 '삭제'해도 행을 지우지 않는다. 고장·할일·점검·근무표가 이 프로필을 참조하고 있어
-- 실제로 지우면 과거 기록의 담당자가 사라지기 때문. 대신 언제·왜 빠졌는지를 남겨
-- 나중에 슈퍼관리자 콘솔에서 퇴사/제외 이력을 모아볼 수 있게 한다.
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists delete_reason text;

-- 이미 제외된 사람(is_active=false)에 시각이 없으면 지금 시각으로 채운다
update public.profiles set deleted_at = now() where is_active = false and deleted_at is null;

select name, is_active, deleted_at, delete_reason from public.profiles where is_active = false;
