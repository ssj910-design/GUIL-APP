-- 024: 자재지급 시 관리자가 기재하는 청구금액 (2026-07-20)
-- 관리자가 자재 지급 완료 처리할 때 신청 부품 중 하나를 선택하고 청구금액을 기재하면,
-- 자동생성되는 할일(todos)에 함께 저장돼 지급받은 기사가 할 일 상세에서 확인할 수 있다.
-- 앱은 컬럼이 없어도 안전하게 동작 — mapTodo가 undefined로 매핑하고
-- ElevatorFieldApp이 이를 감지해 값이 있어도 쓰기는 건너뛴다.
alter table public.todos add column if not exists billing_part text;
alter table public.todos add column if not exists billing_amount numeric;
