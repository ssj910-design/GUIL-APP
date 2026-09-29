-- 147: 무자료 청구서 자동 독촉 크론 등록.
-- 결제기한이 지났는데 자동독촉(reminder_enabled)을 켜둔 무자료 건에 7일 간격으로 재발송,
-- 60일 지나면 자동 중단 + 관리자 알림 (app/api/cron/check-billing-payment/route.js).
-- 매분 호출되지만 라우트 내부에서 KST 09:00에만 실제로 동작한다.
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행. <CRON_SECRET>을 실제 값으로 바꿔 실행할 것
--    (075/095/130/133/135에서 쓴 값과 동일하게).

select cron.schedule('check-billing-payment', '* * * * *', $$
  select net.http_post(
    url := 'https://guil-app-pi.vercel.app/api/cron/check-billing-payment',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

-- 확인:   select jobname, schedule, active from cron.job where jobname = 'check-billing-payment';
-- 최근실행: select status_code, created, left(content::text,150) from net._http_response order by created desc limit 20;
-- 해제:    select cron.unschedule('check-billing-payment');
