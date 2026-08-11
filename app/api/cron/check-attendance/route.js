// 출근체크 리마인드 + 관리자 요약 — pg_cron이 매분 이 주소를 호출한다.
//  1) 09:01~09:30(KST, 평일) 매분: 아직 출근체크 안 한 기사에게 리마인드 (체크하면 다음 스윕부터 빠짐 — 자동 종료)
//  2) 09:10(KST, 평일) 1회: 그 시점 미체크자 명단을 관리자에게 요약
// 연차·공가·병가는 종일 제외, 반차는 오전반차만 제외(오후반차는 오전에 정상 출근이라 대상 포함).
import { createClient } from "@supabase/supabase-js";

const FULL_DAY_EXCLUDE_KINDS = ["연차", "공가", "병가"];

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  const isWeekday = nowKst.getDay() >= 1 && nowKst.getDay() <= 5;
  const inWindow = isWeekday && kstMins >= 541 && kstMins <= 570; // 09:01~09:30
  if (!inWindow) return Response.json({ ok: true, skipped: "시간대 아님" });

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const origin = new URL(request.url).origin;
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);

  const [{ data: engineers }, { data: attendances }, { data: leaves }] = await Promise.all([
    db.from("profiles").select("id,name").eq("role", "engineer").eq("is_active", true),
    db.from("attendances").select("profile_id,checked_in_at").eq("work_date", todayStr),
    db.from("leaves").select("profile_id,kind,note").lte("start_date", todayStr).gte("end_date", todayStr),
  ]);

  const checkedInIds = new Set((attendances ?? []).filter((a) => a.checked_in_at).map((a) => a.profile_id));
  const excludedIds = new Set(
    (leaves ?? [])
      .filter((l) => FULL_DAY_EXCLUDE_KINDS.includes(l.kind) || (l.kind === "반차" && (l.note ?? "").startsWith("오전")))
      .map((l) => l.profile_id)
  );

  const notCheckedIn = (engineers ?? []).filter((e) => !checkedInIds.has(e.id) && !excludedIds.has(e.id));

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
