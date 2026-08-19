"use client";

// 견적요청 품목편집+발행 화면 — 기사가 신청한 부품명/수량(원본, 읽기전용 참고)을
// 관리자가 세부 품목(자재비/인건비 구분·규격·단가 등)으로 확장해 "저장"으로 발행한다
// (PDF 생성 + DB 저장, 발송은 하지 않음). 발송은 목록의 "재발송"(QuoteSendModal)에서
// 따로 처리한다 — 품목편집과 발송을 분리해 실수로 같이 눌러 중복발송되는 걸 막는다.
//
// 공급자/고객 정보·안내메시지·첨부파일은 QuoteRecipientFields.jsx를 QuoteSendModal.jsx
// (재발송)과 공유한다. 여기서 입력한 수신자·참조인 정보는 "저장" 시 quote_requests에
// 그대로 저장돼, 나중에 재발송을 열 때 이어서 쓸 수 있다.
//
// 품목 테이블의 공급가액/세액 컬럼은 화면 표시 전용이다 — 실제 PDF(lib/quotePdf.js)와
// 저장 데이터(quote_items, transport_cost 등)는 그대로 두고 입력 화면만 청구스
// (chungoose.ai) 스타일에 맞춰 다듬은 것. 할인 정보(discount_amount)는 저장·PDF·
// 재발송 총액까지 반영된다(lib/utils.js의 quoteGrandTotal, lib/quotePdf.js 참고).
//
// 오른쪽 미리보기 카드는 실제 PDF 서식을 재현하지 않는 간단한 요약이다 — 새 계산 없이
// 이미 있는 값을 다시 보여줄 뿐이다.
import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { quoteGrandTotal } from "@/lib/utils";
import { Modal, inputCls, PhotoGrid } from "@/app/components/admin/adminShared";
import { COMPANY } from "@/lib/company";
import { useQuoteRecipientFields, QuoteRecipientInfo, QuoteRecipientExtras } from "@/app/components/admin/QuoteRecipientFields";

const CATEGORIES = ["자재비", "인건비"];
const VAT_RATE = 0.1;

function emptyItem(category) {
  return { category, name: "", unitNo: "", spec: "", unit: "", qty: 1, unitPrice: 0, partId: null, returnRequired: false, qtyTaken: null };
}

// 공급가액/세액/합계 — 품목 행과 운반비/안전관리비/이윤 고정행이 공유하는 계산식.
function rowCalc(qty, unitPrice) {
  const supply = Number(qty || 0) * Number(unitPrice || 0);
  const vat = Math.round(supply * VAT_RATE);
  return { supply, vat, total: supply + vat };
}

