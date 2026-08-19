# 자재로스 방지 — 부품마스터 연동·폐자재/여유부품 반납 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적건의 고가부품 항목을 재고관리(부품마스터)와 연동하고, 여유부품·폐자재 반납을 관리자 확인을 거쳐 재고에 반영하는 흐름을 만든다.

**Architecture:** `quote_items`(jsonb)에 `partId`/`returnRequired`/`qtyTaken` 필드를 추가해 부품마스터(`inventory_products`)와 연결한다. 자재지급완료 시 재고 'out'을 남기고, 비용청구 시 견적 1건당 반납 할일 1건(`waste_return_rows` jsonb, 부품 여러 줄)을 만든다. 기사가 사진과 함께 완료하면 관리자 확인 대기열에 올라가고, 관리자가 확인한 만큼만 재고 'in'으로 반영 — 부족하면 남은 줄만 재오픈한다.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase(JS client), Tailwind v4. 테스트 프레임워크 없음 — 검증은 `npm run build` + 브라우저 수동 확인.

## Global Constraints

- Supabase는 실운영 DB(RLS 꺼짐) — 삭제·수정 테스트 금지, 읽기 전용 확인만.
- `main` 푸시 전 `npm run build` 통과 필수.
- 각 Task는 완료 후 작게 커밋 + push (배포는 `[deploy]` 없이 — 사용자가 명시적으로 요청할 때만 배포).
- `returnRequired`는 부품마스터 기본값을 끌어오지 않고 **매 견적 작성 시 사람이 직접 체크**한다.
- 견적 작성 화면에서 부품마스터에 신규 항목을 즉석 등록하지 않는다 — 조회/연동만. 신규 등록은 `InventoryAdmin.jsx`에서만.
- 원본 스펙: [docs/superpowers/specs/2026-08-19-material-loss-prevention-design.md](../specs/2026-08-19-material-loss-prevention-design.md)

---

## Task 1: 마이그레이션 — 반납 흐름에 필요한 컬럼 3개

**Files:**
- Create: `supabase/migrations/125_waste_return_columns_DRAFT.sql`

**Interfaces:**
- Produces: `inventory_stock_movements.todo_id`(nullable, `todos(id)` FK) — Task 3·6이 씀.
  `todos.waste_return_rows`(jsonb, nullable) — Task 4가 insert, Task 6이 update.
  `todos.stock_confirmed_at`(nullable timestamptz) — Task 6이 채움.
  (`todos.quote_request_id`, `todos.photo_urls`는 이미 존재 — 확인됨, 새로 안 만듦.)

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/125_waste_return_columns_DRAFT.sql`:

```sql
-- 폐자재/여유부품 반납 흐름에 필요한 컬럼 3개.
-- 1) 재고 이동 기록을 반납 할일(todos)과 정식으로 연결 — note 자유텍스트 대신 FK로,
--    로스리포트 등 집계 쿼리를 안정적으로 조인할 수 있게 한다. 일반 수동 입출고는 계속 null.
alter table public.inventory_stock_movements
  add column if not exists todo_id uuid references public.todos(id);

create index if not exists inventory_stock_movements_todo_id_idx
  on public.inventory_stock_movements (todo_id);

-- 2) 반납 대상 부품 여러 줄을 한 할일에 담는다: [{ productId, name, qtyRequired, qtyConfirmed }]
alter table public.todos
  add column if not exists waste_return_rows jsonb;

-- 3) 기사가 사진 올려 done=true 되는 시점과 실제 재고 반영(관리자 확인) 시점을 분리하기 위함.
alter table public.todos
  add column if not exists stock_confirmed_at timestamptz;
```

- [ ] **Step 2: 사용자에게 실행 요청**

이 저장소는 마이그레이션 도구가 없다(`supabase/CLAUDE.md`) — DDL은 Supabase 대시보드
SQL Editor에서 직접 실행해야 한다. 파일을 만들고 커밋한 뒤, 사용자에게 "Supabase SQL
Editor에서 `125_waste_return_columns_DRAFT.sql` 실행해주세요"라고 요청한다.
**직접 실행하지 말 것** — 실운영 DB이고 DDL 실행 권한 확인이 필요하다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/125_waste_return_columns_DRAFT.sql
git commit -m "feat: 폐자재/여유부품 반납 흐름에 필요한 컬럼 3개 추가"
git push
```

---

