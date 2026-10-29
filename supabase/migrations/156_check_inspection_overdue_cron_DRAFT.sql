-- 156: 검사유효기간 경과 알림 크론 등록 (2026-10-29)
-- 유효기간이 30일 넘게 지난 호기를 담당 기사·관리자에게 주 1회 알린다
-- (app/api/cron/check-inspection-overdue/route.js). 매분 호출되지만 라우트 내부에서
-- 월요일 KST 09:00에만 실제로 동작한다.
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행. <CRON_SECRET>을 실제 값으로 바꿔 실행할 것
--    (075/095/130/133/135/147에서 쓴 값과 동일하게).

select cron.schedule('check-inspection-overdue', '* * * * *', $$
  select net.http_post(
    url := 'https://guil-app-pi.vercel.app/api/cron/check-inspection-overdue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

-- 확인:   select jobname, schedule, active from cron.job where jobname = 'check-inspection-overdue';
-- 최근실행: select status_code, created, left(content::text,150) from net._http_response order by created desc limit 20;
-- 해제:    select cron.unschedule('check-inspection-overdue');
