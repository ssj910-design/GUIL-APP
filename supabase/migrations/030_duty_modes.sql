-- 030: 근무제별 당직 대상자 (2026-07-20)
-- 같은 사람이 주5일 편성에는 없고 주4일 편성에만 있는 경우가 있다(정문섭·이성현).
-- 순번(duty_order)은 하나로 충분하다 — 근무제로 걸러낸 뒤 순번으로 정렬하면
-- 주5일 편성에서도 상대 순서가 실제 표와 같아지기 때문(김동영이 3번이든 4번이든 순서는 동일).
alter table public.profiles add column if not exists duty_modes text[] not null default '{주5일,주4일}';

-- 실제 근무표 기준: 정문섭·이성현은 주4일 편성에만 등장
update public.profiles set duty_modes = '{주4일}' where name in ('정문섭', '이성현');
-- 당직 대상이 아닌 직원은 어느 편성에도 넣지 않는다
update public.profiles set duty_modes = '{}' where role = 'engineer' and duty_order is null;

select name, duty_order, duty_modes from public.profiles
where role = 'engineer' and duty_order is not null order by duty_order;
