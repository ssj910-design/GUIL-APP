// 관리자 견적 반려/취소 — 모바일 관리자 모드(ElevatorFieldApp)와 PC 관리자웹(QuotesAdmin)이
// 같이 쓴다. 승인 전엔 "반려", 승인 후(고객 취소 등)엔 "견적 취소"로 부르지만 상태값은 둘 다
// '반려'다(승인 후인지는 approvedDate로 구분). 기사가 스스로 한 '취소'와 달리 기사 화면에 남는다.
import { notify } from "@/lib/push";
import { recordQuoteRejectStockIn } from "@/lib/inventoryStock";

export const QUOTE_REJECTABLE = ["요청접수", "작성", "승인", "자재지급완료"];
export const QUOTE_REJECT_REASONS = ["고객 취소", "중복 요청", "현장 확인 필요", "내용 부족"];

export function rejectLabelOf(q) {
  return q.approvedDate ? "견적 취소" : "반려";
}

// 청구까지 끝난 건(견적 할일 완료)은 막는다 — 돈이 오간 뒤라 견적이 아니라 청구 정리 문제다.
// restoreStock: 자재지급완료 건에서 지급 자재가 창고로 돌아왔을 때만 재고를 되돌린다.
export async function rejectQuoteRequest(supabase, { quote, reason, rejectedBy, createdBy, restoreStock }) {
  // 화면 state가 아니라 DB로 확인한다 — 다른 기기에서 방금 청구했을 수 있다.
  const { data: billed, error: billedError } = await supabase.from("todos").select("id")
    .eq("quote_request_id", quote.id).eq("source", "quote").eq("done", true).limit(1);
  if (billedError) return { error: "확인 실패: " + billedError.message };
  if (billed?.length) return { error: "이미 청구된 견적이라 취소할 수 없습니다. 청구내역에서 먼저 정리해주세요." };

  // 관리자가 보고 있던 상태 그대로일 때만 바꾼다 — 그 사이 다른 관리자가 지급완료 등으로 넘겼으면
  // 할일·재고 정리 기준이 달라지므로 0행 적용되고 새로고침을 안내한다.
  const rejectedAt = new Date().toISOString();
  const { data: rows, error } = await supabase.from("quote_requests")
    .update({ status: "반려", reject_reason: reason, rejected_at: rejectedAt, rejected_by: rejectedBy })
    .eq("id", quote.id).eq("status", quote.status).select("id");
  if (error) return { error: "처리 실패: " + error.message };
  if (!rows?.length) return { error: "그 사이 견적 상태가 바뀌었습니다. 새로고침 후 다시 확인해주세요." };

  let removedTodos = [];
  let warning = null;
  if (quote.status === "자재지급완료") {
    const { data: deleted, error: delError } = await supabase.from("todos").delete()
      .eq("quote_request_id", quote.id).eq("source", "quote").eq("done", false).select("id, assignee_id");
    if (delError) warning = "견적은 취소됐지만 할 일 삭제에 실패했습니다 — 할일관리에서 직접 지워주세요: " + delError.message;
    removedTodos = deleted ?? [];
    if (restoreStock) {
      await recordQuoteRejectStockIn(supabase, { quoteItems: quote.quoteItems, quoteId: quote.id, siteName: quote.siteName, createdBy });
    }
  }

  const patch = { status: "반려", rejectReason: reason, rejectedAt, rejectedBy };
  const label = rejectLabelOf(quote);
  const profileIds = [...new Set([quote.requesterId, ...removedTodos.map((t) => t.assignee_id)].filter(Boolean))];
  if (profileIds.length) {
    notify("quote_rejected", {
      profileIds,
      title: label === "반려" ? "견적 요청이 반려됐어요" : "견적이 취소됐어요",
      body: `${quote.siteName ?? ""} · ${quote.quoteTitle || quote.constructionType || ""} — ${reason}`,
      url: "/",
    });
  }
  return { patch, removedTodoIds: removedTodos.map((t) => t.id), warning };
}
