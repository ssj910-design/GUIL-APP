-- 095에서 등록한 5개 크론(check-attendance/selfcheck/inspections/duty-tomorrow/contracts)이
-- <배포URL> 자리표시자를 실제 주소로 안 바꾼 채 그대로 실행돼, 2026-08-01 등록 이후 지금까지
-- 매분 존재하지 않는 URL로 요청을 보내고 있었다(net._http_response에 이 5개 응답이 단 한 건도
-- 없는 것으로 확인됨) — 즉 출근체크·자체점검·정기검사·당직알림·계약만료 알림 5종이 실질적으로
-- 한 번도 발송된 적이 없었다. cron.schedule은 같은 jobname이면 덮어쓰므로 재등록만 하면 된다.
-- ⚠️ <CRON_SECRET> 5곳을 실제 값으로 바꿔 실행할 것 (075/095에서 쓴 값과 동일하게).

select cron.schedule('check-attendance', '* * * * *', $$
  select net.http_post(
    url := 'https://guil-app-pi.vercel.app/api/cron/check-attendance',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

select cron.schedule('check-selfcheck', '* * * * *', $$
  select net.http_post(
    url := 'https://guil-app-pi.vercel.app/api/cron/check-selfcheck',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

select cron.schedule('check-inspections', '* * * * *', $$
  select net.http_post(
    url := 'https://guil-app-pi.vercel.app/api/cron/check-inspections',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

select cron.schedule('check-duty-tomorrow', '* * * * *', $$
  select net.http_post(
    url := 'https://guil-app-pi.vercel.app/api/cron/check-duty-tomorrow',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

select cron.schedule('check-contracts', '* * * * *', $$
  select net.http_post(
    url := 'https://guil-app-pi.vercel.app/api/cron/check-contracts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

-- 확인:   select jobname, command from cron.job where jobname like 'check-%';
-- 최근실행(몇 분 뒤): select status_code, created, left(content::text,150) from net._http_response order by created desc limit 20;
