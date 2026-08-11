# 관리자 모드 폰앱 — 견적관리·새견적작성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 폰 앱(`ElevatorFieldApp.jsx`의 관리자 모드, `AdminTab.jsx`)에서 실제 품목·금액이 담긴
견적서(PDF)를 직접 작성·발행할 수 있게 한다 — 지금은 "견적발행 처리" 버튼이 상태 라벨만 바꿀 뿐
진짜 견적서를 만들지 못한다.

**Architecture:** `AdminTab.jsx`의 "견적요청관리" 아코디언을 "견적관리"라는 이름의 전체화면
(`page` state)으로 바꾸고, 그 안에 새 컴포넌트 `QuoteWizard.jsx`(고장접수와 같은 스텝형 UI: 현장·담당자
선택 → 품목 입력(아코디언 카드) → 부대비용 → 확인·발행)를 추가한다. PDF 생성은 기존
`/api/generate-quote-pdf`를, 저장은 기존 `quote_requests` 테이블·컬럼을 그대로 재사용한다 — 새
API·새 컬럼·새 마이그레이션이 없다.

**Tech Stack:** 기존 Next.js/React/Supabase 그대로. 새 의존성 없음.

## Global Constraints

- 데스크탑 관리자웹(`MaterialsAdmin.jsx`, `QuoteItemsModal.jsx`)은 손대지 않는다.
- `quote_requests` 테이블에 새 컬럼을 추가하지 않는다 — 기존 컬럼(`quote_items`, `transport_cost`,
  `safety_cost`, `profit`, `recipient_name/email/phone`, `quote_number`, `quote_title`,
  `quote_issued_date`, `quote_pdf_url`, `status`)만 쓴다.
- 빈 초안 insert shape은 데스크탑 `MaterialsAdmin.jsx`의 `handleCreateQuote`(503-526행)와 동일하게
  맞춘다: `construction_type: "관리자 발행"`, `requester_id`/`engineer` 둘 다 null, `created_by`는
  추가하지 않는다(데스크탑과 일관성 유지).
- 빈 초안 정리 조건은 데스크탑 `MaterialsAdmin.jsx`(761-786행)와 동일: `status === "요청접수"` AND
  `requester_id`/`engineer` 둘 다 null일 때만 삭제.
- PDF 생성은 기존 `/api/generate-quote-pdf`를 그대로 호출한다(새 라우트 금지) — 이 라우트에 인증
  가드가 없는 건 이미 별도 후속 작업으로 분리했다(이 계획의 범위 밖).
- `자재담당관리자`(`adminTier === "material"`)에게는 지금처럼 견적관리 메뉴 전체가 안 보인다
  (`AdminTab.jsx`의 `isMaterialTier` 조건 그대로 유지).
- 화면 톤은 기존 `AdminTab.jsx`/`FailureTab.jsx`의 Tailwind 컨벤션을 그대로 따른다: 카드
  `bg-white rounded-xl border border-slate-200`, 기본 버튼 `bg-blue-700 text-white`, 입력칸은
  `inputCls`(`@/app/components/admin/adminShared` 또는 `@/app/components/ui`에서 import).

---

### Task 1: 견적관리 화면 — 아코디언에서 전체화면으로 전환 + 메뉴명 변경

**Files:**
- Modify: `app/components/tabs/AdminTab.jsx`

**Interfaces:**
- Consumes: 없음(기존 `QuotesPanel`, `DrillHeader` 그대로 재사용)
- Produces: `page === "quoteManagement"` 분기 — Task 2가 여기에 `[+ 새 견적 작성]` 버튼을 추가한다.

- [ ] **Step 1: `AdminTab.jsx` 상단 import에 `DrillHeader` 있는지 확인**

이미 3행에 `import { Badge, PhotoThumb, PhotoGrid, PrimaryButton, Sheet, Field, inputCls, DrillHeader } from "@/app/components/ui";`로 들어있음 — 추가 작업 없음.

- [ ] **Step 2: `page` state에 새 값 추가 + focusId 딥링크 유지용 effect 추가**

`AdminTab.jsx` 929행:
```js
  const [page, setPage] = useState(null); // null | "billing" | "materialHistory" | "quoteHistory"
```
다음으로 교체:
```js
  const [page, setPage] = useState(null); // null | "billing" | "materialHistory" | "quoteHistory" | "quoteManagement" | "quoteWizard"
```

933-934행:
```js
  const materialsOpen = expanded === "materials" || Boolean(materialFocusId);
  const quotesOpen = expanded === "quotes" || Boolean(quoteFocusId);
```
다음으로 교체(더 이상 아코디언이 아니므로 `quotesOpen` 대신 딥링크 시 전체화면으로 바로 이동):
```js
  const materialsOpen = expanded === "materials" || Boolean(materialFocusId);

  useEffect(() => {
    if (quoteFocusId) setPage("quoteManagement");
  }, [quoteFocusId]);
```

- [ ] **Step 3: `page === "quoteManagement"` 분기 추가**

