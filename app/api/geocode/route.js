// 주소 → 좌표 (티맵 fullAddrGeo) — 엑셀 검증 도구의 "주소 좌표로 대조"용.
// 구주소·신주소 어느 쪽을 넣어도 좌표를 돌려준다. appKey는 서버에서만 쓴다(tmap-route와 동일 원칙).
export async function GET(request) {
  const key = process.env.TMAP_APP_KEY;
  if (!key) return Response.json({ ok: false, reason: "TMAP_APP_KEY 미설정" }, { status: 200 });
  const addr = new URL(request.url).searchParams.get("addr")?.trim();
  if (!addr) return Response.json({ ok: false, reason: "addr 필요" }, { status: 400 });
  try {
    const res = await fetch(
      `https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&coordType=WGS84GEO&fullAddr=${encodeURIComponent(addr)}`,
      { headers: { appKey: key } }
    );
    if (!res.ok) return Response.json({ ok: false, reason: `티맵 응답 ${res.status}` }, { status: 200 });
    const json = await res.json();
    const c = json?.coordinateInfo?.coordinate?.[0];
    const lat = Number(c?.lat || c?.newLat);
    const lng = Number(c?.lon || c?.newLon);
    if (!lat || !lng) return Response.json({ ok: false, reason: "좌표 결과 없음" }, { status: 200 });
    return Response.json({ ok: true, lat, lng });
  } catch (e) {
    return Response.json({ ok: false, reason: e.message }, { status: 200 });
  }
}
