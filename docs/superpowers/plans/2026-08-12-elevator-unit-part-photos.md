# 승강기 부품현황(호기별 부품 사진) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승강기정보 탭(호기 단위)에 "부품현황" 서브탭을 추가해서, 기사가 이 호기에
설치된 부품 사진을 대분류/중분류/세부항목별 아코디언에서 촬영·업로드하고 나중에
누구든 같은 자리에서 바로 확인할 수 있게 한다.

**Architecture:** 부품 분류 체계(대분류→중분류→세부항목, 카테고리마다 중분류 유무가
다름)는 코드 상수로 고정 관리하고, 사진 자체는 1장=1행인 `unit_part_photos` 테이블에
저장한다. UI는 대분류 레벨에서 기존 `AccordionRow`(자재출하관리에서 쓰는 것과 동일
컴포넌트, 공용 위치로 옮김)를 재사용하고, 그 안의 중분류/리프는 재귀 컴포넌트 하나로
깊이에 상관없이 처리한다. 리프(세부항목)의 실제 사진 업로드/보기는 기존
`FileCarousel`(계약서·근로계약서 등에 쓰는 다중 사진 첨부 위젯)을 그대로 재사용한다.

**Tech Stack:** Next.js App Router, React, Supabase(Postgres + Storage), Tailwind
(className 유틸리티, 별도 CSS 파일 없음).

## Global Constraints

- 서브탭 이름은 정확히 "부품현황" (스펙에서 확정, "부품사진"에서 변경됨).
- 부품 분류 체계는 아래 목록을 정확히 그대로 쓴다(라벨 문자열 오타 금지 — 나중에 DB에
  저장된 사진과 매칭이 안 되면 사진이 "사라진 것처럼" 보인다):
  ```
  기계실 > 제어반: 전체사진, PCB, 인버터, ARD, 마그네트, SMPS
  기계실 > 권상기: 전체사진, 구동기, 권상기, 브레이크
  기계실 > 조속기: 전체사진, 조속기 스위치
  기계실 > 비상통화장치            (중분류 없음, 리프)
  카 상부: 전체사진, 카탑PCB, 랜딩스위치, 가이드슈/가이드롤러/오일러   (중분류 없음)
  카도어: 도어드라이브, 도어모터, 벨트, 카도어 인터록, 카도어 벤, 카도어 씰
  승장도어: 행거플레이트, 승장도어 인터록, 승장도어 씰
  승강장: 승장버튼, 승장인디게이터
  카 내부 > 조작반: 전체사진, 버튼, 통신보드, 카 인디게이터
  카 내부 > 조명등                 (중분류 없음, 리프)
  승강로: 리미트스위치, 조속기 인장풀리, 완충기 스위치, 피트 조작반
  ```
- 대분류 행에는 아이콘을 넣지 않는다(사용자가 목업에서 확정).
- 세부항목(리프) 라벨 앞에 "1)", "2)" 같은 번호를 붙이지 않는다.
- 이 프로젝트에는 테스트 프레임워크가 설치돼 있지 않다(jest/vitest 없음, `package.json`
  scripts에 test 항목 없음). Task 2의 순수 함수는 새 프레임워크를 들이지 않고, 이
  세션에서 이미 쓰던 방식대로 `node`로 직접 실행 가능한 assert 기반 스크립트로
  검증한다(Node 24는 `.js`에 `export` 문법이 있으면 자동으로 ESM으로 재해석해서
  `node --input-type=module`/일반 `node` 실행 모두 그대로 동작함 — 확인됨).
- 사진은 기존 `photos` Storage 버킷·`uploadPhoto()`(`lib/photos.js`)를 그대로 쓴다.
  새 버킷·새 정책 안 만든다.
- **구현 서브에이전트는 실제 운영 Supabase DB/Storage에 마이그레이션을 실행하거나
  쓰기 스크립트를 돌리지 않는다.** `111_...DRAFT.sql`은 파일만 작성하고 커밋하며,
  실제 실행과 그 이후의 브라우저 확인은 컨트롤러(사람 승인 하에)가 한다 — 이전
  세션에서 서브에이전트가 이 규칙을 어기고 운영 DB에 직접 쓰기를 시도한 사고가
  있었다.

---

