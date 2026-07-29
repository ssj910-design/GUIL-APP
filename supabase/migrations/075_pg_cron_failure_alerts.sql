-- 075: pg_cron으로 고장 알림 스윕 스케줄 (2026-07-29)
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행. 반드시 074를 먼저 실행할 것.
-- ⚠️ 아래 <배포URL> 2곳과 <CRON_SECRET>을 실제 값으로 바꿔 실행할 것.
--    - 배포 URL 예: https://guil-app-pi.vercel.app  (커스텀 도메인 붙이면 그 주소)
--    - CRON_SECRET: 임의의 긴 랜덤 문자열 하나를 만들어 ① Vercel 환경변수 CRON_SECRET 와
--      ② 아래 Bearer 뒤에 "똑같이" 넣는다. (엔드포인트가 이 값이 일치할 때만 동작)

-- 확장 켜기 (한 번만; 이미 켜져 있으면 무시됨)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 기존 같은 이름 잡이 있으면 먼저 해제 (없으면 조용히 넘어감)
do $$
begin
  perform cron.unschedule('failure-alerts');
exception when others then null;
end $$;

-- 매분 크론 엔드포인트를 호출 → 엔드포인트가 미배정 15분·미응답 5분을 훑어 알림 발송
select cron.schedule(
  'failure-alerts',
  '* * * * *',
  $$
    select net.http_post(
      url := '<배포URL>/api/cron/check-failures',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>')
    );
  $$
);

-- 확인:   select jobname, schedule, active from cron.job;
-- 최근실행: select * from cron.job_run_details order by start_time desc limit 10;
-- 해제:    select cron.unschedule('failure-alerts');
