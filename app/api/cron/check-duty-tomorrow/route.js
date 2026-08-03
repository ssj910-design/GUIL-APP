// 내일 당직·숙직 예고 — pg_cron이 매분 호출, 18:00(KST)에만 동작.
// 내일 duty_schedules에 배정된 사람에게 개별 알림.
import { createClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/utils";

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  if (kstMins !== 1080) return Response.json({ ok: true, skipped: "시간대 아님" }); // 18:00

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const tomorrowStr = addDays(todayStr, 1);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const origin = new URL(request.url).origin;
  const send = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.ok).catch(() => false);

  const { data: rows } = await db.from("duty_schedules").select("profile_id,kind").eq("duty_date", tomorrowStr);
  if (!rows?.length) return Response.json({ ok: true, sent: 0 });

  let sent = 0;
  for (const r of rows) {
    if (!r.profile_id) continue;
    const ok = await send({
      key: "duty_tomorrow",
      profileIds: [r.profile_id],
      title: `내일 ${r.kind}입니다`,
      body: tomorrowStr,
      url: "/?openDuty=1",
    });
    if (ok) sent++;
  }

  return Response.json({ ok: true, sent });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