## Task 2: `QuoteItemsModal.jsx` — 부품마스터 연동 UI

**Files:**
- Modify: `app/components/admin/QuoteItemsModal.jsx`

**Interfaces:**
- Consumes: `inventory_products` 테이블(이미 존재). `AdminApp.jsx`의 `data.inventoryProducts`(이미 로딩됨, `mapInventoryProduct` 매핑 — `materialNo`, `name`, `spec`, `salePrice`, `active`).
- Produces: `quote_items`(jsonb) 각 행에 `partId`(string|null), `returnRequired`(boolean), `qtyTaken`(number|null) 추가. 이후 Task 3(자재지급완료)·Task 4(비용청구)가 이 필드를 읽는다.

이 컴포넌트는 지금 `quote`, `site`, `siteManagers`, `profiles` props만 받는다(42번째 줄).
`inventoryProducts`를 새 prop으로 추가해야 한다 — 호출부(`SitesAdmin.jsx` 또는
`MaterialsAdmin.jsx`에서 이 모달을 여는 곳)도 같이 고쳐야 함. 아래 Step 1에서 먼저
호출부를 찾는다.

- [ ] **Step 1: 호출부 찾기 및 prop 추가**

Run:
```bash
grep -rn "QuoteItemsModal" app/components/admin/*.jsx
```
`<QuoteItemsModal ... />`로 렌더링하는 곳마다 `inventoryProducts={data.inventoryProducts}`를
prop으로 추가한다(변수명은 실제 파일의 `data` 접근 방식에 맞출 것 — `AdminApp.jsx`가
`data`를 `setData`로 내려주는 방식이라 대부분 `data.inventoryProducts`로 접근 가능할 것).

- [ ] **Step 2: `emptyItem`에 필드 추가**

`app/components/admin/QuoteItemsModal.jsx:31-33`:

```js
function emptyItem(category) {
  return { category, name: "", unitNo: "", spec: "", unit: "", qty: 1, unitPrice: 0, partId: null, returnRequired: false, qtyTaken: null };
}
```

- [ ] **Step 3: 컴포넌트 시그니처에 prop 추가**

`app/components/admin/QuoteItemsModal.jsx:42`:

```js
export default function QuoteItemsModal({ quote, site, siteManagers, profiles, inventoryProducts, onClose, onSaved }) {
```

- [ ] **Step 4: 부품마스터 검색 드롭다운 추가 (자재비 행만)**

`app/components/admin/QuoteItemsModal.jsx:286-288`(품명 입력칸) 바로 아래에, `category === "자재비"`일 때만 보이는 검색 select를 추가한다. 기존 품명 인풋은 그대로 두고(자유텍스트 계속 허용), 그 위에 마스터 선택용 select를 하나 얹는다:

```jsx
                        <div className="flex-[11] min-w-0">
                          {category === "자재비" && (
                            <select
                              className={inputCls + " mb-1 text-[11px]"}
                              value=""
                              onChange={(e) => {
                                const p = inventoryProducts.find((x) => x.id === e.target.value);
                                if (!p) return;
                                updateItem(idx, { partId: p.id, name: p.name, spec: p.spec ?? "", unitPrice: p.salePrice ?? 0 });
                              }}
                            >
                              <option value="">부품마스터에서 선택...</option>
                              {inventoryProducts.filter((p) => p.active !== false).map((p) => (
                                <option key={p.id} value={p.id}>{p.materialNo} · {p.name}</option>
                              ))}
                            </select>
                          )}
                          <input className={inputCls} placeholder="품명" value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value, partId: e.target.value === it.name ? it.partId : null })} />
                        </div>
```

주의: 마지막 줄의 품명 인풋 `onChange`는 사용자가 마스터 선택 후 이름을 손으로 고치면
`partId` 연결이 끊기도록 한 것 — `e.target.value === it.name`는 항상 false가 되므로(타이핑
중이라 다름) 실질적으로 **품명을 조금이라도 고치면 `partId: null`**이 된다. 이게 의도한
동작인지(마스터 연결은 이름 그대로일 때만 유지) 확인 후, 원치 않으면 그냥 `updateItem(idx,
{ name: e.target.value })`로 단순화해도 된다(마스터 연결은 유지, 이름만 표시 용도로 바뀜) —
**구현 시 사용자에게 확인**.

- [ ] **Step 5: `returnRequired`·`qtyTaken` 입력칸 추가 (partId 연결된 행만)**

