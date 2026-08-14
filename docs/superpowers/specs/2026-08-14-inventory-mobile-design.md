# 재고관리 모바일 어플 Design

## 목표

PC 관리자웹에 이미 구현된 재고관리([2026-08-14-inventory-management-design.md](2026-08-14-inventory-management-design.md))를
모바일 어플(기사용 PWA)에도 하단탭으로 추가한다. 브라우저 목업으로 레이아웃
확인 완료 — 제품목록(공통), 제품상세(역할별 필드 차등), 입고/출고/조정
수량입력(스테퍼), 액션 바텀시트, 제품 수정.

## 역할별 권한 (이번 작업의 핵심 결정)

| | 관리자·자재담당자 (role=admin) | 기사 (role=engineer) |
|---|---|---|
| 제품목록 | 구매가·판매가 모두 표시 | **판매가만** (구매가 열 자체 없음) |
| 제품상세 | 전체 필드 + 입고/출고/조정 버튼 | 현재재고만, **구매가·구매처 숨김**, 입출고 버튼 없음(안내문구만) |
| 제품 등록/수정 | 가능 | 진입 불가 |
| 입고/출고/조정 | 가능 | 불가 |

이 앱의 기존 역할분리와 동일한 방식 — **화면단 분리일 뿐 RLS 아님**
(`AuthContext.role`로 클라이언트에서만 걸러짐, CLAUDE.md에 이미 명시된 앱
전체 관례). 자재담당자는 `profiles.admin_tier === "material"`인 admin
계정이지만, 이 기능 안에서는 그냥 `role === "admin"`이면 전체 권한으로
충분 — tier까지 나눌 필요 없음(자재담당자만 있는 별도 제한 요청 없었음).

## 데이터 — PC와 완전히 공유, 신규 스키마 없음

`inventory_products`/`inventory_stock_movements` 테이블, `lib/mappers.js`의
`mapInventoryProduct`/`mapInventoryStockMovement`, `lib/inventoryStock.js`의
`currentStock`/`stockHistory` — 전부 그대로 재사용. 모바일에서 만든 제품은
PC에서 바로 보이고 그 반대도 마찬가지(같은 테이블).

## 배치 — 모바일 앱 관례를 따름 (PC와 다름)

CLAUDE.md 컴포넌트 규칙: "App(ElevatorFieldApp.jsx)이 모든 최상위 state와
Supabase CRUD 핸들러를 소유 → 탭에 props로 전달"(PC의 InventoryAdmin.jsx는
자체 상태+직접 supabase 호출 방식이었지만, 그건 PC 관리자 콘솔만의 관례다).
그래서:

- `ElevatorFieldApp.jsx`: 초기 로드 `Promise.all`에 `inventory_products`/
  `inventory_stock_movements` 추가 → `inventoryProducts`/`inventoryStockMovements`
  state. `handleSaveInventoryProduct`/`handleCreateInventoryProduct`/
  `handleAddInventoryMovement` 등 핸들러를 다른 `handleXxx`와 같은 위치에 추가
  (`writeOk` 헬퍼로 감싸는 이 파일의 기존 관례를 따름 — PC의 `if(error){alert}`
  직접 처리 방식이 아니라).
- 신규 파일 `app/components/tabs/InventoryTab.jsx` — 목록/상세/등록/수정/
  재고패널 전부 이 한 파일에 (다른 tabs/*.jsx와 같은 "탭 1개 = 파일 1개" 관례).
- `TABS` 배열에 `{ id: "inventory", label: "재고관리", icon: Package (또는 Boxes) }`
  추가 — 기사도 보이므로 role 필터 없이 항상 노출.

## 화면 구성 (목업 승인된 대로)

**제품목록**: 검색창(제품 이름·바코드·속성) + 리스트(썸네일·이름·가격·재고수량).
탭하면 상세로 이동(모바일이라 좌우 분할이 아니라 화면 전환 — `ScreenHeader`
뒤로가기 관례 재사용).

**제품상세**: 사진+자재번호+제품명, "현재 재고" 큰 배지, (admin만) 입고/출고/
조정 버튼 3개, 나머지 속성(위치/구매처/구매가/판매가 — 기사는 구매처·구매가
행 자체를 안 그림). admin은 "수정" 진입 가능.

**입고/출고/조정 수량입력**: 목업의 +/− 스테퍼 + 숫자 표시(`0 → N`) 모달.
PC의 텍스트 인풋과 다르게 모바일은 스테퍼가 자연스러워 이 화면만 다르게 감 —
제출 시 PC와 동일하게 `qty_delta` 계산(입고 +, 출고 -, 조정은 그대로) 후
같은 `inventory_stock_movements` 테이블에 insert.

**제품 등록/수정 폼**: PC `ProductFormFields`와 같은 필드 셋(자재번호·제품명·
사진·규격·비고·위치·구매처·단가기준일자·구매가·판매가)을 모바일 세로 폼으로.
사진은 기존 `SinglePhotoUpload`(단일) 재사용 — PC는 이후 여러 장으로
확장했지만, 모바일 첫 버전은 목업대로 한 장만(간단하게 시작, 필요해지면
PC처럼 확장).

## 범위 밖

- 여러 장 사진(PC는 지원, 모바일은 1장) — 다르면 헷갈리니 나중에 통일 고려.
- 자재담당자(`admin_tier === "material"`)만 다른 세부 권한 — 이번엔 admin과
  동일 취급.
- 바코드 스캔 연동, 엑셀 일괄등록 — PC와 동일하게 범위 밖.
- 하단탭 재배치(9개→10개가 되는 것 자체)에 대한 추가 UX 논의 — 우선 그대로 추가.
