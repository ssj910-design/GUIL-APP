-- 097: 관리자가 수동 등록한 할일의 "요청자"를 실제 등록한 사람으로 기록 (2026-08-03)
-- 지금까지 수동(source='manual') 할일은 요청자를 저장하는 칸이 아예 없어서, 화면에서
-- 항상 "관리자"로 고정 표시됐다(TodoTab.jsx getRequesterName). 실제 등록한 사람의
-- id+이름 스냅샷(프로필이 나중에 바뀌거나 삭제돼도 기록 유지)을 추가한다.

alter table public.todos add column if not exists requested_by_id uuid references public.profiles(id);
alter table public.todos add column if not exists requested_by_name text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'todos'
  and column_name in ('requested_by_id', 'requested_by_name');