`app/components/admin/QuoteItemsModal.jsx:309-310`:

```jsx
                        <button type="button" onClick={() => removeItem(idx)} className="w-3.5 shrink-0 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={14} /></button>
                      </div>
```

를 아래로 교체(삭제 버튼과 그 줄을 감싸는 `</div>` 사이에 조건부 블록 추가):

```jsx
                        <button type="button" onClick={() => removeItem(idx)} className="w-3.5 shrink-0 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={14} /></button>
                      </div>
                      {it.partId && (
                        <div className="flex items-center gap-3 pl-5 text-[11px] text-slate-500">
                          <label className="flex items-center gap-1">
                            <input type="checkbox" checked={it.returnRequired} onChange={(e) => updateItem(idx, { returnRequired: e.target.checked })} />
                            폐자재 회수 필요
                          </label>
                          <label className="flex items-center gap-1">
                            실반출수량
                            <input type="number" min={it.qty} className="w-14 border border-slate-200 rounded px-1 py-0.5" placeholder={String(it.qty)} value={it.qtyTaken ?? ""} onChange={(e) => updateItem(idx, { qtyTaken: e.target.value === "" ? null : Number(e.target.value) })} />
                            (여유분 있으면 견적수량보다 크게)
                          </label>
                        </div>
                      )}
```

- [ ] **Step 6: 저장 시 필드가 함께 저장되는지 확인**

`onSaved({ quoteItems: items, ... })`(209번째 줄)는 `items` 배열 전체를 그대로 넘기므로
추가 수정 불필요 — `items`에 이미 `partId`/`returnRequired`/`qtyTaken`이 들어있다.

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 8: 브라우저로 확인**

관리자 콘솔 → 자재·견적 신청내역 → 견적요청 하나 열어서 품목편집 → 자재비 행에서
"부품마스터에서 선택" 드롭다운에 재고관리 등록된 부품이 뜨는지, 선택하면 품명·규격·단가가
채워지는지, 그 아래 "폐자재 회수 필요"/"실반출수량"이 나타나는지 확인.

- [ ] **Step 9: 커밋**

```bash
git add app/components/admin/QuoteItemsModal.jsx
git commit -m "feat: 견적 품목에 부품마스터 연동 + 폐자재/여유부품 입력 추가"
git push
```

---

## Task 3: 자재지급완료 시 재고 'out' 반영

**Files:**
- Modify: `app/components/ElevatorFieldApp.jsx` (`handleCompleteQuoteSupply`, 1713번째 줄 근방)

**Interfaces:**
- Consumes: Task 2의 `quoteItems[].partId`/`qtyTaken`. `inventory_stock_movements` insert(기존 패턴, `InventoryAdmin.jsx:543-555`의 `addMovement`와 같은 행 모양 — 단, 이 파일엔 그 함수가 없으므로 인라인으로 같은 모양을 직접 insert한다).
- Produces: 없음(사이드 이펙트만) — 이후 Task 없음이 이 결과를 직접 소비하지 않는다.

- [ ] **Step 1: `handleCompleteQuoteSupply` 안, 할일 생성 뒤에 재고 반영 추가**

`app/components/ElevatorFieldApp.jsx`의 `handleCompleteQuoteSupply` 함수(대략 1713번째
줄 시작, `todosSaved` 확인 후 `statusSaved` 처리하는 부분) — `statusSaved` 확인 뒤,
`setQuoteRequests` 호출 전후 아무 곳에 아래 블록 추가:

```js
    // 부품마스터 연동된 항목(partId 있는 것)마다 실반출수량만큼 재고 'out' 반영 —
    // 자재지급완료가 실제로 부품이 창고에서 나가는 시점이라 여기서 기록한다.
    const partItems = (q.quoteItems ?? []).filter((it) => it.partId);
    if (partItems.length) {
      const movementRows = partItems.map((it) => ({
        product_id: it.partId,
        type: "out",
        qty_delta: -(it.qtyTaken ?? it.qty),
        note: `견적 ${quoteId} 지급`,
        site_text: q.siteName,
        created_by: profileIdByName(profilesAll, profile.name),
      }));
      const { error: moveError } = await supabase.from("inventory_stock_movements").insert(movementRows);
      if (moveError) {
        // 재고 반영 실패는 지급완료 자체를 막지 않는다(할일·상태 변경은 이미 성공) — 콘솔에만 남긴다.
        console.error("재고 반영 실패:", moveError.message);
      }
    }
```

