# 재고관리(제품목록) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 콘솔에 "재고관리 → 제품목록" 화면을 만든다 — 제품(자재) 마스터
등록/조회/수정/삭제 + 재고 수량 조정(입고·출고·조정)과 그 내역 조회.

**Architecture:** 기존 관리자 콘솔 관례 그대로 — `AdminApp.jsx`가 새 테이블 2개를
한 번에 로드해 `data`로 내리고, 신규 파일 `InventoryAdmin.jsx`가 자체 상태로
CRUD를 처리한다(`ErrorCodesAdmin.jsx`/`SitesAdmin.jsx`와 동일 패턴). 현재 재고
수량·내역 잔액은 컬럼으로 저장하지 않고 `inventory_stock_movements`에서 매번
계산한다(순수 함수로 분리 — `lib/inventoryStock.js`).

**Tech Stack:** Next.js(App Router) + React 19 + Tailwind v4 + Supabase(anon key,
RLS off) — 기존 스택 그대로, 신규 의존성 없음.

참고 문서: [2026-08-14-inventory-management-design.md](../specs/2026-08-14-inventory-management-design.md)

## Global Constraints

- 이 저장소의 Supabase는 실운영 DB다. 이 계획의 마이그레이션 파일(Task 1)은
  **작성만 하고 실행하지 않는다** — Supabase 대시보드에서 팀 상의 후 사람이
  직접 실행해야 실제 데이터 저장이 동작한다. 실행 전에는 두 테이블이 없어
  `select`가 빈 배열을 반환하고(에러가 나도 앱은 안 죽음), `insert`는 실패
  alert가 뜨는 게 정상이다 — 각 태스크의 검증 단계에서 이 점을 감안한다.
- `main` 푸시 전 `npm run build` 통과 필수.
- 기존 공용 컴포넌트(`Modal`, `inputCls`, `SinglePhotoUpload`, `confirmAsync`,
  `AdminAuthContext` 등)를 재사용하고 새 추상화를 만들지 않는다.
- 자재신청/견적/상비부품(kit_stock)과 연동하지 않는다 — 독립 운영.
- 단일 창고, 제품 속성 커스텀 편집 없음, 창고 간 "이동" 기능 없음, 바코드
  스캐너 하드웨어 연동 없음(검색창 직접 타이핑으로 대체) — 전부 범위 밖.
- DB는 snake_case, 화면 코드는 camelCase — 변환은 `lib/mappers.js`에만 둔다.

---

### Task 1: 재고관리 DB 스키마 (DRAFT 마이그레이션)

**Files:**
- Create: `supabase/migrations/115_inventory_products_DRAFT.sql`
- Create: `supabase/migrations/116_inventory_stock_movements_DRAFT.sql`

**Interfaces:**
- Produces: 테이블 `inventory_products`(컬럼: `id, material_no, name, photo_url,
  spec, memo, location, vendor, price_date, purchase_price, sale_price, active,
  created_at`), 테이블 `inventory_stock_movements`(컬럼: `id, product_id, type,
  qty_delta, note, created_by, created_at`). 이후 모든 태스크가 이 컬럼명을
  그대로 참조한다.

- [ ] **Step 1: `115_inventory_products_DRAFT.sql` 작성**

```sql
-- 115: inventory_products — 재고관리 제품 마스터 (2026-08-14)
-- 외부 재고관리프로그램을 앱에 통합하는 첫 단계. 자재번호(material_no)는
-- 첨부 화면의 SKU+바코드를 하나로 합친 것 — 관리자가 자동생성 버튼으로 만든다.
-- 단일 창고 운영이라 location은 보관위치(선반/칸) 자유텍스트일 뿐, 창고 구분이
-- 아니다 — 다중 창고가 필요해지면 별도 테이블로 확장.

create table if not exists public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  material_no text not null unique,
  name text not null,
  photo_url text,
  spec text,
  memo text,
  location text,
  vendor text,
  price_date date,
  purchase_price numeric,
  sale_price numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS: 106_rls_remaining.sql·111·114와 동일한 패턴 — 로그인(authenticated)만 하면 전부 허용.
alter table public.inventory_products enable row level security;
drop policy if exists "authenticated_full_access" on public.inventory_products;
create policy "authenticated_full_access" on public.inventory_products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'inventory_products'
order by ordinal_position;
```

- [ ] **Step 2: `116_inventory_stock_movements_DRAFT.sql` 작성**

```sql
-- 116: inventory_stock_movements — 제품별 입고/출고/조정 내역 (2026-08-14)
-- 현재 재고 수량은 이 테이블의 qty_delta 합계로 계산한다(컬럼으로 따로 저장
-- 안 함 — 단일 창고·소규모 데이터라 중복 저장할 이유가 없음, lib/inventoryStock.js).
-- type='adjust'는 qty_delta에 부호 있는 값을 그대로 받는다(예: -4).
-- type='in'/'out'은 항상 양수/음수로 정규화해서 저장(앱 코드가 보장).

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

-- RLS: 위 inventory_products와 동일한 패턴.
alter table public.inventory_stock_movements enable row level security;
drop policy if exists "authenticated_full_access" on public.inventory_stock_movements;
create policy "authenticated_full_access" on public.inventory_stock_movements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'inventory_stock_movements'
order by ordinal_position;
```

- [ ] **Step 3: 컬럼명 스팟체크 (실행 없이)**

두 파일을 직접 Supabase에 실행하지 않고, 이후 태스크가 참조할 컬럼명이 실제로
파일에 있는지만 확인한다.

