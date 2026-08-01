-- 알림 받는 사람(관리자 등급)을 여러 개 동시에 고를 수 있게 (2026-08-01)
-- 093의 audience_tier는 값 하나만 담아서 "최고관리자+중간관리자만" 같은 조합을 못 담았다.
-- audience_tiers(배열)를 새로 두고, 비어있으면(null) 지금처럼 전체 관리자, 값이 있으면
-- 그 등급들만(super/manager/material 중 여러 개 조합 가능).

alter table notify_settings add column if not exists audience_tiers text[];

-- 기존에 audience_tier로 저장돼 있던 단일 값들을 배열로 옮겨 심는다.
update notify_settings
set audience_tiers = array[audience_tier]
where audience_tier is not null and audience_tiers is null;
