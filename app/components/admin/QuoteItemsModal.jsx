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
import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Search, History } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { quoteGrandTotal, quoteDisplayTotal } from "@/lib/utils";
import { currentStock } from "@/lib/inventoryStock";
import { Modal, inputCls, PhotoGrid } from "@/app/components/admin/adminShared";
import { COMPANY } from "@/lib/company";
import { useQuoteRecipientFields, QuoteRecipientInfo, QuoteRecipientExtras } from "@/app/components/admin/QuoteRecipientFields";
import { authFetch } from "@/lib/apiFetch";
import { historyQuotes, buildItemIndex, suggestItems, priceRangeLabel, shortDateLabel, normName, applySuggestion } from "@/lib/quoteHistory";
import PastQuotePicker from "@/app/components/PastQuotePicker";

const CATEGORIES = ["자재비", "인건비"];
const VAT_RATE = 0.1;
const UNIT_PRESETS = ["EA", "SET", "식", "M"];

function emptyItem(category) {
  return { category, name: "", unitNo: "", spec: "", unit: "", qty: 1, unitPrice: 0, partId: null, returnRequired: false, qtyTaken: null };
}

// 공급가액/세액/합계 — 품목 행과 운반비/안전관리비/이윤 고정행이 공유하는 계산식.
function rowCalc(qty, unitPrice) {
  const supply = Number(qty || 0) * Number(unitPrice || 0);
  const vat = Math.round(supply * VAT_RATE);
  return { supply, vat, total: supply + vat };
}

