-- 081: 에러코드집 항목을 기종·코드·고장 이름·의미·조치사항으로 재구성 (2026-07-30)
-- "흔한 원인"(common_cause) 항목은 더 이상 쓰지 않고, 대신 "고장 이름"(fault_name)을 새로 받는다.
-- "표준 조치법"(standard_action) 컬럼은 그대로 두고 화면 라벨만 "조치사항"으로 바꾼다
-- (컬럼 개명은 안 함 — 001~006 결정 기록과 동일한 원칙: 화면 매퍼가 이름 차이를 흡수).
-- error_codes는 현재 0행이라 데이터 마이그레이션 없이 안전하게 실행 가능.

alter table public.error_codes add column if not exists fault_name text;
alter table public.error_codes drop column if exists common_cause;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'error_codes'
order by ordinal_position;
