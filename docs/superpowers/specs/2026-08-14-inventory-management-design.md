# 재고관리(제품목록) Design

## 목표

외부 재고관리프로그램(첨부 화면 참고)을 앱에 통합하는 첫 단계. 관리자 콘솔에
"재고관리" 메뉴를 새로 만들고, 그 안의 "제품목록" 화면만 이번에 구현한다 —
제품(자재) 마스터 등록/조회 + 재고 수량 조정(입고·출고·조정)과 그 내역 조회.

[2026-08-13 자재로스 방지 정리 문서](2026-08-13-material-loss-prevention.md)에서
논의했던 "고가부품 마스터"(`parts_master`, 견적요청 연동용)와는 **별개 기능**이다.
이번 재고관리는 자재신청/견적/상비부품(kit_stock) 흐름과 **연동하지 않고 독립
운영**한다 — 연동은 필요해지면 별도 설계로 진행.

브라우저 mockup으로 레이아웃 확인 완료(서브탭 → 검색바 → 좌측목록/우측상세 구조).

## 배치

`app/components/admin/AdminApp.jsx`의 `MENU`에 "재고관리" 항목 추가(아이콘:
`Boxes`, `Package`는 이미 "자재·견적 신청내역"에서 씀). 새 파일
`app/components/admin/InventoryAdmin.jsx`가 [EngineersAdmin.jsx](../../../app/components/admin/EngineersAdmin.jsx:510)의
서브탭 바 패턴(직원/당직근무표/출근부와 동일한 로컬 `sub` state + 밑줄 탭)을
그대로 재사용한다.

서브탭 3개: **제품목록**(이번에 구현) · **입출고내역** · **구매** — 뒤 두 개는
AdminApp의 미구현 메뉴와 같은 관례로 "준비 중입니다" 문구만 표시.

## UI 구조 — 제품목록

**상단 (고정)**
- 서브탭 바
- "제품목록" 타이틀 + "제품 추가" 버튼(등록 모달 오픈)
- 검색창(자재번호·제품명) + "재고 보유" 체크박스(재고 0 초과만 표시)

**본문 — 좌측목록 / 우측상세 (SitesAdmin 현장정보와 같은 master-detail 비율,
`xl:grid-cols-7`에서 2:5 정도)**
- 좌측: 검색·필터 통과한 제품 카드 리스트(썸네일 · 제품명 · 구매가/판매가 ·
  자재번호 · 현재재고). 클릭하면 선택 상태로 강조, 우측 갱신.
- 우측: 아무 것도 선택 안 하면 "왼쪽 목록에서 제품을 선택하세요" 안내문만
  (부품현황 탭의 "초기 진입 시 안내문" 관례와 동일, 자동 선택 안 함). 선택 시
  2단 패널:
  - **제품 정보**: 사진 + 자재번호·제품명·규격·비고·위치·구매처·단가기준일자·
    구매가·판매가. "수정" 버튼으로 인라인 편집모드 전환(별도 모달/페이지로
    안 쪼갬 — `ErrorCodesAdmin` 상세모달처럼 필드가 바로 입력창으로 바뀌고
    저장/취소 버튼 노출). "삭제" 버튼(빨간 텍스트, `active=false` 소프트삭제) —
    첨부의 "···" 드롭다운 대신 버튼 하나로 단순화(메뉴 항목이 삭제 하나뿐이라
    드롭다운을 둘 이유가 없음).
  - **현재 재고 및 내역**: 큰 숫자로 현재 재고(= 해당 제품 `inventory_stock_movements`의
    `qty_delta` 합계, 클라이언트에서 계산 — 컬럼으로 따로 저장 안 함, 데이터
    규모가 작아 저장할 이유 없음), 입고/출고/조정 버튼 3개, 그 아래 내역 리스트
    (유형 · 날짜 · 증감 · 그 시점 잔액 — 잔액도 `created_at` 오름차순 누적합으로
    렌더 시 계산, 컬럼 저장 안 함).

