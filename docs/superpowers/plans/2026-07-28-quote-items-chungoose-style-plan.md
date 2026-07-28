# 견적 품목편집 청구스 스타일 (1단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `QuoteItemsModal`(견적 품목편집) 입력 화면을 청구스(chungoose.ai) 스타일에 맞춰
품목 테이블에 공급가액/세액/합계 컬럼과 순서변경 화살표를 추가하고, 운반비/안전관리비/이윤을
같은 표의 고정 3줄로 통합하고, 할인 정보 섹션을 새로 추가한다.

**Architecture:** 변경은 `app/components/admin/QuoteItemsModal.jsx` 한 파일 안에서 끝난다.
공급가액/세액/합계/할인은 전부 화면에서 파생 계산되는 값(state 아님, 매 렌더마다 재계산)이고,
저장되는 데이터(`quote_items`, `transport_cost`, `safety_cost`, `profit`)와 실제 PDF 생성
로직(`lib/quotePdf.js`, `app/api/generate-quote-pdf/route.js`)은 전혀 건드리지 않는다.

**Tech Stack:** React 19, Tailwind v4(기존 `grid-cols-12` 패턴 재사용 — 새 config/arbitrary
value 불필요), lucide-react 아이콘.

## Global Constraints

- 저장되는 데이터 형태(`quote_items` 배열의 필드, `transport_cost`/`safety_cost`/`profit`
  컬럼)는 지금과 동일하게 유지한다 — 이번 변경은 입력 화면 UI 전용.
- PDF 생성(`lib/quotePdf.js`, `app/api/generate-quote-pdf/route.js`)은 코드 한 줄도 건드리지
  않는다.
- 세액은 항상 공급가액의 10%(부가세 별도 고정) — 옵션 선택 없음.
- 순서변경 화살표는 같은 구분(자재비/인건비) 안에서만 동작 — 구분을 넘나드는 이동 없음.
- 할인 정보(할인율/할인금액/최종금액)는 화면 표시 전용 — `handleConfirm`이 보내는 `patch`나
  `/api/generate-quote-pdf` 요청 바디에 절대 포함하지 않는다.
- `npm run build` 통과 필수.

---

### Task 1: QuoteItemsModal 리뉴얼 — 품목 테이블 + 고정 3줄 + 할인정보

**Files:**
- Modify: `app/components/admin/QuoteItemsModal.jsx` (전체 교체)

**Interfaces:**
- Consumes: 없음 (독립 작업, 다른 파일 변경 없음)
- Produces: 없음 (이 컴포넌트를 쓰는 `MaterialsAdmin.jsx`의 호출부는 `quote`/`site`/`onClose`/
  `onSaved` props를 그대로 쓰므로 변경 불필요 — 컴포넌트의 외부 인터페이스는 이번 작업으로
  바뀌지 않는다)

- [ ] **Step 1: 현재 파일 내용 확인**

`app/components/admin/QuoteItemsModal.jsx`를 읽어 아래 Step 2의 "다음" 내용과 비교해
기존 로직(견적번호 자동생성, `handleConfirm`의 PDF 생성·저장 흐름)이 그대로 보존되는지
먼저 확인한다.

- [ ] **Step 2: 파일 전체를 아래 내용으로 교체**

