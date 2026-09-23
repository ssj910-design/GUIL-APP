-- 145: quote_requests 현장 견적 담당자 이메일·팩스 (2026-09-23)
-- 기사 앱 견적 신청에서 전화번호 외에 이메일·팩스도 선택 입력받아, 관리자 화면 담당자 연락처에
-- 같이 보여주고 관리자웹 견적 발행 때 받는사람 기본값으로도 쓴다. 기존 건은 비어 있다(전화만 표시).

alter table public.quote_requests add column if not exists contact_email text;
alter table public.quote_requests add column if not exists contact_fax text;

-- 검증
select count(*) as 전체, count(contact_email) as 이메일있음, count(contact_fax) as 팩스있음 from public.quote_requests;
