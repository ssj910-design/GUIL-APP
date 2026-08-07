// 자체점검 미완료·미제출 리마인드 — pg_cron이 매분 이 주소를 호출하고, 09:00(KST)에만 동작한다.
// 매월 말일이면(이번 달 자체점검 아직 '예정'인 것 포함), 그 외엔 이미 마감 지난 것만 훑는다:
//  - status='누락' (매월 1일 자동 전환, 090 마이그레이션)
//  - status='완료'인데 공단제출 결과가 성공(000)이 아닌 것
// 등록(완료)하고 공단제출까지 성공(000)하면 다음 스윕부터 저절로 빠진다(자동 종료).
import { createClient } from "@supabase/supabase-js";

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  if (kstMins !== 540) return Response.json({ ok: true, skipped: "시간대 아님" }); // 09:00

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const origin = new URL(request.url).origin;
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);

  const currentYm = `${nowKst.getFullYear()}-${String(nowKst.getMonth() + 1).padStart(2, "0")}`;
  // 2026-08은 자체점검 등록을 다음 달부터 시작하기로 해서 이번 달만 알림을 건너뛴다 — 데이터(예정
  // 상태)는 그대로 두고 발송만 스킵. 9월부터는 이 줄이 저절로 안 걸려 코드 수정 없이 다시 울린다.
  if (currentYm === "2026-08") return Response.json({ ok: true, skipped: "2026-08 알림 보류" });
  const lastDayOfMonth = new Date(nowKst.getFullYear(), nowKst.getMonth() + 1, 0).getDate();
  const isLastDay = nowKst.getDate() === lastDayOfMonth;

  const [{ data: missed }, { data: govFailed }, { data: dueToday }] = await Promise.all([
    db.from("self_checks").select("id,unit_id,assignee_id").eq("status", "누락").not("assignee_id", "is", null),
    db.from("self_checks").select("id,unit_id,assignee_id")
      .eq("status", "완료").not("gov_submitted_at", "is", null).neq("gov_result_code", "000").not("assignee_id", "is", null),
    isLastDay
      ? db.from("self_checks").select("id,unit_id,assignee_id").eq("status", "예정").eq("ym", currentYm).not("assignee_id", "is", null)
      : Promise.resolve({ data: [] }),
  ]);
  const targets = [...(missed ?? []), ...(govFailed ?? []), ...(dueToday ?? [])];
  if (!targets.length) return Response.json({ ok: true, targets: 0 });

  const unitIds = [...new Set(targets.map((r) => r.unit_id))];
  const { data: units } = await db.from("units").select("id,site_id,seq").in("id", unitIds);
  const siteIds = [...new Set((units ?? []).map((u) => u.site_id))];
  const { data: sites } = await db.from("sites").select("id,name").in("id", siteIds);
  const siteById = new Map((sites ?? []).map((s) => [s.id, s]));
  const unitById = new Map((units ?? []).map((u) => [u.id, u]));
  const label = (r) => {
    const u = unitById.get(r.unit_id);
    const s = u ? siteById.get(u.site_id) : null;
    return `${s?.name ?? "현장"}${u?.seq ? ` ${u.seq}호기` : ""}`;
  };

  const byAssignee = new Map();
  for (const r of targets) {
    if (!byAssignee.has(r.assignee_id)) byAssignee.set(r.assignee_id, []);
    byAssignee.get(r.assignee_id).push(r);
  }

  let sent = 0;
  for (const [assigneeId, list] of byAssignee) {
    const ok = await send({
      key: "selfcheck_pending",
      profileIds: [assigneeId],
      title: "이번 달 자체점검 미완료",
      body: list.map(label).join(", "),
      url: "/?openCheckup=1",
    });
    if (ok) sent++;
  }

  return Response.json({ ok: true, targets: targets.length, assignees: sent });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
