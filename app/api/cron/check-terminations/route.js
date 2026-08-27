// 예약된 계약종료 자동 반영 — pg_cron이 매분 호출, 매일 00:10(KST)에만 동작.
// 관리자가 계약종료일자를 미래로 잡아둔 현장(is_active는 아직 true, terminated_date만 설정됨)
// 중 그 날짜가 된 곳을 찾아 is_active를 false로 바꾼다.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  if (kstMins !== 10) return Response.json({ ok: true, skipped: "시간대 아님" }); // 00:10

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const db = supabaseAdmin;
  const { data: sites, error } = await db
    .from("sites")
    .update({ is_active: false })
    .eq("is_active", true)
    .not("terminated_date", "is", null)
    .lte("terminated_date", todayStr)
    .select("id,name,terminated_date");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, terminated: sites?.length ?? 0, sites: sites?.map((s) => s.name) ?? [] });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