`q`는 이 함수 맨 위에서 이미 `const q = quoteRequests.find((x) => x.id === quoteId);`로
구해둔 변수(1714번째 줄) — 재사용. `profile`/`profilesAll`은 이 파일 최상단 컴포넌트
스코프에 이미 있는 상태(다른 핸들러에서도 쓰는 것 확인됨).

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 3: 브라우저로 확인**

부품마스터 연동된 견적 하나를 "자재지급완료" 처리 → 재고관리 화면에서 그 부품의
재고 수량이 실반출수량만큼 줄어드는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/components/ElevatorFieldApp.jsx
git commit -m "feat: 자재지급완료 시 부품마스터 연동 항목 재고 out 반영"
git push
```

---

## Task 4: 비용청구 시 반납 할일 생성 (견적 1건당 1개)

**Files:**
- Modify: `app/components/ElevatorFieldApp.jsx` (`handleSubmitBilling`, 1166번째 줄 근방)
- Modify: `app/components/tabs/BillingTab.jsx` (`submitMaterial`, 88번째 줄 근방)

**Interfaces:**
- Consumes: Task 2의 `quoteItems[].returnRequired`/`qtyTaken`/`qty`/`partId`/`name`.
- Produces: `todos` row with `source: "waste_return"`, `quote_request_id`, `waste_return_rows`(jsonb 배열 `[{productId, name, qtyRequired, qtyConfirmed}]`), `stock_confirmed_at: null`. Task 5(기사 완료 UI)·Task 6(관리자 확인)이 이 모양을 그대로 읽는다.

**주의**: `handleSubmitBilling`은 지금 `quoteRequestId`를 파라미터로 받지 않는다(현재
시그니처: `{ type, siteName, elevatorNo, part, cost, replaceDate, contactPhone,
beforePhotoUrls, afterPhotoUrls, confirmPhotoUrl, siteId, unitId, materialRequestId }`,
1166번째 줄). 이 Task에서 `quoteRequestId`를 새로 추가해서 전달받아야 한다.

- [ ] **Step 1: `BillingTab.jsx`의 `submitMaterial`에서 `quoteRequestId` 전달**

`app/components/tabs/BillingTab.jsx:103-118`의 `onSubmitBilling({...})` 호출에 한 줄 추가:

```js
    const ok = await onSubmitBilling({
      type: "material",
      siteName: selected.siteName,
      elevatorNo: selected.elevatorNo,
      unitId: selected.unitId ?? null,
      materialRequestId: selected.materialRequestId ?? null,
      quoteRequestId: selected.quoteRequestId ?? null,
      part: selected.part,
      cost: isQuoteBilling ? null : materialCost,
      replaceDate: materialReplaceDate,
      contactPhone: null,
      beforePhotoUrls: materialPhotos.before.map((p) => p.url),
      afterPhotoUrls: materialPhotos.after.map((p) => p.url),
      confirmPhotoUrl: materialPhotos.confirm,
    });
