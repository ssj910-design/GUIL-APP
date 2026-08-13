# 관리자웹 부품현황 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자웹(PC 콘솔) 호기 상세정보 팝업에 "부품현황" 탭을 추가해, 모바일 앱에 이미
있는 부품현황 사진 기능을 트리+상세 2단 레이아웃으로 볼 수 있게 한다.

**Architecture:** 데이터 모델·업로드 로직은 모바일과 100% 공유(같은 테이블, 같은
taxonomy, 같은 `FileCarousel`). 사진 추가/삭제 판별 로직만 순수 함수로 뽑아내 모바일·
관리자웹이 공유하고, 그 위에 관리자웹 전용 트리+상세 UI 컴포넌트를 새로 얹는다.

**Tech Stack:** Next.js App Router, React 19, Supabase, Tailwind v4.

## Global Constraints

- 새 npm 의존성 추가 금지 — 기존 컴포넌트(`FileCarousel`, `uploadPhoto`)만 재사용.
- `lib/unitPartTaxonomy.js`는 수정하지 않는다(이미 완성된 순수함수, 모바일이 쓰고 있음).
- 이 파일 관례를 따른다: `SitesAdmin.jsx` 안의 supabase 쓰기는 `saveUnitDetail`/
  `deleteUnit`/`addUnit`과 동일하게 직접 `supabase.from(...)` 호출 → 에러면
  `alert()` 후 `return` → 성공하면 `setData((prev) => ({ ...prev, ... }))`로 로컬 반영.
  `writeOk` 헬퍼를 새로 끌어오지 않는다(이 파일에 없는 관례).
- 관리자웹에서 올리는 사진은 `uploaded_by`를 채우지 않는다(로그인 프로필 id를 이 화면
  context에서 구할 방법이 없고, 화면 어디서도 업로더를 표시하지 않아 필요 없음 —
  컬럼 자체는 nullable이라 문제 없음).
- 빌드 확인 명령: `npm run build` (Next.js 프로덕션 빌드, 타입/구문 에러를 잡는다).

---

### Task 1: `lib/partLeafPhotos.js` — 사진 추가/삭제 판별 순수 로직 추출

**Files:**
- Create: `lib/partLeafPhotos.js`
- Create: `lib/partLeafPhotos.check.mjs`

**Interfaces:**
- Produces:
  - `partLeafPhotos(photos, category, subcategory, part)` → `{ mine: Array<{id,url,...}>, urls: string[] }`
  - `savePartLeafPhotos({ unitId, category, subcategory, part, mine, urls, nextUrls, onAdd, onRemove }) : Promise<void>`
    - `onAdd({ unitId, category, subcategory, part, url })` — 사진이 늘었을 때 호출
    - `onRemove(photoId)` — 사진이 줄었을 때 호출

이 두 함수는 지금 `app/components/tabs/PartPhotosPanel.jsx`의 `PartLeafRow` 안에
있는 로직(사진 URL이 여러 장 겹칠 수 있어 멀티셋 기반으로 비교)을 그대로 옮긴 것이다
(동작 변경 없음). Task 2에서 `PartLeafRow`가 이 파일을 쓰도록 바꾸고, Task 3에서
관리자웹 쪽도 같이 쓴다.

- [ ] **Step 1: 체크 스크립트부터 작성 (아직 없는 모듈을 import)**

