# 자재로스 방지 — 부품마스터 연동·폐자재/여유부품 반납 Design

## 목표

견적건의 고가부품 항목을 재고관리(부품마스터, `inventory_products`)와 연동해 자재로스
(신청↔지급↔설치 수량이 안 맞아 새는 것)를 잡는다. 여기에 두 가지를 새로 추적한다:
- **여유부품** — 불량 대비로 견적 수량보다 더 가져가는 것
- **폐자재** — 교체하며 나온 헌 부품 중 회수해야 하는 것

이전 논의([2026-08-13-material-loss-prevention.md](../plans/2026-08-13-material-loss-prevention.md))의
후속으로, 그 사이 재고관리 기능(`inventory_products`/`inventory_stock_movements`)이 실제로
만들어져서 그 문서의 `parts_master` 신규 테이블 계획을 대체한다. **이 문서가 최신 설계이고,
기존 문서는 논의 이력으로 남겨둔다.**

## 하이브리드 원칙 (기존 결정, 유지)

- **고가품**만 부품마스터로 추적. 저가 소모품은 지금처럼 자유텍스트 유지 — 전부 마스터화하면
  목록이 너무 커져 실용성이 없다는 기존 판단 유지.
- 고가품은 어차피 전부 **견적요청(quote_requests)** 채널로만 들어오므로, 마스터 연동도
  여기에만 붙인다.

## 부품마스터 연동 방식 — 견적에서는 조회만

**견적 작성 화면(`QuoteItemsModal.jsx`)에서 부품마스터의 신규 항목을 즉석으로 추가하지
않는다.** 항목을 검색해서 선택(연동)만 하고, "기타/직접입력"으로 넣은 부품은 마스터와
연동되지 않는 일반 자유텍스트 항목으로 남는다. **신규 부품 등록·마스터 관리는 재고관리
(`InventoryAdmin.jsx`) 메뉴에서만** 한다 — 견적 작성 중에 마스터 데이터가 오염되는 걸
막기 위함.

## 데이터 모델

| 대상 | 변경 | 비고 |
|---|---|---|
| `quote_items`(jsonb 배열, 기존) | `partId`, `returnRequired`, `qtyTaken` 키 추가 | 마이그레이션 불필요(jsonb). `partId` → `inventory_products.id`. `returnRequired`는 **매번 견적 작성할 때 사람이 직접 체크**(부품마스터의 기본값을 끌어오지 않음 — 확정). `qtyTaken`(실반출수량)은 비우면 `qty`(설치확정수량)와 동일 = 여유분 없음으로 간주. |
| `todos` | `waste_return_rows`(jsonb 배열) 추가 | `[{ productId, name, qtyRequired, qtyConfirmed }]`. 기존 `billing_part_rows`(024/112)와 같은 패턴 — 한 할일에 부품 여러 줄. |
| `todos` | `stock_confirmed_at`(nullable timestamptz) 추가 | 모든 줄이 확인 완료되면 채움. 기사의 "완료"(사진 제출)와 실제 재고 반영은 분리된 이벤트. |
| `inventory_stock_movements` | `todo_id`(nullable, `todos` FK) 추가 | **B안 확정.** `note` 자유텍스트 대신 정식 연결 — 견적/할일 단위 집계(로스리포트)를 안정적으로 조인할 수 있게. 일반 수동 입출고는 계속 null. |

## 흐름

### 1. 견적 작성
고가부품 항목마다 부품마스터에서 검색해 `partId` 연동, `returnRequired` 체크(회수 필요
부품이면), `qtyTaken` 입력(여유 있게 가져가면 `qty`보다 크게).

### 2. 자재지급완료 — 반출(`out`)
`handleCompleteQuoteSupply` 시점(실제로 부품이 창고에서 기사 손으로 넘어가는 순간)에,
`partId` 있는 항목마다 `qtyTaken`만큼 `inventory_stock_movements`에 `type: "out"` 기록.

