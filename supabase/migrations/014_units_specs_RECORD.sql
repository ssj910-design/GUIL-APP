-- ============================================================
-- 014. [기록] units 상세 제원 + 보험 — 공단 엑셀의 전 필드 수용
-- 정적 제원은 DB에 저장(대량 화면·오프라인), 실시간 API는 단건 상세 보조.
-- ============================================================
alter table public.units add column if not exists kind text;             -- 세부 종류 (승객용/장애인용/자동차용 등)
alter table public.units add column if not exists form text;             -- 형식 (권상식-VVVF 등)
alter table public.units add column if not exists manufacturer text;     -- 제조업체
alter table public.units add column if not exists install_place text;    -- 설치장소 라벨 (예: 1-1)
alter table public.units add column if not exists floors text;           -- 운행층수
alter table public.units add column if not exists run_section text;      -- 운행구간 (예: B1-7)
alter table public.units add column if not exists load_kg int;           -- 적재하중(kg)
alter table public.units add column if not exists capacity_persons int;  -- 정원(인승)
alter table public.units add column if not exists rated_speed numeric;   -- 정격속도(m/s)
alter table public.units add column if not exists insurer text;          -- 보험사명
alter table public.units add column if not exists insurance_start date;  -- 보장 시작
alter table public.units add column if not exists insurance_end date;    -- 보장 종료
