-- 114: 부품마스터 — 고가부품 로스방지 추적용 (2026-08-13)
-- 견적요청(quote_requests) 작성 시 quote_items(jsonb 배열) 항목 중 PCB·모터·인버터처럼
-- 고가(10만원 이상)인 것만 이 마스터에서 선택해 연결한다(저가 소모품은 지금처럼
-- 자유텍스트 스펙으로 남겨두고 이 테이블에 안 넣는다 — 목록이 커지면 실용성이 없어짐).
--
-- quote_items 각 항목에 붙는 part_id / returnRequired(폐자재 반납 필요 여부)는 jsonb 안의
-- 키라서 별도 컬럼·마이그레이션이 필요 없다 — 앱 코드에서 저장 형식만 맞추면 된다:
--   { "spec": "...", "qty": 1, "unitPrice": 1200000, "partId": "<parts_master.id>",
--     "returnRequired": true }
--
-- default_return_required: 마스터에서 항목 선택 시 quote_items의 returnRequired 초기값으로
-- 채워주는 기본값(예: PCB·모터는 기본 true) — 매번 체크 안 해도 되게 하는 편의용, 강제 아님.

create table if not exists public.parts_master (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  default_price numeric,
  default_return_required boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists parts_master_name_idx on public.parts_master (name);

-- RLS: 106_rls_remaining.sql·111과 동일한 패턴 — 로그인(authenticated)만 하면 전부 허용.
alter table public.parts_master enable row level security;
drop policy if exists "authenticated_full_access" on public.parts_master;
create policy "authenticated_full_access" on public.parts_master
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'parts_master'
order by ordinal_position;