// 재고관리(부품마스터)에서 검색해 골라 견적 품목에 연동한다 — 재고관리 화면(InventoryAdmin.jsx)의
// 검색+목록 패턴을 재사용, 재고 수량은 currentStock()으로 그 자리에서 같이 보여준다.
function InventoryPickerModal({ products, movements, onClose, onSelect }) {
  const [search, setSearch] = useState("");
  const active = products.filter((p) => p.active !== false);
  const q = search.trim().toLowerCase();
  const rows = active.filter((p) => !q || `${p.materialNo} ${p.name}`.toLowerCase().includes(q));
  return (
    <Modal title="재고에서 선택" onClose={onClose}>
      <input
        className={inputCls + " mb-3"}
        placeholder="자재번호, 품명 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-8">검색 결과가 없습니다</p>}
        {rows.map((p) => {
          const stock = currentStock(movements, p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 text-left"
            >
              {p.photoUrls?.[0] ? (
                <img src={p.photoUrls[0]} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-slate-100 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{p.materialNo}{p.spec ? ` · ${p.spec}` : ""}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-xs font-bold ${stock > 0 ? "text-emerald-600" : "text-red-500"}`}>재고 {stock}</p>
                {p.salePrice != null && <p className="text-[11px] text-slate-400">{Number(p.salePrice).toLocaleString()}원</p>}
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// 품명 입력칸 + 자동완성 — 과거 견적에서 쓴 이름(횟수·단가 범위 표시)과 재고 품목을 후보로 보여준다.
// 과거 견적 후보를 고르면 이름·규격·단위와(자재비일 때, 단가가 비어 있으면) 최근 단가를 채우고,
// 재고 후보는 기존 "재고 연동"과 똑같이 partId까지 연결한다. 인건비는 단가를 자동으로 안 채운다
// (같은 이름이어도 공사 규모에 따라 매번 다르게 나오기 때문).
function ItemNameInput({ item, index, itemIndex, inventoryProducts, onChange, onPick }) {
  const [focused, setFocused] = useState(false);
  const text = item.name ?? "";
  const hist = useMemo(() => (focused ? suggestItems(itemIndex, text, item.category, 6) : []), [focused, itemIndex, text, item.category]);
  const inv = useMemo(() => {
    const q = normName(text);
    if (!focused || !q || item.category !== "자재비") return [];
    return (inventoryProducts ?? []).filter((p) => p.active !== false && normName(p.name).includes(q)).slice(0, 3);
  }, [focused, text, item.category, inventoryProducts]);
  const exact = hist.length === 1 && normName(hist[0].name) === normName(text) && hist[0].normSpec === normName(item.spec) && inv.length === 0;
  const open = focused && !exact && (hist.length > 0 || inv.length > 0);
  return (
    <div className="relative">
      <input
        className={inputCls}
        placeholder="품명"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[24rem] max-w-[80vw] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {hist.map((e) => (
            <button
              key={e.key}
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); onPick(index, { kind: "history", entry: e }); setFocused(false); }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-blue-50 border-b border-slate-100 last:border-0"
            >
              <span className="min-w-0 truncate">
                <span className="text-sm font-semibold text-slate-800">{e.name}</span>
                {e.spec && <span className="ml-1.5 text-xs text-slate-500">{e.spec}</span>}
              </span>
              <span className="text-[11px] text-slate-500 shrink-0">{priceRangeLabel(e)}</span>
            </button>
          ))}
          {inv.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(ev) => { ev.preventDefault(); onPick(index, { kind: "inventory", product: p }); setFocused(false); }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-emerald-50 border-b border-slate-100 last:border-0"
            >
              <span className="text-sm font-semibold text-slate-800 truncate">
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded px-1 py-0.5 mr-1.5 align-middle">재고</span>{p.name}
                {p.spec && <span className="ml-1.5 text-xs font-normal text-slate-500">{p.spec}</span>}
              </span>
              {p.salePrice != null && <span className="text-[11px] text-slate-500 shrink-0">{Number(p.salePrice).toLocaleString()}원</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuoteItemsModal({ quote, site, siteManagers, profiles, inventoryProducts, inventoryStockMovements, quoteHistory, onClose, onSaved }) {
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false); // 재고 연동 모달 — 고르면 자재비 품목을 새로 하나 추가
  const [pastPickerOpen, setPastPickerOpen] = useState(false); // 이전 견적 불러오기
  const pastQuotes = useMemo(() => historyQuotes(quoteHistory, quote.id), [quoteHistory, quote.id]);
  const itemIndex = useMemo(() => buildItemIndex(pastQuotes), [pastQuotes]);
  const [items, setItems] = useState(() => {
    if (quote.quoteItems?.length) return quote.quoteItems.map((it) => ({ ...emptyItem(it.category), ...it }));
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
  const [vatIncluded, setVatIncluded] = useState(!!quote.vatIncluded);
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

  // 단위 드롭다운에서 "직접입력"을 고르면 그 행만 텍스트 입력으로 바꾼다 — 프리셋에 없는
  // 값(불러온 기존 데이터 포함)이면 굳이 이 목록에 없어도 자동으로 텍스트 입력으로 보인다.
  const [customUnitIdx, setCustomUnitIdx] = useState(() => new Set());
  function setCustomUnit(idx, on) {
    setCustomUnitIdx((prev) => {
      const next = new Set(prev);
      if (on) next.add(idx); else next.delete(idx);
      return next;
    });
  }

  function addItem(category) {
    setItems((prev) => [...prev, emptyItem(category)]);
  }
  // 수량·단가를 고치면 "이전 견적에서 불러옴" 표시(_src)를 뗀다 — 이제 그대로 가져온 값이 아니다.
  function updateItem(idx, patch) {
    const edited = "qty" in patch || "unitPrice" in patch;
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch, ...(edited ? { _src: null } : {}) } : it)));
  }
  // 품명 자동완성에서 후보를 골랐을 때 — 과거 견적 후보는 이름·규격·단위(+단가가 비었을 때 자재비 최근 단가),
  // 재고 후보는 기존 "재고 연동"과 같은 필드로 채운다.
  function pickSuggestion(idx, s) {
    setItems((prev) => prev.map((it, i) => (i === idx ? applySuggestion(it, s) : it)));
  }
  // 이전 견적에서 고른 항목은 현재 품목 목록 아래에 추가한다(덮어쓰지 않음). 운반비·안전관리비는
  // 지금 값이 비어 있을 때만 채워서 이미 입력해 둔 값을 건드리지 않는다.
  function applyPastQuote({ items: picked, transportCost: t, safetyCost: sc }) {
    setItems((prev) => [...prev, ...picked.map((it) => ({ ...emptyItem(it.category ?? "자재비"), ...it }))]);
    if (t != null && !Number(transportCost)) setTransportCost(t);
    if (sc != null && !Number(safetyCost)) setSafetyCost(sc);
    setPastPickerOpen(false);
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
  const displayTotal = quoteDisplayTotal(grandTotal, vatIncluded);

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
    // _src는 화면 표시용 임시 표시라 저장·PDF에는 넣지 않는다.
    const cleanItems = items.map(({ _src, ...rest }) => rest);
    setSaving(true);
    setError("");

    const patch = {
      quote_items: cleanItems,
      transport_cost: Number(transportCost) || 0,
      safety_cost: Number(safetyCost) || 0,
      profit: Number(profit) || 0,
      // discount_amount 컬럼은 103 마이그레이션 이후에만 존재 — 할인을 실제로 쓸 때만 써서
      // 마이그레이션 전에도(할인 안 쓰는) 기존 저장이 깨지지 않게 한다.
      ...(Number(discountAmount) > 0 ? { discount_amount: Number(discountAmount) } : {}),
      // vat_included 컬럼도 141 마이그레이션 이후에만 존재 — 같은 이유로 체크했을 때만 쓴다.
      ...(vatIncluded ? { vat_included: true } : {}),
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

    const pdfRes = await authFetch("/api/generate-quote-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRequestId: quote.id,
        siteName: site?.name ?? quote.siteName,
        quoteNumber, recipientName, quoteTitle, quoteDate,
        items: cleanItems, transportCost, safetyCost, profit, discountAmount, vatIncluded,
      }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, reason: e.message }));

    if (!pdfRes.ok) {
      setError("PDF 생성 실패: " + pdfRes.reason);
      setSaving(false);
      return;
    }
    patch.quote_pdf_url = pdfRes.url;
    // 최초 작성(요청접수 → 작성)일 때만 상태를 넘긴다 — 이미 승인·자재지급완료까지 진행된
    // 견적을 최고관리자가 사후 수정할 때는(오탈자·품목 정정 등) 상태를 "작성"으로 되돌리면
    // 안 되고(재승인·재지급을 처음부터 다시 밟게 됨), 품목·금액·PDF만 갱신하고 진행상태는
    // 그대로 둔다.
    const nextStatus = quote.status === "요청접수" ? "작성" : quote.status;
    patch.status = nextStatus;

    const { error: dbError } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setSaving(false);
      return;
    }

    onSaved({
      quoteItems: cleanItems, transportCost: Number(transportCost) || 0, safetyCost: Number(safetyCost) || 0,
      profit: Number(profit) || 0, discountAmount: Number(discountAmount) || 0, vatIncluded, quoteNumber, recipientName, quoteTitle,
      quoteIssuedDate: quoteDate, quotePdfUrl: pdfRes.url, status: nextStatus,
      recipientEmail: rf.email || null, recipientPhone: rf.phone || null,
      senderCcEmail: rf.senderCcEmail || null, referenceEmail: rf.referenceEmail || null, referencePhone: rf.referencePhone || null,
      noticeMessage: rf.noticeMessage || null, attachmentUrls: rf.attachments,
    });
    setSaving(false);
    onClose();
  }

  const saveDisabled = items.length === 0 || saving;

  return (
    <>
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
            <div><p className="text-xs font-bold text-slate-500 mb-1">견적일</p>
              <input type="date" className={inputCls} value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} /></div>
            <div><p className="text-xs font-bold text-slate-500 mb-1">수신자</p>
              <input className={inputCls} placeholder="OO 귀중" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} /></div>
            <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">견적명</p>
              <input className={inputCls} value={quoteTitle} onChange={(e) => setQuoteTitle(e.target.value)} /></div>
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
                <div className="flex items-center gap-1.5">
                  {category === "자재비" && (
                    <button onClick={() => setPastPickerOpen(true)} className="flex items-center gap-1 text-xs font-bold text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1">
                      <History size={12} /> 이전 견적 불러오기
                    </button>
                  )}
                  {category === "자재비" && (
                    <button onClick={() => setInventoryPickerOpen(true)} className="flex items-center gap-1 text-xs font-bold text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1">
                      <Search size={12} /> 재고 연동
                    </button>
                  )}
                  <button onClick={() => addItem(category)} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1">
                    <Plus size={12} /> 직접 입력
                  </button>
                </div>
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
                          <ItemNameInput item={it} index={idx} itemIndex={itemIndex} inventoryProducts={inventoryProducts} onChange={(v) => updateItem(idx, { name: v })} onPick={pickSuggestion} />
                        </div>
                        <div className="flex-[5] min-w-0">
                          <input className={inputCls} placeholder="호기" value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })} />
                        </div>
                        <div className="flex-[20] min-w-0">
                          <input className={inputCls} placeholder="규격" value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                        </div>
                        <div className="flex-[4] min-w-0">
                          {customUnitIdx.has(idx) || (it.unit && !UNIT_PRESETS.includes(it.unit)) ? (
                            <div className="flex items-center gap-1">
                              <input
                                className={inputCls}
                                placeholder="단위 직접입력"
                                value={it.unit}
                                onChange={(e) => updateItem(idx, { unit: e.target.value })}
                              />
                              <button
                                type="button"
                                onClick={() => { setCustomUnit(idx, false); updateItem(idx, { unit: "" }); }}
                                className="shrink-0 text-slate-400 hover:text-slate-600"
                                title="목록에서 선택"
                              >
                                <ChevronDown size={12} />
                              </button>
                            </div>
                          ) : (
                            <select
                              className={inputCls}
                              value={it.unit}
                              onChange={(e) => (e.target.value === "__custom__" ? setCustomUnit(idx, true) : updateItem(idx, { unit: e.target.value }))}
                            >
                              <option value="">단위</option>
                              <option value="EA">EA</option>
                              <option value="SET">SET</option>
                              <option value="식">식</option>
                              <option value="M">M</option>
                              <option value="__custom__">직접입력</option>
                            </select>
                          )}
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
                      <div className="flex justify-between items-center gap-3 text-xs text-slate-500">
                        {it._src ? <span className="ml-5 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">↳ {it._src}{it._src.endsWith("단가") ? "" : " 견적에서 불러옴"} — 단가 확인</span> : <span />}
                        <span className="flex items-center gap-3">
                          <span className="font-bold text-slate-400">소계</span>
                          <span>공급가액 <b className="text-slate-700 font-semibold">{supply.toLocaleString()}</b></span>
                          <span>세액 <b className="text-slate-700 font-semibold">{vat.toLocaleString()}</b></span>
                          <span>합계 <b className="text-slate-800 font-bold">{total.toLocaleString()}</b></span>
                        </span>
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
            <div className="flex justify-between items-center font-bold">
              <span className="flex items-center gap-1.5">
                합계({vatIncluded ? "VAT포함" : "VAT별도"}, 천단위 절사)
                <label className="flex items-center gap-1 font-normal text-xs text-slate-500 ml-1">
                  <input type="checkbox" checked={vatIncluded} onChange={(e) => setVatIncluded(e.target.checked)} />
                  VAT포함
                </label>
              </span>
              <span>{displayTotal.toLocaleString()}원</span>
            </div>
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
              <div className="flex justify-between font-bold"><span>합계({vatIncluded ? "VAT포함" : "VAT별도"})</span><span>{displayTotal.toLocaleString()}원</span></div>
            </div>
          </div>
        </div>
      </div>

      <QuoteRecipientExtras rf={rf} />

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
    {pastPickerOpen && (
      <PastQuotePicker Shell={Modal} inputCls={inputCls} quotes={pastQuotes} site={site} quote={quote} onClose={() => setPastPickerOpen(false)} onApply={applyPastQuote} />
    )}
    {inventoryPickerOpen && (
      <InventoryPickerModal
        products={inventoryProducts}
        movements={inventoryStockMovements ?? []}
        onClose={() => setInventoryPickerOpen(false)}
        onSelect={(p) => {
          setItems((prev) => [...prev, { ...emptyItem("자재비"), partId: p.id, name: p.name, spec: p.spec ?? "", unitPrice: p.salePrice ?? 0 }]);
          setInventoryPickerOpen(false);
        }}
      />
    )}
    </>
  );
}
