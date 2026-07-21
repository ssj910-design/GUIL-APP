# 관리자웹 자재·견적 신청내역 처리 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자웹 "자재·견적 신청내역" 화면(`MaterialsAdmin.jsx`)에서 자재신청 지급완료, 견적요청 견적발행/승인/자재지급완료 처리를 할 수 있게 한다.

**Architecture:** `MaterialsAdmin.jsx`가 다른 관리자 화면(TodosAdmin 등)과 같은 관례로 `setData`를 직접 받아 supabase를 호출하고 로컬 상태를 갱신한다. 입력 없는 전환(견적발행·승인)은 목록 행의 버튼으로 즉시 처리하고, 입력이 필요한 전환(자재 지급완료, 견적 자재지급완료 — 사진·담당기사·금액)은 모달을 연다. DB 쓰기와 자동 할일(D+30) 생성 로직은 모바일 `ElevatorFieldApp.jsx`의 `handleSupplyComplete`/`handleAdvanceQuote`/`handleCompleteQuoteSupply`와 동일한 컬럼·상태값을 쓴다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, `@supabase/supabase-js` v2 (anon key, RLS 없음).

## Global Constraints

- 관리자 콘솔은 v2 네이티브다: `todos` insert에는 항상 `unit_id`/`assignee_id`를 채운다. 모바일의 `v2Ready`/`todoBillingReady` 조건부 분기는 쓰지 않는다 (스펙 "공통 요소" 절).
- 반려 처리·반려건 되돌리기는 이번 범위에서 제외한다 (기사 전용, 모바일에만 유지).
- 사진 첨부는 자재/견적 양쪽 모두 선택사항이다 (`required` 아님).
- 이 프로젝트에는 테스트 러너(jest/vitest)가 없다. 검증은 `npm run build` + 브라우저 수동 확인으로 한다 (기존 관례).
- 커밋 전 `npm run pull --rebase --autostash`로 동기화, 작업 단위마다 작게 커밋 후 즉시 push. `[deploy]`는 붙이지 않는다 (사용자가 배포를 요청할 때만).

---

### Task 1: 데이터 흐름 연결 + 자재신청 지급완료 처리

**Files:**
- Modify: `app/components/admin/AdminApp.jsx:136`
- Modify: `app/components/admin/MaterialsAdmin.jsx` (전체 — import, 컴포넌트 시그니처, 자재신청 표에 "처리" 열, 지급완료 모달)

**Interfaces:**
- Produces: `MaterialsAdmin`는 이제 `{ data, setData }`를 받는다. `setData`는 `AdminApp.jsx`의 `useState` setter — `(updater) => void` 형태로, `updater`는 `(prevData) => newData`.
- Produces: 내부 함수 `handleMaterialSupplyComplete(request, { assigneeId, billingPart, billingAmount, photoUrls })` — Task 2·3에서는 쓰지 않지만 이후 유지보수 시 참고할 시그니처.

- [ ] **Step 1: `AdminApp.jsx`에서 `setData`를 `MaterialsAdmin`에 전달**

`app/components/admin/AdminApp.jsx:136`의 다음 줄을:
```jsx
        ) : menu === "materials" ? (
          <MaterialsAdmin data={data} />
        ) : menu === "billings" ? (
```
다음으로 교체:
```jsx
        ) : menu === "materials" ? (
          <MaterialsAdmin data={data} setData={setData} />
        ) : menu === "billings" ? (
```

- [ ] **Step 2: `MaterialsAdmin.jsx` 전체를 아래 내용으로 교체**

`app/components/admin/MaterialsAdmin.jsx` 전체를 다음으로 교체한다 (기존 91줄 전체 대체 — 검색·필터 부분은 그대로 유지하고, import·시그니처·자재신청 표·모달만 추가):