```

- [ ] **Step 2: `handleSubmitBilling` 시그니처에 `quoteRequestId` 추가**

`app/components/ElevatorFieldApp.jsx:1166`:

```js
  async function handleSubmitBilling({ type, siteName, elevatorNo, part, cost, replaceDate, contactPhone, beforePhotoUrls, afterPhotoUrls, confirmPhotoUrl, siteId, unitId, materialRequestId, quoteRequestId }) {
```

- [ ] **Step 3: billing insert 성공 후, 반납 대상 있으면 할일 생성**

`app/components/ElevatorFieldApp.jsx`의 `handleSubmitBilling` 안, `setBillings((prev) =>
[newBilling, ...prev]); return true;`(1224-1225번째 줄) **바로 앞**에 추가:

```js
    // 이 청구가 견적건이고, 그 견적의 부품마스터 연동 항목 중 폐자재 회수 필요이거나
    // 여유분(실반출 > 견적수량)이 있는 게 있으면 반납 할일을 견적 1건당 1개로 만든다.
    if (quoteRequestId) {
      const q = quoteRequests.find((x) => x.id === quoteRequestId);
      const rows = (q?.quoteItems ?? [])
        .filter((it) => it.partId && (it.returnRequired || (it.qtyTaken ?? it.qty) > it.qty))
        .map((it) => ({
          productId: it.partId,
          name: it.name,
          qtyRequired: (it.returnRequired ? 1 : 0) + Math.max(0, (it.qtyTaken ?? it.qty) - it.qty),
          qtyConfirmed: 0,
        }));
      if (rows.length) {
        const title = `폐자재/여유부품 반납 — ${rows.map((r) => `${r.name} ${r.qtyRequired}EA`).join(", ")}`;
        const { error: wrError } = await supabase.from("todos").insert({
          id: `todo-wastereturn-${newBilling.id}`,
          source: "waste_return",
          title,
          site_name: siteName,
          elevator_no: elevatorNo || null,
          part: "폐자재/여유부품 반납",
          assignee: profile.name,
          assignee_id: profileIdByName(profilesAll, profile.name),
          assigned_date: TODAY_STR,
          due_date: addDays(TODAY_STR, 14),
          done: false,
          quote_request_id: quoteRequestId,
          waste_return_rows: rows,
        });
        if (wrError) console.error("반납 할일 생성 실패:", wrError.message);
        else {
          const { data: fresh } = await supabase.from("todos").select("*").eq("id", `todo-wastereturn-${newBilling.id}`).maybeSingle();
          if (fresh) setTodos((prev) => [mapTodo(fresh), ...prev]);
        }
      }
    }
```

`newBilling.id`는 이 함수 위쪽(1185번째 줄)에서 이미 `id: "bill-" + crypto.randomUUID()`로
정해져 있으므로 재사용 — 할일 id를 청구 id에 묶어 중복 생성을 방지한다(같은 청구가
재시도돼도 `insert`가 PK 충돌로 한 번만 성공).

**알려진 한계**: 한 견적에 호기가 여러 개라 비용청구가 여러 번(호기별로) 제출되면, 이
로직은 청구할 때마다 그 견적의 전체 `quoteItems` 기준으로 반납 할일을 새로 만든다 —
즉 "견적 1건당 할일 1건"이 아니라 "청구 1건당 할일 1건"이 될 수 있다. 설계 문서는 이
경우(견적 1건에 여러 번 청구)를 명시적으로 다루지 않았다. 지금 스코프에서는 이대로
두고, 여러 호기 견적에서 실제로 문제(반납 할일 중복 생성)가 관찰되면 그때 청구
1건째에서만 만들도록(예: 같은 `quoteRequestId`로 이미 만들어진 `waste_return` 할일이
있으면 새로 안 만들고 기존 걸 갱신) 고치는 걸 후속 작업으로 남긴다.

- [ ] **Step 4: `lib/mappers.js`의 `mapTodo`에 새 필드 추가**

`lib/mappers.js:196-199`:

```js
    requestedById: row.requested_by_id,
    requestedByName: row.requested_by_name,
  };
}
```

를 아래로 교체:

```js
    requestedById: row.requested_by_id,
    requestedByName: row.requested_by_name,
    wasteReturnRows: row.waste_return_rows ?? null,
    stockConfirmedAt: row.stock_confirmed_at ?? null,
  };
}
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 6: 브라우저로 확인**

