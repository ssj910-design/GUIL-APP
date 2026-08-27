// 예약형 고장 알림 스윕 — pg_cron이 매분 이 주소를 POST로 호출한다(Supabase pg_net).
// 개별 카운트다운이 아니라 "기준 넘긴 것을 매분 훑어서 울리는" 폴링 방식.
//  1) 미배정 15분: 접수됐는데 15분째 아무도 안 잡은 고장 → 관리자에게 (한 번만, stale_notified_at로 dedup)
//  2) 출동 미응답 3분: 배정됐는데 3분째 출동응답 없음 → 배정 기사(출근중일 때만) + 관리자에게
//     (배정 후 30분까지 3분 간격, no_response_nag_at)
// 24시간 돈다(야간·주말 포함) — 숙직·당직도 놓치면 안 되는 알림이라 시간대로 거르지 않는다.
// 다만 배정 기사 본인에게는 그 시점에 출근상태(checked_in_at 있고 checked_out_at 없음)일 때만 보낸다
// — 퇴근한 기사를 밤새 깨우지 않기 위함. 관리자는 출퇴근체크를 안 하는 경우가 많아 항상 보낸다.
// 실제 발송은 기존 /api/push/send에 위임(회사·개인 알림설정·만료구독 정리를 거기서 처리).
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NOTIFICATIONS, audienceTiersOf } from "@/lib/notifications";

const CATALOG = Object.fromEntries(NOTIFICATIONS.map((n) => [n.key, n]));

const FIFTEEN_MIN = 15 * 60 * 1000;
const THREE_MIN = 3 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;

async function handle(request) {
  // 아무나 못 부르게 — pg_cron이 보내는 시크릿과 일치할 때만. (미설정이면 전부 거부 = 안전)
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const db = supabaseAdmin;
  const origin = new URL(request.url).origin;
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);
  const label = (f) => `${f.site_name ?? ""}${f.elevator_no ? ` · ${f.elevator_no}` : ""}`.trim();

  try {
    const now = Date.now();
    const staleBefore = new Date(now - FIFTEEN_MIN).toISOString();
    const nagBefore = new Date(now - THREE_MIN).toISOString();
    const nagFloor = new Date(now - THIRTY_MIN).toISOString(); // 배정 후 30분까지만 재촉(약 10회), 그 뒤 멈춤

    // 관리자 목록(활성) — 실제 받는 등급은 알림설정 화면(NotifySettings)에서 고른 audience_tiers를
    // 그대로 따른다(lib/notifications.js의 audienceTiersOf, 화면과 발송이 같은 함수를 써서 라벨과
    // 실제 수신자가 항상 일치). 설정을 아무것도 안 건드렸으면 카탈로그의 기본값(최고+중간, 자재담당 제외).
    const [{ data: profs }, { data: settingRows }, { data: attendances }] = await Promise.all([
      db.from("profiles").select("id,role,admin_tier,is_active,deleted_at").eq("role", "admin"),
      db.from("notify_settings").select("key,audience_tiers").in("key", ["failure_stale", "dispatch_no_response"]),
      db.from("attendances").select("profile_id,checked_in_at,checked_out_at").eq("work_date", todayStr),
    ]);
    const activeAdmins = (profs ?? []).filter((p) => p.is_active !== false && !p.deleted_at);
    const orgTiers = Object.fromEntries((settingRows ?? []).map((r) => [r.key, { audienceTiers: r.audience_tiers ?? [] }]));
    function adminIdsFor(key) {
      const tiers = audienceTiersOf(CATALOG[key], orgTiers);
      const pool = tiers.length ? activeAdmins.filter((p) => tiers.includes(p.admin_tier)) : activeAdmins;
      return pool.map((p) => p.id);
    }
    // 지금 출근중(출근체크는 했고 퇴근체크는 안 함)인 사람만 — 숙직·당직이면 이 시간에도 당연히
    // 출근상태라 걸러지지 않는다. 퇴근한 기사를 야간에 재촉으로 깨우지 않기 위한 필터.
    const workingIds = new Set((attendances ?? []).filter((a) => a.checked_in_at && !a.checked_out_at).map((a) => a.profile_id));

    // 1) 미배정 15분 — 접수 후 15분째 assignee 없음, 아직 안 알린 건.
    const { data: stale } = await db
      .from("failures")
      .select("id,site_name,elevator_no,created_at")
      .eq("status", "미처리").is("assignee", null)
      .lte("created_at", staleBefore).is("stale_notified_at", null)
      .limit(50);

    let staleSent = 0;
    for (const f of stale ?? []) {
      const ok = await send({ key: "failure_stale", profileIds: adminIdsFor("failure_stale"), title: "미배정 15분 경과", body: `${label(f)} — 아직 아무도 안 잡았습니다`, url: `/?openFailure=${f.id}` });
      if (ok) { await db.from("failures").update({ stale_notified_at: new Date().toISOString() }).eq("id", f.id); staleSent++; }
    }

    // 2) 출동 미응답 3분 — 배정됐는데(assignee_id 있음) 3분째 미처리(출동응답 전), 마지막 알림이 3분 넘음.
    const { data: pending } = await db
      .from("failures")
      .select("id,site_name,elevator_no,assignee,assignee_id,assigned_at,no_response_nag_at")
      .eq("status", "미처리").not("assignee_id", "is", null)
      .lte("assigned_at", nagBefore).gte("assigned_at", nagFloor)
      .or(`no_response_nag_at.is.null,no_response_nag_at.lte.${nagBefore}`)
      .limit(50);

    let nagSent = 0;
    for (const f of pending ?? []) {
      const assigneeTarget = workingIds.has(f.assignee_id) ? f.assignee_id : null;
      const ids = [assigneeTarget, ...adminIdsFor("dispatch_no_response")].filter(Boolean);
      // 고장별 고정 tag — 같은 고장 재촉은 알림 한 칸에서 갱신(긴급이라 다시 소리·진동), 다른 고장은 따로 쌓임.
      const ok = await send({ key: "dispatch_no_response", profileIds: ids, tag: `dispatch_no_response-${f.id}`, title: "출동 응답 없음", body: `${label(f)} — ${f.assignee ?? "배정 기사"} 미응답 (배정 후 3분+)`, url: `/?openFailure=${f.id}` });
      if (ok) { await db.from("failures").update({ no_response_nag_at: new Date().toISOString() }).eq("id", f.id); nagSent++; }
    }

    return Response.json({ ok: true, stale: staleSent, noResponse: nagSent });
  } catch (e) {
    // 컬럼 미생성(마이그 074 전) 등 — 재시도 폭주 막으려 200으로 사유만 반환.
    return Response.json({ ok: false, reason: e.message }, { status: 200 });
  }
}

// pg_cron(net.http_post)은 POST, Vercel Cron은 GET으로 부른다 — 둘 다 받아 같은 스윕을 돈다(Pro 전환 시 코드 변경 없음).
export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
