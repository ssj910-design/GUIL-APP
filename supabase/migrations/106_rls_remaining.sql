-- RLS 활성화 2/2 — 카나리(holidays, 105) 검증 통과 후 나머지 전부.
-- 로그인(authenticated)만 하면 읽기·쓰기 전부 허용 — 지금 앱 동작과 동일한 범위.
--
-- profiles는 원래 "관리자만" 예외로 설계했었으나, 기사 앱(ElevatorFieldApp.jsx)이
-- 로그인 세션 복원 시 자기 자신의 profiles 행을 읽고(216번 줄), profilesAll 전체를
-- 배정자 매칭·당직 교대·게시판 멘션·알림 대상 선정 등 핵심 기능 전반(748번 줄 등
-- 15곳 이상)에 쓰고 있어 관리자 전용으로 막으면 기사 로그인 자체가 깨진다.
-- (RLS는 컬럼 단위가 아니라 행/테이블 단위라 "본인 행만" 예외를 둬도 동료 정보는
-- 여전히 노출됨 — 즉 관리자 전용으로 얻는 게 없다.) 직원 개인정보(전화번호 등)
-- 노출 범위를 좁히는 건 별도 작업(인사관리 화면·API 가드)으로 처리한다.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sites', 'units', 'site_managers', 'failures', 'inspections',
    'material_requests', 'quote_requests', 'restock_requests', 'todos', 'billings',
    'self_checks', 'self_check_items', 'feed_posts', 'error_codes', 'kit_stock',
    'attendances', 'duty_schedules', 'duty_swaps', 'leaves',
    'inspection_fail_cache', 'push_subscriptions', 'native_push_tokens', 'notify_settings',
    'profiles'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated_full_access" on public.%I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
  end loop;
end $$;