### Task 1: DB — `unit_part_photos` 테이블 마이그레이션

**Files:**
- Create: `supabase/migrations/111_unit_part_photos_DRAFT.sql`

**Interfaces:**
- Produces: `public.unit_part_photos` 테이블 — 컬럼 `id, unit_id, category, subcategory,
  part, url, uploaded_by, created_at`. Task 4의 `lib/mappers.js`·
  `ElevatorFieldApp.jsx`가 이 컬럼명을 그대로 참조한다.

이 저장소의 마이그레이션 파일은 자동 실행되지 않는다(`_DRAFT` 접미사 — 사람이 Supabase
SQL Editor에서 직접 실행하는 관례, `109`/`110`과 동일). 자동화 테스트 없이 파일
내용과 수동 실행 결과로 검증한다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 111: unit_part_photos — 호기별 "부품현황" 참조 사진 (2026-08-12)
-- 승강기정보 탭의 "부품현황" 서브탭에서 기사가 대분류/중분류/세부항목별로 올리는
-- 참조용 부품 사진. 사고 증거(billings)와는 다른 개념 — 사진 1장=1행으로 저장해서
-- 세부항목당 여러 장이 자유롭게 쌓이고 개별 삭제도 단순하게 한다(배열 컬럼 read-
-- modify-write 경합 없음). category/subcategory/part는 lib/unitPartTaxonomy.js의
-- UNIT_PART_TAXONOMY 라벨 문자열과 정확히 일치해야 화면에서 매칭된다.

create table if not exists public.unit_part_photos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  category text not null,
  subcategory text,
  part text not null,
  url text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists unit_part_photos_unit_id_idx on public.unit_part_photos (unit_id);

-- RLS: 106_rls_remaining.sql과 동일한 패턴 — 로그인(authenticated)만 하면 전부 허용.
alter table public.unit_part_photos enable row level security;
create policy "authenticated_full_access" on public.unit_part_photos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'unit_part_photos'
order by ordinal_position;
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'unit_part_photos';
```

- [ ] **Step 2: 파일 내용 확인**

읽어서 컬럼 8개(`id, unit_id, category, subcategory, part, url, uploaded_by,
created_at`)와 RLS 정책 1개가 정확히 들어있는지 눈으로 확인한다. 이 시점에는 아직
Supabase에 실행하지 않는다(사람이 검수 후 직접 실행).

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/111_unit_part_photos_DRAFT.sql
git commit -m "migration: unit_part_photos 테이블 (부품현황 사진, 실행 전 DRAFT)"
```

---

### Task 2: 부품 분류 체계 + 배지 집계 순수함수

**Files:**
- Create: `lib/unitPartTaxonomy.js`
- Create: `lib/unitPartTaxonomy.check.mjs`

**Interfaces:**
- Consumes: 없음(순수 함수, 외부 의존성 없음).
- Produces:
  - `UNIT_PART_TAXONOMY` — 배열. 각 원소는 `{ label: string, children: Array<string |
    { label: string, children: string[] }> }` (대분류). Task 4의 `PartPhotosPanel`이
    이 배열을 순회해서 렌더링한다.
  - `leafPathsOf(node, category, initialSubcategory)` — `node.children`을 재귀로
    평탄화해서 `{ category, subcategory, part }[]`를 돌려준다. 대분류를 넘기면
    `initialSubcategory`는 `null`, 중분류 노드 자체를 넘기면 그 중분류의 `label`.
  - `countFilled(paths, photos)` — `paths` 중 `photos`(각 원소가 `{category,
    subcategory, part}`를 가진 배열, `unitPartPhotos`를 그대로 넘기면 됨) 안에 실제로
    존재하는(사진이 1장 이상 있는) 개수.

- [ ] **Step 1: 실패하는 체크 스크립트 작성**

