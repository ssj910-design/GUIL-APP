-- 037: 알림 설정 (2026-07-20)
-- 종류별 on/off를 두 층으로 나눈다.
--   1) 회사 기본값(notify_settings) — 관리자가 조정. 여기서 끄면 전원에게 안 간다.
--   2) 개인 설정(profiles.notify_prefs) — 회사가 켜둔 것 중에서 본인이 끌 수 있다.
-- 브라우저 알림 권한은 사이트 단위 하나뿐이라 종류별 제어는 앱이 직접 해야 한다.
create table if not exists public.notify_settings (
  key text primary key,                 -- lib/notifications.js의 NOTIFICATIONS[].key
  enabled boolean not null default true,
  level text check (level in ('urgent', 'normal', 'low')),  -- null이면 카탈로그 기본값 사용
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists notify_prefs jsonb not null default '{}'::jsonb;

select
  (select count(*) from public.notify_settings) as 회사설정,
  (select count(*) from public.profiles where notify_prefs <> '{}'::jsonb) as 개인설정있음;
