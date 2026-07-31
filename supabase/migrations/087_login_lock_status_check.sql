-- 로그인 실패 메시지에 계정 잠금 상태 구분 (2026-07-31)
-- 076에서 5회 실패 시 15분 잠금을 넣었는데, verify_login이 "비번 틀림"과 "잠김" 둘 다
-- 빈 결과(no rows)로 반환해서 클라이언트가 구분을 못 하고 항상 "아이디/비번이 올바르지
-- 않습니다"만 보여준다 — 실제로는 잠긴 상태인데 계속 비번 틀렸다고 나오는 문제.
-- verify_login 자체(반환 타입)는 안 건드리고, 로그인 실패 시에만 클라이언트가 추가로
-- 불러 잠금 여부·해제 시각을 확인하는 조회 전용 함수를 새로 둔다(더 안전한 additive 방식).

create or replace function check_login_lock(p_login_id text)
returns table (locked_until timestamptz)
language sql
security definer
set search_path = public, extensions
as $$
  select s.locked_until
  from profiles p
  join user_secrets s on s.profile_id = p.id
  where p.login_id = p_login_id
    and coalesce(p.is_active, true) = true
    and p.deleted_at is null
    and s.locked_until is not null
    and s.locked_until > now();
$$;