```js
// lib/unitPartTaxonomy.check.mjs
import assert from "node:assert/strict";
import { UNIT_PART_TAXONOMY, leafPathsOf, countFilled } from "./unitPartTaxonomy.js";

// 중분류를 거치는 리프(기계실>제어반>PCB)는 subcategory가 채워진다.
const machineRoom = UNIT_PART_TAXONOMY.find((c) => c.label === "기계실");
const machineRoomPaths = leafPathsOf(machineRoom, "기계실", null);
const pcb = machineRoomPaths.find((p) => p.part === "PCB");
assert.deepEqual(pcb, { category: "기계실", subcategory: "제어반", part: "PCB" });

// 중분류 없이 대분류 바로 아래 리프(기계실>비상통화장치)는 subcategory가 null.
const emergencyPhone = machineRoomPaths.find((p) => p.part === "비상통화장치");
assert.deepEqual(emergencyPhone, { category: "기계실", subcategory: null, part: "비상통화장치" });

// 카 상부는 중분류가 아예 없어 모든 리프가 subcategory: null, 개수는 4개.
const carTop = UNIT_PART_TAXONOMY.find((c) => c.label === "카 상부");
const carTopPaths = leafPathsOf(carTop, "카 상부", null);
assert.ok(carTopPaths.every((p) => p.subcategory === null));
assert.equal(carTopPaths.length, 4);

// countFilled: 같은 리프 이름("전체사진")이 기계실 안 여러 중분류(제어반/권상기/조속기)에
// 반복돼도, category+subcategory+part가 전부 일치할 때만 채워진 것으로 센다 —
// 제어반의 전체사진만 있고 권상기 전체사진은 없으면 기계실 전체 배지는 1이어야 한다.
const onlyControlPanelOverall = [{ category: "기계실", subcategory: "제어반", part: "전체사진" }];
assert.equal(countFilled(machineRoomPaths, onlyControlPanelOverall), 1);

// 전체 대분류 라벨이 확정된 7개와 정확히 일치하는지(오타 방지).
assert.deepEqual(
  UNIT_PART_TAXONOMY.map((c) => c.label),
  ["기계실", "카 상부", "카도어", "승장도어", "승강장", "카 내부", "승강로"]
);

console.log("OK: unitPartTaxonomy checks passed");
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `node lib/unitPartTaxonomy.check.mjs`
Expected: `Cannot find module '.../lib/unitPartTaxonomy.js'` 에러로 실패(아직 파일이
없음).

- [ ] **Step 3: 구현**

```js
// lib/unitPartTaxonomy.js
// 호기별 "부품현황" 사진 분류 체계 — 회사가 정한 고정 점검 항목(현장마다 다르지 않음).
// 대분류(배열 원소) 아래 children 원소가 문자열이면 리프(실제 사진 슬롯), {label,
// children} 객체면 한 겹 더 있는 중분류. 카테고리마다 중분류가 있을 수도 없을 수도
// 있어서(예: 기계실은 있고 카상부는 없음), 렌더링 쪽(PartPhotosPanel)은 이 모양을
// 그대로 재귀로 따라가면 된다.
export const UNIT_PART_TAXONOMY = [
  {
    label: "기계실",
    children: [
      { label: "제어반", children: ["전체사진", "PCB", "인버터", "ARD", "마그네트", "SMPS"] },
      { label: "권상기", children: ["전체사진", "구동기", "권상기", "브레이크"] },
      { label: "조속기", children: ["전체사진", "조속기 스위치"] },
      "비상통화장치",
    ],
  },
  { label: "카 상부", children: ["전체사진", "카탑PCB", "랜딩스위치", "가이드슈/가이드롤러/오일러"] },
  { label: "카도어", children: ["도어드라이브", "도어모터, 벨트", "카도어 인터록", "카도어 벤", "카도어 씰"] },
  { label: "승장도어", children: ["행거플레이트", "승장도어 인터록", "승장도어 씰"] },
  { label: "승강장", children: ["승장버튼", "승장인디게이터"] },
  {
    label: "카 내부",
    children: [
      { label: "조작반", children: ["전체사진", "버튼", "통신보드", "카 인디게이터"] },
      "조명등",
    ],
  },
  { label: "승강로", children: ["리미트스위치", "조속기 인장풀리", "완충기 스위치", "피트 조작반"] },
];

// node(대분류 또는 중분류) 아래 모든 리프를 {category, subcategory, part} 경로로
// 평탄화한다. initialSubcategory: node가 대분류면 null, 중분류 노드 자체를 넘겼으면
// 그 중분류의 label.
export function leafPathsOf(node, category, initialSubcategory) {
  function walk(child, subcategory) {
    if (typeof child === "string") return [{ category, subcategory, part: child }];
    return child.children.flatMap((c) => walk(c, subcategory ?? child.label));
  }
  return node.children.flatMap((child) => walk(child, initialSubcategory));
}