Run: `grep -c "material_no" supabase/migrations/115_inventory_products_DRAFT.sql && grep -c "qty_delta" supabase/migrations/116_inventory_stock_movements_DRAFT.sql`
Expected: 두 명령 모두 `1` 이상 출력 (grep -c는 실패해도 exit 1이 아니라 매치 0을
출력하니, 두 숫자 다 0보다 큰지 눈으로 확인).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/115_inventory_products_DRAFT.sql supabase/migrations/116_inventory_stock_movements_DRAFT.sql
git commit -m "재고관리 제품/재고이력 DRAFT 마이그레이션 추가"
```

---

### Task 2: 재고 계산 순수함수 + mapper

**Files:**
- Create: `lib/inventoryStock.js`
- Create: `lib/inventoryStock.check.mjs`
- Modify: `lib/mappers.js` (파일 끝, 454번 줄 뒤에 추가)

**Interfaces:**
- Consumes: `mapped movement` 객체 shape `{ id, productId, qtyDelta, type, note, createdAt }`
  (Task 2의 `mapInventoryStockMovement`가 만드는 shape과 동일).
- Produces: `currentStock(movements, productId): number`,
  `stockHistory(movements, productId): Array<movement & { balance: number }>`
  (최신순 정렬) — Task 5·6의 `InventoryAdmin.jsx`가 그대로 가져다 쓴다.
  `mapInventoryProduct(row)`, `mapInventoryStockMovement(row)` — Task 3이
  `AdminApp.jsx` 로드에서, Task 4~6이 `InventoryAdmin.jsx`에서 그대로 쓴다.

- [ ] **Step 1: `lib/inventoryStock.js` 작성**

```javascript
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
```

- [ ] **Step 2: `lib/inventoryStock.check.mjs` 작성**

```javascript
// 회귀 방지용 최소 self-check — `node lib/inventoryStock.check.mjs`
import assert from "node:assert/strict";
import { currentStock, stockHistory } from "./inventoryStock.js";

const M = (id, productId, qtyDelta, createdAt) => ({ id, productId, qtyDelta, createdAt, type: "adjust", note: null });
const movements = [
  M("m1", "p1", 4, "2026-02-10T00:00:00Z"),
  M("m2", "p1", -4, "2026-03-09T00:00:00Z"),
  M("m3", "p2", 10, "2026-01-01T00:00:00Z"),
];

assert.equal(currentStock(movements, "p1"), 0, "p1 재고 = 4-4 = 0");
assert.equal(currentStock(movements, "p2"), 10, "p2 재고 = 10");
assert.equal(currentStock(movements, "p3"), 0, "움직임 없는 제품은 0");

const history = stockHistory(movements, "p1");
assert.deepEqual(history.map((m) => m.id), ["m2", "m1"], "최신순 정렬");
assert.equal(history[0].balance, 0, "가장 최근(m2, -4) 이후 잔액 0");
assert.equal(history[1].balance, 4, "그 앞(m1, +4) 시점 잔액 4");

console.log("OK: inventoryStock checks passed");
```

- [ ] **Step 3: check 실행해서 통과 확인**

Run: `node lib/inventoryStock.check.mjs`
Expected: `OK: inventoryStock checks passed` 출력, exit code 0.

- [ ] **Step 4: `lib/mappers.js`에 mapper 2개 추가**

`lib/mappers.js` 파일 끝(454번 줄, `mapUnitPartPhoto` 함수 뒤)에 이어서 추가:

```javascript

export function mapInventoryProduct(row) {
  return {
    id: row.id,
    materialNo: row.material_no,
    name: row.name,
    photoUrl: row.photo_url,
    spec: row.spec,
    memo: row.memo,
    location: row.location,
    vendor: row.vendor,
    priceDate: row.price_date,
    purchasePrice: row.purchase_price,
    salePrice: row.sale_price,
    active: row.active,
    createdAt: row.created_at,
  };
}