**제품 추가 모달**
- 자재번호(자동생성 버튼 — `MAT-` + 임의 8자 영숫자, 로드된 목록과 중복이면
  재생성) · 제품명 * · 사진(`SinglePhotoUpload`, 업로드 폴더 `inventory`) ·
  규격 · 비고 · 위치 · 구매처 · 단가기준일자 · 구매가 · 판매가 · **초기 수량**
  (선택, 기본 0 — 0보다 크면 저장 직후 `type: "adjust"`, 메모 "초기 수량"인
  움직임 1건을 같이 넣는다. 첨부 화면의 첫 내역 항목과 동일한 모양).

**입고/출고/조정 모달 (공용 1개, `type` prop으로 분기)**
- 입고·출고: 수량(양수) 입력 → 저장 시 `qty_delta`를 입고는 `+수량`, 출고는
  `-수량`으로 insert.
- 조정: 증감량을 부호 포함으로 직접 입력(예: `-4`) → 그대로 `qty_delta`.
- 메모(선택) 공통.

## 데이터 모델 (마이그레이션 DRAFT 2개, 미실행 — 팀 상의 후 실행)

`supabase/migrations/115_inventory_products_DRAFT.sql`
```sql
create table if not exists public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  material_no text not null unique,   -- 자재번호(자동생성) — 첨부의 SKU+바코드를 통합
  name text not null,
  photo_url text,
  spec text,          -- 규격
  memo text,           -- 비고
  location text,       -- 보관위치(단일 창고, 자유텍스트 — 예: "1-2")
  vendor text,          -- 구매처
  price_date date,       -- 단가 기준일자
  purchase_price numeric,
  sale_price numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

`supabase/migrations/116_inventory_stock_movements_DRAFT.sql`
```sql
create table if not exists public.inventory_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  type text not null check (type in ('in','out','adjust')),
  qty_delta integer not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists inventory_stock_movements_product_id_idx
  on public.inventory_stock_movements (product_id);
```

RLS: 106/111/114와 동일한 패턴(`authenticated_full_access`, 로그인만 하면 전부
허용) — 두 테이블 다 적용.

## 데이터 배선

- `AdminApp.jsx` 최초 로드 `Promise.all`에 두 테이블 `select("*")` 추가(둘 다
  소규모라 페이지네이션 불필요) → `mapInventoryProduct`/`mapInventoryStockMovement`
  (`lib/mappers.js` 신규)로 매핑, `data.inventoryProducts`/`data.inventoryStockMovements`.
- `InventoryAdmin.jsx` 안에서 CRUD 핸들러를 직접 작성(`SitesAdmin.jsx`·
  `ErrorCodesAdmin.jsx`와 같은 관례 — 성공하면 `setData((prev) => ...)`로 로컬
  갱신, `ElevatorFieldApp.jsx` 최상단 핸들러 패턴은 모바일 전용이라 안 씀).

## 범위 밖 (나중에 필요하면 추가)

- 다중 창고·창고 간 이동 — 단일 창고로 결정.
- 제품 속성 커스텀 스키마 편집("제품 속성 편집") — 고정 필드 8개로 충분,
  설정 화면 자체를 안 만듦.
- 바코드 스캐너 하드웨어 연동 — 검색창에 스캔값을 직접 타이핑하는 것으로 대체.
- 자재신청/견적/상비부품(kit_stock) 자동 연동, `parts_master`와의 통합.
- 서브탭 "입출고내역"(전체 제품 통합 내역 조회) · "구매"(구매처별 발주/입고
  관리) — 화면만 자리 잡아두고 미구현.
- **기존 외부 프로그램 데이터 이관** — 확인된 규모가 660개 품목/재고 총 1,212개로
  적지 않다. 엑셀 export가 가능한지, 가능하면 대량입력(엑셀 업로드, 
  `ErrorCodesAdmin`의 `ImportErrorCodesModal` 패턴 재사용 가능)으로 넣는 방향이
  자연스러워 보이나 별도 논의 필요.