// paths 중 photos(각 원소가 {category, subcategory, part}를 가짐) 안에 실제로
// 존재하는(사진이 1장 이상 있는) 개수.
export function countFilled(paths, photos) {
  return paths.filter((p) =>
    photos.some((ph) => ph.category === p.category && ph.subcategory === p.subcategory && ph.part === p.part)
  ).length;
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `node lib/unitPartTaxonomy.check.mjs`
Expected: `OK: unitPartTaxonomy checks passed` 출력, 종료 코드 0.

- [ ] **Step 5: 커밋**

```bash
git add lib/unitPartTaxonomy.js lib/unitPartTaxonomy.check.mjs
git commit -m "feat: 부품현황 분류 체계 + 리프 경로/배지 집계 순수함수"
```

---

### Task 3: `AccordionRow`를 공용 컴포넌트로 추출

**Files:**
- Modify: `app/components/ui.jsx`
- Modify: `app/components/tabs/AdminTab.jsx:3-55`

**Interfaces:**
- Consumes: 없음.
- Produces: `AccordionRow({ icon?, label, badge, open, onToggle, children })` —
  `app/components/ui`에서 export. `icon`이 없으면 아이콘 원을 그리지 않는다(기존
  AdminTab.jsx 호출부는 전부 `icon`을 넘기므로 동작 변화 없음). Task 4의
  `PartPhotosPanel`이 `icon` 없이 이 컴포넌트를 대분류 행에 쓴다.

지금 `AccordionRow`는 `app/components/tabs/AdminTab.jsx` 안에 로컬 함수로만 있어서
`app/components/tabs/SiteTab.jsx`(부품현황이 들어갈 화면)에서 못 쓴다. 공용 위치
(`app/components/ui.jsx` — `DrillHeader`·`Sheet` 등 다른 공용 UI가 있는 곳)로 옮긴다.

- [ ] **Step 1: `ui.jsx`에 `ChevronDown` import 추가**

`app/components/ui.jsx` 5번째 줄, 기존:
```js
import { Home, X, Camera, Check, Image as ImageIcon, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
```
변경 후:
```js
import { Home, X, Camera, Check, Image as ImageIcon, ArrowLeft, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
```

- [ ] **Step 2: `ui.jsx`에 `AccordionRow` 추가**

`app/components/ui.jsx`에서 `DrillHeader` 함수(437~451번 줄)의 닫는 `}` 바로 뒤,
`SmsToast` 함수 앞에 삽입:

```jsx
// 메뉴 줄을 눌러 아래로 펼쳐지는 아코디언 (관리자앱 자재출하관리 등에서 쓰던 것을
// 공용으로 옮김 — SiteTab.jsx의 부품현황에서도 재사용). icon을 안 넘기면 아이콘 없이.
export function AccordionRow({ icon: Icon, label, badge, open, onToggle, children }) {
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5 active:bg-slate-50">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <Icon size={15} className="text-slate-600" />
            </div>
          )}
          <span className="text-sm font-bold text-slate-800">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {!!badge && <span className="text-[11px] font-bold text-white bg-blue-700 px-2 py-0.5 rounded-full">{badge}</span>}
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && <div className="px-3 pb-4 pt-1 bg-slate-50/60 border-t border-slate-100">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 3: `AdminTab.jsx`에서 로컬 정의 삭제하고 공용 import로 교체**

`app/components/tabs/AdminTab.jsx` 4번째 줄, 기존:
```js
import { Badge, PhotoThumb, PhotoGrid, PrimaryButton, Sheet, Field, inputCls, DrillHeader } from "@/app/components/ui";
```
변경 후:
```js
import { Badge, PhotoThumb, PhotoGrid, PrimaryButton, Sheet, Field, inputCls, DrillHeader, AccordionRow } from "@/app/components/ui";
```

같은 파일 36~55번 줄(로컬 `AccordionRow` 함수 전체, 위 주석 줄 `// 메뉴 줄을 눌러...`
포함)을 통째로 삭제한다.

- [ ] **Step 4: 두 preview 폴더에 복사 후 브라우저로 회귀 확인**

