# 견적 신규발행 + 호기별 견적내역 조회 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 기사 요청 없이 직접 새 견적을 발행할 수 있게 하고, 호기 상세창에서 그 호기(또는 호기 미지정 시 현장 전체)의 견적내역을 조회할 수 있게 한다.

**Architecture:** `MaterialsAdmin.jsx`에 "새 견적 발행" 버튼 + 로컬 현장선택 모달을 추가해 빈 `quote_requests` 행을 만든 뒤 기존 `QuoteItemsModal`을 그대로 재사용한다(새 발행 로직 없음 — 진입점만 하나 늘어남). `SitesAdmin.jsx`의 `UnitDetailModal`에는 기존 고장내역/부품교체내역과 동일한 필터 컨벤션으로 "견적내역" 탭을 추가한다. 둘 다 이미 `AdminApp.jsx`가 로드해둔 `data`를 그대로 쓰고, 새 API·새 쿼리·새 마이그레이션이 없다.

**Tech Stack:** 기존 React/Supabase 클라이언트 패턴 그대로. 새 의존성 없음.

## Global Constraints

- 새 DB 컬럼·마이그레이션 없음 — 기존 `quote_requests` 컬럼만 사용.
- "관리자발행" 여부는 `requesterId`와 `engineer`가 둘 다 비어있는지로 판단한다(별도 플래그 컬럼 안 씀).
- 견적내역 탭의 필터는 기존 고장내역/부품교체내역 탭과 동일한 컨벤션을 따른다: `unit_id`가 있으면 그
  호기만, 없으면 그 현장 전체로 fallback — `q.unitId ? q.unitId === unit.id : q.siteId === site.id`.
- `SiteSearchSelect`(`app/components/formWidgets.jsx`)는 `SitesContext`(React Context)로 현장 목록을
  읽는데, 관리자 콘솔 트리에는 이 Context가 없다(기본값 `[]`) — 그대로 갖다 쓰면 현장이 하나도 안
  뜨는 버그가 난다. 그래서 이번 태스크는 `sites`를 prop으로 받는 새 로컬 현장선택 컴포넌트를 만든다
  (기존 위젯 재사용 아님, 명시적으로 다시 만드는 이유).
- PDF 첨부/발송 등 이후 흐름은 기사요청건과 완전히 동일 — `QuoteItemsModal`/`QuoteSendModal` 자체는
  수정하지 않는다.

---

### Task 1: MaterialsAdmin.jsx — 새 견적 발행 + 관리자발행 배지

**Files:**
- Modify: `app/components/admin/MaterialsAdmin.jsx:7-15`(import), `:44-52`(state), `:364-431`(견적요청
  섹션 헤더·표), `:462-490` 부근(모달 렌더 블록)

**Interfaces:**
- Consumes: `mapQuoteRequest`(`@/lib/mappers`, 기존 함수 — 새로 안 만듦), `QuoteItemsModal`(기존, 이미
  이 파일에서 씀).
- Produces: 없음(다른 태스크가 이 태스크에 의존하지 않음 — Task 2와 독립).

- [ ] **Step 1: import 추가**

`app/components/admin/MaterialsAdmin.jsx:9`(`import { supabase } ...` 다음 줄 근처, `import`
블록 안 아무 곳)에 추가:

```js
import { mapQuoteRequest } from "@/lib/mappers";
```

- [ ] **Step 2: state 추가**

`:52`(`const [sendTarget, setSendTarget] = useState(null);` 다음 줄)에 추가:

```js
  const [pickingSite, setPickingSite] = useState(false); // 새 견적 발행 — 현장선택 모달
```

- [ ] **Step 3: 견적 생성 핸들러 추가**

`MaterialsAdmin` 함수 컴포넌트 안, `return (` 바로 앞에 추가(다른 `handle*` 함수들과 같은 위치):

```js
  async function handleCreateQuote(siteId) {
    const site = (data.sites ?? []).find((s) => s.id === siteId);
    if (!site) return;
    const row = {
      id: "q" + Date.now(),
      site_id: siteId,
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
    const { error } = await supabase.from("quote_requests").insert(row);
    if (error) { alert("견적 생성 실패: " + error.message); return; }
    const created = mapQuoteRequest(row);
    setData((prev) => ({ ...prev, quoteRequests: [created, ...prev.quoteRequests] }));
    setPickingSite(false);
    setItemsTarget(created);
  }
```

- [ ] **Step 4: 로컬 현장선택 모달 컴포넌트 추가**

파일 맨 아래(다른 로컬 모달 컴포넌트들, 예: `RequestDetailModal` 근처)에 새 함수 추가:

```jsx
// 관리자가 기사 요청 없이 새 견적을 발행할 때 현장을 고르는 팝업.
// formWidgets.jsx의 SiteSearchSelect는 SitesContext(모바일 트리 전용)로 현장을 읽어서
// 관리자 콘솔에서는 목록이 비어 보인다 — 그래서 sites를 prop으로 받는 버전을 따로 둔다.
function QuoteNewSiteModal({ sites, onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const filtered = sites.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal title="새 견적 발행 — 현장 선택" onClose={onClose}>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className={`${inputCls} pl-8`}
          placeholder="현장명을 검색하세요"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="max-h-72 overflow-y-auto space-y-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">검색 결과가 없습니다</p>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0 rounded-lg"
            >
              {s.name}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: "새 견적 발행" 버튼 추가 (견적요청 섹션 헤더)**

`:366`의 기존 줄

```jsx
        {tab === "all" && <h2 className="text-xs font-bold text-slate-400 mb-2 mt-6">견적요청</h2>}