export default function QuoteItemsModal({ quote, site, siteManagers, profiles, inventoryProducts, onClose, onSaved }) {
  const [items, setItems] = useState(() => {
    if (quote.quoteItems?.length) return quote.quoteItems;
    // 처음 여는 경우 기사 원본(부품명+수량)을 자재비 1행에 프리필
    return quote.part ? [{ ...emptyItem("자재비"), name: quote.part, qty: quote.quantity || 1 }] : [];
  });
  const [recipientName, setRecipientName] = useState(quote.recipientName || (site?.name ?? quote.siteName ? `${site?.name ?? quote.siteName} 대표 귀중` : ""));
  const [quoteTitle, setQuoteTitle] = useState(quote.quoteTitle || "");
  const [quoteNumber, setQuoteNumber] = useState(quote.quoteNumber || "");
  const [quoteDate, setQuoteDate] = useState(quote.quoteIssuedDate || TODAY_STR);
  const [transportCost, setTransportCost] = useState(quote.transportCost || 0);
  const [safetyCost, setSafetyCost] = useState(quote.safetyCost || 0);
  const [profit, setProfit] = useState(quote.profit || 0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(() => Number(quote.discountAmount) || 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rf = useQuoteRecipientFields(quote, siteManagers, profiles);

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

  // 이미 저장된 할인금액이 있으면(재편집) 소계 대비 할인율도 화면에 같이 보여준다.
  useEffect(() => {
    if (quote.discountAmount) handleDiscountAmount(quote.discountAmount);
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
  // 할인 적용 전 소계 — 할인율(%) 계산의 기준값(할인은 이 금액 대비 %).
  const preDiscountSubtotal = itemsSubtotal + Number(transportCost || 0) + Number(safetyCost || 0) + Number(profit || 0);
  // PDF(lib/quotePdf.js)의 "소계"와 동일하게 할인을 반영한 값 — 저장·발송 총액(grandTotal)의 기준.
  const subtotal = preDiscountSubtotal - Number(discountAmount || 0);
  const grandTotal = quoteGrandTotal(items, transportCost, safetyCost, profit, discountAmount);

  // 오른쪽 미리보기 카드용 — 자재비/인건비 구분 없이 하나로 합치고, 운반비/안전관리비/이윤/할인은
  // 값이 0보다 클 때(할인은 입력했을 때)만 같은 목록에 끼워 넣는다. 새 계산 없이 기존 값을 다시
  // 나열만 함. 구분(CATEGORIES) 순서로 정렬 — 왼쪽 폼·PDF(lib/quotePdf.js)와 같은 순서로 보여야
  // 발행 전 대조가 의미 있다. sort는 안정 정렬이라 같은 구분 내 순서는 보존된다.
  const previewRows = [
    ...[...items]
      .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))
      .map((it) => ({
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
    ...(Number(discountAmount) > 0 ? [{ name: "할인", qty: 1, unitPrice: -Number(discountAmount), amount: -Number(discountAmount) }] : []),
  ];

  // 할인율/할인금액은 서로의 값을 기준으로 자동 계산되는 입력 보조 — 실제 저장·PDF·발송
  // 총액은 discountAmount(₩) 기준으로 quoteGrandTotal에 반영된다.
  function handleDiscountPercent(value) {
    const pct = Number(value) || 0;
    setDiscountPercent(pct);
    setDiscountAmount(Math.round((preDiscountSubtotal * pct) / 100));
  }
  function handleDiscountAmount(value) {
    const amt = Number(value) || 0;
    setDiscountAmount(amt);
    setDiscountPercent(preDiscountSubtotal > 0 ? Math.round((amt / preDiscountSubtotal) * 1000) / 10 : 0);
  }

  // 발행만 한다 — 발송은 목록의 "재발송"(QuoteSendModal)에서 따로 처리한다(품목편집과 발송을
  // 분리해 실수로 같이 눌러 중복발송되는 걸 막고, 저장 시점에 입력해둔 수신자·참조인 정보가
  // 그대로 남게 한다).
  async function handleSave() {
    if (items.length === 0) return;
    setSaving(true);
    setError("");

    const patch = {
      quote_items: items,
      transport_cost: Number(transportCost) || 0,
      safety_cost: Number(safetyCost) || 0,
      profit: Number(profit) || 0,
      // discount_amount 컬럼은 103 마이그레이션 이후에만 존재 — 할인을 실제로 쓸 때만 써서
      // 마이그레이션 전에도(할인 안 쓰는) 기존 저장이 깨지지 않게 한다.
      ...(Number(discountAmount) > 0 ? { discount_amount: Number(discountAmount) } : {}),
      quote_number: quoteNumber || null,
      recipient_name: recipientName || null,
      quote_title: quoteTitle || null,
      quote_issued_date: quoteDate,
      // 발송 화면(QuoteRecipientInfo/Extras)에서 입력한 값도 저장 시 같이 반영한다 — 전엔
      // "바로 발송하기"를 눌러야만 저장돼서, 저장만 하면 담당자·참조인 변경이 다음에 열어도
      // 사라져 있던 문제가 있었다.
      recipient_email: rf.email || null,
      recipient_phone: rf.phone || null,
      sender_cc_email: rf.senderCcEmail || null,
      reference_email: rf.referenceEmail || null,
      reference_phone: rf.referencePhone || null,
      notice_message: rf.noticeMessage || null,
      attachment_urls: rf.attachments,
    };

    const pdfRes = await fetch("/api/generate-quote-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRequestId: quote.id,
        siteName: site?.name ?? quote.siteName,
        quoteNumber, recipientName, quoteTitle, quoteDate,
        items, transportCost, safetyCost, profit, discountAmount,
      }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, reason: e.message }));

    if (!pdfRes.ok) {
      setError("PDF 생성 실패: " + pdfRes.reason);
      setSaving(false);
      return;
    }
    patch.quote_pdf_url = pdfRes.url;
    patch.status = "작성";

    const { error: dbError } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setSaving(false);
      return;
    }

    onSaved({
      quoteItems: items, transportCost: Number(transportCost) || 0, safetyCost: Number(safetyCost) || 0,
      profit: Number(profit) || 0, discountAmount: Number(discountAmount) || 0, quoteNumber, recipientName, quoteTitle,
      quoteIssuedDate: quoteDate, quotePdfUrl: pdfRes.url, status: "작성",
      recipientEmail: rf.email || null, recipientPhone: rf.phone || null,
      senderCcEmail: rf.senderCcEmail || null, referenceEmail: rf.referenceEmail || null, referencePhone: rf.referencePhone || null,
      noticeMessage: rf.noticeMessage || null, attachmentUrls: rf.attachments,
    });
    setSaving(false);
    onClose();
  }

  const saveDisabled = items.length === 0 || saving;

  return (
    <Modal title={`${site?.name ?? quote.siteName} 견적 품목편집`} onClose={saving ? () => {} : onClose} wide="2xl">
      <QuoteRecipientInfo rf={rf} siteManagers={siteManagers} />

      <div className="flex gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm">
            <p className="text-xs font-bold text-slate-500 mb-1">기사 요청 원본 (참고용)</p>
            <p className="font-semibold text-slate-700">{quote.part || quote.constructionType} · {quote.quantity ?? "-"}개</p>
            {quote.photoUrls?.length > 0 && (
              <div className="mt-2 max-w-xs">
                <PhotoGrid urls={quote.photoUrls} cols={6} />
              </div>
            )}
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
            <p className="text-xs font-bold text-slate-500 mb-2">할인 정보 (입력하면 위 소계·합계와 PDF에 반영됩니다)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-slate-500 mb-1">할인율(%)</p>
                <input type="number" className={inputCls} value={discountPercent} onChange={(e) => handleDiscountPercent(e.target.value)} /></div>
              <div><p className="text-xs text-slate-500 mb-1">할인금액(원)</p>
                <input type="number" className={inputCls} value={discountAmount} onChange={(e) => handleDiscountAmount(e.target.value)} /></div>
            </div>
          </div>
        </div>

        <div className="w-80 shrink-0">
          <div className="sticky top-0 h-full border border-slate-200 rounded-xl p-4 bg-white">
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
            </div>
          </div>
        </div>
      </div>

      <QuoteRecipientExtras rf={rf} showChannels={false} />

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} disabled={saving} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5 disabled:opacity-40">닫기</button>
        <button
          onClick={handleSave}
          disabled={saveDisabled}
          className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </Modal>
  );
}
