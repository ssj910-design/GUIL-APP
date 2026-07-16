-- ============================================================
-- 008. 상비부품 재고 (kit_stock)  ⚠️ 초안 — 실행 전 팀 협의
--
-- 배경: "나의 상비부품 현황" 기능 (2026-07-16 요구사항)
--   - 기사별 상비부품 명칭·수량 관리
--   - 비용청구 직접입력에서 "상비부품에서 사용함" 체크 후 제출 → 수량 차감
--   - 보충 지급완료 후 수령 확인 → 지급 수량만큼 증가
-- DESIGN-v2.md §9의 미결정 항목 "자재 수량(quantity) 개념"이
-- 필요한 것으로 확정된 첫 사례.
--
-- 차감/증가는 우선 앱 로직에서 수행 (DB 트리거는 규칙 안정화 후 검토).
-- ============================================================

-- 기사별 부품 재고 (스냅샷 방식: 현재 수량만 저장)
create table if not exists public.kit_stock (
  id          uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.profiles(id) on delete cascade,
  part        text not null,
  qty         int  not null default 0 check (qty >= 0),
  updated_at  timestamptz not null default now(),
  unique (engineer_id, part)
);

-- 보충요청에 수량 개념 추가 (기존 행은 1개로 간주)
alter table public.restock_requests add column if not exists quantity int not null default 1;
-- 수령 확인 시각 (지급완료 후 기사가 "수령"을 누르는 시점 — 이때 재고 증가)
alter table public.restock_requests add column if not exists received_at timestamptz;

-- 초기 재고 시드 — 2026-07-16 확정: 신석주에게만 우선 지급 (테스트용, 나머지 기사는 추후 추가)
insert into public.kit_stock (engineer_id, part, qty)
select p.id, v.part, v.qty
from (values
  ('배터리(12V7AH)', 4),
  ('배터리(12V2.9AH)', 2),
  ('배터리(12V1.2AH)', 2),
  ('SMPS(VSF50EE)', 1),
  ('LED등', 5),
  ('비상정전원장치(LED등포함)', 1)
) as v(part, qty)
cross join public.profiles p where p.name = '신석주'
on conflict (engineer_id, part) do update set qty = excluded.qty;

-- 검증
select 'kit_stock 준비됨' as status, count(*) as rows from public.kit_stock;