963-975행(`if (page === "quoteHistory") { ... }` 블록) 바로 뒤에 추가:
```js
  if (page === "quoteManagement") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <DrillHeader title="견적관리" onBack={() => setPage(null)} onHome={() => setPage(null)} />
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
          <QuotesPanel
            active={quoteActive}
            completedCount={completed.length}
            engineerNames={engineerNames}
            onAdvanceQuote={onAdvanceQuote}
            onCompleteQuoteSupply={onCompleteQuoteSupply}
            onAttachQuotePhoto={onAttachQuotePhoto}
            onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
            onOpenHistory={() => setPage("quoteHistory")}
            focusId={quoteFocusId}
            onFocusHandled={onQuoteFocusHandled}
          />
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: 기존 "견적 요청 관리" 아코디언 행을 "견적관리" 이동 버튼으로 교체**

1017-1032행:
```jsx
          {!isMaterialTier && (
            <AccordionRow icon={FileText} label="견적 요청 관리" badge={quoteActive.length} open={quotesOpen} onToggle={() => toggle("quotes")}>
              <QuotesPanel
                active={quoteActive}
                completedCount={completed.length}
                engineerNames={engineerNames}
                onAdvanceQuote={onAdvanceQuote}
                onCompleteQuoteSupply={onCompleteQuoteSupply}
                onAttachQuotePhoto={onAttachQuotePhoto}
                onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
                onOpenHistory={() => setPage("quoteHistory")}
                focusId={quoteFocusId}
                onFocusHandled={onQuoteFocusHandled}
              />
            </AccordionRow>
          )}
```
다음으로 교체:
```jsx
          {!isMaterialTier && (
            <button onClick={() => setPage("quoteManagement")} className="w-full flex items-center justify-between px-4 py-3.5 active:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <FileText size={15} className="text-slate-600" />
                </div>
                <span className="text-sm font-bold text-slate-800">견적관리</span>
              </div>
              <div className="flex items-center gap-1.5">
                {quoteActive.length > 0 && <span className="text-[11px] font-bold text-white bg-blue-700 px-2 py-0.5 rounded-full">{quoteActive.length}</span>}
                <ChevronRight size={16} className="text-slate-400" />
              </div>
            </button>
          )}
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과. (`quotesOpen`을 지웠으니 미사용 변수 경고가 없는지도 같이 확인.)

- [ ] **Step 6: 브라우저로 확인**

관리자 계정으로 네이티브 모드(또는 `?stay`로 리다이렉트 우회) 접속 → 관리자 모드 진입 → "견적관리" 행
탭 → 전체화면으로 기존 견적요청 목록이 뜨는지, 뒤로가기가 되는지, 배지 숫자가 이전 아코디언과
같은지 확인.

- [ ] **Step 7: 커밋**

```bash
git add app/components/tabs/AdminTab.jsx
git commit -m "feat: 관리자 모드 폰앱 - 견적요청관리를 견적관리 전체화면으로 전환"
```

---

### Task 2: 새 견적 작성 마법사 뼈대 — 현장·담당자 선택 단계 + 진입점 연결

**Files:**
- Create: `app/components/tabs/QuoteWizard.jsx`
- Modify: `app/components/tabs/AdminTab.jsx`
- Modify: `app/components/ElevatorFieldApp.jsx`

**Interfaces:**
- Produces: `QuoteWizard({ existingQuote, onClose, onDraftCreated, onDiscarded, onSaved })` — Task 3·4·5가
  이 파일에 계속 이어서 단계를 추가한다. `existingQuote`는 `null`(새 견적) 또는
  `lib/mappers.js`의 `mapQuoteRequest` shape 객체(기존 요청에서 이어감).
- Consumes: `SitesContext`(`@/app/components/context`), `SiteSearchSelect`(`@/app/components/formWidgets`),
  `mapSiteManager`(`@/lib/mappers`), `supabase`(`@/lib/supabaseClient`), `TODAY_STR`(`@/lib/constants`).

- [ ] **Step 1: `QuoteWizard.jsx` 생성 — 스텝 뼈대 + 1단계(현장·담당자)**

