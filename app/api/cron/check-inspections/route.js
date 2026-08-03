// 금일 정기검사 알림 — pg_cron이 매분 호출, 08:00(KST)에만 동작.
// 오늘이 검사 유효기간 만료일(정기검사일)인 담당현장이 있으면 담당 기사에게 리스트로 알림.
// 없으면 그날은 아무것도 안 보낸다. (기존 D-7 사전예고는 폐지 — 당일 알림으로 대체)
import { createClient } from "@supabase/supabase-js";

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  if (kstMins !== 480) return Response.json({ ok: true, skipped: "시간대 아님" }); // 08:00

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const origin = new URL(request.url).origin;
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);

  const { data: units } = await db.from("units").select("id,site_id,seq")
    .eq("is_active", true).eq("inspection_end", todayStr);
  if (!units?.length) return Response.json({ ok: true, sites: 0 });

  const siteIds = [...new Set(units.map((u) => u.site_id))];
  const [{ data: sites }, { data: assignments }] = await Promise.all([
    db.from("sites").select("id,name").in("id", siteIds),
    db.from("site_assignments").select("site_id,tech_id").eq("is_lead", true).in("site_id", siteIds),
  ]);
  const siteById = new Map((sites ?? []).map((s) => [s.id, s]));
  const techBySite = new Map((assignments ?? []).map((a) => [a.site_id, a.tech_id]));

  const byTech = new Map();
  for (const u of units) {
    const techId = techBySite.get(u.site_id);
    if (!techId) continue;
    const label = `${siteById.get(u.site_id)?.name ?? "현장"}${u.seq ? ` ${u.seq}호기` : ""}`;
    if (!byTech.has(techId)) byTech.set(techId, []);
    byTech.get(techId).push(label);
  }

  let sent = 0;
  for (const [techId, labels] of byTech) {
    const ok = await send({
      key: "inspection_due",
      profileIds: [techId],
      title: "오늘 담당현장 정기검사",
      body: labels.join(", "),
      url: "/?openInspectionTab=1",
    });
    if (ok) sent++;
  }

  return Response.json({ ok: true, units: units.length, techs: sent });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
