// 금일 정기검사 알림 — pg_cron이 매분 호출, 08:00(KST)에만 동작.
// 오늘이 검사도래현장 일정(inspections.due_date, 관리자 수기입력)인 담당현장이 있으면 담당 기사에게 리스트로 알림.
// 없으면 그날은 아무것도 안 보낸다. (기존 D-7 사전예고는 폐지 — 당일 알림으로 대체)
// 공단 API의 units.inspection_end(검사유효기간)는 관리자가 일정을 등록하지 않아도 채워지므로
// 알림 기준으로 쓰지 않는다 — 화면(검사관리 > 검사도래현장)과 같은 inspections 테이블만 본다.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  if (kstMins !== 480) return Response.json({ ok: true, skipped: "시간대 아님" }); // 08:00

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const db = supabaseAdmin;
  const origin = new URL(request.url).origin;
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);

  const { data: dueInspections } = await db.from("inspections").select("unit_id")
    .eq("due_date", todayStr).is("result", null).not("unit_id", "is", null);
  const dueUnitIds = [...new Set((dueInspections ?? []).map((r) => r.unit_id))];
  if (!dueUnitIds.length) return Response.json({ ok: true, sites: 0 });

  const { data: units } = await db.from("units").select("id,site_id,seq")
    .eq("is_active", true).in("id", dueUnitIds);
  if (!units?.length) return Response.json({ ok: true, sites: 0 });

  const siteIds = [...new Set(units.map((u) => u.site_id))];
  const [{ data: sites }, { data: assignments }] = await Promise.all([
    db.from("sites").select("id,name").in("id", siteIds),
    // is_lead 필터 없이 담당 기사 전원을 받는다 — 이 알림도 담당기사 전원에게 팬아웃한다
    // (고장 알림 팬아웃과 같은 방향, ElevatorFieldApp.jsx 참고).
    db.from("site_assignments").select("site_id,tech_id").in("site_id", siteIds),
  ]);
  const siteById = new Map((sites ?? []).map((s) => [s.id, s]));
  const techBySite = new Map();
  for (const a of assignments ?? []) {
    if (!techBySite.has(a.site_id)) techBySite.set(a.site_id, []);
    techBySite.get(a.site_id).push(a.tech_id);
  }

  const byTech = new Map();
  for (const u of units) {
    const techIds = techBySite.get(u.site_id);
    if (!techIds?.length) continue;
    const label = `${siteById.get(u.site_id)?.name ?? "현장"}${u.seq ? ` ${u.seq}호기` : ""}`;
    for (const techId of techIds) {
      if (!byTech.has(techId)) byTech.set(techId, []);
      byTech.get(techId).push(label);
    }
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
