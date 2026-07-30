-- 081: 개발자 갓(GOD) 어드민 (2026-07-30)
-- 개발·QA용 만능 로그인 — role=admin + admin_tier=super 라서 모바일 관리자모드·PC 콘솔 전부 들어간다.
-- 아이디: god / 비밀번호: 1234 (must_change=false — 강제 변경 안 뜸)
-- ⚠️ 로그인(SKIP_LOGIN=false)을 실제로 켜기 전에 이 계정 비밀번호를 반드시 바꾸거나 비활성화할 것.
--    (지금은 로그인 자체가 꺼져 있어 노출 없음)
-- 참고: 관리자 목록·알림 대상에 '개발자'로 보인다 — 숨김 처리는 안 함(투명하게 두는 게 안전).

insert into public.profiles (id, name, role, admin_tier, login_id, is_active)
values ('a0000000-0000-4000-8000-00000000900d', '개발자', 'admin', 'super', 'god', true)
on conflict (id) do update set login_id = 'god', role = 'admin', admin_tier = 'super', is_active = true;

insert into public.user_secrets (profile_id, password_hash, must_change)
values ('a0000000-0000-4000-8000-00000000900d', extensions.crypt('1234', extensions.gen_salt('bf')), false)
on conflict (profile_id) do update
  set password_hash = extensions.crypt('1234', extensions.gen_salt('bf')), must_change = false, updated_at = now();

-- 확인: select p.login_id, p.role, p.admin_tier from profiles p where p.login_id = 'god';
-- 삭제(필요시): delete from user_secrets where profile_id = 'a0000000-0000-4000-8000-00000000900d';
--             delete from profiles where id = 'a0000000-0000-4000-8000-00000000900d';
