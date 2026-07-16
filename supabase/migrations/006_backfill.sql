-- ============================================================
-- 006. 기존 데이터 변환 (라벨 → unit_id, 이름 → profiles id)
-- 여러 번 실행해도 안전 (이미 채워진 행은 건너뜀).
-- 마지막의 검증 쿼리로 매칭 실패 건을 반드시 확인할 것.
--
-- 라벨 규칙 (2026-07-15 실DB 조사 기준 두 형식 혼재):
--   '1-N'  → 그 현장의 N번째 호기   (예: '1-2' → seq 2)
--   'N호기' → 그 현장의 N번째 호기   (예: '3호기' → seq 3)
--   null/그 외 → 매칭하지 않음 (검증 쿼리에 잡힘 → 수동 지정)
--
-- 이름 규칙: '관리자'는 개발용 가짜 이름 → '관리자(신석주)' 프로필로 병합.
-- ※ '동일빌딩'처럼 이름이 중복인 현장은 이름 기반 자동매칭에서 제외됨.
-- 실행: Supabase SQL Editor (001~005 이후)
-- ============================================================

-- 라벨 → seq 변환 함수 (이 파일 안에서만 사용)
create or replace function public._label_to_seq(label text)
returns int language sql immutable as $$
  select case
    when label ~ '^1-[0-9]+$'  then split_part(label, '-', 2)::int
    when label ~ '^[0-9]+호기$' then replace(label, '호기', '')::int
    else null
  end;
$$;

-- 이름 → 프로필 매핑 뷰 (병합 규칙 포함)
create or replace view public._name_to_profile as
  select p.name as raw_name, p.id as profile_id from public.profiles p
  union all
  select '관리자', p.id from public.profiles p where p.name = '관리자(신석주)';

-- ---------- 1) unit_id 채우기 : site_id가 있는 테이블 ----------
update public.failures f set unit_id = u.id
from public.units u
where f.unit_id is null
  and u.site_id = f.site_id and u.seq = public._label_to_seq(f.elevator_no);

update public.inspections i set unit_id = u.id
from public.units u
where i.unit_id is null
  and u.site_id = i.site_id and u.seq = public._label_to_seq(i.elevator_no);

update public.material_requests m set unit_id = u.id
from public.units u
where m.unit_id is null
  and u.site_id = m.site_id and u.seq = public._label_to_seq(m.elevator_no);

update public.quote_requests q set unit_id = u.id
from public.units u
where q.unit_id is null
  and u.site_id = q.site_id and u.seq = public._label_to_seq(q.elevator_no);

-- 라벨이 없어도 그 현장의 호기가 1대뿐이면 그 호기로 확정 매칭
-- (호기 입력란이 생기기 전의 옛 신청 건 구제)
update public.material_requests m set unit_id = u.id
from public.units u
where m.unit_id is null and u.site_id = m.site_id
  and 1 = (select count(*) from public.units x where x.site_id = m.site_id);

update public.quote_requests q set unit_id = u.id
from public.units u
where q.unit_id is null and u.site_id = q.site_id
  and 1 = (select count(*) from public.units x where x.site_id = q.site_id);

-- ---------- 2) unit_id 채우기 : site_id가 없는 테이블 ----------
-- billings: 이름이 유일한 현장만 자동매칭
update public.billings b set unit_id = u.id
from public.sites s
join public.units u on u.site_id = s.id
where b.unit_id is null
  and s.name = b.site_name
  and s.name in (select name from public.sites group by name having count(*) = 1)
  and u.seq = public._label_to_seq(b.elevator_no);

-- todos: ① 자재건에서 상속 → ② 견적건에서 상속 → ③ 이름+라벨
update public.todos t set unit_id = m.unit_id
from public.material_requests m
where t.unit_id is null and t.material_request_id = m.id and m.unit_id is not null;

update public.todos t set unit_id = q.unit_id
from public.quote_requests q
where t.unit_id is null and t.quote_request_id = q.id and q.unit_id is not null;

update public.todos t set unit_id = u.id
from (select name from public.sites group by name having count(*) = 1) uniq
join public.sites s on s.name = uniq.name
join public.units u on u.site_id = s.id
where t.unit_id is null
  and t.site_name = s.name and u.seq = public._label_to_seq(t.elevator_no);

-- ---------- 3) 이름 → profiles id ----------
update public.failures f set assignee_id = n.profile_id
from public._name_to_profile n
where f.assignee_id is null and trim(coalesce(f.assignee,'')) = n.raw_name;

update public.material_requests m set requester_id = n.profile_id
from public._name_to_profile n
where m.requester_id is null and trim(coalesce(m.engineer,'')) = n.raw_name;

update public.quote_requests q set requester_id = n.profile_id
from public._name_to_profile n
where q.requester_id is null and trim(coalesce(q.engineer,'')) = n.raw_name;

update public.todos t set assignee_id = n.profile_id
from public._name_to_profile n
where t.assignee_id is null and trim(coalesce(t.assignee,'')) = n.raw_name;

update public.billings b set engineer_id = n.profile_id
from public._name_to_profile n
where b.engineer_id is null and trim(coalesce(b.engineer,'')) = n.raw_name;

update public.restock_requests r set engineer_id = n.profile_id
from public._name_to_profile n
where r.engineer_id is null and trim(coalesce(r.engineer,'')) = n.raw_name;

update public.feed_posts f set author_id = n.profile_id
from public._name_to_profile n
where f.author_id is null and trim(coalesce(f.author,'')) = n.raw_name;

-- ---------- 4) 검증: 매칭 실패 건 (결과가 모두 0이어야 이상적) ----------
select 'failures unit 미매칭' as what, count(*) from public.failures where unit_id is null
union all select 'failures 배정자 미매칭(배정된 건만)', count(*) from public.failures where assignee_id is null and nullif(trim(assignee),'') is not null
union all select 'inspections unit 미매칭', count(*) from public.inspections where unit_id is null
union all select 'material unit 미매칭(라벨 있는 건만)', count(*) from public.material_requests where unit_id is null and nullif(trim(elevator_no),'') is not null
union all select 'material 신청자 미매칭', count(*) from public.material_requests where requester_id is null and nullif(trim(engineer),'') is not null
union all select 'quote unit 미매칭(라벨 있는 건만)', count(*) from public.quote_requests where unit_id is null and nullif(trim(elevator_no),'') is not null
union all select 'todos unit 미매칭(원천 있는 건만)', count(*) from public.todos where unit_id is null and (material_request_id is not null or quote_request_id is not null or nullif(trim(elevator_no),'') is not null)
union all select 'billings unit 미매칭', count(*) from public.billings where unit_id is null
union all select 'billings 기사 미매칭', count(*) from public.billings where engineer_id is null and nullif(trim(engineer),'') is not null
union all select 'restock 기사 미매칭', count(*) from public.restock_requests where engineer_id is null
union all select 'feed 작성자 미매칭', count(*) from public.feed_posts where author_id is null;

-- 미매칭 상세 확인용 (필요할 때 주석 해제):
-- select id, site_name, elevator_no from public.failures where unit_id is null;
-- select id, site_name, elevator_no from public.todos
--   where unit_id is null and (material_request_id is not null or quote_request_id is not null or nullif(trim(elevator_no),'') is not null);
