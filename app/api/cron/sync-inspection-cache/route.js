// 매일 국가승강기정보센터 API에서 전 호기의 검사유효기간·판정결과를 가져와
// units.inspection_start/inspection_end/inspection_result 캐시를 채운다 (Vercel Cron, vercel.json 참고).
// 대량 화면(홈·대시보드·검사관리)은 이 캐시만 읽는다 — 요청마다 공단 API를 부르면 트래픽 한도를 초과한다.
//
// 같은 건물(site)의 호기는 승강기고유번호 1개만 조회해도 전 호기가 함께 반환되므로,
// 사이트당 1콜로 묶어서 869개 호기를 869콜이 아니라 사이트 수만큼만 호출한다.
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const GOV_API_URL = "https://apis.data.go.kr/B553664/BuldElevatorService/getBuldElvtrList";
const CONCURRENCY = 10;

function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((itemMatch) => {
    const fields = {};
    for (const fieldMatch of itemMatch[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)) {
      fields[fieldMatch[1]] = fieldMatch[2];
    }
    return fields;
  });
}

// "20260716" → "2026-07-16"
function toDashedDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

async function fetchBuildingItems(anyGovNo) {
  const url = `${GOV_API_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&elevator_no=${encodeURIComponent(anyGovNo)}`;
  const res = await fetch(url);
  const xml = await res.text();
  const resultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(xml)?.[1];
  if (resultCode !== "00") return null;
  return parseItems(xml);
}

export async function GET(request) {
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const { data: units, error } = await supabase
    .from("units")
    .select("id, site_id, gov_no")
    .eq("is_active", true)
    .not("gov_no", "is", null);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const unitsBySite = new Map();
  for (const u of units) {
    if (!unitsBySite.has(u.site_id)) unitsBySite.set(u.site_id, []);
    unitsBySite.get(u.site_id).push(u);
  }
  const siteGroups = [...unitsBySite.values()];

  let sitesQueried = 0;
  let unitsUpdated = 0;
  let sitesFailed = 0;

  for (let i = 0; i < siteGroups.length; i += CONCURRENCY) {
    const batch = siteGroups.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (siteUnits) => {
        sitesQueried++;
        const items = await fetchBuildingItems(siteUnits[0].gov_no);
        if (!items) { sitesFailed++; return; }
        const itemByGovNo = new Map(items.map((it) => [it.elevatorNo, it]));
        await Promise.all(
          siteUnits.map(async (u) => {
            const item = itemByGovNo.get(u.gov_no);
            if (!item) return;
            const { error: updateError } = await supabase
              .from("units")
              .update({
                inspection_start: toDashedDate(item.applcBeDt),
                inspection_end: toDashedDate(item.applcEnDt),
                inspection_result: item.resultNm || null,
              })
              .eq("id", u.id);
            if (!updateError) unitsUpdated++;
          })
        );
      })
    );
  }

  return Response.json({
    totalUnits: units.length,
    sitesQueried,
    sitesFailed,
    unitsUpdated,
  });
}
