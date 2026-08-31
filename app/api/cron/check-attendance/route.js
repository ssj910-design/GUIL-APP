// 출근체크 리마인드 + 관리자 요약 — pg_cron이 매분 이 주소를 호출한다.
//  1) 09:01~10:00(KST, 평일·공휴일·근로자의날 제외) 매분: 아직 출근체크 안 한 기사에게 리마인드
//     (체크하면 다음 스윕부터 빠짐 — 자동 종료). 연차·공가·병가는 종일 제외, 오전반차도 제외
//     (오전반차는 아래 3번에서 정오에 따로 다룬다). 오후반차는 오전에 정상 출근이라 대상 포함.
//  2) 09:10(KST) 1회: 그 시점 미체크자 명단을 관리자에게 요약
//  3) 12:01~13:00(KST) 매분: 오전반차인 사람 중 아직 출근체크 안 한 사람에게 리마인드
//     (오전반차는 정오 무렵부터 근무 시작이라 위 09:01~10:00 리마인드 대상에서는 빠져 있다 —
//     1번과 동일하게 체크할 때까지 매분 반복되다가 체크하면 다음 스윕부터 빠진다)
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { periodOf } from "@/lib/utils";
import { isKstHoliday } from "@/lib/serverHolidays";

const FULL_DAY_EXCLUDE_KINDS = ["연차", "공가", "병가"];

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  const isWeekday = nowKst.getDay() >= 1 && nowKst.getDay() <= 5;
  const inMorningWindow = kstMins >= 541 && kstMins <= 600; // 09:01~10:00
  const inNoonWindow = kstMins >= 721 && kstMins <= 780; // 12:01~13:00 (오전반차 — 09시 알람과 동일한 방식)
  if (!isWeekday || !(inMorningWindow || inNoonWindow)) return Response.json({ ok: true, skipped: "시간대 아님" });

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

  const [{ data: allEngineers }, { data: attendances }, { data: leaves }] = await Promise.all([
    db.from("profiles").select("id,name,member_type").eq("role", "engineer").eq("is_active", true),
    db.from("attendances").select("profile_id,checked_in_at").eq("work_date", todayStr),
    db.from("leaves").select("profile_id,kind,note").lte("start_date", todayStr).gte("end_date", todayStr),
  ]);
  // TEST계정은 실제 출근을 안 하니 출근체크 리마인드·미체크 보고 대상에서 뺀다.
  const engineers = (allEngineers ?? []).filter((e) => e.member_type !== "TEST계정");

  const checkedInIds = new Set((attendances ?? []).filter((a) => a.checked_in_at).map((a) => a.profile_id));
  const amHalfDayIds = new Set((leaves ?? []).filter((l) => l.kind === "반차" && periodOf(l.note) === "오전").map((l) => l.profile_id));

  if (inNoonWindow) {
    const notCheckedIn = engineers.filter((e) => amHalfDayIds.has(e.id) && !checkedInIds.has(e.id));
    let reminded = false;
    if (notCheckedIn.length) {
      reminded = await send({
        key: "attendance_missing",
        profileIds: notCheckedIn.map((e) => e.id),
        title: "출근체크를 아직 안 하셨어요",
        body: "오전반차 후 출근하셨다면 앱에서 출근체크를 눌러주세요",
        url: "/?openAttendance=1",
      });
    }
    return Response.json({ ok: true, notCheckedIn: notCheckedIn.length, reminded });
  }

  const excludedIds = new Set((leaves ?? []).filter((l) => FULL_DAY_EXCLUDE_KINDS.includes(l.kind)).map((l) => l.profile_id));
  for (const id of amHalfDayIds) excludedIds.add(id);

  const notCheckedIn = engineers.filter((e) => !checkedInIds.has(e.id) && !excludedIds.has(e.id));

  let reminded = false;
  let reported = false;
  if (notCheckedIn.length) {
    reminded = await send({
      key: "attendance_missing",
      profileIds: notCheckedIn.map((e) => e.id),
      title: "출근체크를 아직 안 하셨어요",
      body: "정상 출근하셨다면 앱에서 출근체크를 눌러주세요",
      url: "/?openAttendance=1",
    });
    if (kstMins === 550) { // 09:10 — 관리자 요약은 이 시각에 한 번만
      reported = await send({
        key: "attendance_report",
        title: "출근 미체크 인원",
        body: notCheckedIn.map((e) => e.name).join(", "),
        url: "/admin?openAttendanceReport=1",
      });
    }
  }

  return Response.json({ ok: true, notCheckedIn: notCheckedIn.length, reminded, reported });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