`lib/partLeafPhotos.check.mjs`:
```js
import assert from "node:assert/strict";
import { partLeafPhotos, savePartLeafPhotos } from "./partLeafPhotos.js";

// partLeafPhotos: category+subcategory+part가 모두 일치하는 사진만 골라낸다.
const photos = [
  { id: "p1", category: "카도어", subcategory: null, part: "카도어 벤", url: "u1" },
  { id: "p2", category: "카도어", subcategory: null, part: "카도어 벤", url: "u2" },
  { id: "p3", category: "카도어", subcategory: null, part: "카도어 씰", url: "u3" },
];
const { mine, urls } = partLeafPhotos(photos, "카도어", null, "카도어 벤");
assert.deepEqual(urls, ["u1", "u2"]);
assert.equal(mine.length, 2);

// savePartLeafPhotos: nextUrls가 더 길면 추가된 url로 onAdd 호출.
{
  let added = null;
  await savePartLeafPhotos({
    unitId: "unit1", category: "카도어", subcategory: null, part: "카도어 벤",
    mine, urls, nextUrls: ["u1", "u2", "u3"],
    onAdd: async (payload) => { added = payload; },
    onRemove: async () => { throw new Error("onRemove는 호출되면 안 됨"); },
  });
  assert.deepEqual(added, { unitId: "unit1", category: "카도어", subcategory: null, part: "카도어 벤", url: "u3" });
}

// savePartLeafPhotos: nextUrls가 더 짧으면 빠진 사진의 id로 onRemove 호출.
{
  let removedId = null;
  await savePartLeafPhotos({
    unitId: "unit1", category: "카도어", subcategory: null, part: "카도어 벤",
    mine, urls, nextUrls: ["u1"],
    onAdd: async () => { throw new Error("onAdd는 호출되면 안 됨"); },
    onRemove: async (id) => { removedId = id; },
  });
  assert.equal(removedId, "p2");
}

// savePartLeafPhotos: 같은 url이 두 장 겹쳐도(멀티셋) 정확히 한 장만 삭제로 판별.
// findIndex가 앞에서부터 훑으면서 nextCounts(남은 개수)를 먼저 소진시키므로, 앞쪽
// 항목(d1)이 "남은 것"으로 매칭되고 뒤쪽 항목(d2)이 "빠진 것"으로 판별된다.
{
  const dupPhotos = [
    { id: "d1", category: "승장도어", subcategory: null, part: "승장도어 슈", url: "dup" },
    { id: "d2", category: "승장도어", subcategory: null, part: "승장도어 슈", url: "dup" },
  ];
  const { mine: dupMine, urls: dupUrls } = partLeafPhotos(dupPhotos, "승장도어", null, "승장도어 슈");
  let removedId = null;
  await savePartLeafPhotos({
    unitId: "unit1", category: "승장도어", subcategory: null, part: "승장도어 슈",
    mine: dupMine, urls: dupUrls, nextUrls: ["dup"],
    onAdd: async () => { throw new Error("onAdd는 호출되면 안 됨"); },
    onRemove: async (id) => { removedId = id; },
  });
  assert.equal(removedId, "d2");
}

console.log("OK: partLeafPhotos checks passed");
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `node lib/partLeafPhotos.check.mjs`
Expected: FAIL — `Cannot find module './partLeafPhotos.js'`

- [ ] **Step 3: 구현**

`lib/partLeafPhotos.js`:
```js
// 호기 부품현황 사진 — 리프(세부항목) 단위로 "지금 사진이 몇 장 있는지"와 "다음 urls
// 배열과 비교해서 추가/삭제 중 뭐가 일어났는지" 판별하는 순수 로직. 모바일 아코디언
// 행(PartLeafRow)과 관리자웹 상세패널(PartsStatusTab)이 이 파일 하나를 같이 쓴다.

// 이 리프(category+subcategory+part)에 해당하는 사진들과 그 url 목록.
export function partLeafPhotos(photos, category, subcategory, part) {
  const mine = photos.filter((p) => p.category === category && p.subcategory === subcategory && p.part === part);
  return { mine, urls: mine.map((p) => p.url) };
}