```jsx
"use client";

// 견적요청 품목편집 — 기사가 신청한 부품명/수량(원본, 읽기전용 참고)을 관리자가
// 세부 품목(자재비/인건비 구분·규격·단가 등)으로 확장해 "발행 확정"하면
// PDF까지 생성해서 견적요청을 "견적발행" 상태로 넘긴다.
//
// 품목 테이블의 공급가액/세액/합계 컬럼과 할인 정보 섹션은 화면 표시 전용이다 — 실제
// PDF(lib/quotePdf.js)와 저장 데이터(quote_items, transport_cost 등)는 그대로 두고
// 입력 화면만 청구스(chungoose.ai) 스타일에 맞춰 다듬은 것 (설계:
// docs/superpowers/specs/2026-07-28-quote-items-chungoose-style-design.md).
import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { Modal, inputCls } from "@/app/components/admin/adminShared";

const CATEGORIES = ["자재비", "인건비"];
const VAT_RATE = 0.1;

function emptyItem(category) {
  return { category, name: "", unitNo: "", spec: "", unit: "", qty: 1, unitPrice: 0 };
}

// 공급가액/세액/합계 — 품목 행과 운반비/안전관리비/이윤 고정행이 공유하는 계산식.
function rowCalc(qty, unitPrice) {
  const supply = Number(qty || 0) * Number(unitPrice || 0);
  const vat = Math.round(supply * VAT_RATE);
  return { supply, vat, total: supply + vat };
}

export default function QuoteItemsModal({ quote, site, onClose, onSaved }) {
  const [items, setItems] = useState(() => {
    if (quote.quoteItems?.length) return quote.quoteItems;
    // 처음 여는 경우 기사 원본(부품명+수량)을 자재비 1행에 프리필
    return quote.part ? [{ ...emptyItem("자재비"), name: quote.part, qty: quote.quantity || 1 }] : [];
  });
  const [recipientName, setRecipientName] = useState(quote.recipientName || "");
  const [quoteTitle, setQuoteTitle] = useState(quote.quoteTitle || quote.constructionType || "");
  const [quoteNumber, setQuoteNumber] = useState(quote.quoteNumber || "");
  const [quoteDate, setQuoteDate] = useState(quote.quoteIssuedDate || TODAY_STR);
  const [transportCost, setTransportCost] = useState(quote.transportCost || 0);
  const [safetyCost, setSafetyCost] = useState(quote.safetyCost || 0);
  const [profit, setProfit] = useState(quote.profit || 0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (quote.quoteNumber) return; // 이미 발행된 견적은 번호를 유지
    (async () => {
      // 견적번호 = 오늘날짜(YYYYMMDD) + "1" + 오늘 발행 순번. 예: 2026-07-27 4번째 발행 → 2026072714
      // ponytail: 동시에 두 명이 같은 순간 발행하면 번호가 겹칠 수 있음 — 발행 빈도가 낮은
      // 내부 관리툴이라 당장은 감수, 문제되면 DB 시퀀스/락으로 업그레이드.
      const { count } = await supabase
        .from("quote_requests")
        .select("id", { count: "exact", head: true })
        .eq("quote_issued_date", TODAY_STR);
      setQuoteNumber(`${TODAY_STR.replace(/-/g, "")}1${(count || 0) + 1}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addItem(category) {
    setItems((prev) => [...prev, emptyItem(category)]);
  }
  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  // 같은 구분(자재비/인건비) 안에서만 위/아래로 순서를 바꾼다 — 구분을 넘나드는 이동은
  // PDF가 구분별로 섹션을 나눠 그리므로 지원하지 않는다.
  function moveItem(idx, direction) {
    setItems((prev) => {
      const category = prev[idx].category;
      const catIndices = prev.map((it, i) => (it.category === category ? i : -1)).filter((i) => i !== -1);
      const pos = catIndices.indexOf(idx);
      const swapPos = pos + direction;
      if (swapPos < 0 || swapPos >= catIndices.length) return prev;
      const swapIdx = catIndices[swapPos];
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }

  const itemsSubtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  const subtotal = itemsSubtotal + Number(transportCost || 0) + Number(safetyCost || 0) + Number(profit || 0);
  const grandTotal = Math.floor(subtotal / 1000) * 1000;
  const finalAmount = subtotal - discountAmount;

  // 할인율/할인금액은 서로의 값을 기준으로 자동 계산되는 화면 표시 전용 값 —
  // handleConfirm의 patch나 PDF 요청 바디 어디에도 들어가지 않는다.
  function handleDiscountPercent(value) {
    const pct = Number(value) || 0;
    setDiscountPercent(pct);
    setDiscountAmount(Math.round((subtotal * pct) / 100));
  }
  function handleDiscountAmount(value) {
    const amt = Number(value) || 0;
    setDiscountAmount(amt);
    setDiscountPercent(subtotal > 0 ? Math.round((amt / subtotal) * 1000) / 10 : 0);
  }

  async function handleConfirm() {
    if (items.length === 0) return;
    setSaving(true);
    setError("");

    const patch = {
      quote_items: items,
      transport_cost: Number(transportCost) || 0,
      safety_cost: Number(safetyCost) || 0,
      profit: Number(profit) || 0,
      quote_number: quoteNumber || null,
      recipient_name: recipientName || null,
      quote_title: quoteTitle || null,
      quote_issued_date: quoteDate,
    };

    const pdfRes = await fetch("/api/generate-quote-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRequestId: quote.id,
        siteName: site?.name ?? quote.siteName,
        quoteNumber, recipientName, quoteTitle, quoteDate,
        items, transportCost, safetyCost, profit,
      }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, reason: e.message }));

    if (!pdfRes.ok) {
      setError("PDF 생성 실패: " + pdfRes.reason);
      setSaving(false);
      return;
    }
    patch.quote_pdf_url = pdfRes.url;
    patch.status = "견적발행";

    const { error: dbError } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setSaving(false);
      return;
    }

    onSaved({
      quoteItems: items, transportCost: Number(transportCost) || 0, safetyCost: Number(safetyCost) || 0,
      profit: Number(profit) || 0, quoteNumber, recipientName, quoteTitle,
      quoteIssuedDate: quoteDate, quotePdfUrl: pdfRes.url, status: "견적발행",
    });
    setSaving(false);
  }

  return (
    <Modal title={`${site?.name ?? quote.siteName} 견적 품목편집`} onClose={onClose} wide="2xl">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm">
        <p className="text-xs font-bold text-slate-500 mb-1">기사 요청 원본 (참고용)</p>
        <p className="font-semibold text-slate-700">{quote.part || quote.constructionType} · {quote.quantity ?? "-"}개</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div><p className="text-xs font-bold text-slate-500 mb-1">견적번호(No.)</p>
          <input className={inputCls} value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">수신자</p>
          <input className={inputCls} placeholder="OO 귀중" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} /></div>
        <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">견적명</p>
          <input className={inputCls} value={quoteTitle} onChange={(e) => setQuoteTitle(e.target.value)} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">견적일</p>
          <input type="date" className={inputCls} value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} /></div>
      </div>

      <div className="grid grid-cols-12 gap-1 mb-1 text-[10px] font-bold text-slate-400 px-0.5">
        <span className="col-span-1"></span>
        <span className="col-span-2">품명</span>
        <span className="col-span-1">단위</span>
        <span className="col-span-1">수량</span>
        <span className="col-span-2">단가</span>
        <span className="col-span-2 text-right">공급가액</span>
        <span className="col-span-1 text-right">세액</span>
        <span className="col-span-1 text-right">합계</span>
        <span className="col-span-1"></span>
      </div>

      {CATEGORIES.map((category) => (
        <div key={category} className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-600">{category === "자재비" ? "1.자재비" : "2.인건비"}</p>
            <button onClick={() => addItem(category)} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1">
              <Plus size={12} /> 품목 추가
            </button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => {
              if (it.category !== category) return null;
              const catIndices = items.map((x, i) => (x.category === category ? i : -1)).filter((i) => i !== -1);
              const pos = catIndices.indexOf(idx);
              const { supply, vat, total } = rowCalc(it.qty, it.unitPrice);
              return (
                <div key={idx} className="border border-slate-100 rounded-lg p-1.5">
                  <div className="grid grid-cols-12 gap-1 items-center mb-1">
                    <div className="col-span-1 flex flex-col">
                      <button type="button" onClick={() => moveItem(idx, -1)} disabled={pos === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">
                        <ChevronUp size={12} />
                      </button>
                      <button type="button" onClick={() => moveItem(idx, 1)} disabled={pos === catIndices.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    <input className={`${inputCls} col-span-2`} placeholder="품명" value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                    <input className={`${inputCls} col-span-1`} placeholder="단위" value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                    <input type="number" className={`${inputCls} col-span-1`} placeholder="수량" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                    <input type="number" className={`${inputCls} col-span-2`} placeholder="단가" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: e.target.value })} />
                    <span className="col-span-2 text-xs text-slate-500 text-right">{supply.toLocaleString()}</span>
                    <span className="col-span-1 text-xs text-slate-500 text-right">{vat.toLocaleString()}</span>
                    <span className="col-span-1 text-xs font-semibold text-slate-700 text-right">{total.toLocaleString()}</span>
                    <button type="button" onClick={() => removeItem(idx)} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pl-[calc(8.333%+0.25rem)]">
                    <input className={inputCls} placeholder="호기" value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })} />
                    <input className={inputCls} placeholder="규격" value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                  </div>
                </div>
              );
            })}
            {items.filter((it) => it.category === category).length === 0 && (
              <p className="text-xs text-slate-300 text-center py-2">품목 없음</p>
            )}
          </div>
        </div>
      ))}

      <div className="mb-4 space-y-1.5">
        {[
          { label: "운반비", value: transportCost, setValue: setTransportCost },
          { label: "안전관리비 및 기타", value: safetyCost, setValue: setSafetyCost },
          { label: "이윤", value: profit, setValue: setProfit },
        ].map(({ label, value, setValue }) => {
          const { supply, vat, total } = rowCalc(1, value);
          return (
            <div key={label} className="grid grid-cols-12 gap-1 items-center">
              <span className="col-span-1"></span>
              <span className="col-span-2 text-xs font-semibold text-slate-600">{label}</span>
              <span className="col-span-1"></span>
              <span className="col-span-1 text-xs text-slate-400 text-center">1</span>
              <input type="number" className={`${inputCls} col-span-2`} value={value} onChange={(e) => setValue(e.target.value)} />
              <span className="col-span-2 text-xs text-slate-500 text-right">{supply.toLocaleString()}</span>
              <span className="col-span-1 text-xs text-slate-500 text-right">{vat.toLocaleString()}</span>
              <span className="col-span-1 text-xs font-semibold text-slate-700 text-right">{total.toLocaleString()}</span>
              <span className="col-span-1"></span>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-slate-500">소계</span><span className="font-semibold">{subtotal.toLocaleString()}원</span></div>
        <div className="flex justify-between font-bold"><span>합계(VAT별도, 천단위 절사)</span><span>{grandTotal.toLocaleString()}원</span></div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm">
        <p className="text-xs font-bold text-slate-500 mb-2">할인 정보 (화면 표시용 — 저장·PDF에는 반영되지 않습니다)</p>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div><p className="text-xs text-slate-500 mb-1">할인율(%)</p>
            <input type="number" className={inputCls} value={discountPercent} onChange={(e) => handleDiscountPercent(e.target.value)} /></div>
          <div><p className="text-xs text-slate-500 mb-1">할인금액(원)</p>
            <input type="number" className={inputCls} value={discountAmount} onChange={(e) => handleDiscountAmount(e.target.value)} /></div>
        </div>
        <div className="flex justify-between font-bold text-blue-700"><span>최종금액</span><span>{finalAmount.toLocaleString()}원</span></div>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">취소</button>
        <button
          onClick={handleConfirm}
          disabled={items.length === 0 || saving}
          className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
        >
          {saving ? "생성 중..." : "발행 확정"}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 4: 브라우저 실사용 검증 (디스포저블 테스트 견적 사용)**

`npm run dev` 후 관리자웹 `/admin` → 자재·견적 신청내역 → "+ 새 견적 발행" → 아무 실제
현장 선택(테스트 후 삭제할 것이므로 아무 현장이나 가능) → 품목편집 모달에서 아래를 확인:

1. 품목 추가 → 품명/단위/수량/단가 입력 → 공급가액=단가×수량, 세액=공급가액의 10%, 합계=
   공급가액+세액으로 자동 계산되어 보이는지 확인.
2. 같은 구분(자재비 또는 인건비) 안에 품목을 2개 이상 추가하고, 위/아래 화살표로 순서가
   바뀌는지 확인(첫 번째 행은 위 화살표 비활성화, 마지막 행은 아래 화살표 비활성화).
3. 운반비/안전관리비 및 기타/이윤 3줄이 표 스타일로 통일되어 보이고, 단가란에 숫자를
   넣으면 공급가액/세액/합계가 같이 계산되는지 확인.
4. 할인율(%)에 10 입력 → 할인금액이 소계의 10%로 자동 채워지는지, 반대로 할인금액을 직접
   입력하면 할인율이 역산되는지, 최종금액이 소계-할인금액으로 표시되는지 확인.
5. "발행 확정" 클릭 → PDF가 정상 생성되고(기존과 동일한 자재비/인건비/운반비/안전관리비/
   이윤/소계/합계 양식) 견적요청 상태가 "견적발행"으로 바뀌는지 확인 — 특히 **할인 정보가
   PDF나 저장된 quote_items/transport_cost 등에 전혀 반영되지 않는지** 확인(REST로
   quote_requests 행을 조회해 discount 관련 필드가 없는지 확인).
6. 테스트에 사용한 디스포저블 견적 행은 REST DELETE로 정리한다.

- [ ] **Step 5: 커밋**

```bash
git add app/components/admin/QuoteItemsModal.jsx
git commit -m "feat: 견적 품목편집을 청구스 스타일로 개편 (공급가액/세액/합계, 순서변경, 할인정보)"
```
