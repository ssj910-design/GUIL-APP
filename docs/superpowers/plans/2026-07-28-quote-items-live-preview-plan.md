# 견적 품목편집 실시간 미리보기 (4단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `QuoteItemsModal`을 2열로 재구성해서, 왼쪽 입력 폼 옆에 오른쪽으로 간단한 견적서
요약 미리보기 카드를 추가하고 입력값이 바뀔 때마다 같이 갱신되게 한다.

**Architecture:** 새 state나 새 계산 로직 없이, 이미 존재하는 `items`/`transportCost`/
`safetyCost`/`profit`/`subtotal`/`grandTotal`/`discountAmount`/`finalAmount`/`quoteNumber`/
`quoteDate` 값을 그대로 읽어서 미리보기 카드를 렌더링한다. PDF 생성·저장(`handleConfirm`)은
전혀 건드리지 않는다.

**Tech Stack:** React 19, Tailwind v4 flex 레이아웃 — 새 라이브러리 없음.

## Global Constraints

- PDF 서식(로고, 사업자정보, 자재비/인건비 구분, 특이사항 조항)을 재현하지 않는다 — 간단한
  카드형 요약만.
- 미리보기는 화면 표시 전용이다 — 새 상태·저장·PDF 요청 바디 어디에도 영향을 주지 않는다.
- `handleConfirm`의 PDF 생성/DB 저장 로직은 한 글자도 바뀌지 않는다.
- `npm run build` 통과 필수.

---

### Task 1: `QuoteItemsModal.jsx` 2열 레이아웃 + 미리보기 카드

**Files:**
- Modify: `app/components/admin/QuoteItemsModal.jsx` (전체 교체)