// FileCarousel은 "다음 urls 배열"만 넘겨준다 — 이전 urls와 비교해서 추가/삭제 중 뭐가
// 일어났는지 여기서 판단한다. 단순 includes() 비교로는 같은 url이 두 장 이상 겹칠 때
// (중복 업로드 등) 삭제된 장을 못 찾아 아무 반응이 없었다 — 개수 기반(멀티셋) 비교로
// 정확히 몇 번째가 빠졌는지 찾는다.
export async function savePartLeafPhotos({ unitId, category, subcategory, part, mine, urls, nextUrls, onAdd, onRemove }) {
  if (nextUrls.length > urls.length) {
    const addedUrl = nextUrls.find((u) => !urls.includes(u));
    await onAdd({ unitId, category, subcategory, part, url: addedUrl });
    return;
  }
  const nextCounts = new Map();
  nextUrls.forEach((u) => nextCounts.set(u, (nextCounts.get(u) ?? 0) + 1));
  const removedIndex = urls.findIndex((u) => {
    const remaining = nextCounts.get(u) ?? 0;
    if (remaining > 0) { nextCounts.set(u, remaining - 1); return false; }
    return true;
  });
  const removed = removedIndex >= 0 ? mine[removedIndex] : undefined;
  if (removed) await onRemove(removed.id);
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `node lib/partLeafPhotos.check.mjs`
Expected: `OK: partLeafPhotos checks passed`

- [ ] **Step 5: 커밋**

```bash
git add lib/partLeafPhotos.js lib/partLeafPhotos.check.mjs
git commit -m "feat: 부품현황 사진 추가/삭제 판별 로직을 순수함수로 추출"
```

---

### Task 2: 모바일 `PartLeafRow`가 새 헬퍼를 쓰도록 교체 (동작 변경 없음)

**Files:**
- Modify: `app/components/tabs/PartPhotosPanel.jsx:1-35`

**Interfaces:**
- Consumes: `partLeafPhotos`, `savePartLeafPhotos` from `@/lib/partLeafPhotos` (Task 1)
- Produces: `PartLeafRow`의 외부 시그니처(`{ unitId, category, subcategory, part, photos, onAdd, onRemove }`)는 변경 없음 — `PartPhotosPanel`을 쓰는 모바일 화면은 아무 것도 안 바뀐다.

- [ ] **Step 1: import 추가, 중복 로직 제거**

`app/components/tabs/PartPhotosPanel.jsx`의 현재 1~35행:
```js
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AccordionRow } from "@/app/components/ui";
import { FileCarousel } from "@/app/components/admin/adminShared";
import { uploadPhoto } from "@/lib/photos";
import { UNIT_PART_TAXONOMY, leafPathsOf, countFilled } from "@/lib/unitPartTaxonomy";

// 리프(세부항목) 한 칸 — 탭하면 펼쳐져서 사진 그리드(FileCarousel)가 나온다.
function PartLeafRow({ unitId, category, subcategory, part, photos, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const mine = photos.filter((p) => p.category === category && p.subcategory === subcategory && p.part === part);
  const urls = mine.map((p) => p.url);

  // FileCarousel은 "다음 urls 배열"만 넘겨준다 — 우리는 사진 1장=1행으로 저장하므로
  // 이전 urls와 비교해서 추가/삭제 중 뭐가 일어났는지 여기서 판단한다.
  // 단순 includes() 비교로는 같은 url이 두 장 이상 겹칠 때(중복 업로드 등) 삭제된 장을
  // 못 찾아 아무 반응이 없었다 — 개수 기반(멀티셋) 비교로 정확히 몇 번째가 빠졌는지 찾는다.
  async function handleSave(nextUrls) {
    if (nextUrls.length > urls.length) {
      const addedUrl = nextUrls.find((u) => !urls.includes(u));
      await onAdd({ unitId, category, subcategory, part, url: addedUrl });
    } else {
      const nextCounts = new Map();
      nextUrls.forEach((u) => nextCounts.set(u, (nextCounts.get(u) ?? 0) + 1));
      const removedIndex = urls.findIndex((u) => {
        const remaining = nextCounts.get(u) ?? 0;
        if (remaining > 0) { nextCounts.set(u, remaining - 1); return false; }
        return true;
      });
      const removed = removedIndex >= 0 ? mine[removedIndex] : undefined;
      if (removed) await onRemove(removed.id);
    }
  }
```

이 전체를 아래로 교체:
```js
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AccordionRow } from "@/app/components/ui";
import { FileCarousel } from "@/app/components/admin/adminShared";
import { uploadPhoto } from "@/lib/photos";
import { UNIT_PART_TAXONOMY, leafPathsOf, countFilled } from "@/lib/unitPartTaxonomy";
import { partLeafPhotos, savePartLeafPhotos } from "@/lib/partLeafPhotos";

// 리프(세부항목) 한 칸 — 탭하면 펼쳐져서 사진 그리드(FileCarousel)가 나온다.
function PartLeafRow({ unitId, category, subcategory, part, photos, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const { mine, urls } = partLeafPhotos(photos, category, subcategory, part);

  async function handleSave(nextUrls) {
    await savePartLeafPhotos({ unitId, category, subcategory, part, mine, urls, nextUrls, onAdd, onRemove });
  }
```

나머지(37행부터, `return (` 이후)는 그대로 둔다 — `mine.length`를 쓰던 자리가
있는지 파일 끝까지 확인하고, 있다면(46행 근처 `mine.length`) 그대로 두면 된다
(`mine`은 여전히 위에서 구조분해로 들어온다).

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add app/components/tabs/PartPhotosPanel.jsx
git commit -m "refactor: PartLeafRow가 lib/partLeafPhotos 공용 로직을 쓰도록 정리"
```

---

### Task 3: `app/components/admin/PartsStatusTab.jsx` — 트리+상세 2단 컴포넌트

**Files:**
- Create: `app/components/admin/PartsStatusTab.jsx`

**Interfaces:**
- Consumes:
  - `UNIT_PART_TAXONOMY`, `leafPathsOf`, `countFilled` from `@/lib/unitPartTaxonomy`
  - `partLeafPhotos`, `savePartLeafPhotos` from `@/lib/partLeafPhotos` (Task 1)
  - `FileCarousel` from `@/app/components/admin/adminShared`
  - `uploadPhoto` from `@/lib/photos`
- Produces: `export function PartsStatusTab({ unitId, photos, onAdd, onRemove })` — Task 5에서
  `UnitDetailModal`의 "부품현황" 탭에서 렌더.
  - `photos`: `{ id, unitId, category, subcategory, part, url }[]` (이미 해당 unit으로 필터링된 배열)
  - `onAdd({ unitId, category, subcategory, part, url })`, `onRemove(photoId)`

- [ ] **Step 1: 컴포넌트 작성**

`app/components/admin/PartsStatusTab.jsx`:
```jsx
"use client";

import { useState } from "react";
import { UNIT_PART_TAXONOMY, leafPathsOf, countFilled } from "@/lib/unitPartTaxonomy";
import { partLeafPhotos, savePartLeafPhotos } from "@/lib/partLeafPhotos";
import { FileCarousel } from "@/app/components/admin/adminShared";
import { uploadPhoto } from "@/lib/photos";

// 트리 리프 한 줄 — 점(사진 유무) + 라벨. 클릭하면 우측 상세를 이 리프로 바꾼다.
function TreeLeaf({ category, subcategory, part, photos, selected, onSelect }) {
  const has = photos.some((p) => p.category === category && p.subcategory === subcategory && p.part === part);
  return (
    <button
      type="button"
      onClick={() => onSelect({ category, subcategory, part })}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs ${
        selected ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-500"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${has ? "bg-emerald-500" : "bg-slate-200"}`} />
      {part}
    </button>
  );
}

// node가 문자열이면 리프, 객체({label,children})면 중분류 소제목 + 그 아래 리프들 —
// 깊이 상관없이 재귀(모바일 PartPhotosPanel의 PartNode/PartGroup과 동일한 순회 방식).
function TreeNode({ category, subcategory, node, photos, selected, onSelect }) {
  if (typeof node === "string") {
    const isSelected = selected?.category === category && selected?.subcategory === subcategory && selected?.part === node;
    return <TreeLeaf category={category} subcategory={subcategory} part={node} photos={photos} selected={isSelected} onSelect={onSelect} />;
  }
  return (
    <div>
      <p className="px-2.5 pt-2 pb-1 text-[10px] font-bold text-slate-400">{node.label}</p>
      {node.children.map((child) => (
        <TreeNode
          key={typeof child === "string" ? child : child.label}
          category={category}
          subcategory={node.label}
          node={child}
          photos={photos}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// 대분류 한 칸 — 탭하면 펼쳐져서 안의 트리가 나온다. 한 번에 하나만 펼침(부모가 상태 관리).
function TreeCategory({ cat, photos, open, onToggle, selected, onSelect }) {
  const paths = leafPathsOf(cat, cat.label, null);
  const filled = countFilled(paths, photos);
  const full = filled === paths.length;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left ${open ? "bg-blue-50" : ""}`}
      >
        <span className={`text-xs font-extrabold ${open ? "text-blue-700" : "text-slate-700"}`}>{cat.label}</span>
        <span className={`text-[10px] font-extrabold ${full ? "text-emerald-600" : "text-slate-400"}`}>{filled}/{paths.length}</span>
      </button>
      {open && (
        <div className="pl-1.5 pb-1">
          {cat.children.map((child) => (
            <TreeNode
              key={typeof child === "string" ? child : child.label}
              category={cat.label}
              subcategory={null}
              node={child}
              photos={photos}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 우측 상세 — 선택된 리프의 사진 패널. FileCarousel 하나로 촬영/선택/드래그드랍/전체화면/삭제 전부 처리.
function LeafDetail({ unitId, selected, photos, onAdd, onRemove }) {
  if (!selected) {
    return <p className="text-xs text-slate-400 text-center py-16">왼쪽에서 항목을 선택하세요</p>;
  }
  const { mine, urls } = partLeafPhotos(photos, selected.category, selected.subcategory, selected.part);
  async function handleSave(nextUrls) {
    await savePartLeafPhotos({ unitId, ...selected, mine, urls, nextUrls, onAdd, onRemove });
  }
  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-1">
        {selected.category}{selected.subcategory ? ` › ${selected.subcategory}` : ""}
      </p>
      <h3 className="text-sm font-extrabold text-slate-800 mb-3">{selected.part}</h3>
      <FileCarousel
        urls={urls}
        accept="image/*"
        uploadLabel="사진 촬영/선택"
        height="h-64"
        onUpload={(file) => uploadPhoto(file, `unit-parts/${unitId}`)}
        onSave={handleSave}
      />
    </div>
  );
}

export function PartsStatusTab({ unitId, photos, onAdd, onRemove }) {
  const [openCategory, setOpenCategory] = useState(null);
  const [selected, setSelected] = useState(null);

  if (!unitId) {
    return <p className="text-xs text-slate-400 text-center py-10">호기 정보가 없어 부품현황을 쓸 수 없습니다</p>;
  }

  const allPaths = UNIT_PART_TAXONOMY.flatMap((cat) => leafPathsOf(cat, cat.label, null));
  const totalFilled = countFilled(allPaths, photos);
  const fullCategoryCount = UNIT_PART_TAXONOMY.filter((cat) => {
    const paths = leafPathsOf(cat, cat.label, null);
    return countFilled(paths, photos) === paths.length;
  }).length;

  return (
    <div className="h-full flex gap-4">
      <div className="w-[240px] shrink-0 overflow-y-auto border-r border-slate-100 pr-3">
        {UNIT_PART_TAXONOMY.map((cat) => (
          <TreeCategory
            key={cat.label}
            cat={cat}
            photos={photos}
            open={openCategory === cat.label}
            onToggle={() => setOpenCategory(openCategory === cat.label ? null : cat.label)}
            selected={selected}
            onSelect={setSelected}
          />
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="flex gap-2 mb-4">
          <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1">
            전체 <span className="text-slate-800">{totalFilled}/{allPaths.length}</span>
          </span>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1">
            완료 <span className="text-emerald-600">{fullCategoryCount}개 대분류</span>
          </span>
        </div>
        <LeafDetail unitId={unitId} selected={selected} photos={photos} onAdd={onAdd} onRemove={onRemove} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공(이 시점엔 아직 아무 데서도 import 안 하므로 실질적으로
구문 에러만 잡힘 — 실제 배선/동작 확인은 Task 5).

- [ ] **Step 3: 커밋**

```bash
git add app/components/admin/PartsStatusTab.jsx
git commit -m "feat: 관리자웹 부품현황 트리+상세 2단 컴포넌트 추가"
```

---

### Task 4: `AdminApp.jsx` — `unit_part_photos` 최초 로드

**Files:**
- Modify: `app/components/admin/AdminApp.jsx:10-13` (import)
- Modify: `app/components/admin/AdminApp.jsx:63-67` (초기 `data` state)
- Modify: `app/components/admin/AdminApp.jsx:188-231` (`load()` 함수)

**Interfaces:**
- Consumes: `mapUnitPartPhoto` from `@/lib/mappers` (이미 존재, 모바일이 씀)
- Produces: `data.unitPartPhotos: { id, unitId, category, subcategory, part, url, uploadedBy, createdAt }[]` — Task 5의 `SitesAdmin`이 `data`에서 구조분해해서 쓴다.

- [ ] **Step 1: import에 `mapUnitPartPhoto` 추가**

`app/components/admin/AdminApp.jsx:10-13` 현재:
```js
import {
  mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest,
  mapTodo, mapQuoteRequest, mapBilling, mapUnit, mapSelfCheck, mapSelfCheckItem, mapFeedPost, mapRestockRequest, mapErrorCode,
} from "@/lib/mappers";
```

교체:
```js
import {
  mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest,
  mapTodo, mapQuoteRequest, mapBilling, mapUnit, mapSelfCheck, mapSelfCheckItem, mapFeedPost, mapRestockRequest, mapErrorCode, mapUnitPartPhoto,
} from "@/lib/mappers";
```

- [ ] **Step 2: 초기 `data` state에 `unitPartPhotos: []` 추가**

`app/components/admin/AdminApp.jsx:63-67` 현재:
```js
  const [data, setData] = useState({
    sites: [], units: [], siteManagers: [], failures: [], inspections: [],
    materialRequests: [], quoteRequests: [], restockRequests: [], todos: [], billings: [],
    selfChecks: [], selfCheckItems: [], profiles: [], feed: [], errorCodes: [],
  });
```

교체:
```js
  const [data, setData] = useState({
    sites: [], units: [], siteManagers: [], failures: [], inspections: [],
    materialRequests: [], quoteRequests: [], restockRequests: [], todos: [], billings: [],
    selfChecks: [], selfCheckItems: [], profiles: [], feed: [], errorCodes: [], unitPartPhotos: [],
  });
```

- [ ] **Step 3: `load()` — 조회 목록과 결과 매핑에 추가**

`app/components/admin/AdminApp.jsx:188-210` 현재:
```js
    async function load() {
      const [sites, units, siteManagers, failures, inspections, materials, quotes, restock, todos, billings, selfChecks, selfCheckItems, profiles, feed, errorCodes] =
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
        ]);
```

교체:
```js
    async function load() {
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
          // 부품현황 사진 — 모바일 ElevatorFieldApp.jsx와 동일하게 페이지네이션 없는 단순 조회.
          supabase.from("unit_part_photos").select("*"),
        ]);
```

`app/components/admin/AdminApp.jsx:211-227` 현재:
```js
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
      });
      setLoading(false);
    }
    load();
  }, [me]);
```

교체:
```js
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
    }
    load();
  }, [me]);
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공.

