-- ============================================================
-- 007. 옛 컬럼·테이블 정리  ⛔ 지금 실행 금지 ⛔
--
-- 실행 조건 (전부 충족 후에만):
--   1. 앱 코드가 새 컬럼(unit_id, *_id)만 읽고 쓰도록 전환·배포됨
--   2. 006 검증 쿼리의 미매칭이 전부 0 또는 수동 처리 완료
--   3. 배포 후 최소 1~2주 실사용에서 문제 없음
--   4. 실행 직전 다시 백업
-- ============================================================

-- 담당자 테이블 개명 (앱 전환과 동시에)
alter table public.site_managers rename to site_contacts;

-- 변환용 임시 객체 제거
drop view if exists public._name_to_profile;
drop function if exists public._label_to_seq(text);

-- 기록 테이블의 복사 저장 컬럼 제거
alter table public.failures drop column if exists site_id;
alter table public.failures drop column if exists site_name;
alter table public.failures drop column if exists elevator_no;
alter table public.failures drop column if exists assignee;
alter table public.failures drop column if exists photo_count;

alter table public.inspections drop column if exists site_id;
alter table public.inspections drop column if exists site_name;
alter table public.inspections drop column if exists elevator_no;

alter table public.material_requests drop column if exists site_id;
alter table public.material_requests drop column if exists site_name;
alter table public.material_requests drop column if exists elevator_no;
alter table public.material_requests drop column if exists engineer;
alter table public.material_requests drop column if exists photo_count;
alter table public.material_requests drop column if exists has_supply_photo;

alter table public.quote_requests drop column if exists site_id;
alter table public.quote_requests drop column if exists site_name;
alter table public.quote_requests drop column if exists elevator_no;
alter table public.quote_requests drop column if exists engineer;
alter table public.quote_requests drop column if exists photo_count;
alter table public.quote_requests drop column if exists has_supply_photo;

alter table public.todos drop column if exists site_name;
alter table public.todos drop column if exists elevator_no;
alter table public.todos drop column if exists assignee;
alter table public.todos drop column if exists photo_count;

alter table public.billings drop column if exists site_name;
alter table public.billings drop column if exists elevator_no;
alter table public.billings drop column if exists engineer;

alter table public.restock_requests drop column if exists engineer;
alter table public.restock_requests drop column if exists site_name;
alter table public.restock_requests drop column if exists has_supply_photo;

alter table public.feed_posts drop column if exists author;

-- sites의 승강기·레거시 컬럼 제거 (호기 정보는 units로 이관 완료)
alter table public.sites drop column if exists elevator_model;
alter table public.sites drop column if exists unit_count;
alter table public.sites drop column if exists gov_elevator_nos;
alter table public.sites drop column if exists gov_elevator_no;
alter table public.sites drop column if exists elevator_no;
alter table public.sites drop column if exists assigned_engineer;
alter table public.sites drop column if exists failures_30d;
alter table public.sites drop column if exists site_code;
alter table public.sites drop column if exists region;
alter table public.sites drop column if exists phone;
alter table public.sites drop column if exists manager;
alter table public.sites drop column if exists manager_phone;
alter table public.sites drop column if exists overdue_long;
alter table public.sites drop column if exists overdue_total;

-- 레거시 테이블 제거
drop table if exists public.engineers;

-- 검증: 남은 컬럼 최종 확인
select table_name, array_agg(column_name order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public'
group by table_name order by table_name;
