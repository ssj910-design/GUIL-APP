// 공휴일 동기화 — 한국천문연구원 특일정보 API에서 올해·내년 공휴일을 받아 holidays 테이블에 채운다.
// 매달 도는 이유: 매년 갱신만으로는 임시공휴일(선거일·정부 지정)을 놓친다.
//
// ⚠️ HOLIDAY_API_KEY는 data.go.kr에서 "특일정보"를 별도 활용신청해야 발급된다.
// 승강기 API 키로는 호출이 Forbidden으로 막힌다 (2026-07-20 확인).
// 키가 없거나 실패하면 앱은 lib/holidays.json 폴백을 계속 쓴다 — 화면이 비지는 않는다.
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const API = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

async function fetchYear(year, key) {
  const url = `${API}?solYear=${year}&numOfRows=100&_type=json&serviceKey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok || text.startsWith("<") || text.includes("Forbidden")) {
    throw new Error(`특일정보 API 응답 이상 (${res.status}): ${text.slice(0, 120)}`);
  }
  const json = JSON.parse(text);
  const raw = json?.response?.body?.items?.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  // locdate: 20260101(숫자), dateName: "1월1일", isHoliday: "Y"
  return items
    .filter((it) => it.isHoliday === "Y" && it.locdate)
    .map((it) => {
      const d = String(it.locdate);
      return { holiday_date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, name: it.dateName?.trim() || "공휴일" };
    });
}

export async function GET() {
  const key = process.env.HOLIDAY_API_KEY;
  if (!key) {
    return Response.json(
      { ok: false, reason: "HOLIDAY_API_KEY 미설정 — data.go.kr에서 특일정보 활용신청 후 Vercel 환경변수에 넣으세요. 그때까지 lib/holidays.json 폴백 사용" },
      { status: 200 }
    );
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const thisYear = new Date().getFullYear();
  const results = [];

  for (const year of [thisYear, thisYear + 1]) {
    try {
      const rows = await fetchYear(year, key);
      if (!rows.length) { results.push({ year, ok: false, reason: "빈 응답" }); continue; }
      // 그 해 데이터를 통째로 갈아끼운다 — 임시공휴일이 취소되는 경우까지 반영된다
      await supabase.from("holidays").delete().gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`);
      const { error } = await supabase.from("holidays").insert(rows.map((r) => ({ ...r, synced_at: new Date().toISOString() })));
      results.push(error ? { year, ok: false, reason: error.message } : { year, ok: true, count: rows.length });
    } catch (e) {
      results.push({ year, ok: false, reason: String(e.message ?? e) });
    }
  }

  return Response.json({ ok: results.some((r) => r.ok), results });
}