- [ ] **Step 5: 커밋**

```bash
git add app/components/admin/AdminApp.jsx
git commit -m "feat: 관리자웹 최초 로드에 unit_part_photos 추가"
```

---

### Task 5: `SitesAdmin.jsx` — 탭 추가, 핸들러, 배선

**Files:**
- Modify: `app/components/admin/SitesAdmin.jsx:10` (import)
- Modify: `app/components/admin/SitesAdmin.jsx:176-225` (`UnitDetailModal` 시그니처, 탭 목록, wrapper)
- Modify: `app/components/admin/SitesAdmin.jsx:392` 부근 (견적내역 블록 뒤에 부품현황 블록 추가)
- Modify: `app/components/admin/SitesAdmin.jsx:512-513` (`data`에서 `unitPartPhotos` 구조분해)
- Modify: `app/components/admin/SitesAdmin.jsx:726-730` 부근 (새 핸들러 2개 추가)
- Modify: `app/components/admin/SitesAdmin.jsx:1387-1397` (`<UnitDetailModal>` 렌더에 props 추가)

**Interfaces:**
- Consumes: `PartsStatusTab` from `@/app/components/admin/PartsStatusTab` (Task 3),
  `mapUnitPartPhoto` from `@/lib/mappers`, `data.unitPartPhotos` (Task 4)
