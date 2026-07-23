-- 할일 재배정 요청 (기사 → 관리자): 기사가 자기 할일을 다른 사람에게 넘겨달라고 요청.
-- 관리자가 요청을 보고 재배정(assignee 변경) 또는 반려. 모두 nullable/기본값이라 기존 데이터 영향 없음.
alter table todos add column if not exists reassign_requested boolean not null default false;
alter table todos add column if not exists reassign_reason text;   -- 요청 사유
alter table todos add column if not exists reassign_to text;       -- 희망 담당자(선택)
