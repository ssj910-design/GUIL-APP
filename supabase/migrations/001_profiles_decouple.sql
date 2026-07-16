-- ============================================================
-- 001. profiles를 auth.users에서 분리 + 전 직원 프로필 생성
-- 목적: 로그인 계정이 없는 기사(김기사 등)도 profiles 행을 가질 수
--       있어야 모든 기록의 이름 컬럼을 assignee_id(FK)로 바꿀 수 있다.
-- 실행: Supabase SQL Editor
-- ============================================================

-- 1) auth.users FK 제거 (제약 이름이 환경마다 달라 동적으로 찾아 제거)
--    id 컬럼에 걸린 FK만 제거 — auth_user_id의 FK는 남긴다 (재실행 안전)
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.profiles'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.profiles'::regclass
                            and attname = 'id')::int2];
  if c is not null then
    execute format('alter table public.profiles drop constraint %I', c);
  end if;
end $$;

-- 2) id는 자체 생성 uuid로, 로그인 계정 연결은 별도 컬럼(auth_user_id)으로
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists auth_user_id uuid unique references auth.users(id);
alter table public.profiles add column if not exists region text;
alter table public.profiles add column if not exists is_active boolean not null default true;

-- 기존 2개 계정(관리자(신석주), 신석주)은 id가 곧 auth.users.id였으므로 연결 보존
-- (재실행 안전: 실제 auth 계정이 있는 행만)
update public.profiles p set auth_user_id = p.id
where p.auth_user_id is null
  and exists (select 1 from auth.users u where u.id = p.id);

-- 3) 회원가입 트리거 갱신: 같은 이름의 미연결 프로필이 있으면 연결, 없으면 생성
--    (김기사가 나중에 계정을 만들면 기존 프로필에 붙는다)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  update public.profiles
     set auth_user_id = new.id,
         email = coalesce(email, new.email)
   where auth_user_id is null
     and name = coalesce(new.raw_user_meta_data->>'name', '');
  if not found then
    insert into public.profiles (auth_user_id, name, role, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', new.email),
      coalesce(new.raw_user_meta_data->>'role', 'engineer'),
      new.email
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- 3-1) 트리거가 없는 환경이면 생성 (있으면 그대로)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

-- 4) 데이터에 등장하지만 프로필이 없는 직원 생성
--    (2026-07-15 실DB 조사: 관리자, 관리자(신석주), 김기사, 신석주, 이기사, 차호근)
--    ※ '관리자'는 별도 인물이 아니라 개발용 가짜 프로필 이름 → 006에서
--       '관리자(신석주)'로 병합 매핑하므로 여기서 만들지 않는다.
insert into public.profiles (name, role)
select v.name, 'engineer'
from (values ('김기사'), ('이기사'), ('차호근')) as v(name)
where not exists (select 1 from public.profiles p where p.name = v.name);

-- 검증: 이름별 프로필 존재 확인 (5행이어야 함)
select name, role, auth_user_id is not null as has_login from public.profiles order by name;
