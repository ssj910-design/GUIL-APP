-- ============================================================
-- 009. 현장 공통 연락처 (2026-07-16 설계 교정)
--
-- "현장 공통 연락처(건물/관리사무소 대표 전화·팩스·메일)"와
-- "담당자 개인 연락처(site_managers의 개별 행)"는 다른 층위다.
--  - 공통: sites.phone(기존 컬럼 유지·승격) + fax, email(신설)
--  - 개별: site_managers.name/phone/email/fax (그대로)
-- ※ 이에 따라 007의 sites.phone DROP은 취소됨 (007 파일에도 반영).
-- ============================================================

alter table public.sites add column if not exists fax text;
alter table public.sites add column if not exists email text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'sites' and column_name in ('phone','fax','email');
