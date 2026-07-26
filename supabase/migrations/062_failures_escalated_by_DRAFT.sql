-- ============================================================
-- 062. [초안] failures.escalated_by / escalated_by_id / escalated_at
-- 지원요청·운행정지 처리결과가 들어오면 배정을 풀면서 assignee를 비우는데, 그러면
-- "누가 그 판단을 내렸는지"가 데이터에서 사라진다. 비우기 직전 값을 스냅샷으로
-- 남겨 고장신고 상세 화면에서 보여주기 위한 컬럼.
-- ⚠️ 팀 상의 후 Supabase SQL Editor에서 직접 실행할 것 — Claude가 자동 실행하지 않는다.
-- ============================================================
alter table public.failures add column if not exists escalated_by text;
alter table public.failures add column if not exists escalated_by_id uuid references public.profiles(id);
alter table public.failures add column if not exists escalated_at timestamptz;

-- 검증
select escalated_by, escalated_by_id, escalated_at from public.failures where escalation is not null limit 5;
