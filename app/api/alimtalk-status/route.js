// 알림톡 발송 결과 새로고침 — "확인 중"에 멈춘 건을 솔라피에 직접 물어 갱신한다.
//
// 웹훅이 정상이면 이 라우트는 할 일이 없다. 하지만 웹훅은 콘솔 설정·토큰에 의존해서
// 조용히 안 올 수 있고, 그러면 화면에는 "확인 중"만 영원히 남는다 — 그 상태면 발송 현황
// 화면을 만든 이유가 사라진다. 그래서 화면이 열릴 때 이걸 한 번 부른다.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAlimtalkStatus } from "@/lib/alimtalk";

export async function POST() {
  if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) {
    return Response.json({ ok: false, reason: "SOLAPI 키 미설정" });
  }

  // 아직 결과를 못 받은 카카오 발송 건만 추린다.
  const { data: rows, error } = await supabaseAdmin
    .from("quote_requests")
    .select("id, send_log")
    .neq("send_log", "[]")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });

  const pendingIds = [];
  for (const r of rows ?? []) {
    for (const e of r.send_log ?? []) {
      if (e.channel === "kakao" && e.messageId && e.status !== "delivered" && e.status !== "failed") {
        pendingIds.push(e.messageId);
      }
    }
  }
  if (!pendingIds.length) return Response.json({ ok: true, checked: 0, updated: 0 });

  const statuses = await fetchAlimtalkStatus(pendingIds);

  // 결과가 나온 건만 골라 그 행의 send_log를 통째로 다시 쓴다.
  let updated = 0;
  const changedRows = {};   // { quoteId: send_log } — 화면이 상위 재조회 없이 바로 반영한다
  for (const r of rows ?? []) {
    let changed = false;
    const next = (r.send_log ?? []).map((e) => {
      const s = e.messageId ? statuses[e.messageId] : null;
      if (!s || s.status === "pending" || s.status === e.status) return e;
      changed = true;
      return { ...e, ...s, checkedAt: new Date().toISOString() };
    });
    if (!changed) continue;
    const { error: upErr } = await supabaseAdmin.from("quote_requests").update({ send_log: next }).eq("id", r.id);
    if (upErr) console.error("[alimtalk-status] 갱신 실패:", r.id, upErr.message);
    else { updated += 1; changedRows[r.id] = next; }
  }

  return Response.json({ ok: true, checked: pendingIds.length, updated, changedRows });
}
