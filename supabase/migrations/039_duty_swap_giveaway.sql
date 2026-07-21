-- 039: 근무 넘기기/대신서기 (2026-07-21)
-- 지금까지 duty_swaps는 두 근무를 맞바꾸는 '교환'만 지원했다. 실무에서는
-- 맞바꿀 근무 없이 그냥 넘기거나(넘기기) 대신 서주는(대신서기) 경우가 많다.
--   교환   : from ↔ to 두 칸의 담당자를 맞바꾼다 (to 필요)
--   넘기기 : 내 근무(from)를 상대에게 준다. 상대 수락 시 from 담당자 = 상대
--   대신서기: 남의 근무(from)를 내가 대신 선다. 원주인 수락 시 from 담당자 = 나
-- 넘기기·대신서기는 맞바꿀 근무가 없으므로 to_schedule_id를 비운다.
alter table public.duty_swaps alter column to_schedule_id drop not null;
alter table public.duty_swaps add column if not exists kind text not null default '교환'
  check (kind in ('교환', '넘기기', '대신서기'));

select conname from pg_constraint
where conrelid = 'public.duty_swaps'::regclass and conname like '%kind%';
