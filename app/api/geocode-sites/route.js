// 현장 주소 → 좌표 변환 (티맵 지오코딩). 결과는 sites.lat/lng에 캐시한다.
//
// 왜 캐시하는가: 고장 배정 때마다 711개 현장을 지오코딩하면 티맵 호출 한도를 즉시 넘긴다.
// 주소는 거의 바뀌지 않으므로 한 번 변환해 두고 재사용한다.
//
// appKey는 서버에서만 쓴다 (클라이언트로 내려보내면 키가 노출된다).
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const GEO_URL = "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo";
// 티맵은 짧은 시간에 몰아치면 조용히 빈 응답을 준다(에러코드도 안 준다).
// 동시 2개 + 호출 간 간격 + 1회 재시도로 낮추니 실패가 사라졌다 (2026-07-20 실측:
// 동시 5개 연속 배치에서는 성공률이 87%→15%까지 떨어졌다).
const CONCURRENCY = 2;
const GAP_MS = 250;
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
async function geocode(address, key) {
  const clean = cleanAddress(address);
  const first = await geocodeOnce(clean, key);
  if (first) return first;
  await sleep(600);
  return (await geocodeOnce(clean, key)) ?? (clean !== address ? await geocodeOnce(address, key) : null);
}

export async function GET(request) {
  const key = process.env.TMAP_APP_KEY;
  if (!key) return Response.json({ ok: false, reason: "TMAP_APP_KEY 미설정" }, { status: 200 });

  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit")) || 50, 1000);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // 아직 변환하지 않은 현장만 처리한다 — 여러 번 돌려도 중복 호출이 없다
  const { data: sites, error } = await supabase
    .from("sites").select("id,name,address")
    .is("lat", null).not("address", "is", null).neq("address", "").limit(limit);
  if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
  if (!sites?.length) return Response.json({ ok: true, done: 0, remaining: 0, note: "변환할 현장이 없습니다" });

  let ok = 0;
  const failed = [];
  const queue = [...sites];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const s = queue.shift();
        await sleep(GAP_MS);
        const pos = await geocode(s.address, key);
        if (!pos) { failed.push(s.name); continue; }
        const { error: upErr } = await supabase
          .from("sites").update({ ...pos, geocoded_at: new Date().toISOString() }).eq("id", s.id);
        if (upErr) failed.push(s.name); else ok++;
      }
    })
  );

  const { count } = await supabase.from("sites")
    .select("id", { count: "exact", head: true })
    .is("lat", null).not("address", "is", null).neq("address", "");

  return Response.json({ ok: true, done: ok, failed: failed.length, failedNames: failed.slice(0, 10), remaining: count ?? 0 });
}