- Produces: 없음 (최종 배선 — 이 탭이 화면에 완성된 형태로 뜬다)

- [ ] **Step 1: import에 `mapUnitPartPhoto`, `PartsStatusTab` 추가**

`app/components/admin/SitesAdmin.jsx:10` 현재:
```js
import { mapUnit, mapSite } from "@/lib/mappers";
```

교체:
```js
import { mapUnit, mapSite, mapUnitPartPhoto } from "@/lib/mappers";
```

`app/components/admin/SitesAdmin.jsx:16` 다음 줄에 추가(현재 16번째 줄
`import { Modal, StatusBadge, DateTextInput, FileCarousel, sentHistory, Highlight } from "@/app/components/admin/adminShared";` 바로 아래):
```js
import { PartsStatusTab } from "@/app/components/admin/PartsStatusTab";
```

- [ ] **Step 2: `UnitDetailModal` 시그니처에 새 props 추가**

`app/components/admin/SitesAdmin.jsx:176` 현재:
```js
function UnitDetailModal({ unit, site, failures, inspections, billings, quoteRequests, onClose, onSave }) {
```

교체:
```js
function UnitDetailModal({ unit, site, failures, inspections, billings, quoteRequests, unitPartPhotos, onAddPartPhoto, onRemovePartPhoto, onClose, onSave }) {
```

