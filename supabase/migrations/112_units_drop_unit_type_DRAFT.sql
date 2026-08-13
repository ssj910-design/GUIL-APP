-- 112: units.unit_type 컬럼 삭제 (2026-08-13)
-- kind(승강기 상세 종류 — 승객용/장애인용/자동차용 등, 공단 데이터 연동)와 역할이
-- 겹쳐서(관리자웹 표시는 이미 kind를 우선 쓰고 unit_type은 kind가 비었을 때만 대체로
-- 쓰였음), 코드 쪽 참조(SitesAdmin.jsx, ImportSites.jsx, SiteMapModal.jsx,
-- lib/mappers.js)를 전부 걷어내고 컬럼 자체도 지운다. NOT NULL 기본값만 있고
-- CHECK 제약·다른 테이블 참조 없어서 삭제 자체는 깔끔하다(마이그레이션 002에서 생성,
-- 이후 어떤 마이그레이션도 이 컬럼을 건드리지 않음 — 확인됨).

alter table public.units drop column if exists unit_type;

-- 검증 — 컬럼이 사라졌는지 확인
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'units' and column_name = 'unit_type';
