-- 133: 예약된 계약종료 자동 반영 크론 등록.
-- 관리자웹에서 계약종료일자를 미래로 잡아두면(예: 오늘 8/27인데 종료일자 9/1) 그 날짜가 될 때까지는
-- 현장이 계속 활성 상태로 남고, 그 날짜가 되면 이 크론이 is_active를 false로 바꿔 자동으로
-- 계약종료 처리한다 (app/api/cron/check-terminations/route.js).
-- 매분 호출되지만 라우트 내부에서 KST 00:10에만 실제로 동작한다.
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행. <CRON_SECRET>을 실제 값으로 바꿔 실행할 것
--    (075/095/130에서 쓴 값과 동일하게).

select cron.schedule('check-terminations', '* * * * *', $$
  select net.http_post(
    url := 'https://guil-app-pi.vercel.app/api/cron/check-terminations',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

-- 확인:   select jobname, schedule, active from cron.job where jobname = 'check-terminations';
-- 최근실행: select status_code, created, left(content::text,150) from net._http_response order by created desc limit 20;
-- 해제:    select cron.unschedule('check-terminations');
