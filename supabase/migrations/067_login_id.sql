-- 로그인 전용 아이디 컬럼 (2026-07-27) — 관리자 로그인 + 미래 멀티테넌트 대비.
-- minwon_id는 "민원24 점검자 ID"라 로그인 아이디로 겸용하면 꼬인다(관리자는 없거나 중복, 타사는 체계 다름).
-- 그래서 로그인 기준을 별도 login_id로 분리한다. 기사는 login_id=minwon_id로 백필해 변화 없음.

alter table profiles add column if not exists login_id text;

-- 기사: 로그인 아이디 = 민원24 아이디 (기존 동작 유지)
update profiles
set login_id = minwon_id
where role = 'engineer' and minwon_id is not null and minwon_id <> '' and login_id is null;

-- 관리자: 별도 지정 (팀 결정 — 대표관리자 guiladmin, 이에라 era). minwon_id는 안 건드린다.
update profiles set login_id = 'guiladmin' where name = '관리자(신석주)' and role = 'admin';
update profiles set login_id = 'era'       where name = '이에라'        and role = 'admin';

-- verify_login이 minwon_id 대신 login_id로 조회하도록 교체 (시그니처·반환형 동일).
-- 아이디가 중복이면(login_id 같은 행 2개 이상) 여전히 로그인 실패시킨다.
create or replace function verify_login(p_login_id text, p_password text)
returns table (id uuid, name text, role text, must_change boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_cnt int;
begin
  select count(*) into v_cnt
  from profiles p
  where p.login_id = p_login_id
    and coalesce(p.is_active, true) = true
    and p.deleted_at is null;
  if v_cnt <> 1 then
    return;
  end if;

  select p.id into v_id
  from profiles p
  where p.login_id = p_login_id
    and coalesce(p.is_active, true) = true
    and p.deleted_at is null;

  return query
  select p.id, p.name, p.role, s.must_change
  from profiles p
  join user_secrets s on s.profile_id = p.id
  where p.id = v_id
    and s.password_hash = crypt(p_password, s.password_hash);
end;
$$;
