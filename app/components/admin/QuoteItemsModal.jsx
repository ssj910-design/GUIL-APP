"use client";

// 견적요청 품목편집 — 기사가 신청한 부품명/수량(원본, 읽기전용 참고)을 관리자가
// 세부 품목(자재비/인건비 구분·규격·단가 등)으로 확장해 "발행 확정"하면
// PDF까지 생성해서 견적요청을 "견적발행" 상태로 넘긴다.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { Modal, inputCls } from "@/app/components/admin/adminShared";

const CATEGORIES = ["자재비", "인건비", "운반비", "안전관리비"];

function emptyItem(category) {
  return { category, name: "", unitNo: "", spec: "", unit: "", qty: 1, unitPrice: 0 };
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
  const [profit, setProfit] = useState(quote.profit || 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addItem(category) {
    setItems((prev) => [...prev, emptyItem(category)]);
  }
  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function categoryAmount(category) {
    return items
      .filter((it) => it.category === category)
      .reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  }
  const itemsSubtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  const subtotal = itemsSubtotal + Number(profit || 0);
  const grandTotal = Math.floor(subtotal / 1000) * 1000;

  async function handleConfirm() {
    if (items.length === 0) return;
    setSaving(true);
    setError("");

    // transport_cost/safety_cost 컬럼은 이제 직접 입력값이 아니라 운반비/안전관리비
    // 품목들의 합계를 그대로 저장해두는 값(참고·집계용)이다 — 실제 금액 출처는 items.
    const transportCost = categoryAmount("운반비");
    const safetyCost = categoryAmount("안전관리비");

    const patch = {
      quote_items: items,
      transport_cost: transportCost,
      safety_cost: safetyCost,
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
        items, profit,
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
      quoteItems: items, transportCost, safetyCost,
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

      {CATEGORIES.map((category, catIdx) => (
        <div key={category} className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-600">{catIdx + 1}.{category}</p>
            <button onClick={() => addItem(category)} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1">
              <Plus size={12} /> 품목 추가
            </button>
          </div>
          <div className="space-y-1.5">
            {items.map((it, idx) => it.category !== category ? null : (
              <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                <input className={`${inputCls} col-span-3`} placeholder="품명" value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                <input className={`${inputCls} col-span-1`} placeholder="호기" value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })} />
                <input className={`${inputCls} col-span-2`} placeholder="규격" value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                <input className={`${inputCls} col-span-1`} placeholder="단위" value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                <input type="number" className={`${inputCls} col-span-1`} placeholder="수량" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                <input type="number" className={`${inputCls} col-span-2`} placeholder="단가" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: e.target.value })} />
                <span className="col-span-1 text-xs text-slate-500 text-right">{(Number(it.qty || 0) * Number(it.unitPrice || 0)).toLocaleString()}</span>
                <button onClick={() => removeItem(idx)} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={14} /></button>
              </div>
            ))}
            {items.filter((it) => it.category === category).length === 0 && (
              <p className="text-xs text-slate-300 text-center py-2">품목 없음</p>
            )}
          </div>
        </div>
      ))}

      <div className="w-1/3 mb-4">
        <p className="text-xs font-bold text-slate-500 mb-1">5.이윤</p>
        <input type="number" className={inputCls} value={profit} onChange={(e) => setProfit(e.target.value)} />
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-slate-500">소계</span><span className="font-semibold">{subtotal.toLocaleString()}원</span></div>
        <div className="flex justify-between font-bold"><span>합계(VAT별도, 천단위 절사)</span><span>{grandTotal.toLocaleString()}원</span></div>
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
