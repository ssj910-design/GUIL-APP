-- 알림 받는 사람을 관리자가 좁힐 수 있게 (2026-08-01)
-- 지금까지 audience(engineer/admin/all)는 카탈로그(lib/notifications.js)에 고정돼 있어서
-- "관리자 알림인데 최고관리자한테만 가게" 같은 조정이 코드 수정 없인 불가능했다.
-- notify_settings에 audience_tier를 추가해 관리자 알림(audience: "admin")만 추가로 좁힐 수
-- 있게 한다. null이면 지금처럼 전체 관리자, 'super'면 최고관리자만.

alter table notify_settings add column if not exists audience_tier text;

-- 자재신청은 이번에 새로 나뉘는 키(material_requested) — 기존 자재·견적 통합 알림과 동일하게
-- 전체 관리자(audience_tier 없음)로 둔다. 견적신청(quote_requested)은 최고관리자만 받게 시작한다
-- (자재담당관리자를 새로 만들면서 자재/견적 알림 대상을 분리하기로 한 결정).
insert into notify_settings (key, audience_tier)
values ('quote_requested', 'super')
on conflict (key) do update set audience_tier = excluded.audience_tier, updated_at = now();
