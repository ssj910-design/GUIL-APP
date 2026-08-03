// 예약형 고장 알림 스윕 — pg_cron이 매분 이 주소를 POST로 호출한다(Supabase pg_net).
// 개별 카운트다운이 아니라 "기준 넘긴 것을 매분 훑어서 울리는" 폴링 방식.
//  1) 미배정 15분: 접수됐는데 15분째 아무도 안 잡은 고장 → 관리자에게 (한 번만, stale_notified_at로 dedup)
//  2) 출동 미응답 5분: 배정됐는데 5분째 출동응답 없음 → 배정 기사 + 관리자에게 (근무시간 내 배정 후 30분까지 5분 간격, no_response_nag_at)
// 재촉은 근무시간(월~금 08:00~17:30 KST)에만 — 야간·주말은 끔. 초기 긴급 알림은 즉시형이라 시간 무관하게 감.
// 실제 발송은 기존 /api/push/send에 위임(회사·개인 알림설정·만료구독 정리를 거기서 처리).
import { createClient } from "@supabase/supabase-js";

const FIFTEEN_MIN = 15 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;

async function handle(request) {
  // 아무나 못 부르게 — pg_cron이 보내는 시크릿과 일치할 때만. (미설정이면 전부 거부 = 안전)
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  // 재촉은 근무시간에만 — 월~금 08:00~17:30(KST). 야간·주말은 스킵.
  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  const workHours = nowKst.getDay() >= 1 && nowKst.getDay() <= 5 && kstMins >= 480 && kstMins <= 1050;
  if (!workHours) return Response.json({ ok: true, skipped: "근무시간 외" });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const origin = new URL(request.url).origin;
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);
  const label = (f) => `${f.site_name ?? ""}${f.elevator_no ? ` · ${f.elevator_no}` : ""}`.trim();

  try {
    const now = Date.now();
    const staleBefore = new Date(now - FIFTEEN_MIN).toISOString();
    const nagBefore = new Date(now - FIVE_MIN).toISOString();
    const nagFloor = new Date(now - THIRTY_MIN).toISOString(); // 배정 후 30분까지만 재촉(약 5~6회), 그 뒤 멈춤

    // 관리자 목록(활성) — 두 알림 모두 관리자에게 간다. 자재담당관리자는 자재·견적만 다루고
    // 고장 대응은 관여하지 않으므로 제외한다.
    const { data: profs } = await db.from("profiles").select("id,role,admin_tier,is_active,deleted_at").eq("role", "admin");
    const adminIds = (profs ?? [])
      .filter((p) => p.is_active !== false && !p.deleted_at && p.admin_tier !== "material")
      .map((p) => p.id);

    // 1) 미배정 15분 — 접수 후 15분째 assignee 없음, 아직 안 알린 건.
    const { data: stale } = await db
      .from("failures")
      .select("id,site_name,elevator_no,created_at")
      .eq("status", "미처리").is("assignee", null)
      .lte("created_at", staleBefore).is("stale_notified_at", null)
      .limit(50);

    let staleSent = 0;
    for (const f of stale ?? []) {
      const ok = await send({ key: "failure_stale", profileIds: adminIds, title: "미배정 15분 경과", body: `${label(f)} — 아직 아무도 안 잡았습니다`, url: `/?openFailure=${f.id}` });
      if (ok) { await db.from("failures").update({ stale_notified_at: new Date().toISOString() }).eq("id", f.id); staleSent++; }
    }

    // 2) 출동 미응답 5분 — 배정됐는데(assignee_id 있음) 5분째 미처리(출동응답 전), 마지막 알림이 5분 넘음.
    const { data: pending } = await db
      .from("failures")
      .select("id,site_name,elevator_no,assignee,assignee_id,assigned_at,no_response_nag_at")
      .eq("status", "미처리").not("assignee_id", "is", null)
      .lte("assigned_at", nagBefore).gte("assigned_at", nagFloor)
      .or(`no_response_nag_at.is.null,no_response_nag_at.lte.${nagBefore}`)
      .limit(50);

    let nagSent = 0;
    for (const f of pending ?? []) {
      const ids = [f.assignee_id, ...adminIds].filter(Boolean);
      // 고장별 고정 tag — 같은 고장 재촉은 알림 한 칸에서 갱신(긴급이라 다시 소리·진동), 다른 고장은 따로 쌓임.
      const ok = await send({ key: "dispatch_no_response", profileIds: ids, tag: `dispatch_no_response-${f.id}`, title: "출동 응답 없음", body: `${label(f)} — ${f.assignee ?? "배정 기사"} 미응답 (배정 후 5분+)`, url: `/?openFailure=${f.id}` });
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
