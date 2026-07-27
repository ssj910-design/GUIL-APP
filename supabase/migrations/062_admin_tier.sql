-- 관리자 등급 (2026-07-27) — 최고관리자/중간관리자 구분. role은 admin/engineer 그대로 두고(48곳 영향 회피)
-- 관리자 안에서 등급만 나눈다. super = 최고관리자(관리자 등록·직원제외·청구민감수정·회사설정 가능), manager = 중간관리자(일상 운영).
alter table profiles add column if not exists admin_tier text;
update profiles set admin_tier = 'super'   where name = '관리자(신석주)' and role = 'admin';
update profiles set admin_tier = 'manager' where name = '이에라'        and role = 'admin';
