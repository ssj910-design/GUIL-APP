-- 테스트 데이터 일괄 삭제 (현장/호기/직원 등 마스터 데이터는 건드리지 않음).
-- Supabase SQL Editor에서 직접 실행할 것 — 되돌릴 수 없으니 실행 전 백업 권장.
-- 자식(billings, todos) → 부모(material_requests, quote_requests) 순서로 지워야
-- FK 제약(billings.material_request_id 등)에 걸리지 않는다.
begin;

delete from public.billings;
delete from public.todos;
delete from public.material_requests;
delete from public.quote_requests;
delete from public.failures;
delete from public.feed_posts;
delete from public.attendances;

commit;
