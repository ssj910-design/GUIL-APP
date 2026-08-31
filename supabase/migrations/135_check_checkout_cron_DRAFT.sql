-- 135: 퇴근체크 리마인드/요약 크론 등록.
-- 출근은 했는데 아직 퇴근체크 안 한 기사에게 18:00에 1회 리마인드, 18:30에 관리자에게
-- 미체크 인원 요약 (app/api/cron/check-checkout/route.js). 숙직·당직·연차·반차·병가·공가,
-- 평일이 아닌 날·공휴일·근로자의날은 라우트 내부에서 제외한다.
-- 매분 호출되지만 라우트 내부에서 KST 18:00·18:30에만 실제로 동작한다.
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행. <CRON_SECRET>을 실제 값으로 바꿔 실행할 것
--    (075/095/130/133에서 쓴 값과 동일하게).

select cron.schedule('check-checkout', '* * * * *', $$
  select net.http_post(
    url := 'https://guil-app-pi.vercel.app/api/cron/check-checkout',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

-- 확인:   select jobname, schedule, active from cron.job where jobname = 'check-checkout';
-- 최근실행: select status_code, created, left(content::text,150) from net._http_response order by created desc limit 20;
-- 해제:    select cron.unschedule('check-checkout');
