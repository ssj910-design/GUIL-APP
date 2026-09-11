"use client";

// 부품교체·공사 내역 — 청구 건 조회 + 합계. 각 건 클릭 시 상세보기(사진 포함)에서
// 내용(관리자 메모) 추가, 담당자 변경, 기한(교체일자) 수정이 가능하다.
import { useState, useContext, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, X, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { shortDate, formatUnitLabel, quoteGrandTotal, freeReasonOf, freeReasonLabel, isCostPending, quoteMaterialItems, receivedTotalOf, receivedStatusOf, billingPaymentBucket, billingDueAmount, inferQuoteUnitId } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { mapBilling } from "@/lib/mappers";
import { BRAND } from "@/lib/company";
import { uploadPhoto } from "@/lib/photos";
import { locOf, addressOf, personOf, StatusBadge, AdminTable, Modal, inputCls, PhotoGrid, DateTextInput, EditableDate, EditableSelect, AdminAuthContext, SiteAutocomplete } from "@/app/components/admin/adminShared";
import ReplacementCertificateViewer from "@/app/components/admin/ReplacementCertificateViewer";

const BILLING_METHODS = ["계좌이체", "CMS", "지로", "무자료"];
// 무상 처리 사유 — 기사어플(BillingTab.jsx)의 FM/하자/서비스와 동일 3개(견적서 참조는
// "무상"이 아니라 별개 상태라 여기 포함하지 않는다).
const FREE_REASONS = ["FM", "하자", "서비스"];

// 목록·완료보고서에서 "현장 · 호기"를 표시할 때 쓴다 — 한 청구가 여러 호기를 같이 다루면
// (여러 호기를 한 번에 청구한 경우) 대표 호기 하나만 보여주는 locOf 대신 전체 호기를 같이 보여준다.
function siteUnitOf(b, data) {
  return b.elevatorNos?.length > 1
    ? `${data.sites.find((s) => s.id === data.units.find((u) => u.id === b.unitId)?.siteId)?.name ?? b.siteName ?? "-"} · ${formatUnitLabel(b.elevatorNos)}`
    : locOf(data, b.unitId, b.siteName, b.elevatorNo);
}

// 목록의 "현장" 열 — 호기는 별도 열로 뺐으니 현장명만.
function siteNameOf(b, data) {
  return data.sites.find((s) => s.id === data.units.find((u) => u.id === b.unitId)?.siteId)?.name ?? b.siteName ?? "-";
}

// 청구 한 건은 목록에서 한 행이 기본이지만, 품목마다 호기를 다르게 지정해둔(다호기) 청구는
// 호기·교체내역만 호기별로 행을 나누고(다른 열은 rowSpan으로 합쳐서 한 번만 보여줌 — 그 외
// 열은 청구 한 건 단위 값이라 호기별로 나눌 값이 아니다), "이 호기엔 뭘 교체했는지"가 한
// 줄에 섞이지 않고 바로 보이게 한다. 품목에 호기 지정이 하나도 없으면(단일 호기 청구 등)
// 기존처럼 통짜 한 행 그대로.
function unitPartRowsFor(b, data) {
  const items = (b.partPhotos ?? []).filter((p) => p.name?.trim());
  const hasPerUnitTags = items.length > 1 && items.some((it) => it.unit);
  if (!hasPerUnitTags) {
    // elevatorNo(s)는 옛 텍스트 필드라 견적 연동 청구처럼 unit_id(v2 FK)만 채워진 건에서는
    // 비어있다 — 그럴 때 data.units에서 실제 호기를 찾아 대신 쓴다(locOf와 동일한 우선순위).
    const unitNoFromId = data.units.find((u) => u.id === b.unitId)?.unitNo;
    const label = formatUnitLabel(b.elevatorNos?.length ? b.elevatorNos : (b.elevatorNo || unitNoFromId));
    return [{ unitLabel: label || "-", part: b.part }];
  }
  const groups = new Map();
  for (const it of items) {
    const key = it.unit || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return [...groups.entries()].map(([unit, its]) => (
    { unitLabel: unit ? formatUnitLabel(unit) : "호기 미지정", part: its.map((it) => `${it.name}${it.qty ? ` ${it.qty}개` : ""}`).join(", ") }
  ));
}

// 교체확인자 — 기사가 현장에서 실제로 서명·전화승인을 받은 사람(성명(연락처)). 옛 데이터나
// 관리자 직접입력(서명 없이 contact_phone만 있는 건)은 그 연락처로 대신한다.
function signerLabel(b) {
  if (b.approverName || b.approverPhone) return `${b.approverName || "-"}${b.approverPhone ? `(${b.approverPhone})` : ""}`;
  return b.contactPhone || "-";
}

// 청구 건 하나를 교체확인서 PDF 입력 형태로 바꾼다. 부품이 2개 이상(billing_part_rows
// 기반 구조화 저장건)이면 부품별 단가·금액까지 나오고, 그 전 방식(부품 1개 또는 옛
// 데이터)으로 남은 건은 단가 정보가 없어 수량만 보여준다 — 없는 값을 지어내지 않는다.
function buildCertificateData(b, data) {
  const items = (b.partPhotos?.length > 1 ? b.partPhotos : null)?.map((p) => ({
    name: p.name,
    qty: p.qty,
    amount: p.amount ?? null,
    beforeUrls: p.beforeUrls ?? [],
    afterUrls: p.afterUrls ?? [],
  })) ?? [{
    name: b.part,
    qty: null,
    amount: b.isFree ? null : b.cost,
    beforeUrls: b.beforePhotoUrls ?? [],
    afterUrls: b.afterPhotoUrls ?? [],
  }];
  // 자체처리 견적건은 기사 화면엔 금액을 숨기지만(billings.cost가 null로 저장됨), 완료보고서는
  // 관리자가 견적서에 적은 실제 금액을 보여줘야 한다 — 품목별 금액(견적서 단가×수량)이 다 있으면
  // 그 합계를 대신 쓴다.
  const itemsTotal = items.length && items.every((it) => it.amount != null) ? items.reduce((sum, it) => sum + it.amount, 0) : null;

  // 견적 연동 건(자체처리)은 품목별 금액을 문서에 찍지 않는다 — 청구 금액은 견적 승인 금액
  // (인건비·운반비·안전관리비·이윤 포함)인데 품목표엔 자재만 나오니, 품목 금액을 같이 보여주면
  // 합이 합계와 안 맞는 문서가 된다. 기사앱 서명 미리보기와 같은 규칙. 합계 계산엔 그대로 쓴다.
  const certItems = b.quoteRequestId && !b.isOutsourced
    ? items.map((it) => ({ ...it, amount: null }))
    : items;

  const siteUnit = siteUnitOf(b, data);
  const replaceDate = shortDate(b.replaceDate);

  return {
    billingId: b.id,
    docNumber: `${BRAND.code}-${b.id.slice(0, 8).toUpperCase()}`,
    issuedDate: shortDate(new Date().toISOString().slice(0, 10)),
    siteUnit,
    // 다운로드 파일명 겸 Storage 오브젝트 이름 — 미리보기 창 내장 뷰어의 저장 버튼이
    // URL 마지막 조각을 파일명으로 쓰기 때문에 둘이 같아야 한다. 경로/파일명에 못 쓰는
    // 문자는 여기서 미리 털어낸다(서버도 같은 규칙으로 한 번 더 막는다).
    fileName: `${siteUnit.replace(" · ", " ")} 부품교체확인서 ${replaceDate}`.replace(/[\/:*?"<>|]/g, " "),
    address: addressOf(data, b.unitId, b.siteName),
    // 고객이 보는 문서라 외주 여부는 노출하지 않는다 — 담당 기사 이름을 그대로 쓴다.
    engineerName: personOf(data, b.engineerId, b.engineer),
    replaceDate,
    items: certItems,
    totalCost: b.cost ?? itemsTotal,
    isFree: b.isFree,
    freeReason: freeReasonOf(b.notes),
    approval: b.approvalMethod
      ? {
          method: b.approvalMethod,
          signatureUrl: b.signatureUrl,
          approverName: b.approverName,
          approverPhone: b.approverPhone,
          approvedAt: b.approvedAt ? shortDate(b.approvedAt.slice(0, 10)) : null,
        }
      : null,
  };
}

// 수정 모드·새 청구 등록에서 쓰는 사진 편집 — 여러 장(교체 전/후)이든 1장(확인서, 배열로만
// 감싸서 재사용)이든 같은 위젯 하나로 처리한다. 클릭 선택은 관리자 콘솔의 기존 업로드 패턴
// (uploadPhoto + 파일 input)과 동일, 끌어다 놓기는 FileCarousel(adminShared.jsx)과 같은 방식.
function EditablePhotoRow({ label, urls, onChange, uploadFolder }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const newUrls = await Promise.all(files.map((f) => uploadPhoto(f, uploadFolder)));
      onChange([...urls, ...newUrls]);
    } catch (err) {
      alert("사진 업로드 실패: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
    }
  }
  function handleFiles(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    uploadFiles(files);
  }
  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <p className="text-[11px] font-bold text-slate-500 mb-1">{label}</p>
      <div
        className={`flex flex-wrap gap-2 p-1.5 -m-1.5 rounded-xl ${dragOver ? "ring-2 ring-blue-300 bg-blue-50/40" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {urls.map((url, i) => (
          <div key={i} className="relative">
            <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
            <button
              type="button"
              onClick={() => onChange(urls.filter((_, idx) => idx !== i))}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center leading-none"
            >
              ×
            </button>
          </div>
        ))}
        <label className={`w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer text-xs ${dragOver ? "border-blue-400 bg-blue-50 text-blue-500" : "border-slate-300 text-slate-400"}`}>
          {uploading ? "..." : dragOver ? "놓기" : "+"}
          <input type="file" accept="image/*" multiple={label !== "확인서"} className="hidden" onChange={handleFiles} disabled={uploading} />
        </label>
      </div>
    </div>
  );
}

function emptyBillingItem() {
  return { name: "", qty: "", amount: "", beforeUrls: [], afterUrls: [] };
}

// 새 청구 등록 폼의 품목 입력 — 품명·수량·금액에 품목별 전/후 사진까지 한 번에 받는다
// (기존 상세수정 화면의 품목별 수정 UI와 동일한 필드 구성, 여기선 행 추가·삭제까지 지원).
// unitOptions(호기 라벨 배열)를 주면 품목마다 어느 호기 것인지 고를 수 있다 — 이 청구가
// 여러 호기를 같이 다룰 때만 의미가 있어(단일 호기면 다 그 호기 것이므로) 상위(BillingDetailModal)
// 에서 호기를 2개 이상 골랐을 때만 넘겨준다. item.unit에 저장 — SitesAdmin.jsx 호기상세
// 부품교체내역이 이 값으로 "이 호기 것만" 걸러서 보여준다(기존부터 있던 컨벤션).
function ItemRowsInput({ items, onChange, uploadFolder, unitOptions = null }) {
  function updateItem(i, patch) {
    onChange(items.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <p className="text-[11px] font-bold text-slate-500 mb-1">품명</p>
              <input className={inputCls} value={item.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 mb-1">수량</p>
              <input className={inputCls} value={item.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} />
            </div>
          </div>
          {unitOptions && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 mb-1">호기</p>
              <select className={inputCls} value={item.unit ?? ""} onChange={(e) => updateItem(i, { unit: e.target.value || null })}>
                <option value="">호기 미지정</option>
                {unitOptions.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <p className="text-[11px] font-bold text-slate-500 mb-1">금액 (선택)</p>
              <input type="number" className={inputCls} placeholder="-" value={item.amount} onChange={(e) => updateItem(i, { amount: e.target.value })} />
            </div>
            {items.length > 1 && (
              <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-xs font-bold text-red-500 border border-red-200 rounded-lg px-3 py-2">
                삭제
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <EditablePhotoRow label="교체 전" urls={item.beforeUrls} onChange={(urls) => updateItem(i, { beforeUrls: urls })} uploadFolder={`${uploadFolder}/part${i}/before`} />
            <EditablePhotoRow label="교체 후" urls={item.afterUrls} onChange={(urls) => updateItem(i, { afterUrls: urls })} uploadFolder={`${uploadFolder}/part${i}/after`} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, emptyBillingItem()])} className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-2">
        + 품목 추가
      </button>
    </div>
  );
}

// 새 청구 등록 — 자재 지급건에 연동(청구 안 된 완료 대기 할일 하나를 골라 그 내용으로 채움) 또는
// 직접 입력(현장·호기부터 전부 수기입력) 두 모드. 기사어플과 달리 고객 서명·전화승인은 관리자가
// 현장에 없어 받을 수 없으므로 요구하지 않는다(사후 입력·보정용이라는 전제).
function NewBillingModal({ data, onClose, onCreate }) {
  const { sites, units, profiles, todos, quoteRequests } = data;
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false);
  const [mode, setMode] = useState("material"); // material | manual
  // 자재 지급건 연동 대상 — 기사어플 청구 화면과 같은 조건(완료 안 된, 수동배정·반납확인 아닌 할일). 기사 제한 없이 전체.
  const linkableTodos = todos.filter((t) => !t.done && t.source !== "manual" && t.source !== "waste_return");
  const [linkedTodoId, setLinkedTodoId] = useState("");
  const [uploadToken] = useState(() => Date.now());
  const [form, setForm] = useState({
    siteId: "", unitIds: [], engineerId: "", replaceDate: TODAY_STR, contactPhone: "",
    vendorName: "", items: [emptyBillingItem()], totalCost: "",
  });
  const [saving, setSaving] = useState(false);
  const siteUnits = units.filter((u) => u.siteId === form.siteId);

  // 지급건을 고르면 그 건의 현장·호기·담당자·품목으로 폼을 채운다(그대로 써도 되고 고쳐도 됨).
  function pickLinkedTodo(id) {
    setLinkedTodoId(id);
    const t = todos.find((x) => x.id === id);
    if (!t) return;
    const unit = units.find((u) => u.id === t.unitId);
    const quote = t.source === "quote" ? quoteRequests.find((q) => q.id === t.quoteRequestId) : null;
    // 청구 품목은 실제 교체한 자재만 — 인건비·운반비·안전관리비·이윤·할인은 품목이 아니라
    // 금액 구성요소라, 합계금액(견적 승인 금액)에만 반영한다.
    const quoteItems = quote
      ? quoteMaterialItems(quote.quoteItems)
          .map((it) => ({ name: it.name, qty: it.qty || null, amount: Math.round(Number(it.qty || 0) * Number(it.unitPrice || 0)) }))
      : null;
    const quoteTotal = quote
      ? quoteGrandTotal(quote.quoteItems, quote.transportCost, quote.safetyCost, quote.profit, quote.discountAmount)
      : null;
    const parts = quoteItems?.length > 1 ? quoteItems : t.billingPartRows?.length > 1 ? t.billingPartRows : null;
    const siteId = unit?.siteId ?? sites.find((s) => s.name === t.siteName)?.id ?? "";
    // 지급건 자체에 호기가 없으면(관리자가 호기 선택 없이 발행한 견적 등 — 이젠 지급완료
    // 처리 시점에 채워지도록 고쳤지만, 그 전에 이미 만들어진 옛 할일에 대한 안전망으로 남겨둔다)
    // 견적 품목의 호기 라벨로 추정한다.
    const inferredUnitId = t.unitId || inferQuoteUnitId(units, siteId, quote) || "";
    // 지급건이 여러 호기를 한 번에 다룬 경우(elevatorNos) 그 호기들을 전부 선택된 채로 채운다.
    const inferredUnitIds = t.elevatorNos?.length
      ? units.filter((u) => u.siteId === siteId && t.elevatorNos.includes(u.unitNo)).map((u) => u.id)
      : (inferredUnitId ? [inferredUnitId] : []);
    setForm({
      siteId,
      unitIds: inferredUnitIds,
      engineerId: t.assigneeId ?? "",
      replaceDate: TODAY_STR,
      contactPhone: "",
      vendorName: t.vendorName ?? "",
      items: parts
        ? parts.map((p) => ({ name: p.name ?? "", qty: p.qty ?? "", amount: p.amount ?? "", beforeUrls: [], afterUrls: [] }))
        : [{ name: t.part ?? "", qty: "", amount: t.billingAmount ?? "", beforeUrls: [], afterUrls: [] }],
      totalCost: quoteTotal != null ? String(quoteTotal) : "",
    });
  }

  const filledItems = form.items.filter((i) => i.name.trim());
  const valid = form.siteId && form.unitIds.length > 0 && form.engineerId && form.replaceDate && filledItems.length > 0;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onCreate({ ...form, linkedTodoId: mode === "material" ? linkedTodoId : null });
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="새 청구 등록" onClose={onClose} wide="xl">
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("material")}
            className={`flex-1 text-sm font-bold rounded-xl px-3 py-2.5 ${mode === "material" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}
          >
            자재 지급건 연동
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex-1 text-sm font-bold rounded-xl px-3 py-2.5 ${mode === "manual" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}
          >
            직접 입력
          </button>
        </div>

        {mode === "material" && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">청구 대상 지급건</p>
            <select className={inputCls} value={linkedTodoId} onChange={(e) => pickLinkedTodo(e.target.value)}>
              <option value="">선택하세요</option>
              {linkableTodos.map((t) => (
                <option key={t.id} value={t.id}>
                  {locOf(data, t.unitId, t.siteName, t.elevatorNo)} · {personOf(data, t.assigneeId, t.assignee)} · {t.part ?? t.title}
                </option>
              ))}
            </select>
            {!linkableTodos.length && <p className="text-[11px] text-slate-400 mt-1">청구 안 된 지급 완료 대기 할일이 없습니다</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">현장</p>
            <SiteAutocomplete sites={sites} value={form.siteId} onChange={(id) => setForm({ ...form, siteId: id, unitIds: [] })} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">호기 (여러 호기 선택 가능)</p>
            <div className="flex flex-wrap gap-1.5">
              {siteUnits.map((u) => {
                const checked = form.unitIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      unitIds: checked ? form.unitIds.filter((id) => id !== u.id) : [...form.unitIds, u.id],
                    })}
                    className={`text-xs font-bold rounded-lg px-3 py-1.5 border ${checked ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200"}`}
                  >
                    {u.unitNo}
                  </button>
                );
              })}
            </div>
            {!form.siteId && <p className="text-xs text-slate-400">현장을 먼저 선택하세요</p>}
            {form.siteId && siteUnits.length === 0 && <p className="text-xs text-slate-400">이 현장에 등록된 호기가 없습니다</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">담당 기사</p>
            <select className={inputCls} value={form.engineerId} onChange={(e) => setForm({ ...form, engineerId: e.target.value })}>
              <option value="">선택하세요</option>
              {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-xs font-bold text-slate-500 mb-1 mt-3">외주작업 (선택)</p>
            <input
              className={inputCls}
              placeholder="업체명을 입력하면 외주작업으로 처리됩니다"
              value={form.vendorName}
              onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
            />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">교체일자</p>
            <DateTextInput key={form.replaceDate} value={form.replaceDate} onChange={(v) => setForm({ ...form, replaceDate: v })} />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">교체 확인자 연락처 (선택)</p>
          <input className={inputCls} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">
            교체 품목 (사진은 선택, 품목별 금액도 선택)
            {form.unitIds.length > 1 && " · 호기를 2개 이상 고르면 품목마다 어느 호기 것인지 지정할 수 있습니다"}
          </p>
          <ItemRowsInput
            items={form.items}
            onChange={(items) => setForm({ ...form, items })}
            uploadFolder={`billings/admin-${uploadToken}`}
            unitOptions={form.unitIds.length > 1 ? siteUnits.filter((u) => form.unitIds.includes(u.id)).map((u) => u.unitNo) : null}
          />
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">합계금액</p>
          <input
            type="number"
            className={inputCls}
            placeholder="품목별 금액을 다 입력하면 자동으로 더해집니다 — 직접 입력해도 됩니다"
            value={form.totalCost}
            onChange={(e) => setForm({ ...form, totalCost: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-5 py-2.5">취소</button>
          <button disabled={!valid || saving} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
            등록
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BillingDetailModal({ b, data, onClose, onSave, onToggleFree, onAdjustPrice }) {
  const { profiles } = data;
  const isSuper = useContext(AdminAuthContext).tier === "super"; // 무상처리·가격조정은 최고관리자만
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
  const notesReady = data.billings.some((x) => x.notes !== undefined);
  // 교체호기 수정 대상 — 이 청구가 속한 현장의 호기 목록만 고를 수 있다(다른 현장 호기로는
  // 못 바꾼다, 현장 자체를 옮기는 기능이 아니라 그 현장 안에서 호기를 다시 고르는 것).
  const billingSiteId = data.units.find((u) => u.id === b.unitId)?.siteId ?? data.sites.find((s) => s.name === b.siteName)?.id ?? null;
  const siteUnits = data.units.filter((u) => u.siteId === billingSiteId);
  const [form, setForm] = useState({
    notes: b.notes ?? "",
    engineerId: b.engineerId ?? "",
    replaceDate: b.replaceDate ?? "",
  });
  const [saving, setSaving] = useState(false);
  const photos = [...(b.beforePhotoUrls ?? []), ...(b.afterPhotoUrls ?? [])];
  if (b.confirmPhotoUrl) photos.push(b.confirmPhotoUrl);

  // 품목이 2개 이상(다품목 청구)이면 flat 필드(part/cost) 대신 품목별 구조화 데이터(part_photos:
  // 이름·수량·금액·사진)를 쓴다 — 완료보고서(buildCertificateData)가 이 구조화 데이터를 우선해서
  // 쓰기 때문에, flat 필드만 고치면 완료보고서엔 반영이 안 된다. 수정 모드에서는 새 청구 등록과
  // 동일하게 품목을 항상 목록(품목추가·삭제 가능)으로 편집한 뒤, 저장 시점의 품목 수로 flat/
  // 구조화 여부를 다시 정한다(단품 ↔ 다품목 전환도 가능해야 하므로 — saveEdit 참고).
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);

  function startEdit() {
    const seededItems = (b.partPhotos ?? []).length
      ? b.partPhotos.map((p) => ({ ...p, beforeUrls: p.beforeUrls ?? [], afterUrls: p.afterUrls ?? [] }))
      : [{ name: b.part ?? "", qty: "", amount: b.cost ?? "", beforeUrls: b.beforePhotoUrls ?? [], afterUrls: b.afterPhotoUrls ?? [] }];
    const initialUnitIds = b.elevatorNos?.length
      ? siteUnits.filter((u) => b.elevatorNos.includes(u.unitNo)).map((u) => u.id)
      : b.unitId ? [b.unitId] : [];
    setEditForm({
      contactPhone: b.contactPhone ?? "",
      vendorName: b.vendorName ?? "",
      confirmPhotoUrl: b.confirmPhotoUrl ?? null,
      partPhotos: seededItems,
      unitIds: initialUnitIds,
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    const dbPatch = { contact_phone: editForm.contactPhone || null, confirm_photo_url: editForm.confirmPhotoUrl || null };
    const localPatch = { contactPhone: editForm.contactPhone || null, confirmPhotoUrl: editForm.confirmPhotoUrl || null };
    if (b.isOutsourced) {
      dbPatch.vendor_name = editForm.vendorName || null;
      localPatch.vendorName = editForm.vendorName || null;
    }
    // 교체호기 — 1개 고르면 unit_id/elevator_no만, 2개 이상이면 대표 호기(unit_id) +
    // elevator_nos(전체 호기 라벨)까지 같이 채운다. 다른 화면(SitesAdmin 호기상세·SiteTab
    // 견적내역 등)이 이 두 필드로 "이 청구가 어느 호기(들)인지" 판단한다.
    const selectedUnits = siteUnits.filter((u) => editForm.unitIds.includes(u.id));
    if (selectedUnits.length > 0) {
      dbPatch.unit_id = selectedUnits[0].id;
      dbPatch.elevator_no = selectedUnits[0].unitNo;
      dbPatch.elevator_nos = selectedUnits.length > 1 ? selectedUnits.map((u) => u.unitNo) : null;
      localPatch.unitId = dbPatch.unit_id;
      localPatch.elevatorNo = dbPatch.elevator_no;
      localPatch.elevatorNos = dbPatch.elevator_nos;
    }
    const filled = editForm.partPhotos.filter((p) => p.name?.trim());
    if (filled.length > 1) {
      const partNames = filled.map((p) => p.name).join(", ") || null;
      dbPatch.part_photos = filled;
      dbPatch.part = partNames;
      dbPatch.before_photo_urls = null;
      dbPatch.after_photo_urls = null;
      localPatch.partPhotos = filled;
      localPatch.part = partNames;
      localPatch.beforePhotoUrls = [];
      localPatch.afterPhotoUrls = [];
    } else {
      const only = filled[0] ?? {};
      dbPatch.part = only.name || null;
      dbPatch.cost = only.amount === "" || only.amount == null ? null : Number(only.amount);
      dbPatch.before_photo_urls = only.beforeUrls?.length ? only.beforeUrls : null;
      dbPatch.after_photo_urls = only.afterUrls?.length ? only.afterUrls : null;
      dbPatch.part_photos = null;
      localPatch.part = dbPatch.part;
      localPatch.cost = dbPatch.cost;
      localPatch.beforePhotoUrls = only.beforeUrls ?? [];
      localPatch.afterPhotoUrls = only.afterUrls ?? [];
      localPatch.partPhotos = [];
    }
    await onSave(b, dbPatch, localPatch);
    setSaving(false);
    setEditing(false);
    onClose();
  }

  async function save() {
    setSaving(true);
    const engineerName = engineers.find((p) => p.id === form.engineerId)?.name ?? b.engineer;
    const patch = {
      engineer_id: form.engineerId || null,
      engineer: engineerName,
      replace_date: form.replaceDate || null,
      ...(notesReady ? { notes: form.notes || null } : {}),
    };
    await onSave(b, patch, {
      engineerId: patch.engineer_id, engineer: patch.engineer, replaceDate: patch.replace_date,
      ...(notesReady ? { notes: patch.notes } : {}),
    });
    setSaving(false);
    onClose();
  }

  // 무상 처리 — 켤 때는 사유를 FM/하자/서비스 중에서 고르게 한다(기사어플과 동일). 이미
  // 무상이면 사유 없이 바로 해제.
  const [pickingFreeReason, setPickingFreeReason] = useState(false);
  function handleToggleFree() {
    if (b.isFree) {
      onToggleFree(b, null).then(onClose);
      return;
    }
    setPickingFreeReason(true);
  }
  async function selectFreeReason(reason) {
    setPickingFreeReason(false);
    await onToggleFree(b, reason);
    onClose();
  }

  // 가격 조정 — 청구 금액을 직접 다시 입력한다.
  async function handleAdjustPrice() {
    const input = prompt("새 가격을 입력해주세요 (원)", b.cost ?? "");
    if (input === null) return; // 취소
    const value = Number(input.replace(/[^0-9.-]/g, ""));
    if (!input.trim() || Number.isNaN(value)) { alert("올바른 숫자를 입력해주세요"); return; }
    await onAdjustPrice(b, value);
    onClose();
  }

  return (
    <Modal title="상세내역" onClose={onClose} wide>
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 · 호기</p><p className="font-semibold text-slate-800">{siteUnitOf(b, data)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 주소</p><p className="font-semibold text-slate-800">{addressOf(data, b.unitId, b.siteName)}</p></div>
          {!editing ? (
            <div><p className="text-xs font-bold text-slate-400 mb-1">교체내역</p><p className="font-semibold text-slate-800 whitespace-pre-line">{b.part}</p></div>
          ) : (
            <div><p className="text-xs font-bold text-slate-400 mb-1">교체내역</p><p className="text-xs text-slate-400">아래 품목 목록에서 수정하세요</p></div>
          )}
          {!editing ? (
            <div>
              <p className="text-xs font-bold text-slate-400 mb-1">금액(VAT별도)</p>
              {b.isFree ? (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                  {freeReasonLabel(freeReasonOf(b.notes))}
                </span>
              ) : b.cost == null ? (
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">견적서 참조</span>
              ) : (
                <p className="font-semibold text-slate-800">{Number(b.cost).toLocaleString()}원</p>
              )}
            </div>
          ) : (
            <div><p className="text-xs font-bold text-slate-400 mb-1">금액(VAT별도)</p><p className="text-xs text-slate-400">아래 품목 목록에서 수정하세요</p></div>
          )}
          <div><p className="text-xs font-bold text-slate-400 mb-1">제출일</p><p className="font-semibold text-slate-800">{shortDate(b.submittedAt)}</p></div>
          {!editing ? (
            <div><p className="text-xs font-bold text-slate-400 mb-1">교체확인자</p><p className="font-semibold text-slate-800">{signerLabel(b)}</p></div>
          ) : (
            <div>
              <p className="text-xs font-bold text-slate-400 mb-1">교체확인자 연락처{b.approverName || b.approverPhone ? ` (서명 시 확인된 교체확인자: ${signerLabel(b)})` : ""}</p>
              <input className={inputCls} value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} />
            </div>
          )}
          {b.isOutsourced && (
            !editing ? (
              <div><p className="text-xs font-bold text-slate-400 mb-1">작업 업체</p><p className="font-semibold text-slate-800">{b.vendorName || "-"}</p></div>
            ) : (
              <div>
                <p className="text-xs font-bold text-slate-400 mb-1">작업 업체</p>
                <input className={inputCls} value={editForm.vendorName} onChange={(e) => setEditForm({ ...editForm, vendorName: e.target.value })} />
              </div>
            )
          )}
          <div>
            {b.materialRequestId || b.type === "material"
              ? <StatusBadge tone="blue">자재 지급건</StatusBadge>
              : <StatusBadge tone="slate">직접 입력</StatusBadge>}
            {b.isOutsourced && <span className="ml-1.5"><StatusBadge tone="purple">외주</StatusBadge></span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">담당자 변경</p>
            <select className={inputCls} value={form.engineerId} onChange={(e) => setForm({ ...form, engineerId: e.target.value })}>
              <option value="">{b.engineer ?? "미배정"}</option>
              {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기한(교체일자) 수정</p>
            <DateTextInput key={form.replaceDate ?? "unset"} value={form.replaceDate} onChange={(v) => setForm({ ...form, replaceDate: v })} />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">내용{!notesReady && " (마이그레이션 대기)"}</p>
          <textarea
            className={inputCls}
            rows={3}
            disabled={!notesReady}
            placeholder={notesReady ? "관리자 메모를 입력하세요" : "011 마이그레이션 실행 후 사용 가능합니다"}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </div>

      {!editing ? (
        <div>
          {/* 품목이 2개 이상이면 사진이 flat 필드(beforePhotoUrls 등)가 아니라 품목별
              partPhotos[].beforeUrls/afterUrls에 들어있다(saveEdit 참고) — 품목별로 나눠 보여준다. */}
          {b.partPhotos?.length > 1 ? (
            <div className="space-y-3">
              {b.partPhotos.filter((p) => p.name?.trim()).map((p, i) => {
                const urls = [...(p.beforeUrls ?? []), ...(p.afterUrls ?? [])];
                return (
                  <div key={i}>
                    <p className="text-xs font-bold text-slate-500 mb-2">
                      {p.name}{p.unit ? ` · ${formatUnitLabel(p.unit)}` : ""} 사진 ({urls.length}장)
                    </p>
                    <PhotoGrid urls={urls} />
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <p className="text-xs font-bold text-slate-500 mb-2">사진 ({photos.length}장)</p>
              <PhotoGrid urls={photos} />
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">교체 호기 (여러 호기 선택 가능)</p>
            <div className="flex flex-wrap gap-1.5">
              {siteUnits.map((u) => {
                const checked = editForm.unitIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setEditForm({
                      ...editForm,
                      unitIds: checked ? editForm.unitIds.filter((id) => id !== u.id) : [...editForm.unitIds, u.id],
                    })}
                    className={`text-xs font-bold rounded-lg px-3 py-1.5 border ${checked ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200"}`}
                  >
                    {u.unitNo}
                  </button>
                );
              })}
            </div>
            {siteUnits.length === 0 && <p className="text-xs text-slate-400">이 현장에 등록된 호기가 없습니다</p>}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">
              품목별 수정 (새 청구 등록과 동일하게 품목 추가·삭제 가능)
              {editForm.unitIds.length > 1 && " · 호기를 2개 이상 고르면 품목마다 어느 호기 것인지 지정할 수 있습니다"}
            </p>
            <ItemRowsInput
              items={editForm.partPhotos}
              onChange={(partPhotos) => setEditForm({ ...editForm, partPhotos })}
              uploadFolder={`billings/${b.id}`}
              unitOptions={editForm.unitIds.length > 1 ? siteUnits.filter((u) => editForm.unitIds.includes(u.id)).map((u) => u.unitNo) : null}
            />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">확인서</p>
            <EditablePhotoRow
              label="확인서"
              urls={editForm.confirmPhotoUrl ? [editForm.confirmPhotoUrl] : []}
              onChange={(urls) => setEditForm({ ...editForm, confirmPhotoUrl: urls[0] ?? null })}
              uploadFolder={`billings/${b.id}/confirm`}
            />
          </div>
        </div>
      )}

      <div className="flex justify-between mt-4">
        <div className="flex items-center gap-2">
          {isSuper ? (
            pickingFreeReason ? (
              <>
                <span className="text-xs font-bold text-slate-500">무상 사유:</span>
                {FREE_REASONS.map((r) => (
                  <button key={r} onClick={() => selectFreeReason(r)} className="text-sm font-bold text-white bg-emerald-600 rounded-xl px-4 py-2.5">
                    {r}
                  </button>
                ))}
                <button onClick={() => setPickingFreeReason(false)} className="text-sm font-bold text-slate-400 px-2">취소</button>
              </>
            ) : (
              <>
                <button onClick={handleToggleFree} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-5 py-2.5">
                  {b.isFree ? "무상 해제하기" : "무상 처리"}
                </button>
                <button onClick={handleAdjustPrice} className="text-sm font-bold text-blue-700 bg-white border border-blue-200 rounded-xl px-5 py-2.5">
                  가격 조정
                </button>
              </>
            )
          ) : (
            <p className="text-[11px] text-slate-400 self-center">무상 처리·가격 조정은 최고관리자만 가능합니다</p>
          )}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-5 py-2.5">
                취소
              </button>
              <button disabled={saving} onClick={saveEdit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
                수정 저장
              </button>
            </>
          ) : (
            <>
              <button onClick={startEdit} className="text-sm font-bold text-blue-700 bg-white border border-blue-200 rounded-xl px-5 py-2.5">
                수정
              </button>
              <button disabled={saving} onClick={save} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
                저장
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// 분할납부 한 줄 — 평소엔 "날짜 · 금액" 읽기전용 텍스트에 연필 하나(둘이 아니라)만 있고,
// 누르면 날짜·금액을 같이 고치는 입력칸이 뜬다. 방금 "입금 추가"로 만든 새 줄은 비어있는
// 채로 연필을 또 눌러야 하는 게 아니라 바로 이 입력 상태로 열린다. 포커스가 이 줄 바깥으로
// 완전히 나갈 때(둘 중 하나에서 다른 하나로 옮기는 건 안에 있는 이동이라 안 닫힌다) 저장하고
// 읽기전용으로 돌아간다.
function PaymentRow({ r, startEditing, onCommit, onRemove }) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState({ date: r.date ?? "", amount: r.amount ?? "" });

  function openEdit() {
    setDraft({ date: r.date ?? "", amount: r.amount ?? "" });
    setEditing(true);
  }
  function closeAndCommit() {
    onCommit(draft);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-700">
          {r.date ? shortDate(r.date) : "-"} · {r.amount ? `${Number(r.amount).toLocaleString()}원` : "-"}
        </span>
        <button type="button" onClick={openEdit} className="text-slate-300 hover:text-slate-500 shrink-0" aria-label="입금 수정">
          <Pencil size={12} />
        </button>
        <button type="button" onClick={onRemove} className="text-slate-300 hover:text-red-500 shrink-0" aria-label="이 입금 삭제">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closeAndCommit(); }}>
      <DateTextInput
        className="min-w-24 text-xs"
        value={draft.date}
        autoFocus={startEditing}
        onChange={(v) => setDraft((d) => ({ ...d, date: v }))}
      />
      <input
        type="number"
        placeholder="금액"
        className={`${inputCls} text-xs px-1.5 py-1 w-20`}
        value={draft.amount}
        onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
      <button type="button" onClick={onRemove} className="text-slate-300 hover:text-red-500 shrink-0" aria-label="이 입금 삭제">
        <X size={12} />
      </button>
    </div>
  );
}

// 입금일 칸 — 보통은 한 번에 다 받아 날짜 하나면 되지만, 분할납부는 "+"를 눌러
// (날짜, 금액) 행을 여러 개 쌓을 수 있게 전환한다. 합계를 청구금액과 맞춰보는 검증은
// 아직 없다 — 나중에 필요해지면 추가(그때도 이 컬럼이 없던 옛 청구는 입금일 유무로만
// 완납/미납을 판단할 수 있고, 분할 여부까진 소급 적용이 안 된다).
function ReceivedPaymentsCell({ b, onSaveDate, onSavePayments }) {
  const initialRows = b.receivedPayments?.length ? b.receivedPayments : [{ date: b.receivedDate ?? "", amount: "" }];
  const [splitMode, setSplitMode] = useState(!!b.receivedPayments?.length);
  const [rows, setRows] = useState(initialRows);
  // 방금 "입금 추가"로 만든(또는 분할납부로 막 전환한) 줄의 인덱스 — 그 줄만 곧바로
  // 입력 상태로 열어준다. 저장하거나 지우면 다시 null로 돌아간다.
  const [justAddedIndex, setJustAddedIndex] = useState(null);

  function saveRows(next) {
    onSavePayments(next.filter((r) => r.date || r.amount));
  }
  function commitRow(i, draft) {
    const next = rows.map((row, idx) => (idx === i ? draft : row));
    setRows(next);
    saveRows(next);
    setJustAddedIndex((cur) => (cur === i ? null : cur));
  }
  function removeRow(i) {
    const next = rows.filter((_, idx) => idx !== i);
    setJustAddedIndex((cur) => (cur === i ? null : cur));
    if (next.length === 0) {
      setSplitMode(false);
      onSavePayments(null);
      return;
    }
    setRows(next);
    saveRows(next);
  }
  function addRow() {
    setRows((prev) => {
      const next = [...prev, { date: "", amount: "" }];
      setJustAddedIndex(next.length - 1);
      return next;
    });
  }

  if (!splitMode) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <EditableDate key={b.receivedDate ?? "unset"} value={b.receivedDate} onCommit={onSaveDate} />
        <button
          type="button"
          onClick={() => { setRows([{ date: b.receivedDate ?? "", amount: "" }]); setJustAddedIndex(0); setSplitMode(true); }}
          className="text-slate-300 hover:text-blue-600 shrink-0"
          title="분할납부로 나눠 입력"
        >
          <Plus size={12} />
        </button>
      </span>
    );
  }

  const status = receivedStatusOf(b);
  const statusTone = status === "완납" ? "text-emerald-600" : status === "부분입금" ? "text-amber-600" : "text-red-600";

  return (
    <div className="space-y-1 min-w-[11rem]">
      {rows.map((r, i) => (
        <PaymentRow
          key={i}
          r={r}
          startEditing={justAddedIndex === i}
          onCommit={(draft) => commitRow(i, draft)}
          onRemove={() => removeRow(i)}
        />
      ))}
      {status && (
        <p className={`text-[10px] font-bold ${statusTone}`}>
          {status} ({receivedTotalOf(b).toLocaleString()}/{billingDueAmount(b).toLocaleString()}원)
        </p>
      )}
      <button type="button" onClick={addRow} className="text-[11px] font-bold text-blue-600">
        + 입금 추가
      </button>
    </div>
  );
}

// 목록 헤더 칼럼 필터 — 라벨 옆 화살표를 누르면 아래로 체크박스 드롭다운이 뜬다.
// 필터가 하나라도 켜져 있으면 화살표가 파란색이 된다.
// 드롭다운은 body에 포털로 띄운다 — 표가 overflow-x-auto라(가로 스크롤 위해) 그 안에 그냥
// absolute로 두면 세로로도 같이 잘려서 안 보인다(overflow-x를 auto로 두면 overflow-y도
// 자동으로 clip되는 CSS 규칙 때문 — 실제로 겪은 버그).
function FilterHeader({ label, active, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  function toggleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={`p-0.5 rounded ${active ? "text-blue-600" : "text-slate-400"} hover:text-slate-600`}
        aria-label={`${label} 필터`}
      >
        <ChevronDown size={12} />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-2 w-56 max-h-80 overflow-y-auto text-left font-normal normal-case text-slate-700"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>,
        document.body
      )}
    </span>
  );
}

function CheckboxFilterList({ options, selected, onChange }) {
  function toggle(v) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }
  if (!options.length) return <p className="text-xs text-slate-400 px-1.5 py-1">항목 없음</p>;
  return (
    <div className="space-y-0.5">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
          {o}
        </label>
      ))}
    </div>
  );
}

// "YYYY-MM-DD" 문자열 배열을 연도>월>일 트리로 묶는다 (최신 먼저).
function buildDateTree(dates) {
  const years = new Map(); // year -> Map(month -> Set(day))
  for (const d of dates) {
    if (!d) continue;
    const [y, m, day] = d.split("-");
    if (!years.has(y)) years.set(y, new Map());
    const months = years.get(y);
    if (!months.has(m)) months.set(m, new Set());
    months.get(m).add(day);
  }
  return [...years.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([y, months]) => ({
      key: y,
      label: `${y}년`,
      months: [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([m, days]) => ({
          key: `${y}-${m}`,
          label: `${Number(m)}월`,
          days: [...days]
            .sort((a, b) => b.localeCompare(a))
            .map((d) => ({ key: `${y}-${m}-${d}`, label: `${Number(d)}일` })),
        })),
    }));
}

// 선택값은 "2026"/"2026-09"/"2026-09-10"처럼 길이가 다를 수 있다 — 날짜가 그 값으로
// 시작하면 매치(연도만 고르면 그 해 전체, 일자까지 고르면 그 날만).
function matchesDateFilter(dateStr, selected) {
  if (!selected.length) return true;
  if (!dateStr) return false;
  return selected.some((k) => dateStr.startsWith(k));
}

function DateTreeFilter({ dates, selected, onChange }) {
  const tree = useMemo(() => buildDateTree(dates), [dates]);
  const [openYears, setOpenYears] = useState(new Set());
  const [openMonths, setOpenMonths] = useState(new Set());
  function toggleValue(key) {
    onChange(selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key]);
  }
  function toggleOpen(setFn, key) {
    setFn((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  if (!tree.length) return <p className="text-xs text-slate-400 px-1.5 py-1">날짜 없음</p>;
  return (
    <div className="space-y-0.5">
      {tree.map((y) => (
        <div key={y.key}>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => toggleOpen(setOpenYears, y.key)} className="text-slate-400 shrink-0 p-0.5">
              <ChevronRight size={11} className={openYears.has(y.key) ? "rotate-90" : ""} />
            </button>
            <label className="flex-1 flex items-center gap-1.5 px-1 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs font-bold text-slate-700">
              <input type="checkbox" checked={selected.includes(y.key)} onChange={() => toggleValue(y.key)} />
              {y.label}
            </label>
          </div>
          {openYears.has(y.key) && (
            <div className="ml-4">
              {y.months.map((m) => (
                <div key={m.key}>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => toggleOpen(setOpenMonths, m.key)} className="text-slate-400 shrink-0 p-0.5">
                      <ChevronRight size={11} className={openMonths.has(m.key) ? "rotate-90" : ""} />
                    </button>
                    <label className="flex-1 flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-slate-50 cursor-pointer text-xs font-semibold text-slate-600">
                      <input type="checkbox" checked={selected.includes(m.key)} onChange={() => toggleValue(m.key)} />
                      {m.label}
                    </label>
                  </div>
                  {openMonths.has(m.key) && (
                    <div className="ml-4">
                      {m.days.map((d) => (
                        <label key={d.key} className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-slate-50 cursor-pointer text-[11px] text-slate-500">
                          <input type="checkbox" checked={selected.includes(d.key)} onChange={() => toggleValue(d.key)} />
                          {d.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// 작업자 칼럼에 실제 표시되는 값 — 외주 건은 기사명 대신 업체명이 보이므로 필터 옵션도 그 기준.
function workerLabelOf(data, b) {
  return b.isOutsourced ? (b.vendorName || "외주") : personOf(data, b.engineerId, b.engineer);
}

const BILLING_FILTERS_KEY = "guilBillingFiltersV1";
const DEFAULT_BILLING_FILTERS = { workers: [], replaceDates: [], billingDates: [], costType: [], paymentStatus: [], billingMethods: [] };

export default function BillingsAdmin({ data, setData }) {
  const { billings } = data;
  const [search, setSearch] = useState("");
  // 칼럼 필터 — 새로고침해도 유지되게 sessionStorage에 저장(탭 닫으면 사라짐, 메뉴 선택
  // 기억 방식(AdminApp.jsx의 ADMIN_MENU_KEY)과 동일 패턴). SSR 시점엔 window가 없어
  // 초기값은 기본값으로 두고, 마운트 후 effect에서 복원한다(하이드레이션 불일치 방지).
  const [filters, setFilters] = useState(DEFAULT_BILLING_FILTERS);
  // 마운트 직후 저장 effect가 "복원되기 전 기본값"으로 먼저 한 번 실행돼(복원 setFilters는
  // 다음 렌더로 미뤄지는데, 저장 effect는 같은 커밋에서 이전 렌더의 filters를 그대로 보고
  // 실행됨) 방금 복원한 값을 덮어써버리는 경쟁 상태가 있었다 — 저장 effect의 첫 실행만
  // 건너뛰어서 막는다.
  const skipNextSave = useRef(true);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BILLING_FILTERS_KEY);
      if (raw) setFilters({ ...DEFAULT_BILLING_FILTERS, ...JSON.parse(raw) });
    } catch { /* 손상된 저장값은 무시하고 기본값으로 시작 */ }
  }, []);
  useEffect(() => {
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    try { sessionStorage.setItem(BILLING_FILTERS_KEY, JSON.stringify(filters)); } catch { /* 저장 실패는 무시 — 필터 자체는 정상 동작 */ }
  }, [filters]);
  const filtersActive = Object.values(filters).some((v) => v.length > 0);
  // 호기별로 행이 나뉜(다호기) 청구는 어느 행에 마우스를 올려도 그 청구의 행 전체가 같이
  // 밝아지게 해서 "이건 한 청구다"가 보이게 한다 — 안 그러면 행마다 따로 반응해 서로 다른
  // 건처럼 보인다.
  const [hoveredBillingId, setHoveredBillingId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [certTarget, setCertTarget] = useState(null);
  const [creating, setCreating] = useState(false);
  // billings.certificate_pdf_url 컬럼 존재 여부 — 마이그레이션 122 실행 전엔 컬럼이 없다.
  const certUrlReady = billings.some((b) => b.certificatePdfUrl !== undefined);
  // billings.received_date 컬럼 존재 여부 — 마이그레이션 136 실행 전엔 컬럼이 없다.
  const receivedDateReady = billings.some((b) => b.receivedDate !== undefined);
  // billings.received_payments 컬럼 존재 여부 — 마이그레이션 138 실행 전엔 컬럼이 없다.
  const receivedPaymentsReady = billings.some((b) => b.receivedPayments !== undefined);

  // 필터 드롭다운 옵션 — 다른 필터가 걸려도 목록이 줄어들지 않게 전체 billings 기준으로 뽑는다
  // (필터를 걸수록 옵션이 사라지면 "방금 있던 항목이 왜 없어졌지" 하고 헷갈리기 쉽다).
  const workerOptions = [...new Set(billings.map((b) => workerLabelOf(data, b)))].filter(Boolean).sort();
  const replaceDateOptions = billings.map((b) => b.replaceDate).filter(Boolean);
  const billingDateOptions = billings.map((b) => b.billingDate).filter(Boolean);

  const q = search.trim().toLowerCase();
  const rows = billings.filter((b) => {
    if (q &&
      !locOf(data, b.unitId, b.siteName, b.elevatorNo).toLowerCase().includes(q) &&
      !(b.part ?? "").toLowerCase().includes(q) &&
      !personOf(data, b.engineerId, b.engineer).toLowerCase().includes(q) &&
      !(b.vendorName ?? "").toLowerCase().includes(q)
    ) return false;
    if (filters.workers.length && !filters.workers.includes(workerLabelOf(data, b))) return false;
    if (!matchesDateFilter(b.replaceDate, filters.replaceDates)) return false;
    if (!matchesDateFilter(b.billingDate, filters.billingDates)) return false;
    if (filters.costType.length && !filters.costType.includes(b.isFree ? "무상" : "유상")) return false;
    if (filters.paymentStatus.length) {
      const bucket = billingPaymentBucket(b);
      if (!bucket || !filters.paymentStatus.includes(bucket)) return false;
    }
    if (filters.billingMethods.length && !filters.billingMethods.includes(b.billingMethod)) return false;
    return true;
  });
  // 무상 처리된 건은 합계에서 제외한다. 합계는 청구금액(cost) 기준 = VAT 별도다
  // (입금 대조만 부가세 포함으로 본다 — billingDueAmount).
  const total = rows.reduce((sum, b) => sum + (b.isFree ? 0 : Number(b.cost) || 0), 0);

  // localPatch는 화면(camelCase) 반영용 — dbPatch(snake_case)와 내용은 같되 키 이름만 다르다.
  // 호출부(BillingDetailModal)가 필드를 늘릴 때마다 여기서 매핑을 다시 안 써도 되게 둘 다 받는다.
  async function saveBilling(b, dbPatch, localPatch) {
    // 담당자·교체일자·교체내역·사진 등이 바뀌면 교체확인서 내용도 바뀌어야 하니, 저장해둔
    // PDF는 비워서 다음에 열 때 새로 만들어지게 한다.
    const fullPatch = { ...dbPatch, ...(certUrlReady ? { certificate_pdf_url: null } : {}) };
    const { error } = await supabase.from("billings").update(fullPatch).eq("id", b.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      billings: prev.billings.map((x) => (x.id === b.id ? {
        ...x,
        ...localPatch,
        ...(certUrlReady ? { certificatePdfUrl: null } : {}),
      } : x)),
    }));
  }

  // 청구일·청구방식 — 목록에서 바로 수기입력하는 필드라 저장도 즉시 처리한다.
  async function updateManualField(b, column, key, value) {
    const { error } = await supabase.from("billings").update({ [column]: value || null }).eq("id", b.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, billings: prev.billings.map((x) => (x.id === b.id ? { ...x, [key]: value || null } : x)) }));
  }

  // 분할납부 목록 저장 — 빈 배열/null이면 컬럼도 비워서 다음에 열 때 단일 날짜 입력으로 돌아간다.
  async function updateReceivedPayments(b, payments) {
    const next = payments?.length ? payments : null;
    const { error } = await supabase.from("billings").update({ received_payments: next }).eq("id", b.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, billings: prev.billings.map((x) => (x.id === b.id ? { ...x, receivedPayments: next } : x)) }));
  }

  // 무상 처리 — 청구 상세내역에서만 지원(모바일 앱엔 없음). 금액은 그대로 두고 표시·합계에서만
  // 제외한다. 켤 때 받은 사유는 내용(notes)에 남겨 상세내역에서 그대로 볼 수 있게 한다.
  async function toggleFree(b, reason) {
    const next = !b.isFree;
    const notesReady = data.billings.some((x) => x.notes !== undefined);
    const patch = { is_free: next, ...(certUrlReady ? { certificate_pdf_url: null } : {}) };
    if (next && reason && notesReady) {
      patch.notes = (b.notes ? b.notes + "\n" : "") + `[무상처리] ${reason}`;
    }
    const { error } = await supabase.from("billings").update(patch).eq("id", b.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      billings: prev.billings.map((x) => (x.id === b.id ? {
        ...x, isFree: next,
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(certUrlReady ? { certificatePdfUrl: null } : {}),
      } : x)),
    }));
  }

  // 가격 조정 — 청구 상세내역에서 금액을 다시 입력했을 때 반영한다. 금액이 바뀌면 교체확인서에
  // 찍힌 합계도 달라지니 저장해둔 PDF는 비워서 다음에 열 때 새로 만들어지게 한다. 무상 처리된
  // 건에 실제 금액을 입력하는 것도 이 액션이라(무상/견적서참조 배지 → 금액), 무상 상태를 같이
  // 해제한다 — 안 그러면 방금 입력한 금액 대신 배지가 계속 표시되고 합계에서도 계속 빠진다.
  async function adjustPrice(b, cost) {
    const patch = { cost, is_free: false, ...(certUrlReady ? { certificate_pdf_url: null } : {}) };
    const { error } = await supabase.from("billings").update(patch).eq("id", b.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      billings: prev.billings.map((x) => (x.id === b.id ? { ...x, cost, isFree: false, ...(certUrlReady ? { certificatePdfUrl: null } : {}) } : x)),
    }));
  }

  // 새 청구 등록 — 자재 지급건 연동이면 관련 할일(같은 견적·자재신청·자체점검 건을 공유하는
  // 미완료 할일 전부, 담당자가 여럿이면 그만큼)을 기사어플 청구 제출과 동일한 규칙으로 완료 처리한다.
  async function createBilling(form) {
    const filled = form.items.filter((i) => i.name.trim());
    if (!filled.length) return;
    const isMulti = filled.length > 1;
    // siteUnits와 동일 순서로 걸러서, 여러 호기를 골랐을 때 elevator_nos 순서가 화면과 일치하게 한다.
    const selectedUnits = data.units.filter((u) => u.siteId === form.siteId && form.unitIds.includes(u.id));
    const site = data.sites.find((s) => s.id === form.siteId);
    const engineer = data.profiles.find((p) => p.id === form.engineerId);
    const linked = form.linkedTodoId ? data.todos.find((t) => t.id === form.linkedTodoId) : null;

    const partPhotos = isMulti
      ? filled.map((i) => ({ name: i.name.trim(), qty: i.qty || null, amount: i.amount === "" ? null : Number(i.amount), beforeUrls: i.beforeUrls, afterUrls: i.afterUrls }))
      : null;
    const part = isMulti ? filled.map((i) => i.name.trim()).join(", ") : `${filled[0].name.trim()}${filled[0].qty ? ` ${filled[0].qty}개` : ""}`;
    // 합계금액을 직접 입력했으면 그 값을 최우선으로 쓴다(품목 1개짜리도 포함 — 개별 단가를
    // 몰라도 총액만 알면 등록 가능하게). 안 입력했으면 품목별 금액을 채운 만큼 합산하되,
    // 하나라도 비어 있으면(다품목인데 일부만 아는 경우 등) 가격 미정으로 null.
    const itemsCost = isMulti
      ? (filled.every((i) => i.amount !== "") ? filled.reduce((sum, i) => sum + Number(i.amount || 0), 0) : null)
      : (filled[0].amount === "" ? null : Number(filled[0].amount));
    const cost = form.totalCost !== "" ? Number(form.totalCost) : itemsCost;
    const beforePhotoUrls = isMulti ? partPhotos.flatMap((p) => p.beforeUrls) : filled[0].beforeUrls;
    const afterPhotoUrls = isMulti ? partPhotos.flatMap((p) => p.afterUrls) : filled[0].afterUrls;

    const row = {
      id: "bill-" + crypto.randomUUID(),
      type: linked ? linked.source : "manual",
      site_name: site?.name ?? null,
      elevator_no: selectedUnits[0]?.unitNo ?? null,
      elevator_nos: selectedUnits.length > 1 ? selectedUnits.map((u) => u.unitNo) : null,
      unit_id: selectedUnits[0]?.id ?? null,
      part,
      cost,
      replace_date: form.replaceDate || null,
      contact_phone: form.contactPhone || null,
      engineer: engineer?.name ?? null,
      engineer_id: form.engineerId || null,
      submitted_at: TODAY_STR,
      before_photo_urls: beforePhotoUrls.length ? beforePhotoUrls : null,
      after_photo_urls: afterPhotoUrls.length ? afterPhotoUrls : null,
      part_photos: partPhotos,
      // 외주작업 여부는 별도 체크박스 없이 업체명 입력 여부로 판단한다.
      is_outsourced: !!form.vendorName.trim(),
      vendor_name: form.vendorName.trim() || null,
      is_free: cost === 0,
      material_request_id: linked?.materialRequestId ?? null,
      quote_request_id: linked?.quoteRequestId ?? null,
    };
    const { data: inserted, error } = await supabase.from("billings").insert(row).select().single();
    if (error) { alert("등록 실패: " + error.message); return; }

    let doneIds = [];
    if (linked) {
      doneIds = data.todos
        .filter((t) => !t.done && t.source !== "waste_return" && (
          (linked.quoteRequestId && t.quoteRequestId === linked.quoteRequestId) ||
          (linked.materialRequestId && t.materialRequestId === linked.materialRequestId) ||
          (linked.selfCheckItemId && t.selfCheckItemId === linked.selfCheckItemId) ||
          (!linked.quoteRequestId && !linked.materialRequestId && !linked.selfCheckItemId && t.id === linked.id)
        ))
        .map((t) => t.id);
      if (doneIds.length) {
        const { error: todoError } = await supabase.from("todos").update({ done: true }).in("id", doneIds);
        if (todoError) alert("청구는 등록됐지만 할일 완료 처리에 실패했습니다: " + todoError.message);
      }
    }

    setData((prev) => ({
      ...prev,
      billings: [mapBilling(inserted), ...prev.billings],
      todos: doneIds.length ? prev.todos.map((t) => (doneIds.includes(t.id) ? { ...t, done: true } : t)) : prev.todos,
    }));
  }

  const cert = certTarget && buildCertificateData(certTarget, data);

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-xl font-extrabold">부품교체·공사 내역</h1>
        <p className="text-sm text-slate-500">
          {(q || filtersActive) && `검색결과 ${rows.length}건 / `}총 {billings.length}건 · <span className="font-extrabold text-slate-900">{total.toLocaleString()}원</span>
        </p>
      </div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative max-w-72 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-8`} placeholder="현장·부품·기사명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filtersActive && (
            <button type="button" onClick={() => setFilters(DEFAULT_BILLING_FILTERS)} className="text-xs font-bold text-slate-500 hover:text-slate-700 whitespace-nowrap">
              필터 초기화
            </button>
          )}
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
          <Plus size={15} /> 새 청구 등록
        </button>
      </div>
      <AdminTable head={[
        "현장",
        <FilterHeader key="worker" label="작업자" active={filters.workers.length > 0}>
          <CheckboxFilterList options={workerOptions} selected={filters.workers} onChange={(v) => setFilters({ ...filters, workers: v })} />
        </FilterHeader>,
        "호기",
        "교체내역",
        <FilterHeader key="cost" label="금액(VAT별도)" active={filters.costType.length > 0}>
          <CheckboxFilterList options={["유상", "무상"]} selected={filters.costType} onChange={(v) => setFilters({ ...filters, costType: v })} />
        </FilterHeader>,
        <FilterHeader key="replaceDate" label="교체일" active={filters.replaceDates.length > 0}>
          <DateTreeFilter dates={replaceDateOptions} selected={filters.replaceDates} onChange={(v) => setFilters({ ...filters, replaceDates: v })} />
        </FilterHeader>,
        "교체확인서",
        <FilterHeader key="billingDate" label="청구일" active={filters.billingDates.length > 0}>
          <DateTreeFilter dates={billingDateOptions} selected={filters.billingDates} onChange={(v) => setFilters({ ...filters, billingDates: v })} />
        </FilterHeader>,
        <FilterHeader key="payment" label="입금일" active={filters.paymentStatus.length > 0}>
          <CheckboxFilterList options={["완납", "미수", "연체"]} selected={filters.paymentStatus} onChange={(v) => setFilters({ ...filters, paymentStatus: v })} />
        </FilterHeader>,
        <FilterHeader key="method" label="청구방식" active={filters.billingMethods.length > 0}>
          <CheckboxFilterList options={BILLING_METHODS} selected={filters.billingMethods} onChange={(v) => setFilters({ ...filters, billingMethods: v })} />
        </FilterHeader>,
      ]}>
        {rows.map((b) => {
          const unitPartRows = unitPartRowsFor(b, data);
          const span = unitPartRows.length;
          return unitPartRows.map((r, i) => (
            <tr
              key={`${b.id}-${i}`}
              className={`border-b border-slate-50 cursor-pointer ${hoveredBillingId === b.id ? "bg-slate-50" : ""}`}
              onClick={() => setDetail(b)}
              onMouseEnter={() => setHoveredBillingId(b.id)}
              onMouseLeave={() => setHoveredBillingId((id) => (id === b.id ? null : id))}
            >
              {i === 0 && (
                <>
                  <td rowSpan={span} className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap align-middle">{siteNameOf(b, data)}</td>
                  <td rowSpan={span} className="px-3 py-2.5 whitespace-nowrap align-middle">
                    {b.isOutsourced ? (
                      <span className="inline-flex items-center gap-1">
                        <StatusBadge tone="purple">외주</StatusBadge> {b.vendorName || "-"}
                      </span>
                    ) : personOf(data, b.engineerId, b.engineer)}
                  </td>
                </>
              )}
              <td className="px-3 py-2.5 whitespace-nowrap">{r.unitLabel}</td>
              <td className="px-3 py-2.5 text-slate-600 whitespace-pre-line">{r.part}</td>
              {i === 0 && (
                <>
                  <td rowSpan={span} className="px-3 py-2.5 whitespace-nowrap align-middle">
                    {isCostPending(b) ? (
                      // 기사가 "견적서 참조"로 낸 건 — 무상이 아니라 관리자가 금액을 넣어야 하는 상태.
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">금액 입력 필요</span>
                    ) : b.isFree ? (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                        {freeReasonLabel(freeReasonOf(b.notes))}
                      </span>
                    ) : b.cost == null ? (
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">견적서 참조</span>
                    ) : (
                      <span className="font-bold">{Number(b.cost).toLocaleString()}원</span>
                    )}
                  </td>
                  <td rowSpan={span} className="px-3 py-2.5 text-slate-500 whitespace-nowrap align-middle">{shortDate(b.replaceDate)}</td>
                  <td rowSpan={span} className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setCertTarget(b)}
                      disabled={isCostPending(b)}
                      title={isCostPending(b) ? "금액을 먼저 입력해주세요 (상세내역 → 가격 조정)" : undefined}
                      className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap hover:bg-blue-100 disabled:text-slate-400 disabled:bg-slate-100 disabled:border-slate-200 disabled:cursor-not-allowed"
                    >
                      교체확인서 보기
                    </button>
                  </td>
                  <td rowSpan={span} className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                    {b.isFree ? (
                      <span className="text-slate-300">-</span>
                    ) : (
                      <EditableDate key={b.billingDate ?? "unset"} value={b.billingDate} onCommit={(v) => updateManualField(b, "billing_date", "billingDate", v)} />
                    )}
                  </td>
                  <td rowSpan={span} className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                    {b.isFree ? (
                      <span className="text-slate-300">-</span>
                    ) : receivedPaymentsReady ? (
                      <ReceivedPaymentsCell
                        key={b.id}
                        b={b}
                        onSaveDate={(v) => updateManualField(b, "received_date", "receivedDate", v)}
                        onSavePayments={(payments) => updateReceivedPayments(b, payments)}
                      />
                    ) : receivedDateReady ? (
                      <EditableDate key={b.receivedDate ?? "unset"} value={b.receivedDate} onCommit={(v) => updateManualField(b, "received_date", "receivedDate", v)} />
                    ) : "-"}
                  </td>
                  <td rowSpan={span} className="px-3 py-2.5 whitespace-nowrap align-middle" onClick={(e) => e.stopPropagation()}>
                    {b.isFree ? (
                      <span className="text-slate-300">-</span>
                    ) : (
                      <EditableSelect
                        value={b.billingMethod ?? ""}
                        options={BILLING_METHODS}
                        onCommit={(v) => updateManualField(b, "billing_method", "billingMethod", v)}
                      />
                    )}
                  </td>
                </>
              )}
            </tr>
          ));
        })}
      </AdminTable>

      {detail && <BillingDetailModal b={detail} data={data} onClose={() => setDetail(null)} onSave={saveBilling} onToggleFree={toggleFree} onAdjustPrice={adjustPrice} />}
      {creating && <NewBillingModal data={data} onClose={() => setCreating(false)} onCreate={createBilling} />}
      {certTarget && (
        <ReplacementCertificateViewer
          cert={cert}
          filenameBase={cert.fileName}
          cachedUrl={certTarget.certificatePdfUrl}
          onGenerated={(url) => {
            if (!certUrlReady) return;
            supabase.from("billings").update({ certificate_pdf_url: url }).eq("id", certTarget.id).then(() => {});
            setData((prev) => ({ ...prev, billings: prev.billings.map((x) => (x.id === certTarget.id ? { ...x, certificatePdfUrl: url } : x)) }));
          }}
          onClose={() => setCertTarget(null)}
        />
      )}
    </div>
  );
}
