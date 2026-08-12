-- 111: unit_part_photos — 호기별 "부품현황" 참조 사진 (2026-08-12)
-- 승강기정보 탭의 "부품현황" 서브탭에서 기사가 대분류/중분류/세부항목별로 올리는
-- 참조용 부품 사진. 사고 증거(billings)와는 다른 개념 — 사진 1장=1행으로 저장해서
-- 세부항목당 여러 장이 자유롭게 쌓이고 개별 삭제도 단순하게 한다(배열 컬럼 read-
-- modify-write 경합 없음). category/subcategory/part는 lib/unitPartTaxonomy.js의
-- UNIT_PART_TAXONOMY 라벨 문자열과 정확히 일치해야 화면에서 매칭된다.

create table if not exists public.unit_part_photos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  category text not null,
  subcategory text,
  part text not null,
  url text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists unit_part_photos_unit_id_idx on public.unit_part_photos (unit_id);

-- RLS: 106_rls_remaining.sql과 동일한 패턴 — 로그인(authenticated)만 하면 전부 허용.
alter table public.unit_part_photos enable row level security;
drop policy if exists "authenticated_full_access" on public.unit_part_photos;
create policy "authenticated_full_access" on public.unit_part_photos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'unit_part_photos'
order by ordinal_position;
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'unit_part_photos';
