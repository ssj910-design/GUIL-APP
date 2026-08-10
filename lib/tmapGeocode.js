// 티맵 주소 → 좌표 지오코딩. app/api/geocode-sites, app/api/geocode-address에서 공용으로 쓴다.
// appKey는 서버에서만 쓴다 (클라이언트로 내려보내면 키가 노출된다).
const GEO_URL = "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 공단 주소에는 ", 개인주택" 같은 꼬리표나 이중 공백이 섞여 있다. 티맵은 대체로 견디지만
// 정리해서 보내는 편이 매칭률이 높다.
function cleanAddress(a) {
  return a.replace(/\s*,.*$/, "").replace(/\s{2,}/g, " ").trim();
}

async function geocodeOnce(address, key) {
  const url = `${GEO_URL}?version=1&format=json&coordType=WGS84GEO&fullAddr=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { appKey: key }, cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const c = json?.coordinateInfo?.coordinate?.[0];
  if (!c) return null;
  // 티맵은 신주소/구주소에 따라 lat·lon 또는 newLat·newLon 중 하나를 채워 준다
  const lat = Number(c.newLat || c.lat);
  const lng = Number(c.newLon || c.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 ? { lat, lng } : null;
}

// 1회 재시도 — 호출 제한에 걸린 건 잠깐 쉬면 대부분 성공한다
export async function geocodeAddress(address, key) {
  const clean = cleanAddress(address);
  const first = await geocodeOnce(clean, key);
  if (first) return first;
  await sleep(600);
  return (await geocodeOnce(clean, key)) ?? (clean !== address ? await geocodeOnce(address, key) : null);
}
