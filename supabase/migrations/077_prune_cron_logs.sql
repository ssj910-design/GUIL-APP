-- 077: 크론 실행 로그 정리 (2026-07-29) — DB 용량 관리
-- pg_cron이 매분 돌아 cron.job_run_details가 하루 ~1440행씩 쌓인다(무료 500MB를 야금야금 먹음).
-- 매일 7일 지난 크론 실행 로그를 지우는 잡을 등록한다.
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행. 급하진 않음(로그는 천천히 쌓임) — 편할 때 한 번.
-- ⚠️ 알림 자체(고장 row 타임스탬프 갱신)는 새 행을 안 만들어 용량과 무관 — 이건 오직 "크론 실행 로그" 정리용.

do $$ begin perform cron.unschedule('prune-cron-logs'); exception when others then null; end $$;

-- 매일 18:00 UTC(=KST 새벽 3시), 7일 지난 크론 로그 삭제
select cron.schedule('prune-cron-logs', '0 18 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '7 days';
$$);

-- 확인: select jobname, schedule from cron.job;
-- (pg_net HTTP 응답 기록은 Supabase가 자동 정리하지만, 많이 쌓이면 가끔 아래도)
--   delete from net._http_response where created < now() - interval '1 day';
