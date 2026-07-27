-- 로그인 2단계 (2026-07-27) — 비밀번호 규칙 강화 + 관리자 초기화 함수.
-- 규칙(팀 결정): 6자 이상, 숫자만, 같은 숫자 반복 금지, 너무 뻔한 것 금지. (대문자·특수문자 없음 — 현장 기사 입력 편의)

-- change_password 반환형을 boolean → text 로 바꾼다(실패 사유를 화면에 보여주기 위해). 재정의 위해 먼저 삭제.
drop function if exists change_password(uuid, text, text);

-- 반환: '' = 성공, 그 외 = 화면에 보여줄 실패 사유.
create or replace function change_password(p_profile_id uuid, p_current text, p_new text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ok boolean;
begin
  select (s.password_hash = crypt(p_current, s.password_hash)) into ok
  from user_secrets s where s.profile_id = p_profile_id;
  if not coalesce(ok, false) then
    return '현재 비밀번호가 올바르지 않습니다';
  end if;

  if length(coalesce(p_new, '')) < 6 then
    return '6자 이상 입력해주세요';
  end if;
  if p_new !~ '^[0-9]+$' then
    return '숫자만 입력해주세요';
  end if;
  if p_new ~ '^(.)\1+$' then
    return '같은 숫자만으로는 설정할 수 없습니다';
  end if;
  if p_new in ('123456','654321','012345','111222','121212','123123','112233','1234','000000') then
    return '너무 쉬운 비밀번호입니다';
  end if;

  update user_secrets
  set password_hash = crypt(p_new, gen_salt('bf')), must_change = false, updated_at = now()
  where profile_id = p_profile_id;
  return '';
end;
$$;

-- 관리자 비밀번호 초기화 — 대상 기사 비번을 1234로 되돌리고 강제변경 플래그를 켠다(기사가 잊었을 때).
-- (이 앱은 원래 anon 키로 전 테이블 접근 가능한 구조라 이 함수도 같은 보안 수준이다.)
create or replace function admin_reset_password(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into user_secrets (profile_id, password_hash, must_change)
  values (p_profile_id, crypt('1234', gen_salt('bf')), true)
  on conflict (profile_id) do update
    set password_hash = crypt('1234', gen_salt('bf')), must_change = true, updated_at = now();
  return true;
end;
$$;

revoke all on function change_password(uuid, text, text) from public;
revoke all on function admin_reset_password(uuid) from public;
grant execute on function change_password(uuid, text, text) to anon, authenticated;
grant execute on function admin_reset_password(uuid) to anon, authenticated;
