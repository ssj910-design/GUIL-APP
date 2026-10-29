// 검사유효기간 경과 알림 — pg_cron이 매분 호출, 월요일 09:00(KST)에만 동작(주 1회).
// 유효기간이 30일 넘게 지난 호기를 담당 기사(본인 담당분)와 관리자(전체 요약)에게 알린다.
// 관리자가 검사관리 화면에서 "검사 신청함"을 체크한 호기는 빠진다 — 단 체크 후 30일이 지나도
// 유효기간이 그대로면 다시 대상이 된다(lib/inspectionOverdue.js의 needsInspectionAlert).
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { needsInspectionAlert, overdueDaysOf } from "@/lib/inspectionOverdue";

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  if (kstMins !== 540) return Response.json({ ok: true, skipped: "시간대 아님" });       // 09:00
  if (nowKst.getDay() !== 1) return Response.json({ ok: true, skipped: "월요일 아님" }); // 주 1회

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const db = supabaseAdmin;
  const origin = new URL(request.url).origin;
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);

  // 법정 검사 대상만 본다 — 호이스트·주차기 등(requires_self_check=false)은 제외.
  const { data: units } = await db
    .from("units")
    .select("id,site_id,unit_no,seq,inspection_end,inspection_applied_at")
    .eq("is_active", true)
    .eq("requires_self_check", true)
    .not("inspection_end", "is", null);
  const overdue = (units ?? []).filter((u) => needsInspectionAlert(u, todayStr));
  if (!overdue.length) return Response.json({ ok: true, units: 0 });

  // 계약종료 현장은 뺀다.
  const siteIds = [...new Set(overdue.map((u) => u.site_id))];
  const [{ data: sites }, { data: assignments }] = await Promise.all([
    db.from("sites").select("id,name,is_active").in("id", siteIds),
    db.from("site_assignments").select("site_id,tech_id").in("site_id", siteIds),
  ]);
  const siteById = new Map((sites ?? []).filter((s) => s.is_active !== false).map((s) => [s.id, s]));
  const targets = overdue.filter((u) => siteById.has(u.site_id));
  if (!targets.length) return Response.json({ ok: true, units: 0 });

  const techBySite = new Map();
  for (const a of assignments ?? []) {
    if (!techBySite.has(a.site_id)) techBySite.set(a.site_id, []);
    techBySite.get(a.site_id).push(a.tech_id);
  }
  const labelOf = (u) => {
    const unitLabel = u.unit_no || (u.seq ? `${u.seq}호기` : "");
    const days = overdueDaysOf(u.inspection_end, todayStr);
    return `${siteById.get(u.site_id)?.name ?? "현장"}${unitLabel ? ` ${unitLabel}` : ""}(${days}일 경과)`;
  };

  // 담당 기사 — 본인 담당 현장 건만 묶어서 한 건.
  const byTech = new Map();
  for (const u of targets) {
    for (const techId of techBySite.get(u.site_id) ?? []) {
      if (!byTech.has(techId)) byTech.set(techId, []);
      byTech.get(techId).push(u);
    }
  }
  let techSent = 0;
  for (const [techId, list] of byTech) {
    const ok = await send({
      key: "inspection_overdue",
      profileIds: [techId],
      title: "검사유효기간 한 달 경과 — 검사 신청 확인 필요",
      body: `${list.map(labelOf).join(", ")} · 건물관계자에게 검사 신청 여부를 확인해주세요`,
      url: "/?openInspectionTab=1",
    });
    if (ok) techSent++;
  }

  // 관리자 — 전체 요약 한 건(대상 지정 없이 audience로 보낸다).
  const siteCount = new Set(targets.map((u) => u.site_id)).size;
  const adminOk = await send({
    key: "inspection_overdue_report",
    title: "검사유효기간 한 달 경과 — 검사 신청 확인 필요",
    body: `${siteCount}개 현장 ${targets.length}대 · 건물관계자에게 검사 신청 여부를 확인해주세요`,
    url: "/?openInspectionTab=1",
  });

  return Response.json({ ok: true, units: targets.length, techs: techSent, adminReport: adminOk });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