같은 함수 안, `unitQuotes` 계산부(기존 208~212행 근처) 바로 아래에 이 호기의
부품현황 사진만 거른 변수를 추가한다. 기존:
```js
  const unitQuotes = quoteRequests
    .filter((q) => (q.unitId ? q.unitId === unit.id : q.siteId === site.id))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));
```

교체:
```js
  const unitQuotes = quoteRequests
    .filter((q) => (q.unitId ? q.unitId === unit.id : q.siteId === site.id))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));
  const unitPhotos = unitPartPhotos.filter((p) => p.unitId === unit.id);
```

- [ ] **Step 3: 탭 목록에 "부품현황" 추가, 폭 넓히기, wrapper 조건부 스크롤**

`app/components/admin/SitesAdmin.jsx:215-225` 현재:
```jsx
    <Modal title={`${site.name} · ${unit.unitNo} 상세정보`} onClose={onClose} wide>
      <div className="flex gap-1 mb-4 border-b border-slate-100 shrink-0">
        {["정보", "고장내역", "검사내역", "부품교체내역", "견적내역"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-xs font-bold ${tab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* 탭마다 팝업 크기가 달라지지 않도록 고정 높이 + 내부 스크롤로 통일 */}
      <div className="h-[26rem] overflow-y-auto">
```

