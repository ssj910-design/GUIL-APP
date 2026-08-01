-- 자체점검 출석부 자동 생성 + 누락 자동 전환 (2026-08-01)
-- 배경: 004에서 generate_self_checks()는 만들어뒀지만 실제 pg_cron 등록을
-- 안 해서, 기사가 등록화면을 열거나 관리자가 수동으로 "생성" 버튼을 눌러야만
-- 그 달 레코드가 생겼다. 아무도 안 건드린 현장은 레코드 자체가 없어 "누락"으로도
-- 안 잡혔다(애초에 상태를 누락으로 바꾸는 코드가 없었음).
--
-- ① 매월 1일 자정: 이번 달 출석부를 활성 호기 전체에 자동 생성 (기존 함수 재사용).
-- ② 매월 1일 자정: 지난달 레코드 중 아직 '예정'으로 남은 것을 '누락'으로 일괄 전환.
--    유예기간 없음 — 말일까지 입력 안 한 현장은 바로 다음날 관리자가 확인 가능해야 함(팀 결정).
--
-- pg_cron은 이미 다른 작업(074/075/077)에 쓰이고 있어 확장은 이미 켜져 있다.

create or replace function public.mark_self_checks_missed(p_ym text)
returns int as $$
declare n int;
begin
  update public.self_checks
  set status = '누락'
  where ym = p_ym and status = '예정';
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql security definer;

-- 매월 1일 00:00: 이번 달 출석부 생성
select cron.schedule('self-checks-generate-monthly', '0 0 1 * *',
  $$select public.generate_self_checks(to_char(now(), 'YYYY-MM'))$$);

-- 매월 1일 00:05: 지난달 중 여전히 '예정'인 건 '누락'으로 전환 (생성 크론과 5분 간격 — 순서 안전)
select cron.schedule('self-checks-mark-missed-monthly', '5 0 1 * *',
  $$select public.mark_self_checks_missed(to_char(now() - interval '1 day', 'YYYY-MM'))$$);

-- 검증:
-- select * from cron.job where jobname like 'self-checks-%';
