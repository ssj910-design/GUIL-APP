-- 102: 비밀번호 규칙 강화 — 숫자만 → 문자+숫자 조합 필수 (2026-08-05)
-- (특수문자·대소문자 구분 요구는 그대로 없음 — 현장 기사 입력 편의를 위한 기존 방침 유지)

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
  if p_new !~ '^[a-zA-Z0-9]+$' then
    return '문자와 숫자만 사용할 수 있습니다';
  end if;
  if p_new !~ '[a-zA-Z]' or p_new !~ '[0-9]' then
    return '문자와 숫자를 조합해 입력해주세요';
  end if;
  if p_new ~ '^(.)\1+$' then
    return '같은 글자만으로는 설정할 수 없습니다';
  end if;
  if lower(p_new) in ('123456','654321','012345','111222','121212','123123','112233','abcdef','qwerty','password','abc123') then
    return '너무 쉬운 비밀번호입니다';
  end if;

  update user_secrets
  set password_hash = crypt(p_new, gen_salt('bf')), must_change = false, updated_at = now()
  where profile_id = p_profile_id;
  return '';
end;
$$;
