// 솔라피 발송 결과 수신 — 알림톡/문자가 고객 폰에 실제로 도착했는지 알려주는 창구.
//
// 발송 API가 주는 건 "접수했다"까지라, 카톡 미가입·차단·번호오류로 못 받은 건은 앱에선
// 성공처럼 보인다. 그래서 솔라피가 결과를 확정하면(SINGLE-REPORT 이벤트) 여기로 알려주고,
// 그 messageId로 견적의 발송 이력(send_log)을 찾아 상태를 채운다.
//
// 등록: 콘솔(또는 API)에서 이벤트 SINGLE-REPORT, URL을 아래로.
//   https://guil-app-pi.vercel.app/api/solapi-webhook?token=<SOLAPI_WEBHOOK_TOKEN>
// 인증은 URL의 token 하나로 한다 — 솔라피 서명 방식에 의존하지 않아 단순하고, 토큰을
// 모르면 아무나 상태를 조작할 수 없다.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const db = () => supabaseAdmin;

// 솔라피 상태코드 → 사람이 읽는 상태. 4000이 성공, 나머지는 실패 사유가 따라온다.
function statusOf(report) {
  const code = String(report.statusCode ?? "");
  if (code === "4000") return "delivered";
  return code ? "failed" : "pending";
}

export async function POST(request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!process.env.SOLAPI_WEBHOOK_TOKEN || token !== process.env.SOLAPI_WEBHOOK_TOKEN) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  // 단건/배열 둘 다 올 수 있다 (테스트 이벤트는 단건).
  const reports = Array.isArray(body) ? body : [body].filter(Boolean);
  if (!reports.length) return Response.json({ ok: true, updated: 0 });

  const supabase = db();
  let updated = 0;

  for (const r of reports) {
    const messageId = r?.messageId;
    if (!messageId) continue;

    // send_log(jsonb 배열) 안에 이 messageId가 든 견적을 찾는다.
    const { data: rows } = await supabase
      .from("quote_requests")
      .select("id,send_log")
      .contains("send_log", [{ messageId }]);
    const row = rows?.[0];
    if (!row) continue; // 테스트 이벤트이거나 우리가 안 보낸 건

    const nextLog = (row.send_log ?? []).map((e) =>
      e.messageId === messageId
        ? {
            ...e,
            status: statusOf(r),
            statusCode: r.statusCode ?? null,
            // 실패 사유(카톡 미가입 등)를 그대로 남긴다 — 화면에서 보여줘야 대응이 된다.
            statusMessage: r.reason ?? r.statusMessage ?? null,
            reportedAt: r.dateReceived ?? new Date().toISOString(),
          }
        : e
    );
    await supabase.from("quote_requests").update({ send_log: nextLog }).eq("id", row.id);
    updated += 1;
  }

  return Response.json({ ok: true, updated });
}

// 솔라피가 등록 시 URL 유효성을 확인할 수 있어 GET도 열어둔다(상태만 응답, 데이터 없음).
export async function GET() {
  return Response.json({ ok: true, service: "solapi-webhook" });
}