Task 2에서 폐자재 회수 체크 + 여유분 입력한 견적건을 자재지급완료 → 비용청구까지
진행 → 할일관리에 "폐자재/여유부품 반납 — ..." 할일이 하나 생기는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add app/components/ElevatorFieldApp.jsx app/components/tabs/BillingTab.jsx lib/mappers.js
git commit -m "feat: 비용청구 시 견적 1건당 폐자재/여유부품 반납 할일 생성"
git push
```

---

## Task 5: 기사 완료 화면 — 반납사진 없으면 완료 불가

**Files:**
- Modify: `app/components/tabs/TodoTab.jsx`

**Interfaces:**
- Consumes: Task 4의 `todo.wasteReturnRows`, `todo.source === "waste_return"`.
- Produces: `todos.photo_urls`(반납사진, 기존 컬럼 있으면 재사용 — 없으면 `grep -n "photo_urls\|photoUrls" lib/mappers.js`로 `todos` 매핑에 이미 있는지 먼저 확인할 것) 갱신, `done: true`.

- [ ] **Step 1: 완료 버튼 활성화 조건에 반납사진 체크 추가**

`app/components/tabs/TodoTab.jsx`에서 `TodoCheckbox`를 렌더링하는 곳(176-181번째 줄
근방, `role === "admin" ? ... : isManual ? () => toggleManualTodo(t.id) : undefined`)의
조건을 확장한다. 정확한 조건 분기는 실제 파일을 읽고, `t.source === "waste_return"`일
때는 `t.photoUrls?.length > 0`이어야만 `toggleManualTodo(t.id)`를 연결하고, 사진이
없으면 `onClick`을 `undefined`로 둬서 `TodoCheckbox`가 자동으로 잠금 아이콘을 보여주게
한다(56-80번째 줄 `TodoCheckbox` 컴포넌트가 `locked` prop으로 이미 이 표시를 지원함 —
`locked={t.source === "waste_return" && !(t.photoUrls?.length > 0)}`로 새 조건 추가).

- [ ] **Step 2: 반납사진 업로드 위젯을 상세(아코디언) 영역에 추가**

`t.source === "waste_return"`일 때 상세 펼침 영역(expanded 상태, `MultiPhotoUpload` 이미
1번째 줄에 import돼 있음)에 사진 업로드 UI를 추가한다:

```jsx
{t.source === "waste_return" && (
  <div className="mt-2">
    <p className="text-[11px] font-bold text-slate-500 mb-1">
      반납 항목: {t.wasteReturnRows?.map((r) => `${r.name} ${r.qtyRequired}EA`).join(", ")}
    </p>
    <MultiPhotoUpload
      photos={(t.photoUrls ?? []).map((url) => ({ url }))}
      onAdd={(url) => updateTodoPhotos(t.id, [...(t.photoUrls ?? []), url])}
      onRemove={(url) => updateTodoPhotos(t.id, (t.photoUrls ?? []).filter((u) => u !== url))}
      label="반납 사진"
      uploadFolder={`todos/${t.id}`}
    />
  </div>
)}
```

`updateTodoPhotos`는 이 파일에 아직 없는 새 함수 — Step 3에서 만든다. `todos.photo_urls`
컬럼과 `mapTodo`의 `photoUrls` 매핑은 이미 존재함(확인됨) — 마이그레이션 불필요.

- [ ] **Step 3: `updateTodoPhotos` 함수 추가**

`TodoTab` 컴포넌트 안, `toggleManualTodo` 함수(104-110번째 줄) 근처에 추가:

```js
  async function updateTodoPhotos(id, urls) {
    await supabase.from("todos").update({ photo_urls: urls }).eq("id", id);
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, photoUrls: urls } : x)));
  }
