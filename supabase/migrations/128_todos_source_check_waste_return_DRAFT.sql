-- todos.source의 CHECK 제약이 'material'/'quote'/'manual' 3개만 허용하고 있어서
-- (source_check 정의를 실제로 조회해서 확인함), waste_return 소스로 반납 할일을 insert
-- 하려는 모든 시도(클라이언트 JS든, 트리거든)가 처음부터 계속 실패하고 있었다.
-- 이전엔 다른 버그(클라이언트가 옛 견적 데이터를 써서 반납대상 0건으로 계산 → insert
-- 시도 자체를 안 함)가 이 문제를 가려서 드러나지 않았다.

alter table public.todos drop constraint todos_source_check;
alter table public.todos add constraint todos_source_check
  check (source = any (array['material'::text, 'quote'::text, 'manual'::text, 'waste_return'::text]));
