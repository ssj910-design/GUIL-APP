// 현재 재고 수량과 내역 화면의 "그 시점 잔액"은 컬럼으로 저장하지 않고
// inventory_stock_movements(qtyDelta)로 매번 계산한다 — 단일 창고·소규모
// 데이터라 중복 저장으로 얻는 이득이 없고, drift 위험만 생긴다.

// 견적 자재지급완료 시 재고 'out' 반영 — 모바일 앱(handleCompleteQuoteSupply)과
// PC 관리자 콘솔(handleQuoteSupplyComplete) 양쪽에서 호출한다. 부품마스터 연동된
// 항목(partId 있는 것)마다 실반출수량만큼 기록한다. 재고 반영 실패는 지급완료
// 자체를 막지 않는다(호출부에서 이미 할일·상태 변경 성공) — 콘솔에만 남긴다.
// supabase 클라이언트를 인자로 받는다(모듈에서 직접 import하지 않음) — 이 파일은 node로
// 바로 실행하는 self-check(inventoryStock.check.mjs)가 있어 "@/..." 별칭 import를 못 쓴다.
export async function recordQuoteSupplyStockOut(supabase, { quoteItems, quoteId, siteName, createdBy }) {
  const partItems = (quoteItems ?? []).filter((it) => it.partId);
  if (!partItems.length) return;
  const movementRows = partItems.map((it) => ({
    product_id: it.partId,
    type: "out",
    qty_delta: -(it.qtyTaken ?? it.qty),
    note: `견적 ${quoteId} 지급`,
    site_text: siteName,
    created_by: createdBy ?? null,
  }));
  const { error } = await supabase.from("inventory_stock_movements").insert(movementRows);
  if (error) console.error("재고 반영 실패:", error.message);
}

export function currentStock(movements, productId) {
  return movements
    .filter((m) => m.productId === productId)
    .reduce((sum, m) => sum + m.qtyDelta, 0);
}

// 오래된 순으로 누적합(잔액)을 구한 뒤 화면 표시용으로 최신순으로 뒤집는다.
export function stockHistory(movements, productId) {
  const sorted = movements
    .filter((m) => m.productId === productId)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let balance = 0;
  const withBalance = sorted.map((m) => {
    balance += m.qtyDelta;
    return { ...m, balance };
  });
  return withBalance.reverse();
}
