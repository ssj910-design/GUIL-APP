-- 095: 새 예약 알림 5종 pg_cron 등록 (2026-08-01)
-- 출근체크 안 함/요약, 자체점검 미완료, 오늘 정기검사, 내일 당직·숙직, 계약만료.
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행. 075와 같은 방식 — 아래 <배포URL> 5곳과
--    <CRON_SECRET> 5곳을 실제 값으로 바꿔 실행할 것 (075에서 쓴 값과 동일하게).
-- 전부 매분 호출되지만, 각 라우트가 내부에서 정해진 시각(KST)에만 실제로 동작하고
-- 그 외엔 바로 스킵 응답한다 (check-failures와 동일한 폴링 패턴).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('check-attendance');
  perform cron.unschedule('check-selfcheck');
  perform cron.unschedule('check-inspections');
  perform cron.unschedule('check-duty-tomorrow');
  perform cron.unschedule('check-contracts');
exception when others then null;
end $$;

select cron.schedule('check-attendance', '* * * * *', $$
  select net.http_post(
    url := '<배포URL>/api/cron/check-attendance',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

select cron.schedule('check-selfcheck', '* * * * *', $$
  select net.http_post(
    url := '<배포URL>/api/cron/check-selfcheck',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

select cron.schedule('check-inspections', '* * * * *', $$
  select net.http_post(
    url := '<배포URL>/api/cron/check-inspections',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

select cron.schedule('check-duty-tomorrow', '* * * * *', $$
  select net.http_post(
    url := '<배포URL>/api/cron/check-duty-tomorrow',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

select cron.schedule('check-contracts', '* * * * *', $$
  select net.http_post(
    url := '<배포URL>/api/cron/check-contracts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
  );
$$);

-- 확인:   select jobname, schedule, active from cron.job where jobname like 'check-%';
-- 최근실행: select * from cron.job_run_details order by start_time desc limit 20;
-- 해제:    select cron.unschedule('check-attendance'); (job명 바꿔가며)
