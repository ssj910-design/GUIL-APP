-- 110: photos 버킷 Storage 정책 — anon 전용이던 걸 authenticated도 허용하게 (2026-08-12)
-- 오늘(2026-08-12) 로그인 토큰을 브라우저 클라이언트에 붙이기 시작하면서, 로그인한
-- 사용자의 모든 요청이 anon이 아니라 authenticated 역할로 나가게 됐다 — 그런데 이
-- photos 버킷의 기존 정책(anon insert photos / anon select photos)은 anon 역할에만
-- 걸려있어서, 로그인한 사용자의 사진 업로드가 전부 RLS 위반으로 막히기 시작했다
-- (사진 업로드 전 화면 공통 — 자재신청, 고장접수, 자체점검 등).
--
-- 대시보드 Policies UI에서 이름만 바꾸려다 "must be owner of table objects"(42501)로
-- 막혀서, SQL Editor에서 직접 지우고 다시 만든다 — Storage 정책 관리에 흔히 쓰는 방식.
-- WITH CHECK/USING 조건(bucket_id = 'photos')은 기존과 동일하게 유지, role만 넓힌다.

drop policy if exists "anon insert photos" on storage.objects;
drop policy if exists "anon select photos" on storage.objects;

create policy "insert photos" on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'photos');

create policy "select photos" on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'photos');

-- 검증
select policyname, cmd, roles from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname in ('insert photos', 'select photos');
