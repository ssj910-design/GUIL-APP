// 안드로이드 APK 사이드로드 배포 — Supabase Storage(photos 버킷, releases/ 폴더)에 APK와
// 최신 버전 정보(latest.json)를 올려두고, 앱은 그 JSON을 읽어 설치된 버전과 비교한다.
// 새 APK를 낼 때마다 releases/latest.json을 새 버전 정보로 덮어써야 한다.
const RELEASES_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/releases`;

export const LATEST_RELEASE_URL = `${RELEASES_BASE}/latest.json`;

// 실패해도(파일이 아직 없거나 네트워크 문제) null을 돌려준다 — 업데이트 배너는 있으면
// 좋은 기능이지 앱 동작을 막을 이유가 아니다.
export async function fetchLatestRelease() {
  try {
    const res = await fetch(LATEST_RELEASE_URL, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
