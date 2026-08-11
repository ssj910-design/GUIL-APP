-- RLS 카나리 테스트 — 공휴일 정보 하나만 먼저 켜서 실제로 문제없이 동작하는지
-- 확인한 뒤 나머지 테이블(106)을 켠다. holidays는 화면 노출이 적고 민감하지
-- 않은 테이블이라 먼저 고른다.
alter table public.holidays enable row level security;

create policy "authenticated_full_access" on public.holidays
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