### 3. 비용청구 제출 — 반납 할일 생성 (견적 1건당 1개)
이 견적건의 `quote_items` 중 `returnRequired: true`이거나 `qtyTaken > qty`인 항목이
하나라도 있으면, **견적 1건당 할일 1건**을 생성한다(부품별로 쪼개지 않음 — 기사가
여러 건에 흩어지지 않고 한 견적을 한 번에 처리하도록).

`todos.waste_return_rows`에 대상 부품 전부를 담는다:
```json
[
  { "productId": "pcb-001", "name": "PCB보드", "qtyRequired": 2, "qtyConfirmed": 0 },
  { "productId": "motor-007", "name": "모터", "qtyRequired": 1, "qtyConfirmed": 0 }
]
```
`qtyRequired`(각 줄) = 폐자재개수(`returnRequired`면 보통 1) + 여유분(`qtyTaken - qty`).
할일 제목: `"폐자재/여유부품 반납 — PCB보드 2EA, 모터 1EA"`(줄 나열).

### 4. 기사 완료
기존 "관리자 부여"(`source === "manual"`) 계열 셀프완료 패턴 재사용 — **반납사진
(`photoUrls`) 없으면 "완료 처리" 버튼 비활성화**. `done = true`가 돼도 재고엔 아직
반영되지 않는다(5번 관리자 확인을 거쳐야 함).

### 5. 관리자 확인 — 여기서만 재고에 반영된다
`TodosAdmin.jsx`에 `source === "waste_return" && done && !stockConfirmedAt` 필터 뷰
추가. 반납사진 + `waste_return_rows` 각 줄마다 확인수량 입력칸(기본값 = `qtyRequired`,
실물과 다르면 수정)을 보여주고, "확인" 누르면:

- **줄마다** 확인수량만큼 즉시 `inventory_stock_movements`에 `type: "in", todo_id: <이 할일 id>` 기록(부분 확인이어도 확인된 만큼은 바로 반영).
- `waste_return_rows`의 해당 줄 `qtyConfirmed`를 갱신.
- **모든 줄**이 `qtyConfirmed === qtyRequired`가 되면 → `stock_confirmed_at` 채우고 종료.
- **일부 줄만 부족**하면 → 부족한 줄만 남은 수량(`qtyRequired - qtyConfirmed`)으로 갱신하고
  할일을 `done = false`로 **재오픈**. 이미 완결된 줄(모터처럼 다 확인된 것)은 재오픈된
  기사 화면에서 숨기고, 남은 줄(PCB 1개)만 보여준다. 사진은 재오픈마다 지우지 않고
  누적(1차/2차 제출 이력 남김).
- 기사가 남은 걸 재반납 → 4번부터 반복.

### 6. (선택) 대시보드 연동
"30일 초과 미청구" 필터에 `waste_return`도 포함시키면 미반납도 같은 화면에서 관리 가능.

## 로스리포트와의 연결 (기존 결정, 유지)

새 메커니즘이 아니라 기존 "지급 후 30일 초과 미청구" KPI(`Dashboard.jsx`,
`overdueUnbilled`)의 부분집합 + 상세 뷰. 견적건 중 `quote_items`에 `partId`(고가부품)가
있는 것만 필터링, "무슨 부품이 얼마짜리가 며칠째 안 걷혔는지" 상세 리스트로 표시.
`todo_id` FK 덕분에 "이 견적으로 반출된 수량 - 반납 확인된 수량 - 설치확정수량"을 조인
쿼리로 안정적으로 대조할 수 있다.

## 범위 밖

- `inventory_products` 초기 데이터 적재 — 이미 완료됨(재고관리 기능 자체 작업 범위).
- 저가 소모품의 마스터화 — 하이브리드 원칙에 따라 대상 아님.
- 견적 작성 중 신규 부품 즉석 등록 — 재고관리 메뉴에서만 가능하도록 의도적으로 막음.
- 화면 구현 우선순위·순서 — 다음 단계에서 논의.
