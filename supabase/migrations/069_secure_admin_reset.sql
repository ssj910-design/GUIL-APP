-- 보안 수정 (2026-07-27) — admin_reset_password 뒷문 차단.
-- 기존: anon이 target_id만 넘기면 아무 계정이나 1234로 초기화 가능(계정 탈취). UI 버튼만 최고관리자 제한이라 RPC 직접호출로 우회됨.
-- 수정: 호출 시 "최고관리자 아이디+비밀번호"를 함께 받아, 진짜 활성 최고관리자이고 비번이 맞을 때만 초기화한다.
--       (서버 검증 세션이 없는 현 구조에서 재인증으로 방어. 진짜 격리는 RLS 도입 때 — MULTITENANT-PLAN Phase 3)

-- 옛 시그니처(uuid 1개) 제거
drop function if exists admin_reset_password(uuid);

create or replace function admin_reset_password(p_admin_login_id text, p_admin_password text, p_target_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean;
begin
  -- 호출자가 활성 최고관리자이고 비밀번호가 맞는지 확인
  select (s.password_hash = crypt(p_admin_password, s.password_hash))
  into v_ok
  from profiles p
  join user_secrets s on s.profile_id = p.id
  where p.login_id = p_admin_login_id
    and p.role = 'admin' and p.admin_tier = 'super'
    and coalesce(p.is_active, true) = true and p.deleted_at is null;

  if not coalesce(v_ok, false) then
    return '최고관리자 인증에 실패했습니다 (아이디/비밀번호 확인)';
  end if;

  -- 인증 통과 → 대상 비번을 1234로 초기화 + 첫 로그인 강제변경
  insert into user_secrets (profile_id, password_hash, must_change)
  values (p_target_id, crypt('1234', gen_salt('bf')), true)
  on conflict (profile_id) do update
    set password_hash = crypt('1234', gen_salt('bf')), must_change = true, updated_at = now();
  return '';
end;
$$;

revoke all on function admin_reset_password(text, text, uuid) from public;
grant execute on function admin_reset_password(text, text, uuid) to anon, authenticated;