```

을 아래로 교체:

```jsx
        <div className="flex items-center justify-between mb-2 mt-6">
          {tab === "all" ? <h2 className="text-xs font-bold text-slate-400">견적요청</h2> : <span />}
          <button
            onClick={() => setPickingSite(true)}
            className="text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 transition-colors px-3 py-1.5 rounded-lg"
          >
            + 새 견적 발행
          </button>
        </div>
```

- [ ] **Step 6: "신청 기사" 칸에 관리자발행 배지**

`:377`의 기존 줄

```jsx
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, q.requesterId, q.engineer)}</td>
```

을 아래로 교체:

```jsx
              <td className="px-3 py-2.5 whitespace-nowrap">
                {!q.requesterId && !q.engineer
                  ? <StatusBadge tone="slate">관리자발행</StatusBadge>
                  : personOf(data, q.requesterId, q.engineer)}
              </td>
```

- [ ] **Step 7: 모달 렌더 블록 추가**

`:477`(`{itemsTarget && (` 블록) 바로 다음에 추가:

```jsx
      {pickingSite && (
        <QuoteNewSiteModal
          sites={data.sites ?? []}
          onClose={() => setPickingSite(false)}
          onSelect={handleCreateQuote}
        />
      )}
```

- [ ] **Step 8: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 9: 브라우저로 확인 (실데이터, 검증 후 원복)**

1. `preview_start`로 dev 서버 열고 `/admin` → "자재·견적 신청내역" → "견적요청" 탭(또는 "전체").
2. "+ 새 견적 발행" 클릭 → 현장선택 모달 뜨는지, 검색 되는지 확인.
3. 아무 현장이나 골라본다 → **실제로 `quote_requests`에 새 행이 생긴다** → `QuoteItemsModal`이
   바로 열리는지 확인. 열리면 그대로 "취소"로 닫는다(발행 확정까지는 안 눌러도 검증 충분).
4. 목록에서 방금 만든 행이 "요청접수" 상태로, "신청 기사" 칸에 "관리자발행" 배지가 뜨는지 확인.
5. "견적발행 처리" 버튼으로 실제 `QuoteItemsModal`을 열어 품목 1개 정도 넣고 취소(발행 확정은
   누르지 않음 — 실제 PDF 생성·발송까지 갈 필요 없음, 모달 진입/표시만 확인).
6. **원복**: REST로 방금 만든 `quote_requests` 행을 삭제한다(`DELETE
   .../rest/v1/quote_requests?id=eq.<생성된id>`) — 실제 있던 데이터가 아니라 이 검증용으로 만든
   것이므로 삭제가 맞다(다른 태스크들의 "발송 성공/실패" 검증과 달리, 이건 새로 만든 행 자체를
   지우는 것이라 REST DELETE가 맞음. 만약 이전 세션들처럼 실DB 쓰기가 시스템 분류기에 막히면,
   막힌 그대로 컨트롤러에게 보고하고 임의로 우회하지 않는다).

- [ ] **Step 10: 커밋**

```bash
git add app/components/admin/MaterialsAdmin.jsx
git commit -m "feat: 자재·견적 신청내역에 새 견적 발행 버튼 + 관리자발행 배지 추가"
```

---

### Task 2: SitesAdmin.jsx — 호기 상세창에 견적내역 탭

**Files:**
- Modify: `app/components/admin/SitesAdmin.jsx:89`(`UnitDetailModal` 시그니처), `:130`(탭 배열),
  `:218-242` 부근(탭 콘텐츠, `부품교체내역` 블록 다음에 추가), `:334`(상위 컴포넌트 data 구조분해),
  `:992-999`(`UnitDetailModal` 호출부)

**Interfaces:**
- Consumes: 없음(Task 1과 완전히 독립 — 같은 파일 아니고, 서로 다른 데이터 흐름).

- [ ] **Step 1: 상위 컴포넌트에서 quoteRequests 꺼내기**

`:334`의 기존 줄

```js
  const { sites, units, profiles, failures, inspections, billings, siteManagers } = data;
```

을 아래로 교체:

```js
  const { sites, units, profiles, failures, inspections, billings, siteManagers, quoteRequests } = data;
```

- [ ] **Step 2: UnitDetailModal 시그니처에 quoteRequests 추가**

`:89`의 기존 줄

```js
function UnitDetailModal({ unit, site, failures, inspections, billings, onClose }) {
```

을 아래로 교체:

```js
function UnitDetailModal({ unit, site, failures, inspections, billings, quoteRequests, onClose }) {
```

- [ ] **Step 3: 탭 배열에 "견적내역" 추가**

`:130`의 기존 줄

```jsx
        {["정보", "고장내역", "검사내역", "부품교체내역"].map((t) => (
```

을 아래로 교체:

```jsx
        {["정보", "고장내역", "검사내역", "부품교체내역", "견적내역"].map((t) => (
```

- [ ] **Step 4: 필터 변수 추가**

`UnitDetailModal` 함수 안, 기존 `const unitBillings = billings.filter(...)` 줄(`:107` 부근) 바로
다음에 추가:

```js
  // 고장내역/부품교체내역과 동일한 컨벤션: unit_id가 있으면 그 호기만, 없으면(관리자가 호기를
  // 안 정한 경우 등) 현장 전체로 fallback.
  const unitQuotes = quoteRequests
    .filter((q) => (q.unitId ? q.unitId === unit.id : q.siteId === site.id))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));
```

- [ ] **Step 5: 탭 콘텐츠 추가**

`:218-242`의 `{tab === "부품교체내역" && (...)}` 블록이 끝나는 곳(`)}` 다음, `</div>` 앞) 바로
뒤에 추가:

```jsx
        {tab === "견적내역" && (
          unitQuotes.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">등록된 견적 내역이 없습니다</p> : (
            <div className="space-y-2">
              {unitQuotes.map((q) => {
                const displayStatus = q.status === "자재지급완료" ? "교체완료" : q.status;
                const tone = displayStatus === "교체완료" ? "indigo"
                  : (displayStatus === "승인" || displayStatus === "견적발행") ? "amber"
                  : displayStatus === "요청접수" ? "blue" : "slate";
                return (
                  <div key={q.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-sm">{q.quoteTitle || q.constructionType || "견적"}</p>
                      <StatusBadge tone={tone}>{displayStatus}</StatusBadge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {shortDate(q.quoteIssuedDate || q.requestedDate)}
                      {(q.emailSentAt || q.kakaoSentAt) && " · 발송완료"}
                    </p>
                    {q.quotePdfUrl && (
                      <a href={q.quotePdfUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 font-semibold mt-1 inline-block">
                        PDF 보기
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
```

- [ ] **Step 6: 호출부에 quoteRequests 전달**

`:992-999`의 기존 블록

```jsx
        <UnitDetailModal
          unit={unitDetail}
          site={sites.find((s) => s.id === unitDetail.siteId)}
          failures={failures}
          inspections={inspections}
          billings={billings}
          onClose={() => setUnitDetail(null)}
        />
```

을 아래로 교체:

```jsx
        <UnitDetailModal
          unit={unitDetail}
          site={sites.find((s) => s.id === unitDetail.siteId)}
          failures={failures}
          inspections={inspections}
          billings={billings}
          quoteRequests={quoteRequests ?? []}
          onClose={() => setUnitDetail(null)}
        />
```

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 8: 브라우저로 확인**

1. `preview_start`로 dev 서버 열고 `/admin` → "현장관리" → 견적이 있는 현장(예: 이전 세션에서
   견적 발행/발송을 테스트했던 현장) 클릭 → 호기 클릭 → 상세창.
2. 탭에 "견적내역"이 새로 보이는지, 클릭하면 그 현장(또는 호기)의 견적이 상태 배지와 함께
   나열되는지 확인. 없는 현장이면 "등록된 견적 내역이 없습니다" 문구가 뜨는지 확인.
3. PDF가 있는 견적이면 "PDF 보기" 링크가 실제로 열리는지 확인.
4. 조회 전용 기능이라(쓰기 없음) 원복할 것이 없다.

- [ ] **Step 9: 커밋**

```bash
git add app/components/admin/SitesAdmin.jsx
git commit -m "feat: 호기 상세창에 견적내역 탭 추가"
```

---

## Self-Review 결과 (계획 작성자 자체 점검)

- **스펙 커버리지**: 새 견적 발행(Task 1) + 관리자발행 구분(Task 1) + 호기별 견적내역 조회(Task 2)
  전부 커버됨. 스펙의 "범위 밖"(통합 대시보드, 발행 시 호기 지정 UI)은 의도적으로 제외.
- **플레이스홀더 스캔**: TBD/TODO 없음. `QuoteItemsModal`이 참조하는 `quote.part`/`quote.quantity`가
  실제로는 `mapQuoteRequest`가 만들지 않는 필드라(기존 버그, 이번 범위 밖) 어차피 항상
  `quote.constructionType` 폴백을 타는데, 그래서 Task 1의 새 행에 `construction_type: "관리자 발행"`을
  넣어 그 참고 박스가 빈 값 대신 이 텍스트를 보여주게 했다.
- **타입 일관성**: Task 1과 Task 2는 서로 다른 파일, 서로 의존관계 없음 — 순서 상관없이 병렬로도
  진행 가능하나(이 계획에선 순서대로 기록). 둘 다 기존 `mapQuoteRequest`가 만드는 camelCase 필드명
  (`quoteTitle`, `constructionType`, `quotePdfUrl`, `emailSentAt`, `kakaoSentAt`, `unitId`, `siteId`,
  `requesterId`, `engineer`)을 그대로 참조하며 새로 이름을 만들지 않았다.
