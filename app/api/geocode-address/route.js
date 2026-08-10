// 지도 검색창에서 임의 주소 하나를 즉석으로 좌표 변환한다 (우리 담당 현장이 아니어도 된다).
// appKey는 서버에서만 쓴다 (클라이언트로 내려보내면 키가 노출된다).
import { geocodeAddress } from "@/lib/tmapGeocode";

export async function GET(request) {
  const key = process.env.TMAP_APP_KEY;
  if (!key) return Response.json({ ok: false, reason: "TMAP_APP_KEY 미설정" }, { status: 200 });

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ ok: false, reason: "검색어 없음" }, { status: 200 });

  const pos = await geocodeAddress(q, key);
  if (!pos) return Response.json({ ok: false, reason: "검색 결과 없음" }, { status: 200 });

  return Response.json({ ok: true, ...pos });
}
