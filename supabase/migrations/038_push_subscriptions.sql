-- 038: 웹 푸시 구독 (2026-07-20)
-- 브라우저마다 구독이 하나씩 생긴다(폰·PC 각각). 한 사람이 여러 기기를 쓸 수 있으므로
-- profile_id 하나에 여러 행이 붙는다. endpoint가 기기를 구분하는 고유값이다.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subs_profile_idx on public.push_subscriptions (profile_id);

select count(*) as 구독 from public.push_subscriptions;
