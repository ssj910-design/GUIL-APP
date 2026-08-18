-- 124: 화면 사용 로그 (2026-08-14)
--
-- 목적: "어느 화면을 실제로 쓰나"를 데이터로 보고 UI를 정리하기 위해. 지금은 감으로만
-- 판단하고 있어서 탭이 11개까지 늘었다 — 안 쓰는 화면을 알아야 줄일 수 있다.
--
-- ⚠️ **개인 단위로 추적하지 않는다.** profile_id 컬럼을 일부러 두지 않았다.
-- "누가 몇 번 눌렀나"는 UI 개선에 필요 없고, 그건 분석이 아니라 감시다.
-- (위치정보 수집을 중단한 것과 같은 기준 — docs/QA-RULES.md 9장)
create table if not exists ui_events (
  id bigint generated always as identity primary key,
  screen text not null,             -- 'home' | 'failure' | 'lawqa' … (탭 id)
  action text not null default 'view',  -- 'view'(화면 진입) | 그 외 주요 동작
  role text,                        -- 'engineer' | 'admin' (개인이 아닌 역할 단위 — 화면 구성 판단용)
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ui_events_created_idx on ui_events (created_at desc);
create index if not exists ui_events_screen_idx on ui_events (screen, created_at desc);

alter table ui_events enable row level security;
-- 로그인한 사람은 남길 수 있고(쓰기), 읽기도 허용 — 통계 화면이 앱에서 직접 조회한다.
-- (다른 테이블과 같은 정책 범위 — 마이그 106)
drop policy if exists ui_events_rw on ui_events;
create policy ui_events_rw on ui_events for all to authenticated using (true) with check (true);

-- 통계 예시:
--   화면별  select screen, count(*) from ui_events where action='view' and created_at > now() - interval '14 days' group by 1 order by 2 desc;
--   역할별  select role, screen, count(*) from ui_events group by 1,2 order by 3 desc;
