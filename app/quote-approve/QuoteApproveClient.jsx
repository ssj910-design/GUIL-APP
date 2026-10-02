"use client";

// 공개 견적 승인 페이지의 실제 로직 — 로그인 없이 동작한다.
// quote_requests/units/sites는 RLS가 막혀 있어 로그인 없는 anon key로는 직접 못 읽는다(실측
// 확인) — 화면에 보여줄 요약은 app/api/approve-quote(GET)가 service role로 대신 조회해 내려준다.
// 1) 금액을 고객이 직접 입력해 확인("그 금액인 줄 몰랐다" 분쟁 방지, 청구서 알림톡과 같은 이유)
// → 2) 서명(SignaturePad 재사용, 기사앱 청구 승인과 동일 컴포넌트 — Storage 업로드는 anon으로도 됨)
// → 3) 제출 시 app/api/approve-quote(POST)가 서버에서 금액을 다시 계산해 대조하고 발주서를 발급한다.
import { useEffect, useState } from "react";
import { SignaturePad } from "@/app/components/formWidgets";

function fmtWon(n) {
  return `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
}

export default function QuoteApproveClient({ id }) {
  const [state, setState] = useState("loading"); // loading | notfound | wrongStatus | ready | done
  const [quote, setQuote] = useState(null);
  const [order, setOrder] = useState(null); // buildPurchaseOrderData() 결과 — 화면 표시용으로도 재사용
  const [amountInput, setAmountInput] = useState("");
  const [amountOk, setAmountOk] = useState(null); // null=미입력, true/false
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [doneInfo, setDoneInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/approve-quote?id=${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => null);
      if (cancelled) return;
      if (!res?.ok) { setState("notfound"); return; }
      if (res.status !== "작성") {
        setQuote({ status: res.status, purchaseOrderPdfUrl: res.purchaseOrderPdfUrl });
        setState("wrongStatus");
        return;
      }
      setOrder(res.order);
      setState("ready");
    })();
    return () => { cancelled = true; };
  }, [id]);

  function handleAmountChange(e) {
    const v = e.target.value;
    setAmountInput(v);
    if (!v.trim()) { setAmountOk(null); return; }
    const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
    setAmountOk(n === order.totalCost);
  }

  async function handleSubmit() {
    if (submitting || !signatureUrl || amountOk !== true || !agree) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/approve-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: id, signatureUrl, approvedAmountInput: order.totalCost }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.reason || "승인 처리에 실패했습니다");
      setDoneInfo(json);
      setState("done");
    } catch (err) {
      setError(err.message ?? "알 수 없는 오류가 발생했습니다");
    }
    setSubmitting(false);
  }

  if (state === "loading") {
    return <p className="flex-1 flex items-center justify-center text-sm text-slate-400">불러오는 중...</p>;
  }
  if (state === "notfound") {
    return <p className="flex-1 flex items-center justify-center text-sm text-slate-400 px-6 text-center">견적을 찾을 수 없습니다.</p>;
  }
  if (state === "wrongStatus") {
    const msg = quote.status === "요청접수" ? "아직 견적서가 발행되지 않았습니다."
      : quote.status === "승인" || quote.status === "자재지급완료" ? "이미 승인된 견적입니다."
      : quote.status === "반려" ? "반려·취소된 견적입니다."
      : "지금은 승인할 수 없는 상태입니다.";
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-sm text-slate-500">{msg}</p>
        {quote.purchaseOrderPdfUrl && (
          <a href={quote.purchaseOrderPdfUrl} className="text-sm font-bold text-blue-700 underline">발주서 확인</a>
        )}
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex-1 p-4">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
          <p className="text-base font-extrabold text-slate-800 mb-1">발주 승인이 완료됐습니다</p>
          <p className="text-xs text-slate-400 mb-5">발주서가 자동으로 발급됐습니다</p>
          <div className="text-left border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5 mb-5">
            <p><span className="text-slate-400">승인 금액</span><br /><span className="font-bold">{fmtWon(order.totalCost)}</span></p>
            <p><span className="text-slate-400">승인 일시</span><br /><span className="font-bold">{doneInfo.approvedAt.slice(0, 16).replace("T", " ")}</span></p>
          </div>
          <a href={doneInfo.pdfUrl} className="block w-full py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700">
            발주서 PDF 확인
          </a>
        </div>
      </div>
    );
  }

  // state === "ready"
  const canSubmit = amountOk === true && !!signatureUrl && agree && !submitting;
  return (
    <div className="flex-1 p-4">
      <div className="max-w-md mx-auto flex flex-col gap-3.5">
        <section className="bg-white rounded-2xl border border-slate-200 p-4.5 p-[18px]">
          <h1 className="text-lg font-extrabold text-slate-800">{order.siteUnit}</h1>
          <p className="text-xs text-slate-400 mb-3.5">{order.quoteTitle} · 문서번호 {order.quoteDocNumber}</p>
          <div className="text-sm space-y-1.5 border-b border-slate-100 pb-3 mb-3">
            <div className="flex justify-between gap-2"><span className="text-slate-400">현장 주소</span><span className="font-semibold text-right">{order.address}</span></div>
          </div>
          <div className="space-y-1.5">
            {order.items.map((it, i) => (
              <div key={i} className="flex justify-between text-xs gap-2">
                <span className="text-slate-700">{it.name}</span>
                <span className="text-slate-400">{fmtWon(it.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-baseline mt-3.5 pt-3.5 border-t-2 border-slate-800">
            <span className="text-xs font-bold text-slate-400">합계{order.vatIncluded ? " (VAT포함)" : " (VAT별도)"}</span>
            <span className="text-xl font-extrabold text-blue-700">{fmtWon(order.totalCost)}</span>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-[18px]">
          <p className="text-[11px] font-bold text-slate-400 mb-3">1 · 승인 금액 확인</p>
          <label className="text-xs font-bold text-slate-400 block mb-1.5">위 합계 금액을 그대로 입력해주세요</label>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3.5 py-2.5 text-base font-bold focus:outline-none focus:border-blue-600"
              inputMode="numeric"
              placeholder="예: 3800000"
              value={amountInput}
              onChange={handleAmountChange}
            />
            <span className="text-sm font-semibold text-slate-400">원</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">숫자만 입력하면 됩니다(쉼표 없이). 직접 입력해 확인한 기록은 발주서에 같이 남습니다.</p>
          {amountOk === false && <p className="text-xs font-bold text-red-600 bg-red-50 rounded-lg px-2.5 py-2 mt-2">금액이 일치하지 않습니다. 다시 확인해주세요.</p>}
          {amountOk === true && <p className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-2 mt-2">금액이 확인됐습니다.</p>}
        </section>

        <section className={`bg-white rounded-2xl border border-slate-200 p-[18px] transition-opacity ${amountOk === true ? "" : "opacity-50 pointer-events-none"}`}>
          <p className="text-[11px] font-bold text-slate-400 mb-3">2 · 서명</p>
          <SignaturePad url={signatureUrl} uploadFolder={`quotes/${id}/approval-signature`} onSigned={setSignatureUrl} onClear={() => setSignatureUrl(null)} />
        </section>

        <section className={`bg-white rounded-2xl border border-slate-200 p-[18px] transition-opacity ${signatureUrl ? "" : "opacity-50 pointer-events-none"}`}>
          <p className="text-[11px] font-bold text-slate-400 mb-3">3 · 발주 확정</p>
          <label className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed mb-3.5">
            <input type="checkbox" className="mt-0.5 shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            위 견적 내용과 금액을 확인했으며, 이 서명으로 발주를 확정하는 데 동의합니다.
          </label>
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 rounded-lg px-2.5 py-2 mb-3">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl text-sm font-extrabold text-white bg-blue-700 disabled:bg-slate-300"
          >
            {submitting ? "처리 중..." : "승인하기"}
          </button>
        </section>
      </div>
    </div>
  );
}
