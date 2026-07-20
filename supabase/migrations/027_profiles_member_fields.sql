-- 027: 인사관리 — 공단 회원 목록 항목 (2026-07-20)
-- 캡처 헤더: 아이디 | 회원명 | 회원구분 | 휴대폰 | 연락처 | 가입상태 | 가입일 | 승인일 | 교육수료번호
--   아이디  → 기존 profiles.minwon_id (공단 점검자 ID와 동일한 값이라 컬럼을 새로 만들지 않음)
--   회원명  → 기존 profiles.name
--   휴대폰  → 기존 profiles.phone
-- 나머지 6개만 신설한다.
alter table public.profiles add column if not exists member_type text;   -- 회원구분
alter table public.profiles add column if not exists tel text;           -- 연락처(유선)
alter table public.profiles add column if not exists join_status text;   -- 가입상태
alter table public.profiles add column if not exists joined_at date;     -- 가입일
alter table public.profiles add column if not exists approved_at date;   -- 승인일
alter table public.profiles add column if not exists edu_cert_no text;   -- 교육수료번호

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('member_type', 'tel', 'join_status', 'joined_at', 'approved_at', 'edu_cert_no')
order by column_name;
