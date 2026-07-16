-- ============================================================
-- 011. 계약일자(sites) + 청구 메모(billings)  ⚠️ 초안 — 실행 전 팀 협의
--
-- 배경: PC 관리자 콘솔 요구사항 (2026-07-16)
--   - 현장관리: 현장정보에 "계약일자" 필드 추가
--   - 청구내역: 각 건 상세보기에서 관리자 메모("내용") 추가 가능하게
--
-- 앱 코드는 이 컬럼이 없어도(마이그레이션 전) 안전하게 동작한다:
--   mapSite/mapBilling이 존재하지 않는 컬럼은 undefined로 매핑하고,
--   SitesAdmin/BillingsAdmin은 이 값을 감지해(=== undefined) 쓰기 payload에서
--   해당 필드를 제외한다. 즉 이 마이그레이션 실행 전에도 기존 저장 기능은
--   그대로 동작하고, 새 필드만 비활성 상태로 보인다.
-- ============================================================

alter table public.sites add column if not exists contract_date date;
alter table public.billings add column if not exists notes text;

-- 검증
select 'contract_date, billings.notes 준비됨' as status;
