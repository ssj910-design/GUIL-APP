-- 041: 위치 권한 상태 보고 (2026-07-21)
-- 브라우저 위치 권한(granted/denied/prompt)은 기기 로컬 정보라 서버가 자동으로 모른다.
-- 기사 앱이 열릴 때 본인 상태를 여기 보고하면, 관리자가 '위치 안 켠 사람'을 추출해
-- 켜는 방법을 안내할 수 있다. 기기마다 다를 수 있어 마지막 보고값을 쓴다.
alter table public.profiles add column if not exists geo_perm text;         -- granted | denied | prompt
alter table public.profiles add column if not exists geo_perm_at timestamptz;