```bash
cp "C:/projects/elevator-field-app/app/components/ui.jsx" "C:/Users/crewj/OneDrive/바탕 화면/어플만들기 프로젝트/elevator-field-app/app/components/ui.jsx"
cp "C:/projects/elevator-field-app/app/components/tabs/AdminTab.jsx" "C:/Users/crewj/OneDrive/바탕 화면/어플만들기 프로젝트/elevator-field-app/app/components/tabs/AdminTab.jsx"
```

프리뷰 브라우저에서 관리자 모드 → "자재출하관리" 아코디언을 펼쳐서 이전과 똑같이
아이콘·뱃지·펼침이 보이는지 확인한다(공용화 전후로 시각적 차이가 없어야 정상).

- [ ] **Step 5: 커밋**

```bash
git add app/components/ui.jsx app/components/tabs/AdminTab.jsx
git commit -m "refactor: AccordionRow를 ui.jsx 공용 컴포넌트로 추출"
```

---

### Task 4: `PartPhotosPanel` + 데이터 연동 + `SiteTab.jsx` 배선

**Files:**
- Create: `app/components/tabs/PartPhotosPanel.jsx`
- Modify: `lib/mappers.js`
- Modify: `app/components/ElevatorFieldApp.jsx`
- Modify: `app/components/tabs/SiteTab.jsx`

**Interfaces:**
- Consumes: Task 2의 `UNIT_PART_TAXONOMY`/`leafPathsOf`/`countFilled`, Task 3의
  `AccordionRow`, 기존 `FileCarousel`(`app/components/admin/adminShared.jsx`),
  기존 `uploadPhoto`(`lib/photos.js`), Task 1의 `unit_part_photos` 테이블.
- Produces: `PartPhotosPanel({ unitId, photos, onAdd, onRemove })` — `photos`는 이미
  해당 unitId로 필터된 `{id, category, subcategory, part, url}[]`. `onAdd({unitId,
  category, subcategory, part, url}) => Promise`, `onRemove(photoId) => Promise`.

**Step 1: `lib/mappers.js`에 매퍼 추가**

- [ ] 파일 끝(마지막 `export function` 뒤)에 추가:

```js
export function mapUnitPartPhoto(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    category: row.category,
    subcategory: row.subcategory,
    part: row.part,
    url: row.url,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}
```

**Step 2: `PartPhotosPanel.jsx` 작성**

- [ ] 새 파일 작성:

```jsx
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
  async function handleSave(nextUrls) {
    if (nextUrls.length > urls.length) {
      const addedUrl = nextUrls.find((u) => !urls.includes(u));
      await onAdd({ unitId, category, subcategory, part, url: addedUrl });
    } else {
      const removedUrl = urls.find((u) => !nextUrls.includes(u));
      const removed = mine.find((p) => p.url === removedUrl);
      if (removed) await onRemove(removed.id);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-100 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-bold text-slate-700">{part}</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold ${mine.length ? "text-emerald-600" : "text-slate-400"}`}>
            {mine.length ? `${mine.length}장` : "사진 없음"}
          </span>
          <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-50 bg-slate-50/40">
          <FileCarousel
            urls={urls}
            accept="image/*"
            uploadLabel="사진 촬영/선택"
            height="h-40"
            onUpload={(file) => uploadPhoto(file, `unit-parts/${unitId}/${category}/${subcategory ?? "_"}/${part}`)}
            onSave={handleSave}
          />
        </div>
      )}
    </div>
  );
}

