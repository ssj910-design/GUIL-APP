// 퇴근체크 리마인드 + 관리자 요약 — pg_cron이 매분 이 주소를 호출한다.
//  1) 18:00(KST, 평일·공휴일·근로자의날 제외) 1회: 오늘 출근은 했는데 아직 퇴근체크 안 한
//     기사에게 리마인드. 숙직·당직(오늘 duty_schedules), 연차·공가·병가·반차(오전/오후 무관
//     종일 제외 — 오전반차는 애초에 정오까지 근무 아니었을 수 있고, 오후반차는 오후에
//     이미 퇴근했을 것이므로 둘 다 대상에서 뺀다)는 제외.
//  2) 18:30(KST) 1회: 그 시점 퇴근 미체크자 명단을 관리자에게 요약
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isKstHoliday } from "@/lib/serverHolidays";

const FULL_DAY_EXCLUDE_KINDS = ["연차", "공가", "병가", "반차"];

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  const isWeekday = nowKst.getDay() >= 1 && nowKst.getDay() <= 5;
  const isReminderMoment = kstMins === 1080; // 18:00
  const isReportMoment = kstMins === 1110; // 18:30
  if (!isWeekday || !(isReminderMoment || isReportMoment)) return Response.json({ ok: true, skipped: "시간대 아님" });

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const db = supabaseAdmin;
  if (await isKstHoliday(db, todayStr)) return Response.json({ ok: true, skipped: "공휴일" });

  const origin = new URL(request.url).origin;
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);

  const [{ data: allEngineers }, { data: attendances }, { data: leaves }, { data: duties }] = await Promise.all([
    db.from("profiles").select("id,name,member_type").eq("role", "engineer").eq("is_active", true),
    db.from("attendances").select("profile_id,checked_in_at,checked_out_at").eq("work_date", todayStr),
    db.from("leaves").select("profile_id,kind").lte("start_date", todayStr).gte("end_date", todayStr),
    db.from("duty_schedules").select("profile_id,kind").eq("duty_date", todayStr),
  ]);
  // TEST계정은 실제 근무를 안 하니 퇴근체크 리마인드·미체크 보고 대상에서 뺀다.
  const engineers = (allEngineers ?? []).filter((e) => e.member_type !== "TEST계정");

  const checkedInNotOutIds = new Set(
    (attendances ?? []).filter((a) => a.checked_in_at && !a.checked_out_at).map((a) => a.profile_id)
  );
  const excludedIds = new Set([
    ...(leaves ?? []).filter((l) => FULL_DAY_EXCLUDE_KINDS.includes(l.kind)).map((l) => l.profile_id),
    ...(duties ?? []).filter((d) => d.kind === "숙직" || d.kind === "당직").map((d) => d.profile_id),
  ]);

  const notCheckedOut = engineers.filter((e) => checkedInNotOutIds.has(e.id) && !excludedIds.has(e.id));

  let reminded = false;
  let reported = false;
  if (notCheckedOut.length) {
    if (isReminderMoment) {
      reminded = await send({
        key: "attendance_checkout_missing",
        profileIds: notCheckedOut.map((e) => e.id),
        title: "퇴근체크를 아직 안 하셨어요",
        body: "퇴근하셨다면 앱에서 퇴근체크를 눌러주세요",
        url: "/?openAttendance=1",
      });
    }
    if (isReportMoment) {
      reported = await send({
        key: "attendance_checkout_report",
        title: "퇴근 미체크 인원",
        body: notCheckedOut.map((e) => e.name).join(", "),
        url: "/admin?openAttendanceReport=1",
      });
    }
  }

  return Response.json({ ok: true, notCheckedOut: notCheckedOut.length, reminded, reported });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
