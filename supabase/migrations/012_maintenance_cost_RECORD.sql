-- ============================================================
-- 012. 유지관리 비용(sites)  ⚠️ 초안 — 실행 전 팀 협의
--
-- 배경: PC 관리자 콘솔 현장정보에 "유지관리 비용" 필드 추가 (2026-07-16)
-- 표시 권한(관리자 계정만)은 /admin에 로그인·역할 구분이 아직 없어 보류 —
-- 현재는 접속하는 모두에게 표시한다.
--
-- 앱 코드는 이 컬럼이 없어도(마이그레이션 전) 안전하게 동작한다:
-- mapSite가 존재하지 않는 컬럼은 undefined로 매핑하고, SitesAdmin이 이를
-- 감지해(=== undefined) 쓰기 payload에서 해당 필드를 제외한다.
-- ============================================================

alter table public.sites add column if not exists maintenance_cost numeric;

-- 검증
select 'maintenance_cost 준비됨' as status;
