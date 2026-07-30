-- 083: 현장 데이터 검증 상태 (2026-07-30)
-- 엑셀 검증 업로드(VerifyImport)의 결과를 현장에 저장 — 현장정보 리스트에 빨강/노랑/초록 띠와 인증마크로 표시.
-- verify_level: 'red' | 'yellow' | 'green' (마지막 검증 스냅샷, null=미검증)
-- verified_at: 사람이 검토를 끝낸(인증완료) 시각. null이면 미인증.
alter table public.sites add column if not exists verify_level text;
alter table public.sites add column if not exists verified_at timestamptz;