교체:
```jsx
    <Modal title={`${site.name} · ${unit.unitNo} 상세정보`} onClose={onClose} wide="xl">
      <div className="flex gap-1 mb-4 border-b border-slate-100 shrink-0">
        {["정보", "고장내역", "검사내역", "부품교체내역", "견적내역", "부품현황"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-xs font-bold ${tab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* 탭마다 팝업 크기가 달라지지 않도록 고정 높이로 통일 — 부품현황은 좌우 2단이라
          바깥은 넘침을 감추고 안쪽 두 단이 각자 스크롤한다. */}
      <div className={tab === "부품현황" ? "h-[26rem] overflow-hidden" : "h-[26rem] overflow-y-auto"}>
```

- [ ] **Step 4: 견적내역 탭 블록 뒤에 부품현황 블록 추가**

`app/components/admin/SitesAdmin.jsx:392` 부근, `{tab === "견적내역" && (` 블록이
끝나는 `)}` 바로 다음(그 다음 줄이 `</div>`로 `h-[26rem]` wrapper가 닫히는 지점)에
추가:
```jsx
        {tab === "부품현황" && (
          <PartsStatusTab unitId={unit.id} photos={unitPhotos} onAdd={onAddPartPhoto} onRemove={onRemovePartPhoto} />
        )}
```

- [ ] **Step 5: `SitesAdmin`에서 `data`로부터 `unitPartPhotos` 구조분해**

`app/components/admin/SitesAdmin.jsx:513` 현재:
```js
  const { sites, units, profiles, failures, inspections, billings, siteManagers, quoteRequests } = data;
```

교체:
```js
  const { sites, units, profiles, failures, inspections, billings, siteManagers, quoteRequests, unitPartPhotos } = data;
```

