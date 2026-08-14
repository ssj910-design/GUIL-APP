// 현재 재고 수량과 내역 화면의 "그 시점 잔액"은 컬럼으로 저장하지 않고
// inventory_stock_movements(qtyDelta)로 매번 계산한다 — 단일 창고·소규모
// 데이터라 중복 저장으로 얻는 이득이 없고, drift 위험만 생긴다.

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