export function mapInventoryStockMovement(row) {
  return {
    id: row.id,
    productId: row.product_id,
    type: row.type,
    qtyDelta: row.qty_delta,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 5: lint 통과 확인**

Run: `npm run lint`
Expected: 에러 없음(경고는 기존 코드에도 있을 수 있으니 새 에러만 없으면 됨).

- [ ] **Step 6: Commit**

```bash
git add lib/inventoryStock.js lib/inventoryStock.check.mjs lib/mappers.js
git commit -m "재고 계산 순수함수 + inventory mapper 추가"
```

---

### Task 3: AdminApp 배선 + 제품목록 목록/검색 (상세는 자리만)

**Files:**
- Create: `app/components/admin/InventoryAdmin.jsx`
- Modify: `app/components/admin/AdminApp.jsx:8` (아이콘 import)
- Modify: `app/components/admin/AdminApp.jsx:10-13` (mapper import)
- Modify: `app/components/admin/AdminApp.jsx:26` (컴포넌트 import 추가)
- Modify: `app/components/admin/AdminApp.jsx:37-51` (MENU)
- Modify: `app/components/admin/AdminApp.jsx:63-67` (data 초기 state)
- Modify: `app/components/admin/AdminApp.jsx:188-231` (초기 로드)
- Modify: `app/components/admin/AdminApp.jsx:348-351` (라우팅)

**Interfaces:**
- Consumes: `currentStock` (`lib/inventoryStock.js`, Task 2),
  `mapInventoryProduct`/`mapInventoryStockMovement` (`lib/mappers.js`, Task 2),
  `inputCls` (`app/components/admin/adminShared.jsx`, 기존).
- Produces: `data.inventoryProducts`, `data.inventoryStockMovements`
  (`AdminApp.jsx`가 로드해 내려줌) — Task 4~6이 그대로 씀. `InventoryAdmin`
  컴포넌트 시그니처 `{ data, setData }` — 다른 Admin 화면과 동일한 관례.

- [ ] **Step 1: `InventoryAdmin.jsx` — 서브탭 + 목록/검색/선택 상태**

```javascript
"use client";

import { useState } from "react";
import { currentStock } from "@/lib/inventoryStock";
import { inputCls } from "@/app/components/admin/adminShared";

const SUBS = ["제품목록", "입출고내역", "구매"];

export default function InventoryAdmin({ data, setData }) {
  const { inventoryProducts = [], inventoryStockMovements = [] } = data;
  const [sub, setSub] = useState("제품목록");
  const [search, setSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const active = inventoryProducts.filter((p) => p.active !== false);
  const rows = active.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q && !`${p.materialNo} ${p.name}`.toLowerCase().includes(q)) return false;
    if (onlyInStock && currentStock(inventoryStockMovements, p.id) <= 0) return false;
    return true;
  });
  const selected = active.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {SUBS.map((s) => (
          <button key={s} onClick={() => setSub(s)}
            className={`text-sm font-bold px-4 py-2.5 -mb-px border-b-2 ${
              sub === s ? "text-blue-700 border-blue-700" : "text-slate-400 border-transparent"
            }`}>
            {s}
          </button>
        ))}
      </div>

      {sub !== "제품목록" ? (
        <p className="pt-20 text-center text-sm text-slate-400">준비 중입니다 (다음 단계)</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-extrabold">제품목록</h1>
          </div>
          <div className="flex gap-2 mb-3">
            <input className={`${inputCls} flex-1`} placeholder="자재번호·제품명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-3 whitespace-nowrap">
              <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} /> 재고 보유
            </label>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-7 gap-5 items-start">
            <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <ul className="max-h-[calc(100vh-20rem)] overflow-y-auto">
                {rows.map((p) => {
                  const stock = currentStock(inventoryStockMovements, p.id);
                  return (
                    <li key={p.id}>
                      <button onClick={() => setSelectedId(p.id)}
                        className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 border-b border-slate-50 ${
                          selectedId === p.id ? "bg-blue-50" : "hover:bg-slate-50"
                        }`}>
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{p.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            ₩{Number(p.purchasePrice ?? 0).toLocaleString()} / ₩{Number(p.salePrice ?? 0).toLocaleString()} · {p.materialNo}
                          </p>
                        </div>
                        <p className={`text-sm font-extrabold ${stock > 0 ? "text-blue-700" : "text-slate-300"}`}>{stock}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-10">등록된 제품이 없습니다</p>}
            </div>

            <div className="xl:col-span-5">
              {!selected ? (
                <div className="bg-white rounded-xl border border-slate-200 h-40 xl:h-64 flex items-center justify-center text-sm text-slate-400">
                  왼쪽 목록에서 제품을 선택하세요
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-5 text-sm text-slate-400">
                  {selected.name} — 상세 화면은 다음 태스크에서 채운다
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `AdminApp.jsx:8` — 아이콘 import에 `Boxes` 추가**

Before:
```javascript
import { Building2, AlertTriangle, ShieldCheck, Package, Receipt, ListTodo, CalendarCheck, Users, LayoutDashboard, BarChart3, Menu , Bell, MessageSquare, BookOpen } from "lucide-react";
```
After:
```javascript
import { Building2, AlertTriangle, ShieldCheck, Package, Receipt, ListTodo, CalendarCheck, Users, LayoutDashboard, BarChart3, Menu , Bell, MessageSquare, BookOpen, Boxes } from "lucide-react";
```

- [ ] **Step 3: `AdminApp.jsx:10-13` — mapper import에 2개 추가**

Before:
```javascript
import {
  mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest,
  mapTodo, mapQuoteRequest, mapBilling, mapUnit, mapSelfCheck, mapSelfCheckItem, mapFeedPost, mapRestockRequest, mapErrorCode, mapUnitPartPhoto,
} from "@/lib/mappers";
```
After:
```javascript
import {
  mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest,
  mapTodo, mapQuoteRequest, mapBilling, mapUnit, mapSelfCheck, mapSelfCheckItem, mapFeedPost, mapRestockRequest, mapErrorCode, mapUnitPartPhoto,
  mapInventoryProduct, mapInventoryStockMovement,
} from "@/lib/mappers";
```

- [ ] **Step 4: `AdminApp.jsx:26` 뒤에 `InventoryAdmin` import 추가**

Before (25-26번 줄):
```javascript
import EngineersAdmin from "@/app/components/admin/EngineersAdmin";
import StatsAdmin from "@/app/components/admin/StatsAdmin";
```
After:
```javascript
import EngineersAdmin from "@/app/components/admin/EngineersAdmin";
import StatsAdmin from "@/app/components/admin/StatsAdmin";
import InventoryAdmin from "@/app/components/admin/InventoryAdmin";
```

- [ ] **Step 5: `AdminApp.jsx:37-51` — MENU에 "재고관리" 추가**

Before:
```javascript
  { id: "materials", label: "자재·견적 신청내역", icon: Package },
  { id: "billings", label: "부품교체·공사 내역", icon: Receipt },
  { id: "todos", label: "할 일 관리", icon: ListTodo },
```
After:
```javascript
  { id: "materials", label: "자재·견적 신청내역", icon: Package },
  { id: "billings", label: "부품교체·공사 내역", icon: Receipt },
  { id: "inventory", label: "재고관리", icon: Boxes },
  { id: "todos", label: "할 일 관리", icon: ListTodo },
```

- [ ] **Step 6: `AdminApp.jsx:63-67` — data 초기 state에 필드 추가**

Before:
```javascript
  const [data, setData] = useState({
    sites: [], units: [], siteManagers: [], failures: [], inspections: [],
    materialRequests: [], quoteRequests: [], restockRequests: [], todos: [], billings: [],
    selfChecks: [], selfCheckItems: [], profiles: [], feed: [], errorCodes: [], unitPartPhotos: [],
  });
```
After:
```javascript
  const [data, setData] = useState({
    sites: [], units: [], siteManagers: [], failures: [], inspections: [],
    materialRequests: [], quoteRequests: [], restockRequests: [], todos: [], billings: [],
    selfChecks: [], selfCheckItems: [], profiles: [], feed: [], errorCodes: [], unitPartPhotos: [],
    inventoryProducts: [], inventoryStockMovements: [],
  });
```

- [ ] **Step 7: `AdminApp.jsx:188-231` — 초기 로드에 두 테이블 추가**

Before:
```javascript
      const [sites, units, siteManagers, failures, inspections, materials, quotes, restock, todos, billings, selfChecks, selfCheckItems, profiles, feed, errorCodes, unitPartPhotos] =
        await Promise.all([
          supabase.from("sites").select("*").order("name"),
          supabase.from("units").select("*").order("seq"),
          // site_managers는 1021행(2026-08-11 기준)으로 기본 1000행 한도를 넘어서, 페이지네이션
          // 없이 조회하면 최근에 추가된 담당자가 조용히 누락된다(실제로 발생) — 전체를 받는다.
          fetchAll("site_managers"),
          supabase.from("failures").select("*").order("created_at", { ascending: false }),
          supabase.from("inspections").select("*").order("due_date"),
          supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("restock_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("todos").select("*").order("created_at", { ascending: false }),
          supabase.from("billings").select("*").order("created_at", { ascending: false }),
          fetchAll("self_checks"),
          // B/C(주의관찰·긴급수리)만 — 나머지(A/D/E)는 자체점검 지적사항 화면에 필요 없어 뺀다(전체는 수백~수천행).
          supabase.from("self_check_items").select("*").in("result", ["B", "C"]),
          supabase.from("profiles").select("*").order("name"),
          supabase.from("feed_posts").select("*").order("created_at", { ascending: true }),
          // 기본 조회는 1000행에서 잘려 새로 추가된 코드가 누락될 수 있어(실제로 발생) 전체를 페이지네이션으로 받는다.
          fetchAll("error_codes"),
          // 부품현황 사진 — 호기당 38리프×사진 1행이라 전체 시스템 기준 1000행을 금방 넘는다.
          // site_managers·error_codes와 같은 이유로 페이지네이션 없이는 조용히 잘린다.
          fetchAll("unit_part_photos"),
        ]);
      setData({
        sites: (sites.data ?? []).map(mapSite),
        units: (units.data ?? []).map(mapUnit),
        siteManagers: (siteManagers.data ?? []).map(mapSiteManager),
        failures: (failures.data ?? []).map(mapFailure),
        inspections: (inspections.data ?? []).map(mapInspection),
        materialRequests: (materials.data ?? []).map(mapMaterialRequest),
        quoteRequests: (quotes.data ?? []).map(mapQuoteRequest),
        restockRequests: (restock.data ?? []).map(mapRestockRequest),
        todos: (todos.data ?? []).map(mapTodo),
        billings: (billings.data ?? []).map(mapBilling),
        selfChecks: (selfChecks.data ?? []).map(mapSelfCheck),
        selfCheckItems: (selfCheckItems.data ?? []).map(mapSelfCheckItem),
        profiles: profiles.data ?? [],
        feed: (feed.data ?? []).map(mapFeedPost),
        errorCodes: (errorCodes.data ?? []).map(mapErrorCode),
        unitPartPhotos: (unitPartPhotos.data ?? []).map(mapUnitPartPhoto),
      });
      setLoading(false);
```
After (두 군데 변경 — 배열 destructuring에 항목 추가, `Promise.all` 배열에 쿼리
추가, `setData`에 필드 추가):
```javascript
      const [sites, units, siteManagers, failures, inspections, materials, quotes, restock, todos, billings, selfChecks, selfCheckItems, profiles, feed, errorCodes, unitPartPhotos, inventoryProducts, inventoryStockMovements] =
        await Promise.all([
          supabase.from("sites").select("*").order("name"),
          supabase.from("units").select("*").order("seq"),
          // site_managers는 1021행(2026-08-11 기준)으로 기본 1000행 한도를 넘어서, 페이지네이션
          // 없이 조회하면 최근에 추가된 담당자가 조용히 누락된다(실제로 발생) — 전체를 받는다.
          fetchAll("site_managers"),
          supabase.from("failures").select("*").order("created_at", { ascending: false }),
          supabase.from("inspections").select("*").order("due_date"),
          supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("restock_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("todos").select("*").order("created_at", { ascending: false }),
          supabase.from("billings").select("*").order("created_at", { ascending: false }),
          fetchAll("self_checks"),
          // B/C(주의관찰·긴급수리)만 — 나머지(A/D/E)는 자체점검 지적사항 화면에 필요 없어 뺀다(전체는 수백~수천행).
          supabase.from("self_check_items").select("*").in("result", ["B", "C"]),
          supabase.from("profiles").select("*").order("name"),
          supabase.from("feed_posts").select("*").order("created_at", { ascending: true }),
          // 기본 조회는 1000행에서 잘려 새로 추가된 코드가 누락될 수 있어(실제로 발생) 전체를 페이지네이션으로 받는다.
          fetchAll("error_codes"),
          // 부품현황 사진 — 호기당 38리프×사진 1행이라 전체 시스템 기준 1000행을 금방 넘는다.
          // site_managers·error_codes와 같은 이유로 페이지네이션 없이는 조용히 잘린다.
          fetchAll("unit_part_photos"),
          supabase.from("inventory_products").select("*").order("created_at", { ascending: false }),
          supabase.from("inventory_stock_movements").select("*"),
        ]);
      setData({
        sites: (sites.data ?? []).map(mapSite),
        units: (units.data ?? []).map(mapUnit),
        siteManagers: (siteManagers.data ?? []).map(mapSiteManager),
        failures: (failures.data ?? []).map(mapFailure),
        inspections: (inspections.data ?? []).map(mapInspection),
        materialRequests: (materials.data ?? []).map(mapMaterialRequest),
        quoteRequests: (quotes.data ?? []).map(mapQuoteRequest),
        restockRequests: (restock.data ?? []).map(mapRestockRequest),
        todos: (todos.data ?? []).map(mapTodo),
        billings: (billings.data ?? []).map(mapBilling),
        selfChecks: (selfChecks.data ?? []).map(mapSelfCheck),
        selfCheckItems: (selfCheckItems.data ?? []).map(mapSelfCheckItem),
        profiles: profiles.data ?? [],
        feed: (feed.data ?? []).map(mapFeedPost),
        errorCodes: (errorCodes.data ?? []).map(mapErrorCode),
        unitPartPhotos: (unitPartPhotos.data ?? []).map(mapUnitPartPhoto),
        inventoryProducts: (inventoryProducts.data ?? []).map(mapInventoryProduct),
        inventoryStockMovements: (inventoryStockMovements.data ?? []).map(mapInventoryStockMovement),
      });
      setLoading(false);
```

- [ ] **Step 8: `AdminApp.jsx:348-351` — 라우팅에 분기 추가**

Before:
```javascript
        ) : menu === "materials" ? (
          <MaterialsAdmin data={data} setData={setData} initialTab={materialsInitialTab} />
        ) : menu === "billings" ? (
          <BillingsAdmin data={data} setData={setData} />
        ) : menu === "todos" ? (
```
After:
```javascript
        ) : menu === "materials" ? (
          <MaterialsAdmin data={data} setData={setData} initialTab={materialsInitialTab} />
        ) : menu === "billings" ? (
          <BillingsAdmin data={data} setData={setData} />
        ) : menu === "inventory" ? (
          <InventoryAdmin data={data} setData={setData} />
        ) : menu === "todos" ? (
```

- [ ] **Step 9: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공.

- [ ] **Step 10: 브라우저로 확인**

`npm run dev` 실행 후 `http://localhost:3000/admin` 접속(로그인 꺼짐 상태
가정, `SKIP_LOGIN=true`). 사이드바에 "재고관리" 메뉴가 보이고 클릭하면
서브탭 3개(제품목록/입출고내역/구매)와 검색창, "등록된 제품이 없습니다"가
보이면 정상(마이그레이션 미실행 상태라 데이터가 비어 있는 게 맞음).

- [ ] **Step 11: Commit**

```bash
git add app/components/admin/InventoryAdmin.jsx app/components/admin/AdminApp.jsx
git commit -m "재고관리 메뉴 배선 + 제품목록 검색/선택 UI"
```

---

### Task 4: 제품 등록 모달

**Files:**
- Modify: `app/components/admin/InventoryAdmin.jsx`

**Interfaces:**
- Consumes: `SinglePhotoUpload` (`app/components/formWidgets.jsx`, 기존, props
  `{ label, url, uploadFolder, onUploaded, onRemove }`), `Modal`/`inputCls`
  (`adminShared.jsx`), `supabase` (`@/lib/supabaseClient`).
- Produces: `<ProductFormFields>` — Task 5의 인라인 수정 폼이 그대로 재사용.
  `createProduct(form)` 핸들러 — Task 6의 초기수량 처리와 연결.

- [ ] **Step 1: import 3개 추가**

Before (파일 최상단):
```javascript
"use client";

import { useState } from "react";
import { currentStock } from "@/lib/inventoryStock";
import { inputCls } from "@/app/components/admin/adminShared";
```
After:
```javascript
"use client";

import { useState } from "react";
import { currentStock } from "@/lib/inventoryStock";
import { supabase } from "@/lib/supabaseClient";
import { mapInventoryProduct } from "@/lib/mappers";
import { inputCls, Modal } from "@/app/components/admin/adminShared";
import { SinglePhotoUpload } from "@/app/components/formWidgets";
```

- [ ] **Step 2: `SUBS` 상수 뒤에 자재번호 생성 함수 + 공용 폼 필드 + 등록 모달 추가**

Before:
```javascript
const SUBS = ["제품목록", "입출고내역", "구매"];

export default function InventoryAdmin({ data, setData }) {
```
After:
```javascript
const SUBS = ["제품목록", "입출고내역", "구매"];

// 자재번호 자동생성 — MAT- + 임의 8자, 이미 쓰는 번호와 겹치면 다시 뽑는다.
function randomMaterialNo(existing) {
  const used = new Set(existing);
  let no;
  do {
    no = "MAT-" + Math.random().toString(36).slice(2, 10).toUpperCase();
  } while (used.has(no));
  return no;
}

// 등록 모달과 상세 인라인수정이 같은 필드 셋을 쓴다.
function ProductFormFields({ form, setForm, onGenerateMaterialNo }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold text-slate-500 mb-1">자재번호 *</p>
        <div className="flex gap-1.5">
          <input className={inputCls} value={form.materialNo} onChange={(e) => setForm({ ...form, materialNo: e.target.value })} />
          <button type="button" onClick={onGenerateMaterialNo} className="text-xs font-bold text-white bg-emerald-600 rounded-lg px-3 whitespace-nowrap">자동 생성</button>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 mb-1">제품명 *</p>
        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <SinglePhotoUpload
        label="사진 추가"
        url={form.photoUrl}
        uploadFolder="inventory"
        onUploaded={(url) => setForm({ ...form, photoUrl: url })}
        onRemove={() => setForm({ ...form, photoUrl: "" })}
      />
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs font-bold text-slate-500 mb-1">규격</p><input className={inputCls} value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">위치</p><input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">구매처</p><input className={inputCls} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">단가 기준일자</p><input type="date" className={inputCls} value={form.priceDate} onChange={(e) => setForm({ ...form, priceDate: e.target.value })} /></div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 mb-1">비고</p>
        <input className={inputCls} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs font-bold text-slate-500 mb-1">구매가</p><input type="number" className={inputCls} value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">판매가</p><input type="number" className={inputCls} value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} /></div>
      </div>
    </div>
  );
}

function RegisterProductModal({ existingNos, onClose, onCreate }) {
  const [form, setForm] = useState({
    materialNo: randomMaterialNo(existingNos), name: "", photoUrl: "", spec: "", location: "",
    vendor: "", priceDate: "", memo: "", purchasePrice: "", salePrice: "",
  });
  const [saving, setSaving] = useState(false);
  const valid = form.materialNo.trim() && form.name.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="제품 등록" onClose={onClose}>
      <ProductFormFields form={form} setForm={setForm} onGenerateMaterialNo={() => setForm({ ...form, materialNo: randomMaterialNo(existingNos) })} />
      <div className="flex justify-end pt-4">
        <button disabled={!valid || saving} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
          {saving ? "등록 중..." : "등록하기"}
        </button>
      </div>
    </Modal>
  );
}

export default function InventoryAdmin({ data, setData }) {
```

- [ ] **Step 3: `selectedId` state 뒤에 `registering` state 추가**

Before:
```javascript
  const [selectedId, setSelectedId] = useState(null);

  const active = inventoryProducts.filter((p) => p.active !== false);
```
After:
```javascript
  const [selectedId, setSelectedId] = useState(null);
  const [registering, setRegistering] = useState(false);

  const active = inventoryProducts.filter((p) => p.active !== false);
```

- [ ] **Step 4: `selected` 변수 뒤에 `createProduct` 핸들러 추가**

Before:
```javascript
  const selected = active.find((p) => p.id === selectedId) ?? null;

  return (
```
After:
```javascript
  const selected = active.find((p) => p.id === selectedId) ?? null;

  async function createProduct(form) {
    const row = {
      material_no: form.materialNo.trim(),
      name: form.name.trim(),
      photo_url: form.photoUrl || null,
      spec: form.spec.trim() || null,
      memo: form.memo.trim() || null,
      location: form.location.trim() || null,
      vendor: form.vendor.trim() || null,
      price_date: form.priceDate || null,
      purchase_price: form.purchasePrice === "" ? null : Number(form.purchasePrice),
      sale_price: form.salePrice === "" ? null : Number(form.salePrice),
    };
    const { data: inserted, error } = await supabase.from("inventory_products").insert(row).select().maybeSingle();
    if (error) { alert("등록 실패: " + error.message); return; }
    const mapped = mapInventoryProduct(inserted);
    setData((prev) => ({ ...prev, inventoryProducts: [mapped, ...prev.inventoryProducts] }));
    setSelectedId(mapped.id);
  }

  return (
```

- [ ] **Step 5: 타이틀 옆에 "제품 추가" 버튼 추가**

Before:
```javascript
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-extrabold">제품목록</h1>
          </div>
```
After:
```javascript
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-extrabold">제품목록</h1>
            <button onClick={() => setRegistering(true)} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5">+ 제품 추가</button>
          </div>
```

- [ ] **Step 6: 파일 끝(닫는 `</div>` 앞)에 모달 렌더 추가**

Before (파일 마지막 부분):
```javascript
          </div>
        </>
      )}
    </div>
  );
}
```
After:
```javascript
          </div>

          {registering && (
            <RegisterProductModal
              existingNos={active.map((p) => p.materialNo)}
              onClose={() => setRegistering(false)}
              onCreate={createProduct}
            />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공.

- [ ] **Step 8: 브라우저로 확인**

`제품 추가` 클릭 → 모달에 자재번호가 자동으로 채워져 있는지, "자동 생성"
버튼 클릭 시 값이 바뀌는지, 제품명 없이 "등록하기"가 비활성화 상태인지 확인.
제품명 입력 후 등록 — 마이그레이션 미실행 상태라면 "등록 실패:" alert가 뜨는
게 정상(테이블이 없어서). alert 문구에 Supabase 에러 메시지가 담겨 있고
화면이 깨지지 않는지만 확인.

- [ ] **Step 9: Commit**

```bash
git add app/components/admin/InventoryAdmin.jsx
git commit -m "재고관리 제품 등록 모달 추가"
```

---

### Task 5: 제품 상세 — 조회/인라인수정/삭제

**Files:**
- Modify: `app/components/admin/InventoryAdmin.jsx`

**Interfaces:**
- Consumes: `ProductFormFields` (Task 4), `confirmAsync`
  (`app/components/ConfirmHost.jsx`, 기존 시그니처 `confirmAsync(message): Promise<boolean>`).
- Produces: `<ProductDetail>` 컴포넌트 — Task 6이 여기에 재고 패널 컬럼을 더한다.
  `saveProduct(product, form)`, `deleteProduct(product)` 핸들러.

- [ ] **Step 1: `Pencil`/`Trash2` 아이콘 + `confirmAsync` import 추가**

Before:
```javascript
import { useState } from "react";
import { currentStock } from "@/lib/inventoryStock";
import { supabase } from "@/lib/supabaseClient";
import { mapInventoryProduct } from "@/lib/mappers";
import { inputCls, Modal } from "@/app/components/admin/adminShared";
import { SinglePhotoUpload } from "@/app/components/formWidgets";
```
After:
```javascript
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { currentStock } from "@/lib/inventoryStock";
import { supabase } from "@/lib/supabaseClient";
import { mapInventoryProduct } from "@/lib/mappers";
import { inputCls, Modal } from "@/app/components/admin/adminShared";
import { SinglePhotoUpload } from "@/app/components/formWidgets";
import { confirmAsync } from "@/app/components/ConfirmHost";
```

- [ ] **Step 2: `RegisterProductModal` 함수 뒤에 `ProductDetail` 컴포넌트 추가**

Before:
```javascript
      </div>
    </Modal>
  );
}

export default function InventoryAdmin({ data, setData }) {
```
After:
```javascript
      </div>
    </Modal>
  );
}

function ProductDetail({ product, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  function startEdit() {
    setForm({
      materialNo: product.materialNo, name: product.name, photoUrl: product.photoUrl ?? "",
      spec: product.spec ?? "", location: product.location ?? "", vendor: product.vendor ?? "",
      priceDate: product.priceDate ?? "", memo: product.memo ?? "",
      purchasePrice: product.purchasePrice ?? "", salePrice: product.salePrice ?? "",
    });
    setEditing(true);
  }

  async function save() {
    await onSave(product, form);
    setEditing(false);
  }

  async function remove() {
    if (!(await confirmAsync(`"${product.name}"을(를) 삭제할까요?`))) return;
    await onDelete(product);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-extrabold">제품 정보</p>
        {!editing ? (
          <div className="flex gap-1.5">
            <button onClick={startEdit} className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5"><Pencil size={13} /> 수정</button>
            <button onClick={remove} className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 rounded-lg px-3 py-1.5"><Trash2 size={13} /> 삭제</button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <button onClick={() => setEditing(false)} className="text-xs font-bold text-slate-500 bg-slate-100 rounded-lg px-3 py-1.5">취소</button>
            <button onClick={save} className="text-xs font-bold text-white bg-blue-700 rounded-lg px-3 py-1.5">저장</button>
          </div>
        )}
      </div>
      {editing ? (
        <ProductFormFields form={form} setForm={setForm} onGenerateMaterialNo={() => {}} />
      ) : (
        <>
          <div className="flex gap-3.5 mb-4">
            {product.photoUrl ? (
              <img src={product.photoUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-100" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-slate-100" />
            )}
            <div className="grid grid-cols-[80px_1fr] gap-y-2 text-sm flex-1">
              <span className="text-slate-400">자재번호</span><span className="font-bold">{product.materialNo}</span>
              <span className="text-slate-400">제품명</span><span className="font-bold">{product.name}</span>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
            <span className="text-slate-400">규격</span><span>{product.spec || "-"}</span>
            <span className="text-slate-400">비고</span><span>{product.memo || "-"}</span>
            <span className="text-slate-400">위치</span><span>{product.location || "-"}</span>
            <span className="text-slate-400">구매처</span><span>{product.vendor || "-"}</span>
            <span className="text-slate-400">단가 기준일자</span><span>{product.priceDate || "-"}</span>
          </div>
          <div className="border-t border-slate-100 mt-3 pt-3 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
            <span className="text-slate-400">구매가</span><span>₩{Number(product.purchasePrice ?? 0).toLocaleString()}</span>
            <span className="text-slate-400">판매가</span><span>₩{Number(product.salePrice ?? 0).toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function InventoryAdmin({ data, setData }) {
```

- [ ] **Step 3: `createProduct` 함수 뒤에 `saveProduct`/`deleteProduct` 추가**

Before:
```javascript
    setData((prev) => ({ ...prev, inventoryProducts: [mapped, ...prev.inventoryProducts] }));
    setSelectedId(mapped.id);
  }

  return (
```
After:
```javascript
    setData((prev) => ({ ...prev, inventoryProducts: [mapped, ...prev.inventoryProducts] }));
    setSelectedId(mapped.id);
  }

  async function saveProduct(product, form) {
    const patch = {
      material_no: form.materialNo.trim(),
      name: form.name.trim(),
      photo_url: form.photoUrl || null,
      spec: form.spec.trim() || null,
      memo: form.memo.trim() || null,
      location: form.location.trim() || null,
      vendor: form.vendor.trim() || null,
      price_date: form.priceDate || null,
      purchase_price: form.purchasePrice === "" ? null : Number(form.purchasePrice),
      sale_price: form.salePrice === "" ? null : Number(form.salePrice),
    };
    const { data: updated, error } = await supabase.from("inventory_products").update(patch).eq("id", product.id).select().maybeSingle();
    if (error) { alert("저장 실패: " + error.message); return; }
    const mapped = mapInventoryProduct(updated);
    setData((prev) => ({ ...prev, inventoryProducts: prev.inventoryProducts.map((p) => (p.id === mapped.id ? mapped : p)) }));
  }

  async function deleteProduct(product) {
    const { error } = await supabase.from("inventory_products").update({ active: false }).eq("id", product.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, inventoryProducts: prev.inventoryProducts.map((p) => (p.id === product.id ? { ...p, active: false } : p)) }));
    setSelectedId(null);
  }

  return (
```

- [ ] **Step 4: 상세 자리표시자를 `ProductDetail`로 교체**

Before:
```javascript
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-5 text-sm text-slate-400">
                  {selected.name} — 상세 화면은 다음 태스크에서 채운다
                </div>
              )}
```
After:
```javascript
              ) : (
                <ProductDetail product={selected} onSave={saveProduct} onDelete={deleteProduct} />
              )}
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공.

- [ ] **Step 6: Commit**

```bash
git add app/components/admin/InventoryAdmin.jsx
git commit -m "재고관리 제품 상세 조회/인라인수정/삭제 추가"
```

---

### Task 6: 재고 패널 — 입고/출고/조정 + 내역

**Files:**
- Modify: `app/components/admin/InventoryAdmin.jsx`

**Interfaces:**
- Consumes: `currentStock`/`stockHistory` (`lib/inventoryStock.js`, Task 2),
  `mapInventoryStockMovement` (`lib/mappers.js`, Task 2), `ProductDetail`
  (Task 5).
- Produces: 완성된 `InventoryAdmin` 화면 — 이 태스크가 계획의 마지막.

- [ ] **Step 1: mapper import에 `mapInventoryStockMovement`, `lib/inventoryStock`
  import에 `stockHistory` 추가**

Before:
```javascript
import { currentStock } from "@/lib/inventoryStock";
import { supabase } from "@/lib/supabaseClient";
import { mapInventoryProduct } from "@/lib/mappers";
```
After:
```javascript
import { currentStock, stockHistory } from "@/lib/inventoryStock";
import { supabase } from "@/lib/supabaseClient";
import { mapInventoryProduct, mapInventoryStockMovement } from "@/lib/mappers";
```

- [ ] **Step 2: `SUBS` 상수 뒤에 라벨 상수 추가**

Before:
```javascript
const SUBS = ["제품목록", "입출고내역", "구매"];

// 자재번호 자동생성 — MAT- + 임의 8자, 이미 쓰는 번호와 겹치면 다시 뽑는다.
```
After:
```javascript
const SUBS = ["제품목록", "입출고내역", "구매"];
const MOVEMENT_LABEL = { in: "입고", out: "출고", adjust: "조정" };

// 자재번호 자동생성 — MAT- + 임의 8자, 이미 쓰는 번호와 겹치면 다시 뽑는다.
```

- [ ] **Step 3: `RegisterProductModal` 함수 뒤, `ProductDetail` 앞에
  `StockMovementModal` 추가**

Before:
```javascript
function ProductDetail({ product, onSave, onDelete }) {
```
After:
```javascript
function StockMovementModal({ type, onClose, onSubmit }) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const label = MOVEMENT_LABEL[type];
  const n = Number(qty);
  const valid = qty.trim() !== "" && !Number.isNaN(n) && n !== 0 && (type === "adjust" || n > 0);

  async function submit() {
    if (!valid) return;
    setSaving(true);
    const qtyDelta = type === "out" ? -Math.abs(n) : type === "in" ? Math.abs(n) : n;
    await onSubmit({ qtyDelta, note: note.trim() || null });
    setSaving(false);
    onClose();
  }

  return (
    <Modal title={`재고 ${label}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">{type === "adjust" ? "증감량 (예: -4)" : "수량"}</p>
          <input type="number" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">메모</p>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end pt-2">
          <button disabled={!valid || saving} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
            {saving ? "저장 중..." : `${label} 등록`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ProductDetail({ product, onSave, onDelete }) {
```

- [ ] **Step 4: `ProductDetail` props에 `movements`/`onMovement` 추가, 재고 패널
  렌더**

Before:
```javascript
function ProductDetail({ product, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
```
After:
```javascript
function ProductDetail({ product, movements, onSave, onDelete, onMovement }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [movementType, setMovementType] = useState(null);
  const stock = currentStock(movements, product.id);
  const history = stockHistory(movements, product.id);
```

Before:
```javascript
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-extrabold">제품 정보</p>
```
After:
```javascript
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-extrabold">제품 정보</p>
```

Before (컴포넌트 마지막 닫는 태그):
```javascript
          </div>
        </>
      )}
    </div>
  );
}

export default function InventoryAdmin({ data, setData }) {
```
After:
```javascript
          </div>
        </>
      )}
    </div>

    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-sm font-extrabold mb-1">현재 재고 및 내역</p>
      <p className="text-3xl font-extrabold text-blue-700 mb-3">{stock}</p>
      <div className="flex gap-1.5 mb-4">
        <button onClick={() => setMovementType("in")} className="flex-1 text-xs font-bold text-white bg-blue-700 rounded-lg py-2">입고</button>
        <button onClick={() => setMovementType("out")} className="flex-1 text-xs font-bold text-white bg-red-600 rounded-lg py-2">출고</button>
        <button onClick={() => setMovementType("adjust")} className="flex-1 text-xs font-bold text-white bg-slate-500 rounded-lg py-2">조정</button>
      </div>
      <div className="border-t border-slate-100">
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">내역이 없습니다</p>
        ) : (
          history.map((m) => (
            <div key={m.id} className="flex justify-between py-2 border-b border-slate-50">
              <div>
                <p className="text-sm font-bold">{MOVEMENT_LABEL[m.type]}</p>
                <p className="text-[11px] text-slate-400">{m.createdAt.slice(0, 10)}{m.note ? ` · ${m.note}` : ""}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${m.qtyDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>{m.qtyDelta >= 0 ? "+" : ""}{m.qtyDelta}</p>
                <p className="text-[11px] text-slate-400">{m.balance}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    {movementType && (
      <StockMovementModal
        type={movementType}
        onClose={() => setMovementType(null)}
        onSubmit={(payload) => onMovement(product, movementType, payload)}
      />
    )}
    </div>
  );
}

export default function InventoryAdmin({ data, setData }) {
```

- [ ] **Step 5: `deleteProduct` 함수 뒤에 `addMovement` 핸들러 추가**

Before:
```javascript
    setData((prev) => ({ ...prev, inventoryProducts: prev.inventoryProducts.map((p) => (p.id === product.id ? { ...p, active: false } : p)) }));
    setSelectedId(null);
  }

  return (
```
After:
```javascript
    setData((prev) => ({ ...prev, inventoryProducts: prev.inventoryProducts.map((p) => (p.id === product.id ? { ...p, active: false } : p)) }));
    setSelectedId(null);
  }

  async function addMovement(product, type, { qtyDelta, note }) {
    const row = { product_id: product.id, type, qty_delta: qtyDelta, note };
    const { data: inserted, error } = await supabase.from("inventory_stock_movements").insert(row).select().maybeSingle();
    if (error) { alert("재고 반영 실패: " + error.message); return; }
    const mapped = mapInventoryStockMovement(inserted);
    setData((prev) => ({ ...prev, inventoryStockMovements: [...prev.inventoryStockMovements, mapped] }));
  }

  return (
```

- [ ] **Step 6: `ProductDetail` 호출부에 새 props 전달**

Before:
```javascript
                <ProductDetail product={selected} onSave={saveProduct} onDelete={deleteProduct} />
```
After:
```javascript
                <ProductDetail
                  product={selected}
                  movements={inventoryStockMovements}
                  onSave={saveProduct}
                  onDelete={deleteProduct}
                  onMovement={addMovement}
                />
```

- [ ] **Step 7: 등록 모달에 "초기 수량" 필드 추가 — `addMovement`가 이제
  있으니 여기서 와이어링한다 (Task 4에서는 아직 없어서 뺐었음)**

Before (`RegisterProductModal`의 `useState` 초기값):
```javascript
    vendor: "", priceDate: "", memo: "", purchasePrice: "", salePrice: "",
  });
  const [saving, setSaving] = useState(false);
  const valid = form.materialNo.trim() && form.name.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="제품 등록" onClose={onClose}>
      <ProductFormFields form={form} setForm={setForm} onGenerateMaterialNo={() => setForm({ ...form, materialNo: randomMaterialNo(existingNos) })} />
      <div className="flex justify-end pt-4">
```
After:
```javascript
    vendor: "", priceDate: "", memo: "", purchasePrice: "", salePrice: "", initialQty: "",
  });
  const [saving, setSaving] = useState(false);
  const valid = form.materialNo.trim() && form.name.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="제품 등록" onClose={onClose}>
      <ProductFormFields form={form} setForm={setForm} onGenerateMaterialNo={() => setForm({ ...form, materialNo: randomMaterialNo(existingNos) })} />
      <div>
        <p className="text-xs font-bold text-slate-500 mb-1 mt-3">초기 수량</p>
        <input type="number" className={inputCls} placeholder="0" value={form.initialQty} onChange={(e) => setForm({ ...form, initialQty: e.target.value })} />
      </div>
      <div className="flex justify-end pt-4">
```

- [ ] **Step 8: `createProduct`가 초기 수량이 있으면 등록 직후 `adjust` 움직임을
  같이 넣도록 수정**

Before:
```javascript
    const { data: inserted, error } = await supabase.from("inventory_products").insert(row).select().maybeSingle();
    if (error) { alert("등록 실패: " + error.message); return; }
    const mapped = mapInventoryProduct(inserted);
    setData((prev) => ({ ...prev, inventoryProducts: [mapped, ...prev.inventoryProducts] }));
    setSelectedId(mapped.id);
  }
