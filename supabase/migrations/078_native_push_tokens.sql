-- 038_push_subscriptions.sql(웹푸시 구독)과 별개로, 네이티브(FCM) 토큰은 스키마가 다르다
-- (p256dh/auth 같은 웹푸시 암호화 키가 없고 토큰 문자열 하나뿐) — 별도 테이블로 관리한다.
create table if not exists public.native_push_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists native_push_tokens_profile_idx on public.native_push_tokens (profile_id);