**Interfaces:**
- Consumes: `lib/company.js`의 `COMPANY`(이미 존재, `QuoteSendModal.jsx`가 쓰는 것과 동일)
- Produces: 없음 (독립 작업, 다른 파일 변경 없음)

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

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
//
// 오른쪽 미리보기 카드는 실제 PDF 서식을 재현하지 않는 간단한 요약이다 — 새 계산 없이
// 이미 있는 값을 다시 보여줄 뿐이다 (설계:
// docs/superpowers/specs/2026-07-28-quote-items-live-preview-design.md).
import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { Modal, inputCls } from "@/app/components/admin/adminShared";
import { COMPANY } from "@/lib/company";

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

  // 오른쪽 미리보기 카드용 — 자재비/인건비 구분 없이 하나로 합치고, 운반비/안전관리비/이윤은
  // 값이 0보다 클 때만 같은 목록에 끼워 넣는다. 새 계산 없이 기존 값을 다시 나열만 함.
  const previewRows = [
    ...items.map((it) => ({
      name: it.name || "(품명 없음)",
      qty: Number(it.qty || 0),
      unitPrice: Number(it.unitPrice || 0),
      amount: Number(it.qty || 0) * Number(it.unitPrice || 0),
    })),
    ...[
      { name: "운반비", value: transportCost },
      { name: "안전관리비 및 기타", value: safetyCost },
      { name: "이윤", value: profit },
    ]
      .filter((x) => Number(x.value) > 0)
      .map((x) => ({ name: x.name, qty: 1, unitPrice: Number(x.value), amount: Number(x.value) })),
  ];

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
      <div className="flex gap-4 mb-4">
        <div className="flex-1 min-w-0">
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

          <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-slate-400 px-0.5">
            <span className="w-3.5 shrink-0"></span>
            <span className="flex-[11] min-w-0">품명</span>
            <span className="flex-[5] min-w-0">호기</span>
            <span className="flex-[20] min-w-0">규격</span>
            <span className="flex-[4] min-w-0">단위</span>
            <span className="flex-[5] min-w-0">수량</span>
            <span className="flex-[6] min-w-0 text-right">단가</span>
            <span className="w-3.5 shrink-0"></span>
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
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 shrink-0 flex flex-col">
                          <button type="button" onClick={() => moveItem(idx, -1)} disabled={pos === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">
                            <ChevronUp size={12} />
                          </button>
                          <button type="button" onClick={() => moveItem(idx, 1)} disabled={pos === catIndices.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">
                            <ChevronDown size={12} />
                          </button>
                        </div>
                        <div className="flex-[11] min-w-0">
                          <input className={inputCls} placeholder="품명" value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                        </div>
                        <div className="flex-[5] min-w-0">
                          <input className={inputCls} placeholder="호기" value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })} />
                        </div>
                        <div className="flex-[20] min-w-0">
                          <input className={inputCls} placeholder="규격" value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                        </div>
                        <div className="flex-[4] min-w-0">
                          <select className={inputCls} value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })}>
                            <option value="">단위</option>
                            <option value="EA">EA</option>
                            <option value="SET">SET</option>
                            <option value="식">식</option>
                          </select>
                        </div>
                        <div className="flex-[5] min-w-0">
                          <input type="number" className={inputCls} placeholder="수량" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                        </div>
                        <div className="flex-[6] min-w-0">
                          <input type="number" className={inputCls} placeholder="단가" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: e.target.value })} />
                        </div>
                        <button type="button" onClick={() => removeItem(idx)} className="w-3.5 shrink-0 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={14} /></button>
                      </div>
                      <div className="flex justify-end items-center gap-3 text-xs text-slate-500">
                        <span className="font-bold text-slate-400">소계</span>
                        <span>공급가액 <b className="text-slate-700 font-semibold">{supply.toLocaleString()}</b></span>
                        <span>세액 <b className="text-slate-700 font-semibold">{vat.toLocaleString()}</b></span>
                        <span>합계 <b className="text-slate-800 font-bold">{total.toLocaleString()}</b></span>
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
                <div key={label} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 shrink-0"></span>
                    <span className="flex-[11] min-w-0 text-xs font-semibold text-slate-600">{label}</span>
                    <span className="flex-[5] min-w-0"></span>
                    <span className="flex-[20] min-w-0"></span>
                    <span className="flex-[4] min-w-0"></span>
                    <span className="flex-[5] min-w-0 text-xs text-slate-400 text-center">1</span>
                    <div className="flex-[6] min-w-0">
                      <input type="number" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end items-center gap-3 text-xs text-slate-500">
                    <span className="font-bold text-slate-400">소계</span>
                    <span>공급가액 <b className="text-slate-700 font-semibold">{supply.toLocaleString()}</b></span>
                    <span>세액 <b className="text-slate-700 font-semibold">{vat.toLocaleString()}</b></span>
                    <span>합계 <b className="text-slate-800 font-bold">{total.toLocaleString()}</b></span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">소계</span><span className="font-semibold">{subtotal.toLocaleString()}원</span></div>
            <div className="flex justify-between font-bold"><span>합계(VAT별도, 천단위 절사)</span><span>{grandTotal.toLocaleString()}원</span></div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
            <p className="text-xs font-bold text-slate-500 mb-2">할인 정보 (화면 표시용 — 저장·PDF에는 반영되지 않습니다)</p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div><p className="text-xs text-slate-500 mb-1">할인율(%)</p>
                <input type="number" className={inputCls} value={discountPercent} onChange={(e) => handleDiscountPercent(e.target.value)} /></div>
              <div><p className="text-xs text-slate-500 mb-1">할인금액(원)</p>
                <input type="number" className={inputCls} value={discountAmount} onChange={(e) => handleDiscountAmount(e.target.value)} /></div>
            </div>
            <div className="flex justify-between font-bold text-blue-700"><span>최종금액</span><span>{finalAmount.toLocaleString()}원</span></div>
          </div>
        </div>

        <div className="w-80 shrink-0">
          <div className="sticky top-0 border border-slate-200 rounded-xl p-4 bg-white">
            <p className="text-sm font-bold text-slate-800 mb-3 text-center">견적서 미리보기</p>
            <div className="text-xs text-slate-500 space-y-1 mb-3">
              <div className="flex justify-between"><span>공급자</span><span className="font-semibold text-slate-700">{COMPANY.name}</span></div>
              <div className="flex justify-between"><span>고객</span><span className="font-semibold text-slate-700">{site?.name ?? quote.siteName}</span></div>
              <div className="flex justify-between"><span>견적번호</span><span className="font-semibold text-slate-700">{quoteNumber || "-"}</span></div>
              <div className="flex justify-between"><span>견적일</span><span className="font-semibold text-slate-700">{quoteDate}</span></div>
            </div>
            <div className="border-t border-slate-100 pt-2 space-y-1 mb-3">
              {previewRows.length === 0 ? (
                <p className="text-xs text-slate-300 text-center py-2">품목 없음</p>
              ) : (
                previewRows.map((row, i) => (
                  <div key={i} className="flex justify-between text-xs gap-2">
                    <span className="text-slate-600 truncate">{row.name}</span>
                    <span className="text-slate-500 shrink-0 whitespace-nowrap">
                      {row.qty} × {row.unitPrice.toLocaleString()} = <b className="text-slate-800">{row.amount.toLocaleString()}</b>
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-slate-100 pt-2 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">소계</span><span className="font-semibold">{subtotal.toLocaleString()}원</span></div>
              <div className="flex justify-between font-bold"><span>합계(VAT별도)</span><span>{grandTotal.toLocaleString()}원</span></div>
              {discountAmount > 0 && (
                <div className="flex justify-between font-bold text-blue-700"><span>최종금액</span><span>{finalAmount.toLocaleString()}원</span></div>
              )}
            </div>
          </div>
        </div>
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

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 3: 브라우저 실사용 검증 (디스포저블 테스트 견적 사용)**

`npm run dev` 후 `/admin` → 자재·견적 신청내역 → "+ 새 견적 발행" → 실제 현장 선택 →
품목편집 모달에서:

1. 오른쪽에 "견적서 미리보기" 카드가 왼쪽 입력 폼과 나란히 보이는지 확인.
2. 품목을 추가하고 품명/수량/단가를 입력 → 오른쪽 미리보기 목록에 같은 품목이 즉시
   나타나고 금액이 맞는지 확인.
3. 운반비에 금액을 입력 → 미리보기 목록에 "운반비" 줄이 추가되는지 확인(0이면 안 보이는지도
   확인).
4. 할인율을 입력 → 미리보기 하단에 "최종금액"이 추가로 나오는지 확인(할인 0일 땐 안 보이는지
   확인).
5. "발행 확정" 클릭 → PDF가 기존과 동일하게 정상 생성되고 상태가 "견적발행"으로 바뀌는지
   확인(이 작업이 PDF 로직에 영향을 주지 않았는지 최종 확인).
6. 테스트에 사용한 디스포저블 견적 행은 REST DELETE로 정리한다.

- [ ] **Step 4: 커밋**

```bash
git add app/components/admin/QuoteItemsModal.jsx
git commit -m "feat: 견적 품목편집에 오른쪽 실시간 미리보기 카드 추가"
```