```
After:
```javascript
    const { data: inserted, error } = await supabase.from("inventory_products").insert(row).select().maybeSingle();
    if (error) { alert("등록 실패: " + error.message); return; }
    const mapped = mapInventoryProduct(inserted);
    setData((prev) => ({ ...prev, inventoryProducts: [mapped, ...prev.inventoryProducts] }));
    const initialQty = Number(form.initialQty);
    if (initialQty > 0) {
      await addMovement(mapped, "adjust", { qtyDelta: initialQty, note: "초기 수량" });
    }
    setSelectedId(mapped.id);
  }
```

- [ ] **Step 9: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공.

- [ ] **Step 10: 브라우저로 확인**

제품 상세에서 "입고"/"출고"/"조정" 버튼 클릭 시 각각 모달이 뜨고, 조정은
음수도 입력되는지, 수량 0이면 저장 버튼이 비활성인지 확인. 제품 등록
모달에 "초기 수량"을 넣고 등록하면(마이그레이션 실행 환경이라면) 상세의
재고 숫자에 바로 반영되는지 확인. 마이그레이션 미실행 상태라면 저장 시
"재고 반영 실패:"/"등록 실패:" alert가 뜨는 게 정상 — 화면이 깨지지 않는지만
확인.

- [ ] **Step 11: Commit**

```bash
git add app/components/admin/InventoryAdmin.jsx
git commit -m "재고관리 입고/출고/조정 + 내역 패널 추가"
```

---

## 완료 후 남는 일 (이 계획 범위 밖)

- `115`/`116` 마이그레이션을 Supabase 대시보드에서 실제로 실행 — 사람이 팀
  상의 후 진행(설계서·CLAUDE.md 규칙).
  ⚠️ **순서 주의**: 이 기능이 `[deploy]` 태그로 실제 배포되면 "재고관리"
  메뉴가 무조건 노출된다 — 마이그레이션 실행 전에 배포되면 관리자에게
  빈 목록 + 모든 버튼에서 "relation ... does not exist" 원시 에러가
  보인다. 마이그레이션을 먼저 실행하거나, 실행 전까지는 이 커밋 범위를
  `[deploy]`에 포함시키지 말 것.
- `115` 파일명이 다른 세션의 `115_knowledge_search_DRAFT.sql`과 겹침 —
  둘 다 미실행 DRAFT라 실행에는 문제없음(기존 112/113 겹침과 같은 패턴,
  CLAUDE.md에 선례 있음). 번호 재부여는 안 함(비용 대비 실익 낮음).
- 기존 외부 재고관리프로그램의 660여 개 품목 이관 — 별도 논의.
- 서브탭 "입출고내역"·"구매" 구현.
- (Minor, 안 고침) `material_no` 중복 시 원시 Postgres 에러 문구 노출,
  소프트삭제된 제품의 자재번호와 충돌하면 UI에서 그 제품을 찾을 수 없음 —
  `error.code === "23505"` 분기로 안내 문구 교체 필요해지면 추가.
