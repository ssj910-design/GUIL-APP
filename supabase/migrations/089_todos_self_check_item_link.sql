-- 자체점검 B/C(주의관찰·긴급수리) 지적사항 → 할일 발행 연결 (2026-08-01)
-- 관리자 콘솔 자체점검 현황 - 지적사항(B/C) 탭에서 "할일로 발행" 버튼을 누르면
-- source='selfcheck' 할일이 생기는데, 같은 지적사항을 중복 발행하지 않도록
-- 어느 self_check_items 행에서 나온 할일인지 남겨둔다.

alter table todos add column if not exists self_check_item_id uuid references self_check_items(id);
