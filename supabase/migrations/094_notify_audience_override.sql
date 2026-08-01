-- 알림 받는 사람을 완전히 다른 그룹으로 바꿀 수 있게 (2026-08-01)
-- 093에서 추가한 audience_tier는 관리자 알림(audience: "admin")을 최고관리자 등으로 "좁히는"
-- 용도였다. 이번엔 그룹 자체(기사 ↔ 관리자)를 바꿀 수 있어야 해서 audience_override를 추가한다.
-- null이면 카탈로그 기본 audience를 그대로 쓰고, 'engineer'|'admin'이면 그 값으로 대체한다.
-- audience_tier는 audience_override(또는 기본값)가 'admin'일 때만 의미가 있고, 이제
-- 'super' 외에 'manager'|'material'도 쓸 수 있다(체크 제약 없는 컬럼이라 별도 변경 불필요).

alter table notify_settings add column if not exists audience_override text;
