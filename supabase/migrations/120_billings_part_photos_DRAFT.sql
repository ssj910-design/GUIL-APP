-- 120: 비용청구 — 부품별 교체 전/후 사진 구조화 (2026-08-14)
-- 자재지급 시 관리자가 확정한 부품별 행(todos.billing_part_rows, 마이그레이션 112)이
-- 2개 이상이면, 청구 화면에서 부품마다 별도의 전/후 사진 슬롯을 받는다. 그 결과를
-- billings.part_photos에 부품별로 묶어 저장 — 나중에 부품별로 정리된 완료보고서를
-- 만들 때 어떤 사진이 어떤 부품 건지 다시 추측할 필요가 없게 하기 위함.
--
-- 부품이 1개뿐인 청구는 지금처럼 before_photo_urls/after_photo_urls(통합 배열)만 쓰고
-- part_photos는 안 채운다 — 부품이 하나면 나눌 이유가 없다.
--
-- part_photos 형식: [{ "name": "마그네트", "qty": "1개", "beforeUrls": [...], "afterUrls": [...] }, ...]

alter table public.billings add column if not exists part_photos jsonb;

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'billings' and column_name = 'part_photos';