```

`todos.photo_urls` 컬럼이 실제로 있는지 먼저 확인할 것(Step 0 성격 — 구현 시작 전에
`grep -n "photo_urls" supabase/migrations/*.sql`로 확인, 없으면 이 Task에 마이그레이션
한 줄 추가 필요).

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 5: 브라우저로 확인**

기사 계정으로 로그인 → 할일관리 → 반납 할일 열어서 사진 없이는 체크 버튼이 잠금
아이콘으로 보이는지, 사진 올리면 체크 가능해지는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add app/components/tabs/TodoTab.jsx
git commit -m "feat: 폐자재/여유부품 반납 할일에 사진 필수 완료 조건 추가"
git push
```

---

## Task 6: 관리자 확인 화면 — 확인 시 재고 반영, 부족하면 재오픈

**Files:**
- Modify: `app/components/admin/TodosAdmin.jsx`

**Interfaces:**
- Consumes: Task 4의 `todo.wasteReturnRows`/`stockConfirmedAt`, Task 5의 `todo.photoUrls`.
- Produces: `inventory_stock_movements`(Task 1의 `todo_id` 사용), `todos.waste_return_rows`(갱신), `todos.done`(재오픈 시 false), `todos.stock_confirmed_at`(완결 시 채움).

- [ ] **Step 1: 필터에 "반납확인대기" 뷰 추가**

`app/components/admin/TodosAdmin.jsx:290`(`sourceFilter` 필터 체인) 근처에, 기존
`SOURCE_LABEL`/필터 탭 목록(410-414번째 줄)에 항목 추가:

```js
{ value: "waste_return", label: "반납확인대기", count: viewFiltered.filter((t) => t.source === "waste_return" && t.done && !t.stockConfirmedAt).length },
```

(정확한 삽입 위치·기존 배열 문법은 410-414번째 줄 패턴을 그대로 따를 것.)

- [ ] **Step 2: 확인 모달 컴포넌트 추가**

이 파일에 새 함수 컴포넌트 `WasteReturnConfirmModal`을 추가한다 — `QuoteItemsModal.jsx`
같은 "행마다 입력칸" 패턴 재사용:

```jsx
function WasteReturnConfirmModal({ todo, onClose, onConfirmed }) {
  const [confirmedQty, setConfirmedQty] = useState(
    () => Object.fromEntries((todo.wasteReturnRows ?? []).map((r) => [r.productId, r.qtyRequired - r.qtyConfirmed]))
  );
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    const rows = todo.wasteReturnRows ?? [];
    const movementRows = rows
      .filter((r) => (confirmedQty[r.productId] ?? 0) > 0)
      .map((r) => ({
        product_id: r.productId,
        type: "in",
        qty_delta: confirmedQty[r.productId],
        note: `할일 ${todo.id} 반납확인`,
        todo_id: todo.id,
      }));
    if (movementRows.length) {
      const { error } = await supabase.from("inventory_stock_movements").insert(movementRows);
      if (error) { alert("재고 반영 실패: " + error.message); setSaving(false); return; }
    }

    const nextRows = rows.map((r) => ({ ...r, qtyConfirmed: r.qtyConfirmed + (confirmedQty[r.productId] ?? 0) }));
    const allDone = nextRows.every((r) => r.qtyConfirmed >= r.qtyRequired);
    const remainingRows = nextRows.filter((r) => r.qtyConfirmed < r.qtyRequired);

    const patch = allDone
      ? { waste_return_rows: nextRows, stock_confirmed_at: new Date().toISOString() }
      : { waste_return_rows: remainingRows, done: false, title: `폐자재/여유부품 반납 — ${remainingRows.map((r) => `${r.name} ${r.qtyRequired - r.qtyConfirmed}EA`).join(", ")}` };

    const { error: todoError } = await supabase.from("todos").update(patch).eq("id", todo.id);
    setSaving(false);
    if (todoError) { alert("할일 갱신 실패: " + todoError.message); return; }
    onConfirmed({ ...todo, wasteReturnRows: allDone ? nextRows : remainingRows, stockConfirmedAt: allDone ? patch.stock_confirmed_at : null, done: allDone ? todo.done : false, title: allDone ? todo.title : patch.title });
    onClose();
  }

  return (
    <Modal title="반납 확인" onClose={onClose}>
      <div className="space-y-3">
        {(todo.photoUrls ?? []).length > 0 && <PhotoGrid urls={todo.photoUrls} cols={4} />}
        {(todo.wasteReturnRows ?? []).map((r) => (
          <div key={r.productId} className="flex items-center justify-between gap-2 text-sm">
            <span>{r.name} (요청 {r.qtyRequired - r.qtyConfirmed}EA{r.qtyConfirmed > 0 ? `, 기확인 ${r.qtyConfirmed}EA` : ""})</span>
            <input type="number" min={0} max={r.qtyRequired - r.qtyConfirmed} className={inputCls + " w-20"}
              value={confirmedQty[r.productId] ?? 0}
              onChange={(e) => setConfirmedQty((prev) => ({ ...prev, [r.productId]: Number(e.target.value) }))} />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2">취소</button>
          <button onClick={confirm} disabled={saving} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2">확인</button>
        </div>
      </div>
    </Modal>
  );
}
```

`useState`/`Modal`/`PhotoGrid`/`inputCls`/`supabase` import가 이 파일 상단에 이미 있는지
확인 후, 없는 것만 추가.

- [ ] **Step 3: 목록에 확인 버튼 연결**

`source === "waste_return" && sourceFilter === "waste_return"`(또는 필터와 무관하게
`t.source === "waste_return" && t.done && !t.stockConfirmedAt`)인 행에 "반납확인" 버튼을
추가해 `WasteReturnConfirmModal`을 여는 상태(`const [confirmTarget, setConfirmTarget] =
useState(null)`)와 연결한다. 목록 테이블 렌더링 부분(450번째 줄 근방, 기존
`StatusBadge`/`SOURCE_LABEL` 쓰는 행)에서 패턴을 따라 추가할 것.

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 5: 브라우저로 확인**

Task 5에서 기사가 반납사진 올려 완료한 할일이 "반납확인대기"에 뜨는지 → 확인수량을
요청보다 적게 넣고 확인 → 재고는 그만큼만 늘고, 할일이 남은 수량으로 다시 기사 목록에
나타나는지(재오픈) 확인. 나머지도 확인 → 완전히 종료(`stock_confirmed_at` 채워짐, 더 이상
"반납확인대기"에 안 뜸)되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add app/components/admin/TodosAdmin.jsx
git commit -m "feat: 관리자 반납확인 화면 — 확인분만 재고 반영, 부족하면 재오픈"
git push
```

---

## 스펙에서 이번 계획에 포함 안 한 것

- 대시보드 "30일 초과 미청구" 필터에 `waste_return` 포함 — 스펙에 "(선택)"으로 표시된
  항목이라 이번 6개 Task엔 안 넣었다. 필요해지면 `Dashboard.jsx`의 `overdueUnbilled`
  로직에 `source === "waste_return"` 조건만 추가하면 되는 작은 작업.

## 완료 후 확인

Task 1의 마이그레이션이 실제로 Supabase에서 실행됐는지 재확인(사용자에게 요청한 뒤
`curl`로 `inventory_stock_movements?select=todo_id&limit=1`이 에러 없이 도는지 등으로
검증 가능). 전체 흐름(견적 작성 → 지급 → 청구 → 기사 완료 → 관리자 확인 → 재오픈까지)을
실제 견적 1건으로 끝까지 따라가며 확인할 것을 권장.

## 최종 브랜치 리뷰에서 남은 후속 작업 (2026-08-19, 병합 차단 아님)

최종 전체 브랜치 리뷰가 4라운드 걸렸다 — 매 라운드 실제 Critical/Important 버그를
찾아 즉시 고쳤고(대부분 "waste_return 할일이 quoteRequestId로 묶이는 기존 로직에
끼어들어 오작동"하는 같은 패턴이 `ElevatorFieldApp.jsx`/`AdminTab.jsx`(기사앱)/
`MaterialsAdmin.jsx`(PC 콘솔) 3곳에 중복 구현된 탓에 반복 발견됨), 4라운드째에
"병합 가능"으로 수렴했다. 의도적으로 남겨둔 것 2건:

1. **Task 6의 취소 후 재진입 이중반영 가능성.** 반납확인 모달에서 재고 insert는
   성공했는데 할일 update가 실패한 상태에서, 관리자가 "재시도" 대신 "취소"를 누르고
   같은 할일을 다시 열면 — 이미 반영된 수량을 모르는 채로 새 확인을 제출해 재고가
   중복 반영될 수 있다. 같은 모달 세션 안에서의 재시도는 (`insertedQty` 스냅샷으로)
   막혀 있지만, 모달을 껐다 다시 여는 경로까지 막으려면 `inventory_stock_movements`를
   `todo_id`로 먼저 조회해서 이미 반영된 걸 확인하거나(서버 측 idempotency), 두 쓰기를
   하나의 Supabase RPC/트랜잭션으로 묶어야 한다 — 이번 라운드들의 범위보다 큰 작업이라
   후속으로 미룸.
2. **`lib/inventoryStock.js`의 출고('out') 기록에 idempotency 키가 없음.** 반납('in')
   쪽은 `movementsAlreadyInserted` 가드가 있는데 출고 쪽은 없다 — 지금은 자재지급완료
   버튼이 상태 가드로 한 번만 눌리게 돼 있어 실사용에서 이중기록 위험은 낮지만, 대칭을
   맞추려면 나중에 같이 정리.

가벼운 것 2건(코드는 그대로 둬도 안전, 참고용):
- `MaterialTab.jsx`의 `isQuoteBilled`만 `source === "quote"`(허용목록) 방식이고 나머지
  3곳(`billingCompleteFor`/`assigneeNames`/`SiteTab.isBilled`)은 `source !== "waste_return"`
  (차단목록) 방식 — 지금은 동작이 같지만(모든 견적 할일 생성 경로가 `source: "quote"`를
  하드코딩함), 나중에 `todos.source`가 비어있는 레거시 행이 생기면 이 한 곳만 다르게
  반응할 수 있음.
- `TodosAdmin.jsx`의 범용 `TodoDetailModal`(할일 종류 구분 없이 아무 할일이나 열림)이
  저장할 때 `photo_count`를 덮어써서 반납 재오픈 기준선을 건드릴 수 있음 — 방향이
  항상 "더 잠그는 쪽"이라(기사가 사진을 한 장 더 올려야 하는 정도) 데이터 훼손은 없음.