```jsx
"use client";

// 관리자 모드 폰앱 — 새 견적서 작성 마법사. 고장접수(FailureTab.jsx)와 같은 스텝형 UI를 쓴다.
// existingQuote가 있으면(기사 요청에서 이어감) 1단계(현장 선택)를 건너뛰고 2단계(품목 입력)부터
// 시작한다 — 새 초안을 만들지 않고 그 요청 행을 그대로 쓴다.
import { useState, useContext, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { SitesContext } from "@/app/components/context";
import { SiteSearchSelect } from "@/app/components/formWidgets";
import { inputCls } from "@/app/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { mapSiteManager } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";

const STEP_TITLES = ["현장·담당자", "품목 입력", "부대비용", "확인·발행"];

export default function QuoteWizard({ existingQuote, onClose, onDraftCreated, onDiscarded, onSaved }) {
  const sites = useContext(SitesContext);
  const [step, setStep] = useState(existingQuote ? 1 : 0);
  const [siteId, setSiteId] = useState(existingQuote?.siteId ?? "");
  const [siteManagers, setSiteManagers] = useState([]);
  const [managerId, setManagerId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState(existingQuote?.contactPhone ?? "");
  // 새 견적(요청 없이 시작)은 1단계를 넘어갈 때 빈 초안을 만든다 — 기존 요청에서 이어가면 그
  // 요청 행을 그대로 쓰므로 draft가 필요 없다.
  const [draft, setDraft] = useState(existingQuote ?? null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const site = sites.find((s) => s.id === siteId);

  useEffect(() => {
    if (!siteId) { setSiteManagers([]); return; }
    let alive = true;
    supabase.from("site_managers").select("*").eq("site_id", siteId).then(({ data }) => {
      if (!alive) return;
      const mapped = (data ?? []).map(mapSiteManager);
      setSiteManagers(mapped);
      const primary = mapped.find((m) => m.isPrimary) ?? mapped[0];
      if (primary) {
        setManagerId(primary.id);
        setRecipientEmail(primary.email || "");
        setRecipientPhone(primary.phone || "");
      }
    });
    return () => { alive = false; };
  }, [siteId]);

  function selectManager(id) {
    setManagerId(id);
    const m = siteManagers.find((x) => x.id === id);
    if (m) { setRecipientEmail(m.email || ""); setRecipientPhone(m.phone || ""); }
  }

  async function handleCancel() {
    // 새 초안을 실제로 만든 뒤(2단계 이상 진행)에만 정리 대상 — 기존 요청에서 이어간 경우
    // (existingQuote 있음)는 그 행을 지우면 안 된다(요청자 정보가 있어 애초에 조건도 안 맞음).
    if (draft && !existingQuote && draft.status === "요청접수" && !draft.requesterId && !draft.engineer) {
      await supabase.from("quote_requests").delete().eq("id", draft.id);
      onDiscarded?.(draft.id);
    }
    onClose();
  }

  async function handleNextFromStep0() {
    if (!site) return;
    setCreating(true);
    setError("");
    const row = {
      id: "q" + Date.now(),
      site_id: site.id,
      site_name: site.name,
      elevator_no: null,
      unit_id: null,
      construction_type: "관리자 발행",
      contact_phone: null,
      note: null,
      engineer: null,
      requester_id: null,
      requested_date: TODAY_STR,
      status: "요청접수",
    };
    const { error: insertError } = await supabase.from("quote_requests").insert(row);
    setCreating(false);
    if (insertError) { setError("초안 생성 실패: " + insertError.message); return; }
    const created = { id: row.id, siteId: site.id, siteName: site.name, status: "요청접수", requesterId: null, engineer: null };
    setDraft(created);
    onDraftCreated?.(created);
    setStep(1);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="shrink-0 px-5 pt-4 pb-3 bg-white border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          {STEP_TITLES.map((t, i) => (
            <div key={t} className={`flex-1 h-1 rounded-full ${i <= step ? "bg-blue-600" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-sm font-extrabold text-slate-800 mt-2.5">{step + 1}. {STEP_TITLES[step]}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24 space-y-4">
        {step === 0 && (
          <>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">현장명 *</p>
              <SiteSearchSelect value={siteId} onChange={setSiteId} placeholder="현장명 검색" />
            </div>
            {site && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1.5">수신 담당자</p>
                {siteManagers.length === 0 ? (
                  <p className="text-xs text-slate-400">등록된 담당자가 없습니다 — 이메일·전화번호를 직접 입력하세요.</p>
                ) : (
                  <select className={inputCls} value={managerId} onChange={(e) => selectManager(e.target.value)}>
                    {siteManagers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}{m.isPrimary ? " (대표)" : ""}</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input className={inputCls} placeholder="이메일" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
                  <input className={inputCls} placeholder="전화번호" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
                </div>
              </div>
            )}
          </>
        )}

        {/* step 1(품목 입력)은 Task 3, step 2(부대비용)는 Task 4, step 3(확인·발행)은 Task 5에서 추가 */}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="shrink-0 px-5 py-3 bg-white border-t border-slate-100 flex gap-2">
        <button onClick={handleCancel} className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">
          {step === 0 ? "취소" : "그만두기"}
        </button>
        {step === 0 && (
          <button
            onClick={handleNextFromStep0}
            disabled={!site || creating}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 flex items-center justify-center gap-1"
          >
            {creating ? "만드는 중..." : <>다음 <ChevronRight size={14} /></>}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과(아직 어디서도 import 안 하므로 dead code지만 컴파일은 돼야 함).

- [ ] **Step 3: `AdminTab.jsx`에 진입점 연결**

**3-1.** 상단 import에 추가(9행 `BillingHistoryScreen` import 다음 줄):
```js
import QuoteWizard from "@/app/components/tabs/QuoteWizard";
```

**3-2.** `AdminTab` 함수 시그니처(918행)에 새 props 추가:
```js
export function AdminTab({ materialRequests, billings, quoteRequests, restockRequests, todos, onSupplyComplete, onSupplyEdit, onReprocess, onAttachPhoto, onRemoveSupplyPhoto, onAdvanceQuote, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onCompleteQuoteSupply, onQuoteSupplyEdit, onAttachRestockPhoto, onRemoveRestockSupplyPhoto, onCompleteRestock, onReassignTodo, onClearReassignRequest, onResetEngineerPassword, materialFocusId, onMaterialFocusHandled, quoteFocusId, onQuoteFocusHandled, onQuoteDraftCreated, onQuoteDiscarded, onQuoteWizardSaved }) {
```
(끝에 `onQuoteDraftCreated, onQuoteDiscarded, onQuoteWizardSaved` 3개만 추가.)

**3-3.** `wizardTarget` state 추가 — Task 1에서 만든 `page` state 선언 바로 아래:
```js
  const [wizardTarget, setWizardTarget] = useState(null); // null = 새 견적, quote 객체 = 기존 요청에서 이어감
```

**3-4.** `page === "quoteWizard"` 분기 추가 — Task 1에서 만든 `page === "quoteManagement"` 블록 바로 뒤에:
```js
  if (page === "quoteWizard") {
    return (
      <QuoteWizard
        existingQuote={wizardTarget}
        onDraftCreated={onQuoteDraftCreated}
        onDiscarded={onQuoteDiscarded}
        onSaved={(patch) => { onQuoteWizardSaved(patch); setPage("quoteManagement"); setWizardTarget(null); }}
        onClose={() => { setPage("quoteManagement"); setWizardTarget(null); }}
      />
    );
  }
```

**3-5.** `page === "quoteManagement"` 블록(Task 1에서 만든) 안, `<QuotesPanel ... />` 바로 앞에 새
견적 작성 버튼 추가:
```jsx
          <button
            onClick={() => { setWizardTarget(null); setPage("quoteWizard"); }}
            className="w-full mb-3 py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-700 text-sm font-bold"
          >
            + 새 견적 작성
          </button>
```

**3-6.** `QuotesPanel`에 `onOpenWizard` prop 전달 — Task 1에서 만든 `<QuotesPanel ...>` 호출(두 곳:
`page === "quoteManagement"` 블록 안 하나뿐, Task 1에서 아코디언 안쪽 호출은 이미 삭제됐음)에
`onOpenWizard={(q) => { setWizardTarget(q); setPage("quoteWizard"); }}` 추가:
```jsx
          <QuotesPanel
            active={quoteActive}
            completedCount={completed.length}
            engineerNames={engineerNames}
            onAdvanceQuote={onAdvanceQuote}
            onOpenWizard={(q) => { setWizardTarget(q); setPage("quoteWizard"); }}
            onCompleteQuoteSupply={onCompleteQuoteSupply}
            onAttachQuotePhoto={onAttachQuotePhoto}
            onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
            onOpenHistory={() => setPage("quoteHistory")}
            focusId={quoteFocusId}
            onFocusHandled={onQuoteFocusHandled}
          />
```

- [ ] **Step 4: `QuotesPanel`/`QuotePendingCard` — "요청접수" 카드가 라벨만 바꾸지 않고 마법사를 열게 변경**

**4-1.** `QuotesPanel` 함수 시그니처(453행)에 `onOpenWizard` 추가:
```js
function QuotesPanel({ active, completedCount, engineerNames, onAdvanceQuote, onOpenWizard, onCompleteQuoteSupply, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onOpenHistory, focusId, onFocusHandled }) {
```
그리고 462-471행 `<QuotePendingCard ... />` 호출에 `onOpenWizard={onOpenWizard}` 추가:
```jsx
          <QuotePendingCard
            q={q}
            engineerNames={engineerNames}
            onAdvanceQuote={onAdvanceQuote}
            onOpenWizard={onOpenWizard}
            onCompleteQuoteSupply={onCompleteQuoteSupply}
            onAttachQuotePhoto={onAttachQuotePhoto}
            onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
            onOpenDetail={setDetail}
          />
```

**4-2.** `QuotePendingCard` 함수 시그니처(240행)에 `onOpenWizard` 추가:
```js
function QuotePendingCard({ q, engineerNames, onAdvanceQuote, onOpenWizard, onCompleteQuoteSupply, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onOpenDetail }) {
```

**4-3.** 257-258행 "요청접수" 상태 버튼 교체:
```jsx
      {q.status === "요청접수" && (
        <button onClick={() => onAdvanceQuote(q.id)} className="w-full mt-2.5 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800">견적발행 처리</button>
      )}
```
다음으로 교체:
```jsx
      {q.status === "요청접수" && (
        <button onClick={() => onOpenWizard(q)} className="w-full mt-2.5 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800">견적서 작성</button>
      )}
```
(`onAdvanceQuote`는 260-262행의 "견적발행"→"승인 처리" 전환에서 계속 쓰이므로 그대로 둔다 — 이미
PDF가 있는 건이라 라벨만 바꾸는 게 맞다.)

- [ ] **Step 5: `ElevatorFieldApp.jsx`에 새 핸들러 3개 추가 + `AdminTab`에 전달**

**5-1.** `handleAdvanceQuote` 함수(약 1592행) 바로 앞에 추가:
```js
  // 마법사가 새 초안을 만들면(1단계 완료 시) 로컬 목록에도 즉시 반영 — 안 그러면 같은 마법사
  // 안에서 뒤로가기/취소로 그 초안을 다시 찾을 때(예: 재진입) 목록에 없어 보인다.
  function handleQuoteDraftCreated(row) {
    setQuoteRequests((prev) => [{ ...row, quoteItems: [], transportCost: 0, safetyCost: 0, profit: 0 }, ...prev]);
  }
  // 마법사를 취소해서 빈 초안이 삭제되면 로컬 목록에서도 제거.
  function handleQuoteDiscarded(id) {
    setQuoteRequests((prev) => prev.filter((q) => q.id !== id));
  }
  // 마법사에서 발행 완료(품목·PDF까지 다 저장)되면 그 건을 patch로 덮어쓴다 — 기존
  // 요청에서 이어간 경우도, 새로 만든 초안도 같은 방식으로 반영된다.
  function handleQuoteWizardSaved(patch) {
    setQuoteRequests((prev) => prev.map((q) => (q.id === patch.id ? { ...q, ...patch } : q)));
  }
```

**5-2.** `<AdminTab ... />` 렌더 호출부(grep으로 위치 확인: `<AdminTab`)에 props 3개 추가:
```jsx
            onQuoteDraftCreated={handleQuoteDraftCreated}
            onQuoteDiscarded={handleQuoteDiscarded}
            onQuoteWizardSaved={handleQuoteWizardSaved}
```

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 7: 브라우저로 확인**

- "견적관리" 화면에서 `[+ 새 견적 작성]` 탭 → 현장 검색해서 하나 고름 → 담당자 드롭다운에 그
  현장 담당자들이 뜨는지, 대표 담당자가 기본 선택돼 있는지 확인 → `[다음]` → 아직 2단계는
  없으니(Task 3에서 추가) 빈 화면이어도 정상. `[그만두기]`를 눌러 빠져나가면 방금 만든 빈 초안이
  "견적관리" 목록에서도 사라지는지(삭제됐는지) 확인.
- "요청접수" 상태 기존 요청 카드에서 `[견적서 작성]` 탭 → 1단계 없이 바로(향후 2단계로) 넘어가는지
  확인.

- [ ] **Step 8: 커밋**

```bash
git add app/components/tabs/QuoteWizard.jsx app/components/tabs/AdminTab.jsx app/components/ElevatorFieldApp.jsx
git commit -m "feat: 새 견적 작성 마법사 뼈대 - 현장/담당자 선택 단계 + 진입점 연결"
```

---

### Task 3: 품목 입력 단계 — 아코디언 카드

**Files:**
- Modify: `app/components/tabs/QuoteWizard.jsx`

**Interfaces:**
- Consumes: Task 2의 `draft`(quote_requests id), `step` state.
- Produces: `items` state(shape `{category, name, spec, unit, qty, unitPrice, unitNo}[]`) — Task 4·5가
  합계 계산에 쓴다.

- [ ] **Step 1: 품목 상태·계산 함수 추가**

`QuoteWizard.jsx`의 `const [error, setError] = useState("");` 바로 뒤에 추가:
```js
  const [items, setItems] = useState(() =>
    existingQuote?.constructionType ? [{ category: "자재비", name: existingQuote.constructionType, spec: "", unit: "EA", qty: 1, unitPrice: 0, unitNo: "" }] : []
  );
  const [expandedIdx, setExpandedIdx] = useState(0);

  function addItem() {
    setItems((prev) => {
      const next = [...prev, { category: "자재비", name: "", spec: "", unit: "EA", qty: 1, unitPrice: 0, unitNo: "" }];
      setExpandedIdx(next.length - 1);
      return next;
    });
  }
  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx(-1);
  }
  const itemsSubtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
```

- [ ] **Step 2: 2단계(품목 입력) JSX 추가**

`{/* step 1(품목 입력)은 Task 3, step 2(부대비용)는 Task 4, step 3(확인·발행)은 Task 5에서 추가 */}`
줄을 다음으로 교체:
```jsx
        {step === 1 && (
          <>
            {items.map((it, idx) => {
              const expanded = idx === expandedIdx;
              const lineTotal = Number(it.qty || 0) * Number(it.unitPrice || 0);
              return (
                <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {!expanded ? (
                    <button onClick={() => setExpandedIdx(idx)} className="w-full flex items-center justify-between px-3.5 py-3 text-left">
                      <span className="text-sm font-semibold text-slate-700 truncate">
                        {it.name || "(품명 없음)"} · {it.qty}{it.unit} × {Number(it.unitPrice || 0).toLocaleString()}원 = {lineTotal.toLocaleString()}원
                      </span>
                      <ChevronRight size={15} className="text-slate-300 shrink-0 ml-2" />
                    </button>
                  ) : (
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex gap-2">
                        {["자재비", "인건비"].map((c) => (
                          <button
                            key={c}
                            onClick={() => updateItem(idx, { category: c })}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold ${it.category === c ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">품명</p>
                        <input className={inputCls} value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">규격</p>
                          <input className={inputCls} value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">호기 (선택)</p>
                          <input className={inputCls} value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">단위</p>
                          <select className={inputCls} value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })}>
                            <option value="EA">EA</option>
                            <option value="SET">SET</option>
                            <option value="식">식</option>
                          </select>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">수량</p>
                          <input type="number" className={inputCls} value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">단가</p>
                          <input type="number" className={inputCls} value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: e.target.value })} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-bold text-slate-500">소계 {lineTotal.toLocaleString()}원</span>
                        <button onClick={() => removeItem(idx)} className="text-xs font-bold text-red-500">이 품목 삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={addItem} className="w-full py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-700 text-sm font-bold">
              + 품목 추가
            </button>
            {items.length === 0 && <p className="text-xs text-slate-400 text-center py-2">품목을 1개 이상 추가해주세요</p>}
          </>
        )}
```

- [ ] **Step 3: 하단 이전/다음 버튼이 1단계에서도 동작하도록 네비게이션 블록 교체**

기존(Task 2에서 만든) 하단 네비게이션:
```jsx
      <div className="shrink-0 px-5 py-3 bg-white border-t border-slate-100 flex gap-2">
        <button onClick={handleCancel} className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">
          {step === 0 ? "취소" : "그만두기"}
        </button>
        {step === 0 && (
          <button
            onClick={handleNextFromStep0}
            disabled={!site || creating}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 flex items-center justify-center gap-1"
          >
            {creating ? "만드는 중..." : <>다음 <ChevronRight size={14} /></>}
          </button>
        )}
      </div>
```
다음으로 교체:
```jsx
      <div className="shrink-0 px-5 py-3 bg-white border-t border-slate-100 flex gap-2">
        <button
          onClick={() => {
            if (step === 1 && !existingQuote) return setStep(0);
            return handleCancel();
          }}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200"
        >
          {step === 1 && !existingQuote ? "이전" : "취소"}
        </button>
        {step === 0 && (
          <button
            onClick={handleNextFromStep0}
            disabled={!site || creating}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 flex items-center justify-center gap-1"
          >
            {creating ? "만드는 중..." : <>다음 <ChevronRight size={14} /></>}
          </button>
        )}
        {step === 1 && (
          <button
            onClick={() => setStep(2)}
            disabled={items.length === 0}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 flex items-center justify-center gap-1"
          >
            다음 <ChevronRight size={14} />
          </button>
        )}
      </div>
```

**1단계에서 왼쪽 버튼을 누르면**: 새 견적(0단계를 거쳐 초안을 만든 경우, `existingQuote`가 없음)이면
0단계(현장선택)로 돌아가고, 기존 요청에서 이어간 경우(0단계 자체가 없었음)면 마법사를 그냥
취소(`handleCancel`)한다.

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 5: 브라우저로 확인**

`[+ 새 견적 작성]`으로 들어가 현장 고르고 다음 → 품목 입력 화면에서 `[+ 품목 추가]`로 카드 2~3개
만들고 각각 펼쳐서 필드 채운 뒤 접었을 때 요약 줄(품명·수량·단가·소계)이 맞는지, 삭제가 되는지
확인. "요청접수" 카드에서 `[견적서 작성]`으로 들어간 경우 품목 1번에 기존 요청 텍스트가 미리
채워져 있는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add app/components/tabs/QuoteWizard.jsx
git commit -m "feat: 견적 마법사 - 품목 입력 단계(아코디언 카드)"
```

---

### Task 4: 운반비·안전관리비·이윤 단계

**Files:**
- Modify: `app/components/tabs/QuoteWizard.jsx`

**Interfaces:**
- Consumes: Task 3의 `items`/`itemsSubtotal`.
- Produces: `transportCost`/`safetyCost`/`profit` state — Task 5가 저장·PDF 요청에 쓴다.

- [ ] **Step 1: 부대비용 상태 추가**

`const [items, setItems] = useState(...)` 블록 뒤에 추가:
```js
  const [transportCost, setTransportCost] = useState(existingQuote?.transportCost || 0);
  const [safetyCost, setSafetyCost] = useState(existingQuote?.safetyCost || 0);
  const [profit, setProfit] = useState(existingQuote?.profit || 0);
  const grandTotal = itemsSubtotal + Number(transportCost || 0) + Number(safetyCost || 0) + Number(profit || 0);
```

- [ ] **Step 2: 3단계(부대비용) JSX 추가**

Task 3에서 만든 `{step === 1 && ( ... )}` 블록 바로 뒤에 추가:
```jsx
        {step === 2 && (
          <>
            {[
              { label: "운반비", value: transportCost, setValue: setTransportCost },
              { label: "안전관리비 및 기타", value: safetyCost, setValue: setSafetyCost },
              { label: "이윤", value: profit, setValue: setProfit },
            ].map(({ label, value, setValue }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-3.5">
                <p className="text-xs font-bold text-slate-500 mb-1.5">{label}</p>
                <input type="number" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
              </div>
            ))}
            <div className="bg-slate-100 rounded-xl p-3.5 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600">합계(VAT별도)</span>
              <span className="text-base font-extrabold text-slate-900">{grandTotal.toLocaleString()}원</span>
            </div>
          </>
        )}
```

- [ ] **Step 3: 하단 네비게이션에 2단계 버튼 추가**

Task 3에서 만든 네비게이션의 `{step === 1 && ( ... )}` 블록 바로 뒤에 추가:
```jsx
        {step === 2 && (
          <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 flex items-center justify-center gap-1">
            다음 <ChevronRight size={14} />
          </button>
        )}
```
그리고 Task 3에서 만든 왼쪽 버튼(맨 처음 `<button onClick={...}>`)을 다음으로 교체해 2·3단계에서도
뒤로가기가 되게 한다:

기존(Task 3):
```jsx
        <button
          onClick={() => {
            if (step === 1 && !existingQuote) return setStep(0);
            return handleCancel();
          }}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200"
        >
          {step === 1 && !existingQuote ? "이전" : "취소"}
        </button>
```
다음으로 교체(모든 단계에서 `setStep(step - 1)`로 일반화, 0단계·existingQuote일 때의 1단계만
"취소"로 남긴다):
```jsx
        <button
          onClick={() => {
            if (step === 0) return handleCancel();
            if (step === 1 && existingQuote) return handleCancel();
            return setStep(step - 1);
          }}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200"
        >
          {step === 0 || (step === 1 && existingQuote) ? "취소" : "이전"}
        </button>
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 5: 브라우저로 확인**

2단계까지 채운 뒤 3단계에서 운반비·안전관리비·이윤 입력하면 합계가 실시간으로 바뀌는지, 이전/다음
버튼으로 1↔2↔3단계를 자유롭게 오갈 때 입력한 값이 유지되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add app/components/tabs/QuoteWizard.jsx
git commit -m "feat: 견적 마법사 - 운반비/안전관리비/이윤 단계"
```

---

### Task 5: 확인·발행 단계 — PDF 생성·저장

**Files:**
- Modify: `app/components/tabs/QuoteWizard.jsx`

**Interfaces:**
- Consumes: 모든 이전 단계의 state(`site`, `managerId`/`recipientEmail`/`recipientPhone`, `items`,
  `transportCost`/`safetyCost`/`profit`, `draft`), `onSaved`(Task 2에서 정의된 prop).
- Produces: 없음(마지막 단계) — `POST /api/generate-quote-pdf` 호출, `quote_requests` 업데이트.

- [ ] **Step 1: 발행 상태·핸들러 추가**

`const grandTotal = ...` 줄 뒤에 추가:
```js
  const [saving, setSaving] = useState(false);
  const managerName = siteManagers.find((m) => m.id === managerId)?.name ?? "";

  async function handlePublish() {
    if (!draft || items.length === 0) return;
    setSaving(true);
    setError("");

    const quoteTitle = items[0]?.name || "견적서";
    const quoteDate = TODAY_STR;

    const pdfRes = await fetch("/api/generate-quote-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRequestId: draft.id,
        siteName: site?.name ?? draft.siteName,
        quoteNumber: "", recipientName: managerName, quoteTitle, quoteDate,
        items, transportCost, safetyCost, profit, discountAmount: 0,
      }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, reason: e.message }));

    if (!pdfRes.ok) {
      setError("PDF 생성 실패: " + pdfRes.reason);
      setSaving(false);
      return;
    }

    const patch = {
      quote_items: items,
      transport_cost: Number(transportCost) || 0,
      safety_cost: Number(safetyCost) || 0,
      profit: Number(profit) || 0,
      recipient_name: managerName || null,
      quote_title: quoteTitle,
      quote_issued_date: quoteDate,
      recipient_email: recipientEmail || null,
      recipient_phone: recipientPhone || null,
      quote_pdf_url: pdfRes.url,
      status: "견적발행",
    };
    const { error: dbError } = await supabase.from("quote_requests").update(patch).eq("id", draft.id);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setSaving(false);
      return;
    }

    onSaved({
      id: draft.id, quoteItems: items, transportCost: Number(transportCost) || 0, safetyCost: Number(safetyCost) || 0,
      profit: Number(profit) || 0, recipientName: managerName, quoteTitle, quoteIssuedDate: quoteDate,
      quotePdfUrl: pdfRes.url, status: "견적발행", recipientEmail: recipientEmail || null, recipientPhone: recipientPhone || null,
    });
    setSaving(false);
  }
