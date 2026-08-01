-- 자재·견적 신청 취소 기능 (2026-08-01)
-- 기사가 아직 관리자 처리 전(자재: 승인대기, 견적: 요청접수) 신청을 직접 취소할 수 있게 한다.
-- status에 '취소' 값을 그대로 쓰고(기존 '반려'와 같은 자유텍스트 컬럼이라 마이그레이션 불필요),
-- 누가·언제 취소했는지만 남기는 컬럼 두 개를 추가한다.

alter table material_requests add column if not exists cancelled_at timestamptz;
alter table material_requests add column if not exists cancelled_by text;
alter table quote_requests add column if not exists cancelled_at timestamptz;
alter table quote_requests add column if not exists cancelled_by text;
