-- 048 (DRAFT, 미실행): 인사관리 화면 확장 — 목록 순서, 주소, 차량번호, 근로계약서 사본
-- staff_order는 인사관리>직원 탭의 드래그 정렬 전용 컬럼이다. duty_order(당직 순번,
-- DutyGenerateWidget에서 관리)와 겹치지 않게 완전히 별개로 둔다.
alter table public.profiles add column if not exists staff_order integer;   -- 인사관리 목록 표시 순서 (드래그로 변경)
alter table public.profiles add column if not exists address text;         -- 주소
alter table public.profiles add column if not exists vehicle_no text;      -- 차량번호
alter table public.profiles add column if not exists contract_url text;    -- 근로계약서 사본 (photos 버킷 업로드 URL)

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('staff_order', 'address', 'vehicle_no', 'contract_url')
order by column_name;