```

- [ ] **Step 2: 4단계(확인·발행) JSX 추가**

Task 4에서 만든 `{step === 2 && ( ... )}` 블록 바로 뒤에 추가:
```jsx
        {step === 3 && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">현장</span><span className="font-semibold text-slate-800">{site?.name ?? draft?.siteName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">수신 담당자</span><span className="font-semibold text-slate-800">{managerName || "-"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">이메일</span><span className="font-semibold text-slate-800">{recipientEmail || "-"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">전화번호</span><span className="font-semibold text-slate-800">{recipientPhone || "-"}</span></div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-1 text-sm">
              <p className="text-xs font-bold text-slate-500 mb-1">품목</p>
              {items.map((it, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-slate-600 truncate">{it.name || "(품명 없음)"}</span>
                  <span className="text-slate-500">{it.qty}{it.unit} × {Number(it.unitPrice || 0).toLocaleString()} = {(Number(it.qty || 0) * Number(it.unitPrice || 0)).toLocaleString()}원</span>
                </div>
              ))}
              {Number(transportCost) > 0 && <div className="flex justify-between text-xs"><span className="text-slate-600">운반비</span><span className="text-slate-500">{Number(transportCost).toLocaleString()}원</span></div>}
              {Number(safetyCost) > 0 && <div className="flex justify-between text-xs"><span className="text-slate-600">안전관리비 및 기타</span><span className="text-slate-500">{Number(safetyCost).toLocaleString()}원</span></div>}
              {Number(profit) > 0 && <div className="flex justify-between text-xs"><span className="text-slate-600">이윤</span><span className="text-slate-500">{Number(profit).toLocaleString()}원</span></div>}
            </div>
            <div className="bg-slate-100 rounded-xl p-3.5 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600">합계(VAT별도)</span>
              <span className="text-base font-extrabold text-slate-900">{grandTotal.toLocaleString()}원</span>
            </div>
          </>
        )}
