// 계약 만료 임박 — pg_cron이 매분 호출, 매주 월요일 09:00(KST)에만 동작.
// 계약만료일이 오늘부터 30일 이내인 현장을 관리자에게 리스트로.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { addDays } from "@/lib/utils";

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  const isMonday = nowKst.getDay() === 1;
  if (!isMonday || kstMins !== 540) return Response.json({ ok: true, skipped: "시간대 아님" }); // 매주 월 09:00

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const untilStr = addDays(todayStr, 30);

  const db = supabaseAdmin;
  const { data: sites } = await db.from("sites").select("id,name,contract_end")
    .eq("is_active", true).gte("contract_end", todayStr).lte("contract_end", untilStr);
  if (!sites?.length) return Response.json({ ok: true, sites: 0 });

  const origin = new URL(request.url).origin;
  const ok = await fetch(`${origin}/api/push/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      key: "contract_expiring",
      title: "계약 만료 임박 현장",
      body: sites.map((s) => `${s.name}(${s.contract_end})`).join(", "),
      url: "/admin?openContract=1",
    }),
  }).then((r) => r.ok).catch(() => false);

  return Response.json({ ok: true, sites: sites.length, sent: ok });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
