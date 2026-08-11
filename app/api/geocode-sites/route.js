// 현장 주소 → 좌표 변환 (티맵 지오코딩). 결과는 sites.lat/lng에 캐시한다.
//
// 왜 캐시하는가: 고장 배정 때마다 711개 현장을 지오코딩하면 티맵 호출 한도를 즉시 넘긴다.
// 주소는 거의 바뀌지 않으므로 한 번 변환해 두고 재사용한다.
//
// appKey는 서버에서만 쓴다 (클라이언트로 내려보내면 키가 노출된다).
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodeAddress } from "@/lib/tmapGeocode";
import { verifyAuthToken } from "@/lib/verifyToken";

export const maxDuration = 300;

// 티맵은 짧은 시간에 몰아치면 조용히 빈 응답을 준다(에러코드도 안 준다).
// 동시 2개 + 호출 간 간격 + 1회 재시도로 낮추니 실패가 사라졌다 (2026-07-20 실측:
// 동시 5개 연속 배치에서는 성공률이 87%→15%까지 떨어졌다).
const CONCURRENCY = 2;
const GAP_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function GET(request) {
  if (!verifyAuthToken(request)) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const key = process.env.TMAP_APP_KEY;
  if (!key) return Response.json({ ok: false, reason: "TMAP_APP_KEY 미설정" }, { status: 200 });

  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit")) || 50, 1000);
  const supabase = supabaseAdmin;

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
        const pos = await geocodeAddress(s.address, key);
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