```

- [ ] **Step 3: 하단 네비게이션에 발행 버튼 추가**

Task 4에서 만든 네비게이션의 `{step === 2 && ( ... )}` 블록 바로 뒤에 추가:
```jsx
        {step === 3 && (
          <button
            onClick={handlePublish}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300"
          >
            {saving ? "발행 중..." : "발행하기"}
          </button>
        )}
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 5: 브라우저로 실제 발행까지 확인**

테스트용으로 지울 수 있는 현장으로 처음부터 끝까지: 현장 선택 → 품목 2개 입력 → 부대비용 입력 →
확인 화면에서 합계가 맞는지 → `[발행하기]` → "발행 중..." 표시 후 견적관리 목록에 상태
"견적발행"으로 바뀌어 나타나는지, 상세를 열었을 때(또는 데스크탑 관리자웹에서 같은 건을 열어)
품목·PDF가 실제로 채워져 있는지 확인. PDF 링크(`quote_pdf_url`)를 직접 열어 내용이 맞는지도
확인.

- [ ] **Step 6: 커밋**

```bash
git add app/components/tabs/QuoteWizard.jsx
git commit -m "feat: 견적 마법사 - 확인/발행 단계, PDF 생성 및 저장 연결"
```

---

## Self-Review 결과 (계획 작성자 자체 점검)

