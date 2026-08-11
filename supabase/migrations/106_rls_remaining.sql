-- RLS 활성화 2/2 — 카나리(holidays, 105) 검증 통과 후 나머지 전부.
-- profiles를 제외한 나머지 테이블: 로그인(authenticated)만 하면 읽기·쓰기 전부 허용.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sites', 'units', 'site_managers', 'failures', 'inspections',
    'material_requests', 'quote_requests', 'restock_requests', 'todos', 'billings',
    'self_checks', 'self_check_items', 'feed_posts', 'error_codes', 'kit_stock',
    'attendances', 'duty_schedules', 'duty_swaps', 'leaves',
    'inspection_fail_cache', 'push_subscriptions', 'native_push_tokens', 'notify_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated_full_access" on public.%I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
  end loop;
end $$;

-- profiles만 예외 — 직원 개인정보라 최고관리자·중간관리자만 (자재담당관리자·기사 제외).
alter table public.profiles enable row level security;

create policy "admin_only_access" on public.profiles
  for all
  using (
    (auth.jwt() ->> 'app_role') = 'admin'
    and (auth.jwt() ->> 'admin_tier') in ('super', 'manager')
  )
  with check (
    (auth.jwt() ->> 'app_role') = 'admin'
    and (auth.jwt() ->> 'admin_tier') in ('super', 'manager')
  );