- [ ] **Step 6: `addUnitPartPhoto`/`removeUnitPartPhoto` 핸들러 추가**

`app/components/admin/SitesAdmin.jsx`의 `saveUnitDetail` 함수가 끝나는 지점
(현재 727~730행 근처, `await syncLegacy(unit.siteId, nextUnits);` 다음 줄인
`}`) 바로 다음에 추가:
```js

  // 부품현황 탭 — 사진 1장 추가/삭제. 모바일 ElevatorFieldApp.jsx의
  // handleAddUnitPartPhoto/handleRemoveUnitPartPhoto와 같은 테이블(unit_part_photos)을
  // 쓰지만, 이 파일 관례대로 직접 supabase 호출 후 setData로 로컬 반영한다.
  async function addUnitPartPhoto({ unitId, category, subcategory, part, url }) {
    const { data: created, error } = await supabase
      .from("unit_part_photos")
      .insert({ unit_id: unitId, category, subcategory, part, url })
      .select().single();
    if (error) { alert("사진 저장 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, unitPartPhotos: [...prev.unitPartPhotos, mapUnitPartPhoto(created)] }));
  }

  async function removeUnitPartPhoto(photoId) {
    const { error } = await supabase.from("unit_part_photos").delete().eq("id", photoId);
    if (error) { alert("사진 삭제 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, unitPartPhotos: prev.unitPartPhotos.filter((p) => p.id !== photoId) }));
  }
```

- [ ] **Step 7: `<UnitDetailModal>` 렌더에 props 전달**

`app/components/admin/SitesAdmin.jsx:1387-1397` 현재:
```jsx
      {unitDetail && (
        <UnitDetailModal
          unit={unitDetail}
          site={sites.find((s) => s.id === unitDetail.siteId)}
          failures={failures}
          inspections={inspections}
          billings={billings}
          quoteRequests={quoteRequests ?? []}
          onClose={() => setUnitDetail(null)}
          onSave={saveUnitDetail}
        />
      )}
```

교체:
```jsx
      {unitDetail && (
        <UnitDetailModal
          unit={unitDetail}
          site={sites.find((s) => s.id === unitDetail.siteId)}
          failures={failures}
          inspections={inspections}
          billings={billings}
          quoteRequests={quoteRequests ?? []}
          unitPartPhotos={unitPartPhotos}
          onAddPartPhoto={addUnitPartPhoto}
          onRemovePartPhoto={removeUnitPartPhoto}
          onClose={() => setUnitDetail(null)}
          onSave={saveUnitDetail}
        />
      )}
```

- [ ] **Step 8: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공.

- [ ] **Step 9: 수동 확인 (브라우저)**

`npm run dev`로 관리자웹을 띄우고:
1. 현장정보 → 아무 현장 → 승강기 정보 표에서 호기명 클릭 → 상세정보 팝업이
   전보다 넓게 뜨는지 확인.
2. 탭에 "부품현황"이 보이는지, 클릭하면 좌측에 7개 대분류가 나열되는지 확인.
3. 대분류(예: "카도어") 클릭 → 펼쳐지면서 리프 목록이 나오는지, 다른 대분류를
   클릭하면 이전 것이 접히는지(한 번에 하나만) 확인.
4. 리프(예: "카도어 벤") 클릭 → 우측에 breadcrumb + 제목 + 업로드 영역이 뜨는지 확인.
5. 사진 촬영/선택 버튼으로 이미지 1장 업로드 → 좌측 트리의 점이 초록으로 바뀌고
   배지 숫자가 올라가는지, 새로고침해도 유지되는지(DB 반영) 확인.
6. 업로드한 사진을 삭제 → 점이 다시 회색으로, 배지 숫자가 내려가는지 확인.
7. 모바일 앱(같은 호기, 승강기정보 > 부품현황)에서도 방금 올린 사진이 그대로
   보이는지 확인 — 같은 테이블을 쓰므로 양쪽에 다 보여야 정상.

- [ ] **Step 10: 커밋**

```bash
git add app/components/admin/SitesAdmin.jsx
git commit -m "feat: 관리자웹 호기 상세정보에 부품현황 탭 배선"
```