```jsx
"use client";

// 자재·견적 처리 — 지급완료(자재)/견적발행·승인·자재지급완료(견적) 액션 포함.
// 입력이 필요 없는 전환(견적발행·승인)은 행에서 바로 처리하고, 사진·담당기사·금액처럼
// 입력이 필요한 전환(자재 지급완료, 견적 자재지급완료)만 모달을 쓴다 (하이브리드 설계 —
// docs/superpowers/specs/2026-07-21-materials-admin-actions-design.md).
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadPhoto } from "@/lib/photos";
import { unitIdFor, addDays } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { locOf, personOf, StatusBadge, AdminTable, FilterPills, inputCls, Modal } from "@/app/components/admin/adminShared";

const MATERIAL_TONE = { 승인대기: "blue", 지급완료: "green", 반려: "red" };
const QUOTE_TONE = { 요청접수: "blue", 견적발행: "amber", 승인: "amber", 자재지급완료: "green" };

export default function MaterialsAdmin({ data, setData }) {
  const { materialRequests: allMaterialRequests, quoteRequests: allQuoteRequests } = data;
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [payTarget, setPayTarget] = useState(null); // 지급완료 처리 중인 자재신청

  const query = search.trim();
  const materialRequests = allMaterialRequests.filter((m) =>
    !query || locOf(data, m.unitId, m.siteName, m.elevatorNo).includes(query) || (m.part ?? "").includes(query) || personOf(data, m.requesterId, m.engineer).includes(query)
  );
  const quoteRequests = allQuoteRequests.filter((q) =>
    !query || locOf(data, q.unitId, q.siteName, q.elevatorNo).includes(query) || (q.constructionType ?? "").includes(query) || personOf(data, q.requesterId, q.engineer).includes(query)
  );

  async function handleMaterialSupplyComplete(request, { assigneeId, billingPart, billingAmount, photoUrls }) {
    const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
    const assigneeName = engineer?.name ?? request.engineer;
    const patch = {
      status: "지급완료",
      supplied_date: TODAY_STR,
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("material_requests").update(patch).eq("id", request.id);
    if (error) { alert("지급완료 처리 실패: " + error.message); return; }

    const todoId = "todo-" + request.id;
    const dueDate = addDays(TODAY_STR, 30);
    const unitId = request.unitId ?? unitIdFor(data.units, request.siteId, request.elevatorNo);
    const todoRow = {
      id: todoId,
      material_request_id: request.id,
      source: "material",
      title: `${request.siteName} ${request.part} 교체 및 확인서 제출`,
      site_name: request.siteName,
      elevator_no: request.elevatorNo,
      part: request.part,
      assignee: assigneeName,
      assigned_date: TODAY_STR,
      due_date: dueDate,
      done: false,
      unit_id: unitId,
      assignee_id: assigneeId || null,
      billing_part: billingPart,
      billing_amount: billingAmount,
    };
    const { error: todoError } = await supabase.from("todos").insert(todoRow);
    if (todoError) { alert("할 일 생성 실패: " + todoError.message); return; }

    setData((prev) => ({
      ...prev,
      materialRequests: prev.materialRequests.map((r) =>
        r.id === request.id
          ? { ...r, status: "지급완료", suppliedDate: TODAY_STR, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls }
          : r
      ),
      todos: [
        {
          id: todoId, materialRequestId: request.id, quoteRequestId: null, source: "material", title: todoRow.title,
          siteName: request.siteName, elevatorNo: request.elevatorNo, part: request.part,
          assignee: assigneeName, assignedDate: TODAY_STR, dueDate, done: false,
          unitId, assigneeId: assigneeId || null, billingPart, billingAmount,
        },
        ...prev.todos,
      ],
    }));
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-4">자재·견적 신청내역</h1>
      <div className="flex items-center justify-between gap-3 mb-3">
        <FilterPills
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: "전체", count: allMaterialRequests.length + allQuoteRequests.length },
            { value: "material", label: "자재신청", count: allMaterialRequests.length },
            { value: "quote", label: "견적요청", count: allQuoteRequests.length },
          ]}
        />
        <div className="relative max-w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-8`} placeholder="현장·부품·기사명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {(tab === "material" || tab === "all") && (
        <>
        {tab === "all" && <h2 className="text-xs font-bold text-slate-400 mb-2">자재신청</h2>}
        <AdminTable head={["신청일", "현장 · 호기", "자재", "긴급도", "신청 기사", "지급사진", "상태", "처리"]}>
          {materialRequests.map((m) => (
            <tr key={m.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{m.requestedDate}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, m.unitId, m.siteName, m.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{m.part}</td>
              <td className="px-3 py-2.5">
                {m.urgency === "긴급" ? <StatusBadge tone="red">긴급</StatusBadge> : <span className="text-slate-500 text-xs">{m.urgency}</span>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, m.requesterId, m.engineer)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{m.supplyPhotoUrls?.length ? `${m.supplyPhotoUrls.length}장` : "-"}</td>
              <td className="px-3 py-2.5">
                <StatusBadge tone={MATERIAL_TONE[m.status] ?? "slate"}>{m.status}</StatusBadge>
                {m.status === "반려" && m.rejectReason && <p className="text-[10px] text-red-500 mt-1">{m.rejectReason}</p>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {m.status === "승인대기" ? (
                  <button onClick={() => setPayTarget(m)} className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                    지급완료 처리
                  </button>
                ) : (
                  <span className="text-xs text-slate-300">-</span>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
        </>
      )}

      {(tab === "quote" || tab === "all") && (
        <>
        {tab === "all" && <h2 className="text-xs font-bold text-slate-400 mb-2 mt-6">견적요청</h2>}
        <AdminTable head={["신청일", "현장 · 호기", "공사 내용", "신청 기사", "발행/승인/지급", "상태"]}>
          {quoteRequests.map((q) => (
            <tr key={q.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{q.requestedDate}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, q.unitId, q.siteName, q.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{q.constructionType}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, q.requesterId, q.engineer)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {q.quoteIssuedDate ?? "-"} / {q.approvedDate ?? "-"} / {q.suppliedDate ?? "-"}
              </td>
              <td className="px-3 py-2.5"><StatusBadge tone={QUOTE_TONE[q.status] ?? "slate"}>{q.status}</StatusBadge></td>
            </tr>
          ))}
        </AdminTable>
        </>
      )}
      <p className="text-[10px] text-slate-400 mt-2">* 반려 처리는 기사 전용 기능으로, 모바일 관리자 모드에서 진행합니다.</p>

      {payTarget && (
        <MaterialSupplyModal
          request={payTarget}
          profiles={data.profiles ?? []}
          onClose={() => setPayTarget(null)}
          onSubmit={async (input) => { await handleMaterialSupplyComplete(payTarget, input); setPayTarget(null); }}
        />
      )}
    </div>
  );
}

function MaterialSupplyModal({ request, profiles, onClose, onSubmit }) {
  const engineers = profiles.filter((p) => p.role === "engineer");
  const defaultAssigneeId = request.requesterId || engineers.find((p) => p.name === request.engineer)?.id || "";
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
  const [photos, setPhotos] = useState(request.supplyPhotoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amounts, setAmounts] = useState({});

  const parts = (request.part ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const total = parts.reduce((sum, _, i) => sum + (Number(amounts[i]) || 0), 0);
  const billingPartText = parts
    .map((part, i) => (amounts[i] ? `${part}(₩${Number(amounts[i]).toLocaleString()})` : part))
    .join(", ");

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, `materials/${request.id}/supply`)));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    setSaving(true);
    await onSubmit({ assigneeId, billingPart: billingPartText || null, billingAmount: total || null, photoUrls: photos });
    setSaving(false);
  }

  return (
    <Modal title={`${request.siteName ?? "-"} · ${request.part} — 지급완료 처리`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">지급 사진 (선택)</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {photos.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                <button
                  onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
            사진 추가
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">담당 기사</label>
          <select className={inputCls} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">담당자 선택 (기본 {request.engineer})</option>
            {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">부품별 금액</label>
          <div className="space-y-1.5">
            {parts.map((part, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs text-slate-700 flex-1 truncate">{part}</span>
                <input
                  type="number"
                  className={`${inputCls} w-28`}
                  placeholder="금액"
                  value={amounts[i] ?? ""}
                  onChange={(e) => setAmounts((m) => ({ ...m, [i]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {parts.length > 1 && <p className="text-[10px] text-slate-400 text-right mt-1">합계 ₩{total.toLocaleString()}</p>}
        </div>

        <button
          onClick={submit}
          disabled={saving || uploading}
          className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
        >
          {saving ? "처리 중..." : "지급완료 처리"}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: `✓ Compiled successfully` — 에러 없이 통과. (`profiles`/`role` 필드는 `AdminApp.jsx`가 `supabase.from("profiles").select("*")`를 그대로 저장하므로 타입 걱정 없음.)

- [ ] **Step 4: 브라우저 수동 검증**

1. `npm run dev` (이미 떠 있다면 생략) 후 `http://localhost:3000/admin` 접속
2. 왼쪽 메뉴 "자재·견적 신청내역" 클릭 → "자재신청" 탭에 "처리" 열이 추가돼 있는지 확인
3. 상태가 "승인대기"인 행에서 "지급완료 처리" 클릭 → 모달이 뜨는지 확인
4. 담당 기사 선택, 부품 금액 하나 입력 후 "지급완료 처리" 버튼 클릭
5. 모달이 닫히고 해당 행 상태가 "지급완료"로 바뀌는지 확인
6. 왼쪽 메뉴 "할 일 관리"로 이동 → 방금 처리한 건의 "OO 교체 및 확인서 제출" 할 일이 D+30 기한으로 생성됐는지 확인

- [ ] **Step 5: 커밋 및 push**

```bash
git add app/components/admin/AdminApp.jsx app/components/admin/MaterialsAdmin.jsx
git commit -m "feat: 관리자웹 자재신청 지급완료 처리 기능 추가"
git push
```

---

### Task 2: 견적요청 견적발행/승인 인라인 처리

**Files:**
- Modify: `app/components/admin/MaterialsAdmin.jsx` (Task 1 결과물 위에 추가 — `handleQuoteAdvance` 함수, 견적요청 표에 "처리" 열)

**Interfaces:**
- Consumes: Task 1의 `setData`, `data` (동일 컴포넌트 내부라 별도 import 불필요).
- Produces: `handleQuoteAdvance(quote)` — Task 3에서는 쓰지 않음(견적 자재지급완료는 별도 핸들러).

- [ ] **Step 1: `handleMaterialSupplyComplete` 함수 뒤에 `handleQuoteAdvance` 추가**

`app/components/admin/MaterialsAdmin.jsx`에서 `handleMaterialSupplyComplete` 함수가 끝나는 지점(Task 1에서 추가한 `}));\n  }` 다음, `return (` 이전)에 다음을 추가:

```jsx
  async function handleQuoteAdvance(quote) {
    const isIssue = quote.status === "요청접수";
    const patch = isIssue
      ? { status: "견적발행", quote_issued_date: TODAY_STR }
      : { status: "승인", approved_date: TODAY_STR };
    const { error } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (error) { alert("처리 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      quoteRequests: prev.quoteRequests.map((x) => {
        if (x.id !== quote.id) return x;
        return isIssue
          ? { ...x, status: "견적발행", quoteIssuedDate: TODAY_STR }
          : { ...x, status: "승인", approvedDate: TODAY_STR };
      }),
    }));
  }
```

- [ ] **Step 2: 견적요청 표에 "처리" 열 추가**

Task 1에서 만든 견적요청 `AdminTable` 블록을:
```jsx
        <AdminTable head={["신청일", "현장 · 호기", "공사 내용", "신청 기사", "발행/승인/지급", "상태"]}>
          {quoteRequests.map((q) => (
            <tr key={q.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{q.requestedDate}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, q.unitId, q.siteName, q.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{q.constructionType}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, q.requesterId, q.engineer)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {q.quoteIssuedDate ?? "-"} / {q.approvedDate ?? "-"} / {q.suppliedDate ?? "-"}
              </td>
              <td className="px-3 py-2.5"><StatusBadge tone={QUOTE_TONE[q.status] ?? "slate"}>{q.status}</StatusBadge></td>
            </tr>
          ))}
        </AdminTable>
```
다음으로 교체:
```jsx
        <AdminTable head={["신청일", "현장 · 호기", "공사 내용", "신청 기사", "발행/승인/지급", "상태", "처리"]}>
          {quoteRequests.map((q) => (
            <tr key={q.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{q.requestedDate}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, q.unitId, q.siteName, q.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{q.constructionType}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, q.requesterId, q.engineer)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {q.quoteIssuedDate ?? "-"} / {q.approvedDate ?? "-"} / {q.suppliedDate ?? "-"}
              </td>
              <td className="px-3 py-2.5"><StatusBadge tone={QUOTE_TONE[q.status] ?? "slate"}>{q.status}</StatusBadge></td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {q.status === "요청접수" && (
                  <button onClick={() => handleQuoteAdvance(q)} className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                    견적발행 처리
                  </button>
                )}
                {q.status === "견적발행" && (
                  <button onClick={() => handleQuoteAdvance(q)} className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg">
                    승인 처리
                  </button>
                )}
                {q.status === "승인" && (
                  <button onClick={() => setQuoteSupplyTarget(q)} className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                    지급완료 처리
                  </button>
                )}
                {q.status === "자재지급완료" && <span className="text-xs text-slate-300">-</span>}
              </td>
            </tr>
          ))}
        </AdminTable>
```

- [ ] **Step 3: `quoteSupplyTarget` state 선언 추가 (Task 3에서 모달을 붙이기 위한 자리, 지금은 setter만 사용)**

Task 1에서 추가한 `const [payTarget, setPayTarget] = useState(null);` 바로 아래 줄에 추가:
```jsx
  const [quoteSupplyTarget, setQuoteSupplyTarget] = useState(null); // 자재지급완료 처리 중인 견적요청
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: `✓ Compiled successfully`. (`quoteSupplyTarget`는 Task 3 전까지 아직 아무 데도 렌더링에 안 쓰여 lint가 "assigned but never used"를 낼 수 있음 — 나면 Step 2에서 만든 버튼 `onClick={() => setQuoteSupplyTarget(q)}`가 이미 setter를 쓰고 있으므로 실제로는 에러 없음.)

- [ ] **Step 5: 브라우저 수동 검증**

1. `http://localhost:3000/admin` → "자재·견적 신청내역" → "견적요청" 탭
2. 상태 "요청접수"인 행에서 "견적발행 처리" 클릭 → 즉시 상태가 "견적발행"으로 바뀌고 발행일이 오늘 날짜로 채워지는지 확인
3. 같은 행에서 이제 "승인 처리" 버튼이 보이는지 확인 → 클릭 → 상태 "승인"으로 변경, 승인일 채워짐 확인
4. "승인" 상태 행에서 "지급완료 처리" 버튼이 보이는지만 확인 (클릭 동작은 Task 3에서 검증)

- [ ] **Step 6: 커밋 및 push**

```bash
git add app/components/admin/MaterialsAdmin.jsx
git commit -m "feat: 관리자웹 견적요청 견적발행·승인 인라인 처리 추가"
git push
```

---

### Task 3: 견적요청 자재지급완료 모달

**Files:**
- Modify: `app/components/admin/MaterialsAdmin.jsx` (Task 1·2 결과물 위에 추가 — `handleQuoteSupplyComplete` 함수, `QuoteSupplyModal` 컴포넌트, 모달 렌더링)

**Interfaces:**
- Consumes: Task 2의 `quoteSupplyTarget`/`setQuoteSupplyTarget`, `data`, `setData`, `unitIdFor`, `addDays`, `TODAY_STR`, `uploadPhoto`, `Modal`, `inputCls` (모두 이미 import/선언됨).
- Produces: `handleQuoteSupplyComplete(quote, { assigneeIds, photoUrls })`.

- [ ] **Step 1: `handleQuoteAdvance` 함수 뒤에 `handleQuoteSupplyComplete` 추가**

`handleQuoteAdvance` 함수가 끝나는 지점(`return (` 이전)에 추가:

```jsx
  async function handleQuoteSupplyComplete(quote, { assigneeIds, photoUrls }) {
    const patch = {
      status: "자재지급완료",
      supplied_date: TODAY_STR,
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (error) { alert("자재지급완료 처리 실패: " + error.message); return; }

    const unitId = quote.unitId ?? unitIdFor(data.units, quote.siteId, quote.elevatorNo);
    const dueDate = addDays(TODAY_STR, 30);
    const newTodos = assigneeIds.map((assigneeId, idx) => {
      const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
      return {
        id: `todo-quote-${quote.id}-${idx}`,
        quoteRequestId: quote.id,
        materialRequestId: null,
        source: "quote",
        title: `${quote.siteName} ${quote.constructionType} 시공 확인 및 서류 제출`,
        siteName: quote.siteName,
        elevatorNo: quote.elevatorNo,
        part: quote.constructionType,
        assignee: engineer?.name ?? quote.engineer,
        assignedDate: TODAY_STR,
        dueDate,
        done: false,
        unitId,
        assigneeId,
      };
    });
    const { error: todoError } = await supabase.from("todos").insert(
      newTodos.map((t) => ({
        id: t.id, quote_request_id: t.quoteRequestId, source: t.source, title: t.title,
        site_name: t.siteName, elevator_no: t.elevatorNo, part: t.part,
        assignee: t.assignee, assigned_date: t.assignedDate, due_date: t.dueDate, done: t.done,
        unit_id: t.unitId, assignee_id: t.assigneeId,
      }))
    );
    if (todoError) { alert("할 일 생성 실패: " + todoError.message); return; }

    setData((prev) => ({
      ...prev,
      quoteRequests: prev.quoteRequests.map((x) =>
        x.id === quote.id
          ? { ...x, status: "자재지급완료", suppliedDate: TODAY_STR, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls }
          : x
      ),
      todos: [...newTodos, ...prev.todos],
    }));
  }
```

- [ ] **Step 2: 모달 렌더링 추가**

Task 1에서 추가한 아래 블록:
```jsx
      {payTarget && (
        <MaterialSupplyModal
          request={payTarget}
          profiles={data.profiles ?? []}
          onClose={() => setPayTarget(null)}
          onSubmit={async (input) => { await handleMaterialSupplyComplete(payTarget, input); setPayTarget(null); }}
        />
      )}
    </div>
  );
}
```
다음으로 교체:
```jsx
      {payTarget && (
        <MaterialSupplyModal
          request={payTarget}
          profiles={data.profiles ?? []}
          onClose={() => setPayTarget(null)}
          onSubmit={async (input) => { await handleMaterialSupplyComplete(payTarget, input); setPayTarget(null); }}
        />
      )}

      {quoteSupplyTarget && (
        <QuoteSupplyModal
          quote={quoteSupplyTarget}
          profiles={data.profiles ?? []}
          onClose={() => setQuoteSupplyTarget(null)}
          onSubmit={async (input) => { await handleQuoteSupplyComplete(quoteSupplyTarget, input); setQuoteSupplyTarget(null); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: `QuoteSupplyModal` 컴포넌트를 파일 맨 끝에 추가**

`MaterialSupplyModal` 함수 정의 뒤(파일 맨 끝)에 추가:

```jsx
function QuoteSupplyModal({ quote, profiles, onClose, onSubmit }) {
  const engineers = profiles.filter((p) => p.role === "engineer");
  const defaultId = engineers.find((p) => p.name === quote.engineer)?.id;
  const [assigneeIds, setAssigneeIds] = useState(defaultId ? [defaultId] : []);
  const [photos, setPhotos] = useState(quote.supplyPhotoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggle(id) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, `quotes/${quote.id}/supply`)));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    if (assigneeIds.length === 0) return;
    setSaving(true);
    await onSubmit({ assigneeIds, photoUrls: photos });
    setSaving(false);
  }

  return (
    <Modal title={`${quote.siteName ?? "-"} · ${quote.constructionType} — 자재지급완료 처리`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">지급 사진 (선택)</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {photos.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                <button
                  onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
            사진 추가
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">담당 기사 (2명 이상 가능)</label>
          <div className="space-y-1">
            {engineers.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={assigneeIds.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
          {assigneeIds.length === 0 && <p className="text-[10px] text-red-500 mt-1">담당 기사를 1명 이상 선택해주세요</p>}
        </div>

        <button
          onClick={submit}
          disabled={saving || uploading || assigneeIds.length === 0}
          className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
        >
          {saving ? "처리 중..." : "자재 지급 완료 체크"}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: 브라우저 수동 검증 (전체 종단 테스트)**

1. `http://localhost:3000/admin` → "자재·견적 신청내역" → "견적요청" 탭
2. "승인" 상태인 행에서 "지급완료 처리" 클릭 → 모달이 뜨는지 확인
3. 담당 기사 체크박스에 기본으로 신청 기사가 체크돼 있는지 확인, 필요시 2명 이상 체크
4. "자재 지급 완료 체크" 클릭 → 모달 닫히고 상태가 "자재지급완료"로 바뀌는지, 지급일이 채워지는지 확인
5. "할 일 관리"로 이동 → 체크한 담당 기사 수만큼 "OO 시공 확인 및 서류 제출" 할 일이 각각 D+30 기한으로 생성됐는지 확인
6. 담당 기사 체크를 전부 해제한 상태에서 "자재 지급 완료 체크" 버튼이 비활성화되는지 확인 (0명 선택 시 처리 막힘)

- [ ] **Step 6: 커밋 및 push**

```bash
git add app/components/admin/MaterialsAdmin.jsx
git commit -m "feat: 관리자웹 견적요청 자재지급완료 모달 처리 추가"
git push
```
