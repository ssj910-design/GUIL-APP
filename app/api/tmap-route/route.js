// 기사 위치 → 고장 현장까지 자동차 경로 안내 (티맵 경로 API 프록시).
// appKey는 서버에서만 쓴다 (클라이언트로 내려보내면 키가 노출된다).
const ROUTE_URL = "https://apis.openapi.sk.com/tmap/routes?version=1";

export async function POST(request) {
  const key = process.env.TMAP_APP_KEY;
  if (!key) return Response.json({ ok: false, reason: "TMAP_APP_KEY 미설정" }, { status: 200 });

  const { startLat, startLng, endLat, endLng, startName, endName } = await request.json().catch(() => ({}));
  if (![startLat, startLng, endLat, endLng].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return Response.json({ ok: false, reason: "좌표 누락" }, { status: 200 });
  }

  const res = await fetch(ROUTE_URL, {
    method: "POST",
    headers: { appKey: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      startX: String(startLng), startY: String(startLat),
      endX: String(endLng), endY: String(endLat),
      reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO",
      startName: encodeURIComponent(startName || "출발"),
      endName: encodeURIComponent(endName || "도착"),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json({ ok: false, reason: `티맵 경로 API 오류 (${res.status})`, detail }, { status: 200 });
  }

  const data = await res.json().catch(() => null);
  const features = data?.features ?? [];
  const summary = features.find((f) => f.properties?.totalDistance != null);
  const coords = [];
  features.forEach((f) => {
    if (f.geometry?.type === "LineString") {
      f.geometry.coordinates.forEach(([lng, lat]) => coords.push([lat, lng]));
    }
  });
  if (!summary || coords.length === 0) {
    return Response.json({ ok: false, reason: "경로를 찾을 수 없습니다" }, { status: 200 });
  }

  return Response.json({
    ok: true,
    totalTimeSec: summary.properties.totalTime,
    totalDistanceM: summary.properties.totalDistance,
    coords,
  });
}