// 중분류 한 칸 — 탭하면 펼쳐져서 그 안의 리프 목록이 나온다(PartNode로 재귀).
function PartGroup({ unitId, category, node, photos, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const paths = leafPathsOf(node, category, node.label);
  const filled = countFilled(paths, photos);
  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-2.5">
        <span className="text-[13px] font-extrabold text-slate-700">{node.label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{filled}/{paths.length}</span>
          <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="px-2 pb-2.5 pt-1 border-t border-slate-50 bg-slate-50/40 space-y-1.5">
          {node.children.map((child) => (
            <PartNode
              key={typeof child === "string" ? child : child.label}
              unitId={unitId}
              category={category}
              subcategory={node.label}
              node={child}
              photos={photos}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// node가 문자열이면 리프, 객체({label,children})면 중분류 — 깊이에 상관없이 재귀.
function PartNode({ unitId, category, subcategory, node, photos, onAdd, onRemove }) {
  if (typeof node === "string") {
    return (
      <PartLeafRow
        unitId={unitId} category={category} subcategory={subcategory} part={node}
        photos={photos} onAdd={onAdd} onRemove={onRemove}
      />
    );
  }
  return <PartGroup unitId={unitId} category={category} node={node} photos={photos} onAdd={onAdd} onRemove={onRemove} />;
}

export function PartPhotosPanel({ unitId, photos, onAdd, onRemove }) {
  const [openCategory, setOpenCategory] = useState(null);

  if (!unitId) {
    return <p className="text-xs text-slate-400 text-center py-10">호기 정보가 없어 부품현황을 쓸 수 없습니다</p>;
  }

  return (
    <div className="bg-slate-50 pb-6">
      {UNIT_PART_TAXONOMY.map((cat) => {
        const paths = leafPathsOf(cat, cat.label, null);
        const filled = countFilled(paths, photos);
        const open = openCategory === cat.label;
        return (
          <AccordionRow
            key={cat.label}
            label={cat.label}
            badge={`${filled}/${paths.length}`}
            open={open}
            onToggle={() => setOpenCategory(open ? null : cat.label)}
          >
            <div className="space-y-1.5">
              {cat.children.map((child) => (
                <PartNode
                  key={typeof child === "string" ? child : child.label}
                  unitId={unitId}
                  category={cat.label}
                  subcategory={null}
                  node={child}
                  photos={photos}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </AccordionRow>
        );
      })}
    </div>
  );
}
```

**Step 3: `ElevatorFieldApp.jsx` — 데이터 연동**

- [ ] `app/components/ElevatorFieldApp.jsx` 9번째 줄, 기존:
```js
import { mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest, mapTodo, mapQuoteRequest, mapBilling, mapRestockRequest, mapFeedPost, mapUnit, mapKitStock, mapSelfCheck, mapAttendance, mapDutySchedule, mapDutySwap, mapErrorCode } from "@/lib/mappers";
```
변경 후(끝에 `mapUnitPartPhoto` 추가):
```js
import { mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest, mapTodo, mapQuoteRequest, mapBilling, mapRestockRequest, mapFeedPost, mapUnit, mapKitStock, mapSelfCheck, mapAttendance, mapDutySchedule, mapDutySwap, mapErrorCode, mapUnitPartPhoto } from "@/lib/mappers";
```

- [ ] 123번째 줄(`const [billings, setBillings] = useState([]);`) 바로 뒤에 추가:
```js
  const [unitPartPhotos, setUnitPartPhotos] = useState([]); // 호기별 부품현황 사진(1장=1행)
```

- [ ] 717~736번째 줄의 `Promise.all` 분해 배열, 기존 마지막 항목:
```js
        leaveRes,
      ] = await Promise.all([
```
변경 후(`leaveRes,` 다음 줄에 `unitPartPhotosRes,` 추가):
```js
        leaveRes,
        unitPartPhotosRes,
      ] = await Promise.all([
```

- [ ] 같은 `Promise.all([...])` 배열의 마지막 항목, 기존:
```js
        supabase.from("leaves").select("*").lte("start_date", TODAY_STR).gte("end_date", TODAY_STR),
      ]);
```
변경 후:
```js
        supabase.from("leaves").select("*").lte("start_date", TODAY_STR).gte("end_date", TODAY_STR),
        supabase.from("unit_part_photos").select("*"), // 테이블 없으면(마이그레이션 전) error → 빈 배열
      ]);
```

- [ ] `setBillings((billingsRes.data ?? []).map(mapBilling));` 줄(768번째) 바로 뒤에 추가:
```js
      setUnitPartPhotos((unitPartPhotosRes.data ?? []).map(mapUnitPartPhoto));
```

- [ ] `handleUpdateSiteAccessInfo` 함수(834~838번째 줄) 바로 뒤에 새 핸들러 2개 추가:
```js

  async function handleAddUnitPartPhoto({ unitId, category, subcategory, part, url }) {
    const { data, error } = await supabase
      .from("unit_part_photos")
      .insert({ unit_id: unitId, category, subcategory, part, url, uploaded_by: profile?.id })
      .select()
      .single();
    if (error) { alert("사진 저장 실패\n" + error.message); return; }
    setUnitPartPhotos((prev) => [...prev, mapUnitPartPhoto(data)]);
  }

  async function handleRemoveUnitPartPhoto(photoId) {
    if (!(await writeOk(supabase.from("unit_part_photos").delete().eq("id", photoId), "사진 삭제 실패"))) return;
    setUnitPartPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }
```

- [ ] 2320번째 줄, 기존:
```jsx
          {tab === "sites" && <SiteTab inspections={inspections} failures={failures} billings={billings} quoteRequests={quoteRequests} todos={todos} siteManagers={siteManagers} onUpdateSiteNotes={handleUpdateSiteNotes} onUpdateSiteAccessInfo={handleUpdateSiteAccessInfo} />}
```
변경 후:
```jsx
          {tab === "sites" && <SiteTab inspections={inspections} failures={failures} billings={billings} quoteRequests={quoteRequests} todos={todos} siteManagers={siteManagers} onUpdateSiteNotes={handleUpdateSiteNotes} onUpdateSiteAccessInfo={handleUpdateSiteAccessInfo} unitPartPhotos={unitPartPhotos} onAddUnitPartPhoto={handleAddUnitPartPhoto} onRemoveUnitPartPhoto={handleRemoveUnitPartPhoto} />}
```

**Step 4: `SiteTab.jsx` — 배선**

- [ ] `app/components/tabs/SiteTab.jsx` 1번째 줄, 기존:
```js
import React, { useState, useContext } from "react";
```
바로 뒤(2번째 줄 이전 import들 사이 아무 곳이나 좋음, 새 줄로) 추가:
```js
import { PartPhotosPanel } from "@/app/components/tabs/PartPhotosPanel";
```

- [ ] 16번째 줄, 기존:
```js
function ElevatorDetailScreen({ site, unit, subTab, setSubTab, failures, inspections, billings, quoteRequests, todos, onBack, onHome }) {
```
변경 후:
```js
function ElevatorDetailScreen({ site, unit, subTab, setSubTab, failures, inspections, billings, quoteRequests, todos, unitPartPhotos, onAddUnitPartPhoto, onRemoveUnitPartPhoto, onBack, onHome }) {
```

- [ ] 34~37번째 줄(`unitBillings`/`unitQuotes` 계산부) 바로 뒤에 추가:
```js
  const unitPhotos = (unitPartPhotos ?? []).filter((p) => p.unitId === realUnit?.id);
```

- [ ] 40번째 줄, 기존:
```js
  const elevatorSubTabs = ["정보", "고장", "검사", "부품교체내역", "견적내역"];
```
변경 후:
```js
  const elevatorSubTabs = ["정보", "고장", "검사", "부품교체내역", "부품현황", "견적내역"];
```

- [ ] "부품교체내역" 렌더 블록이 끝나는 220번째 줄(`);`) 바로 뒤, "견적내역" 렌더가
  시작되는 222번째 줄(`return (`) 앞에 새 분기 삽입:
```js

    if (tab === "부품현황") return (
      <PartPhotosPanel
        unitId={realUnit?.id}
        photos={unitPhotos}
        onAdd={onAddUnitPartPhoto}
        onRemove={onRemoveUnitPartPhoto}
      />
    );
```

- [ ] 617~630번째 줄, `<ElevatorDetailScreen .../>` 호출부 기존:
```jsx
      <ElevatorDetailScreen
        site={liveSelectedSite}
        unit={selectedUnit}
        subTab={elevatorSubTab}
        setSubTab={setElevatorSubTab}
        failures={failures}
        inspections={inspections}
        billings={billings}
        quoteRequests={quoteRequests}
        todos={todos}
        onBack={() => setView("site")}
        onHome={backToList}
      />
```
변경 후:
```jsx
      <ElevatorDetailScreen
        site={liveSelectedSite}
        unit={selectedUnit}
        subTab={elevatorSubTab}
        setSubTab={setElevatorSubTab}
        failures={failures}
        inspections={inspections}
        billings={billings}
        quoteRequests={quoteRequests}
        todos={todos}
        unitPartPhotos={unitPartPhotos}
        onAddUnitPartPhoto={onAddUnitPartPhoto}
        onRemoveUnitPartPhoto={onRemoveUnitPartPhoto}
        onBack={() => setView("site")}
        onHome={backToList}
      />
```

- [ ] 578번째 줄, `export function SiteTab(...)` 시그니처 기존:
```js
export function SiteTab({ inspections, failures, billings, quoteRequests, todos, siteManagers, onUpdateSiteNotes, onUpdateSiteAccessInfo }) {
```
변경 후:
```js
export function SiteTab({ inspections, failures, billings, quoteRequests, todos, siteManagers, onUpdateSiteNotes, onUpdateSiteAccessInfo, unitPartPhotos, onAddUnitPartPhoto, onRemoveUnitPartPhoto }) {
```

**Step 5: 두 폴더에 복사 + 마이그레이션 111 실행 안내**

- [ ] 프리뷰 폴더에 4개 파일 복사:
```bash
cp "C:/projects/elevator-field-app/lib/mappers.js" "C:/Users/crewj/OneDrive/바탕 화면/어플만들기 프로젝트/elevator-field-app/lib/mappers.js"
cp "C:/projects/elevator-field-app/app/components/tabs/PartPhotosPanel.jsx" "C:/Users/crewj/OneDrive/바탕 화면/어플만들기 프로젝트/elevator-field-app/app/components/tabs/PartPhotosPanel.jsx"
cp "C:/projects/elevator-field-app/app/components/ElevatorFieldApp.jsx" "C:/Users/crewj/OneDrive/바탕 화면/어플만들기 프로젝트/elevator-field-app/app/components/ElevatorFieldApp.jsx"
cp "C:/projects/elevator-field-app/app/components/tabs/SiteTab.jsx" "C:/Users/crewj/OneDrive/바탕 화면/어플만들기 프로젝트/elevator-field-app/app/components/tabs/SiteTab.jsx"
```

- [ ] **이 단계는 컨트롤러가 직접 확인한다(Supabase 대시보드 접근 필요) — 구현
  서브에이전트는 건드리지 않는다:** Task 1에서 만든
  `supabase/migrations/111_unit_part_photos_DRAFT.sql`을 Supabase SQL Editor에서
  실행해야 이 Task의 브라우저 확인이 된다. 실행 전이면 `unit_part_photos` 조회가
  에러 나서 `unitPartPhotos`가 빈 배열로만 채워지고(위 fetch의 주석과 동일한
  패턴), 부품현황 탭 자체는 뜨지만 사진 저장이 실패한다.

- [ ] **Step 6: 브라우저로 확인**

프리뷰에서 로그인 → 현장정보 → 임의 현장의 호기 하나 선택 → 승강기정보 →
"부품현황" 탭 탭. 대분류 7개(기계실/카 상부/카도어/승장도어/승강장/카 내부/승강로)가
아이콘 없이 뜨고, "기계실"을 펼치면 제어반/권상기/조속기(중분류, 자체 배지)와
비상통화장치(리프)가 보여야 한다. "제어반"을 펼치고 "PCB"를 탭해서 사진 하나
촬영/선택 → 저장되면 리프 배지가 "1장"으로, 제어반 배지가 오르고, 기계실 대분류
배지도 오르는지 확인. 다시 들어가서 방금 올린 사진이 그대로 남아있는지(새로고침
후에도) 확인.

- [ ] **Step 7: 커밋**

```bash
git add lib/mappers.js app/components/tabs/PartPhotosPanel.jsx app/components/ElevatorFieldApp.jsx app/components/tabs/SiteTab.jsx
git commit -m "feat: 부품현황 탭 — PartPhotosPanel 컴포넌트 + 데이터 연동 + SiteTab 배선"
```

---

## 최종 확인

- [ ] `npm run build`로 타입/구문 에러 없는지 확인 (Run: `npm run build`, 프로젝트
  루트 `C:/projects/elevator-field-app`에서 실행. Expected: 에러 없이 빌드 완료).
- [ ] 위 Task 4 Step 6의 브라우저 확인을 다시 한번 — 이번엔 마이그레이션 111이
  실제로 Supabase에 실행된 상태에서.
- [ ] `git log --oneline -6`으로 Task 1~4 커밋 4~5개가 순서대로 있는지 확인.