- **스펙 커버리지**: 설계 문서(`2026-08-11-mobile-quote-authoring-design.md`)의 메뉴 구조 변경(Task
  1), 마법사 4단계(Task 2~5), 데이터 흐름(빈 초안 생성·로컬 편집·`/api/generate-quote-pdf`
  재사용·빈 초안 정리 — Task 2·5), 범위 밖(데스크탑 관리자웹 무변경, 텔레그램봇 무관 — 어느
  태스크도 건드리지 않음)이 전부 커버됨.
- **재사용 확인**: 현장 검색은 `SiteSearchSelect`(기존, `FailureTab.jsx`가 쓰는 것과 동일 컴포넌트),
  전체화면 헤더는 `DrillHeader`(기존, `BillingHistoryScreen`과 동일 패턴), PDF 생성은
  `/api/generate-quote-pdf`(기존, 새 라우트 없음), 빈 초안 생성·정리 조건은 데스크탑
  `MaterialsAdmin.jsx`와 동일 shape.
- **간소화 지점(의도적으로 명시)**: 데스크탑의 `useQuoteRecipientFields` 훅은 공급자정보·CC·첨부파일·
  발송채널까지 포괄하는 훨씬 큰 훅이라(발행+즉시발송 겸용) 폰 마법사에서는 재사용하지 않고 "담당자
  선택 → 이메일/전화 프리필" 로직만 새로 작성했다 — 스펙의 "훅 로직 재사용"이라는 표현보다 범위가
  좁아진 것으로, 첨부파일·참조인·안내메시지·발송(이메일/카카오 체크박스)은 이 마법사에 없다(발행만
  하고 발송은 안 함 — 데스크탑 `QuoteItemsModal`도 마찬가지로 발행과 발송을 분리해뒀으므로 일관됨).
  품목의 카테고리 내 순서 변경(데스크탑의 위/아래 화살표)도 뺐다 — 모바일에서 실익이 적고 추가하면
  카드 UI가 복잡해진다.
- **타입/이름 일관성**: `existingQuote`(Task 2 도입) → Task 3·4·5에서 동일 이름으로 참조. `items`
  shape(`{category, name, spec, unit, qty, unitPrice, unitNo}`, Task 3 정의) → Task 4의
  `itemsSubtotal`, Task 5의 저장 patch가 그대로 사용. `onDraftCreated`/`onDiscarded`/`onSaved`(Task 2
  props) → `ElevatorFieldApp.jsx`의 `handleQuoteDraftCreated`/`handleQuoteDiscarded`/
  `handleQuoteWizardSaved`와 정확히 대응.
- **플레이스홀더 스캔**: "TODO"·"적절히 처리" 같은 표현 없음, 모든 코드 스텝에 실제 동작하는 코드
  포함 확인.
