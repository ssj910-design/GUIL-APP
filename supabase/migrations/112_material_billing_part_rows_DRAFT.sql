-- 112: 자재신청 부품/수량 구조화 저장 + 관리자 지급확정값 (2026-08-13)
-- 지금은 자재신청 폼(PartsRowsInput)이 {name, qty} 행으로 입력받고도 formatPartRows()로
-- "인버터 1개, 스위치 2개" 문자열로 합쳐서 material_requests.part(text)에 저장한다 —
-- 그래서 이후 단계(할일·비용청구)에서 수량을 다시 분리해 쓸 수가 없다.
--
-- 관리자가 신청과 다르게 지급하는 경우도 있다(요청 부품/수량과 실제 지급이 다름) — 그 확정값을
-- 남기는 자리(todos.billing_part/billing_amount, text)는 024에서 이미 만들어졌지만 구조화가
-- 안 돼 있고, 화면에서 실제로 프리필에 쓰이지도 않고 있다.
--
-- 이 마이그레이션은 컬럼만 추가한다(기존 part/billing_part text 컬럼은 그대로 유지 — 과거
-- 기록·기존 화면 표시는 안 건드림). 신청 폼 저장 로직과 지급완료 화면, 비용청구 프리필은
-- 별도 앱 코드 작업으로 이 컬럼을 채우고 읽도록 바꾼다.
--
-- part_rows / billing_part_rows 형식: [{ "name": "인버터", "qty": 1 }, ...]
--
-- 견적요청건은 quote_requests.quote_items(이미 구조화된 jsonb)를 그대로 쓰면 되므로 이
-- 마이그레이션에 포함하지 않는다.

alter table public.material_requests add column if not exists part_rows jsonb;
alter table public.todos add column if not exists billing_part_rows jsonb;

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'material_requests' and column_name = 'part_rows';
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'todos' and column_name = 'billing_part_rows';
