import { useState, useContext, useEffect } from "react";
import { Receipt, Check, Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { siteUnitList, formatPhone } from "@/lib/utils";
import { TODAY_STR, KIT_PARTS } from "@/lib/constants";
import { DDay, PrimaryButton, Field, inputCls, DrillHeader, SwipeSubtabTrack, SwipeIndicatorBar } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload, SignaturePad } from "@/app/components/formWidgets";
import { emptyPartRow, formatPartRows, PartsRowsInput, UnitPickGrid } from "@/app/components/tabs/MaterialTab";
import { useSwipeSubtab } from "@/app/hooks/useSwipeSubtab";


/* ------------------------------------------------------------------ */
/* BILLING (비용청구)                                                    */
/* ------------------------------------------------------------------ */

const BILL_STEP_TITLES = ["청구 정보", "증빙 사진", "완료 서명"]; // 자재 지급건(3-step)
const draftKey = (todoId) => `guilBillingDraftV1:${todoId}`;
const MAN_BILL_TITLES = ["현장·호기", "교체 내역·비용", "증빙 사진", "완료 서명"]; // 직접 입력(4-step)

// 자릿수(9~11)만 보면 "191-494-949"처럼 0으로 시작하지 않는 엉뚱한 숫자도 통과한다 —
// 국내 전화번호는 항상 0으로 시작하므로 그것까지 같이 확인한다.
function isValidPhoneDigits(v) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.startsWith("0") && d.length >= 9 && d.length <= 11;
}

export function BillingTab({ todos, setTodos, onSubmitBilling, onUseKitPart, quoteRequests = [] }) {
  const sites = useContext(SitesContext);
  const allUnits = useContext(UnitsContext);
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [uploadSession] = useState(() => Date.now());
  const [mode, setMode] = useState("material"); // material | manual
  const billingSubTabs = ["material", "manual"];
  const swipe = useSwipeSubtab(billingSubTabs, mode, setMode);
  // 자재지급건 청구는 기사가 자재신청/견적요청으로 만든 할일만 대상 — 관리자가 직접 부여한 할일(source: manual)은 제외.
  const openTodos = todos.filter((t) => !t.done && t.assignee === CURRENT_ENGINEER && t.source !== "manual" && t.source !== "waste_return");
  const [selectedId, setSelectedId] = useState(openTodos[0]?.id ?? "");
  // todos가 마운트 이후 늦게 도착하면 초기 selectedId가 ""로 굳어 제출 불가 → 유효한 첫 건으로 동기화 (P2-8)
  const openIdsKey = openTodos.map((t) => t.id).join(",");
  useEffect(() => {
    if (selectedId && openTodos.some((t) => t.id === selectedId)) return;
    setSelectedId(openTodos[0]?.id ?? "");
  }, [openIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [materialCost, setMaterialCost] = useState("");
  const [materialReplaceDate, setMaterialReplaceDate] = useState(TODAY_STR);
  const [submitted, setSubmitted] = useState(null);
  const [manualForm, setManualForm] = useState({ siteId: "", units: [], parts: [emptyPartRow()], replaceDate: TODAY_STR, contactPhone: "", cost: "", fromKit: false });
  const [materialPhotos, setMaterialPhotos] = useState({ before: [], after: [] });
  const [partPhotos, setPartPhotos] = useState({}); // 부품 2개 이상일 때만 사용: { [index]: { before: [], after: [] } }
  const [manualPhotos, setManualPhotos] = useState({ before: [], after: [] });
  const [billStep, setBillStep] = useState(0); // 0 정보 · 1 증빙사진 · 2 완료서명
  const [billToast, setBillToast] = useState(null); // { msg, ok }
  function toastBill(msg, ok = false) { setBillToast({ msg, ok }); setTimeout(() => setBillToast(null), 2500); }

  // 지류 교체확인서 대신 현장에서 바로 받는 서명, 또는 고객 부재중일 때의 전화승인 정보.
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [absentMode, setAbsentMode] = useState(false);
  const [approverName, setApproverName] = useState("");
  const [approverPhone, setApproverPhone] = useState("");
  const [absentConfirmed, setAbsentConfirmed] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  // 직접입력(수동청구)도 동일하게 서명/전화승인을 받되, 자재지급건과 상태를 공유하면
  // 두 모드를 오가는 동안 서로 값이 섞일 수 있어 별도 state로 둔다.
  const [manualSignatureUrl, setManualSignatureUrl] = useState(null);
  const [manualAbsentMode, setManualAbsentMode] = useState(false);
  const [manualApproverName, setManualApproverName] = useState("");
  const [manualApproverPhone, setManualApproverPhone] = useState("");
  const [manualAbsentConfirmed, setManualAbsentConfirmed] = useState(false);
  const [manualSignerName, setManualSignerName] = useState("");
  const [manualSignerPhone, setManualSignerPhone] = useState("");

  const selected = todos.find((t) => t.id === selectedId);
  // 견적 연동 건은 이미 견적서에 수리비가 정해져 있어, 직접 입력 대신 "견적서 참조"로 고정합니다.
  // 다만 외주 처리된 견적건은 관리자가 대신 청구를 제출하는 것이라 실제 금액을 이 시스템에도
  // 남겨야 해서(부품교체·공사내역에 반영) 일반 견적 청구와 다르게 취급합니다.
  const isQuoteBilling = selected?.source === "quote" && !selected?.isOutsourced;
  // 견적 연동 건(자체처리·외주 모두)은 관리자가 견적서에 작성한 품목을 그대로 청구 화면에
  // 프리필합니다 — 품목별 전/후 사진을 받고, 완료보고서(교체확인서)도 품목별로 나옵니다.
  // 자체처리 건은 금액을 기사 화면에 노출하지 않지만(위 isQuoteBilling), 이 금액은 그대로
  // partPhotos에 실려 billings에 저장되고, 완료보고서는 이 실제 견적금액을 보여줍니다.
  const quoteBillingItems = selected?.source === "quote"
    ? (quoteRequests.find((q) => q.id === selected.quoteRequestId)?.quoteItems ?? [])
        .filter((it) => it.name?.trim())
        .map((it) => ({ name: it.name, qty: it.qty || null, amount: Math.round(Number(it.qty || 0) * Number(it.unitPrice || 0)) }))
    : null;
  const [vendorNameInput, setVendorNameInput] = useState("");
  // 청구 대상이 바뀌면, 그 건에 임시저장해둔 내용이 있으면 그대로 이어서 하고(사진 찍다 앱을
  // 나갔다 돌아온 경우 등), 없으면 관리자가 지급 확정한 금액으로 미리 채운 빈 폼으로 시작합니다.
  useEffect(() => {
    if (!selectedId) return;
    let draft = null;
    try {
      const raw = localStorage.getItem(draftKey(selectedId));
      if (raw) draft = JSON.parse(raw);
    } catch { /* 손상된 임시저장은 무시하고 빈 폼으로 시작 */ }
    if (draft) {
      setBillStep(draft.billStep ?? 0);
      setMaterialCost(draft.materialCost ?? "");
      setMaterialReplaceDate(draft.materialReplaceDate ?? TODAY_STR);
      setMaterialPhotos(draft.materialPhotos ?? { before: [], after: [] });
      setPartPhotos(draft.partPhotos ?? {});
      setSignatureUrl(draft.signatureUrl ?? null);
      setAbsentMode(draft.absentMode ?? false);
      setApproverName(draft.approverName ?? "");
      setApproverPhone(draft.approverPhone ?? "");
      setAbsentConfirmed(draft.absentConfirmed ?? false);
      setSignerName(draft.signerName ?? "");
      setSignerPhone(draft.signerPhone ?? "");
      setVendorNameInput(draft.vendorName ?? "");
      toastBill("임시저장된 내용을 불러왔습니다", true);
    } else {
      const quoteTotal = quoteBillingItems?.length ? quoteBillingItems.reduce((sum, it) => sum + (it.amount || 0), 0) : null;
      setMaterialCost(quoteTotal != null ? String(quoteTotal) : selected?.billingAmount != null ? String(selected.billingAmount) : "");
      setSignerName("");
      setSignerPhone("");
      setVendorNameInput(selected?.vendorName ?? "");
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  // 관리자가 지급 확정한 부품이 2개 이상이면 부품별로 전/후 사진을 따로 받는다 — 1개면
  // 나눌 이유가 없어 지금처럼 통합 업로더를 그대로 쓴다. 외주 견적건은 견적 품목을 우선한다.
  const billingParts = quoteBillingItems?.length > 1 ? quoteBillingItems : selected?.billingPartRows?.length > 1 ? selected.billingPartRows : null;
  const manualPhotosOk = manualPhotos.before.length > 0 && manualPhotos.after.length > 0;
  const manualApprovalOk = manualAbsentMode
    ? manualApproverName.trim() && manualApproverPhone.replace(/\D/g, "").length >= 9 && manualAbsentConfirmed
    : manualSignerName.trim() && manualSignerPhone.replace(/\D/g, "").length >= 9 && !!manualSignatureUrl;
  const manualValid = manualForm.siteId && manualForm.units.length > 0 && formatPartRows(manualForm.parts) && manualForm.replaceDate && manualForm.contactPhone.trim() && Number(manualForm.cost) > 0 && manualPhotosOk && manualApprovalOk;

  // 스텝별 필수 검증 — 미입력이면 안내 문구 반환(다음/제출 막힘), 없으면 null.
  function matStepError(step) {
    if (step === 0) {
      if (!selected) return "청구 대상 건을 선택해주세요";
      if (!isQuoteBilling && !(Number(materialCost) > 0)) return "수리비를 입력해주세요";
      if (selected?.isOutsourced && !vendorNameInput.trim()) return "작업 업체명을 입력해주세요";
    }
    if (step === 1) {
      if (billingParts) {
        const allFilled = billingParts.every((_, i) => (partPhotos[i]?.before?.length > 0) && (partPhotos[i]?.after?.length > 0));
        if (!allFilled) return "모든 부품의 교체 전/후 사진을 등록해주세요";
      } else {
        if (materialPhotos.before.length === 0) return "교체 전 사진을 등록해주세요";
        if (materialPhotos.after.length === 0) return "교체 후 사진을 등록해주세요";
      }
    }
    if (step === 2) {
      if (absentMode) {
        if (!approverName.trim()) return "담당자 성함 또는 직책을 입력해주세요";
        if (!approverPhone.trim()) return "연락처를 입력해주세요";
        if (!isValidPhoneDigits(approverPhone)) return "전화번호를 확인해주세요";
        if (!absentConfirmed) return "전화 승인 확인란에 체크해주세요";
      } else {
        if (!signerName.trim()) return "서명자 성함을 입력해주세요";
        if (!signerPhone.trim()) return "서명자 연락처를 입력해주세요";
        if (!isValidPhoneDigits(signerPhone)) return "전화번호를 확인해주세요";
        if (!signatureUrl) return "고객 서명을 받아주세요";
      }
    }
    return null;
  }
  // 직접입력은 3-step: 0 현장·호기 / 1 교체내역·비용 / 2 증빙사진
  function manStepError(step) {
    if (step === 0) {
      if (!manualForm.siteId) return "현장을 선택해주세요";
      if (manualForm.units.length === 0) return "호기를 선택해주세요";
    }
    if (step === 1) {
      if (!formatPartRows(manualForm.parts)) return "교체내역을 1개 이상 입력해주세요";
      if (!manualForm.contactPhone.trim()) return "현장담당자 연락처를 입력해주세요";
      if (!(Number(manualForm.cost) > 0)) return "수리비를 입력해주세요";
    }
    if (step === 2) {
      if (manualPhotos.before.length === 0) return "교체 전 사진을 등록해주세요";
      if (manualPhotos.after.length === 0) return "교체 후 사진을 등록해주세요";
    }
    if (step === 3) {
      if (manualAbsentMode) {
        if (!manualApproverName.trim()) return "담당자 성함 또는 직책을 입력해주세요";
        if (!manualApproverPhone.trim()) return "연락처를 입력해주세요";
        if (!isValidPhoneDigits(manualApproverPhone)) return "전화번호를 확인해주세요";
        if (!manualAbsentConfirmed) return "전화 승인 확인란에 체크해주세요";
      } else {
        if (!manualSignerName.trim()) return "서명자 성함을 입력해주세요";
        if (!manualSignerPhone.trim()) return "서명자 연락처를 입력해주세요";
        if (!isValidPhoneDigits(manualSignerPhone)) return "전화번호를 확인해주세요";
        if (!manualSignatureUrl) return "고객 서명을 받아주세요";
      }
    }
    return null;
  }

  // 부품별 전/후 사진 슬롯 하나를 갱신 — { [index]: { before: [...], after: [...] } } 형태를 유지한다.
  function updatePartPhotos(index, key, updater) {
    setPartPhotos((prev) => {
      const cur = prev[index] ?? { before: [], after: [] };
      return { ...prev, [index]: { ...cur, [key]: updater(cur[key]) } };
    });
  }

  // 증빙사진 이후 단계(사진·서명)는 현장에서 중간에 끊기기 쉬워, 지금까지 입력한 내용을
  // 기기에 임시저장해뒀다가 이 건으로 돌아오면 자동으로 이어서 하게 합니다.
  function saveDraft() {
    if (!selected) return;
    try {
      localStorage.setItem(draftKey(selected.id), JSON.stringify({
        billStep, materialCost, materialReplaceDate, materialPhotos, partPhotos,
        signatureUrl, absentMode, approverName, approverPhone, absentConfirmed, signerName, signerPhone,
        vendorName: vendorNameInput,
      }));
      toastBill("임시저장했습니다", true);
    } catch {
      toastBill("임시저장에 실패했습니다");
    }
  }

  async function submitMaterial() {
    if (!selected) return;
    // 견적 지급 시 담당자를 2명 이상 지정한 경우, 같은 quoteRequestId(또는 materialRequestId,
    // selfCheckItemId)를 공유하는 할 일이 여러 개 생성돼 있습니다. 그중 한 명이 비용청구를
    // 하면 나머지 담당자의 할 일도 함께 자동완료되도록, 이 건과 같은 요청을 공유하는
    // 미완료 할 일을 모두 찾아 완료 처리합니다.
    const idsToComplete = (selected.quoteRequestId || selected.materialRequestId || selected.selfCheckItemId)
      ? todos
          .filter(
            (t) =>
              !t.done &&
              t.source !== "waste_return" &&
              ((selected.quoteRequestId && t.quoteRequestId === selected.quoteRequestId) ||
                (selected.materialRequestId && t.materialRequestId === selected.materialRequestId) ||
                (selected.selfCheckItemId && t.selfCheckItemId === selected.selfCheckItemId))
          )
          .map((t) => t.id)
      : [selected.id];
    // 부품이 여러 개면 부품별 전/후 사진을 따로 묶어 보내고, 어떤 사진이든 다 볼 수 있게
    // 통합 배열(beforePhotoUrls/afterPhotoUrls)에도 전체를 합쳐 같이 남긴다(기존 화면 호환).
    const partPhotosPayload = billingParts
      ? billingParts.map((part, i) => ({
          name: part.name,
          qty: part.qty ?? null,
          amount: part.amount ?? null,
          beforeUrls: (partPhotos[i]?.before ?? []).map((p) => p.url),
          afterUrls: (partPhotos[i]?.after ?? []).map((p) => p.url),
        }))
      : null;
    const beforePhotoUrls = billingParts
      ? partPhotosPayload.flatMap((p) => p.beforeUrls)
      : materialPhotos.before.map((p) => p.url);
    const afterPhotoUrls = billingParts
      ? partPhotosPayload.flatMap((p) => p.afterUrls)
      : materialPhotos.after.map((p) => p.url);
    const ok = await onSubmitBilling({
      type: "material",
      siteName: selected.siteName,
      elevatorNo: selected.elevatorNo,
      unitId: selected.unitId ?? null,
      materialRequestId: selected.materialRequestId ?? null,
      quoteRequestId: selected.quoteRequestId ?? null,
      part: selected.part,
      // billings.cost는 숫자 컬럼이라 "견적서 참조" 같은 문자열은 넣을 수 없습니다(넣으면 insert가
      // 조용히 실패합니다). 견적 연동 건은 실제 비용을 이 시스템에 남기지 않는다는 의미로 null 처리합니다.
      cost: isQuoteBilling ? null : materialCost,
      replaceDate: materialReplaceDate,
      contactPhone: null,
      beforePhotoUrls,
      afterPhotoUrls,
      partPhotos: partPhotosPayload,
      // 지류 교체확인서 대신: 서명했으면 서명 이미지, 고객 부재중이면 전화승인자 정보.
      signatureUrl: absentMode ? null : signatureUrl,
      approvalMethod: absentMode ? "전화승인" : "서명",
      approverName: absentMode ? approverName.trim() : signerName.trim(),
      approverPhone: absentMode ? approverPhone.trim() : signerPhone.trim(),
      approvedAt: new Date().toISOString(),
      isOutsourced: !!selected.isOutsourced,
      vendorName: selected.isOutsourced ? vendorNameInput.trim() : null,
    });
    // ★ 청구 저장 성공 후에만 할일 완료 처리 — insert 실패 시 "완료됐는데 청구 없음"(자재 로스) 방지 (P1-2)
    if (!ok) return;
    try { localStorage.removeItem(draftKey(selected.id)); } catch { /* 임시저장 정리 실패는 무시 */ }
    // 할일 완료 처리 자체가 실패할 수도 있다 — 이 결과를 확인 안 하면 DB엔 아직 미완료인데
    // 화면만 완료로 보여서, 그 할일이 다시 청구 대상 목록에 남아 재청구(중복청구) 유혹이 생긴다.
    const { error: todoError } = await supabase.from("todos").update({ done: true }).in("id", idsToComplete);
    if (todoError) {
      alert(`청구는 저장됐지만 할 일 완료 처리에 실패했습니다.\n${todoError.message ?? ""}\n목록에 남아있을 수 있으니 관리자에게 확인을 요청해주세요.`);
    } else {
      setTodos((prev) => prev.map((t) => (idsToComplete.includes(t.id) ? { ...t, done: true } : t)));
    }
    setSubmitted({ siteName: selected.siteName, part: selected.part, manual: false });
    setSelectedId(openTodos.find((t) => t.id !== selected.id)?.id ?? "");
    setMaterialCost("");
    setMaterialReplaceDate(TODAY_STR);
    setMaterialPhotos({ before: [], after: [] });
    setPartPhotos({});
    setSignatureUrl(null);
    setAbsentMode(false);
    setApproverName("");
    setApproverPhone("");
    setAbsentConfirmed(false);
    setSignerName("");
    setSignerPhone("");
    setVendorNameInput("");
    setBillStep(0);
    setTimeout(() => setSubmitted(null), 2600);
  }

  async function submitManual() {
    if (!manualValid) return;
    const site = sites.find((s) => s.id === manualForm.siteId);
    const partText = formatPartRows(manualForm.parts);
    // 선택한 호기마다 청구 1건씩 생성 (호기 단위 정합 — 자재/견적과 동일)
    const targets = manualForm.units.length ? manualForm.units : [null];
    // 순차 await — insert 실패 시 즉시 중단하고 폼을 유지(리셋 안 함)해 재시도 가능 (P1-1/P1-2).
    // 단, 이미 성공한 호기까지 폼에 남겨두면 재시도 시 그 호기들을 또 청구(중복청구)하게 되므로,
    // 실패한 호기부터만 남기고 이미 성공한 호기는 폼에서 미리 제거한다.
    for (let i = 0; i < targets.length; i++) {
      const u = targets[i];
      const ok = await onSubmitBilling({
        type: "manual",
        siteName: site.name,
        elevatorNo: u,
        siteId: site.id,
        part: partText,
        cost: manualForm.cost,
        beforePhotoUrls: manualPhotos.before.map((p) => p.url),
        afterPhotoUrls: manualPhotos.after.map((p) => p.url),
        replaceDate: manualForm.replaceDate,
        contactPhone: manualForm.contactPhone,
        // 지류 교체확인서 대신: 서명했으면 서명 이미지, 고객 부재중이면 전화승인자 정보.
        signatureUrl: manualAbsentMode ? null : manualSignatureUrl,
        approvalMethod: manualAbsentMode ? "전화승인" : "서명",
        approverName: manualAbsentMode ? manualApproverName.trim() : manualSignerName.trim(),
        approverPhone: manualAbsentMode ? manualApproverPhone.trim() : manualSignerPhone.trim(),
        approvedAt: new Date().toISOString(),
      });
      if (!ok) {
        if (manualForm.units.length) setManualForm((f) => ({ ...f, units: targets.slice(i) }));
        return;
      }
    }
    if (manualForm.fromKit) {
      // 호기 수만큼 부품을 썼으니 그만큼 차감해야 한다 — 3개 호기를 한 번에 청구하면 3배 차감.
      const unitCount = targets.length;
      manualForm.parts
        .filter((r) => r.name.trim() && r.qty)
        .forEach((r) => onUseKitPart({ part: r.name.trim(), siteName: site.name, qty: Number(r.qty) * unitCount }));
    }
    setSubmitted({ siteName: site.name, part: partText, manual: true, fromKit: manualForm.fromKit });
    setManualForm({ siteId: "", units: [], parts: [emptyPartRow()], replaceDate: TODAY_STR, contactPhone: "", cost: "", fromKit: false });
    setManualPhotos({ before: [], after: [] });
    setManualSignatureUrl(null);
    setManualAbsentMode(false);
    setManualApproverName("");
    setManualApproverPhone("");
    setManualAbsentConfirmed(false);
    setManualSignerName("");
    setManualSignerPhone("");
    setBillStep(0);
    setTimeout(() => setSubmitted(null), 2600);
  }

  // 자재 지급건/직접 입력 각 탭의 패널 — SwipeSubtabTrack이 드래그 중 옆 탭을 함께 렌더링할 때 쓴다.
  function renderBillingPane(tab) {
    if (tab === "material") return (
        openTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 text-center pt-16">
            <Receipt size={32} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-500">청구할 수 있는 자재 지급건이 없습니다</p>
            <p className="text-xs text-slate-400 mt-1.5">자재 담당자가 [자재 지급 완료] 처리를 해야<br />비용청구 대상 건이 여기에 나타납니다</p>
          </div>
        ) : (
          <div className="px-5 pt-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex gap-1 mb-2">
                {BILL_STEP_TITLES.map((t, i) => <div key={t} className={`flex-1 h-1 rounded-full ${i <= billStep ? "bg-blue-600" : "bg-slate-200"}`} />)}
              </div>
              <p className="text-sm font-extrabold text-slate-800 mb-3">{billStep + 1}. {BILL_STEP_TITLES[billStep]}</p>

              {billStep === 0 && (
                <>
                  <Field label="청구 대상 건 (지급완료된 자재)">
                    <select className={inputCls} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                      {openTodos.map((t) => (
                        <option key={t.id} value={t.id}>{t.siteName}{t.elevatorNo ? ` · ${t.elevatorNo}` : ""} · {t.part ?? t.title}</option>
                      ))}
                    </select>
                  </Field>
                  {selected && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between">
                      <span className="text-xs text-blue-700 font-semibold">지급일 {selected.assignedDate} 기준</span>
                      <DDay dueDate={selected.dueDate} />
                    </div>
                  )}
                  {selected?.isOutsourced && (
                    <Field label="작업 업체*">
                      <input
                        type="text"
                        className={inputCls}
                        placeholder="예: OO엘리베이터설비"
                        value={vendorNameInput}
                        onChange={(e) => setVendorNameInput(e.target.value)}
                      />
                    </Field>
                  )}
                  <Field label="교체일자">
                    <input
                      type="date"
                      className={inputCls}
                      value={materialReplaceDate}
                      onChange={(e) => setMaterialReplaceDate(e.target.value)}
                    />
                  </Field>
                  <Field label="수리비 (필수)">
                    {isQuoteBilling ? (
                      <input type="text" className={`${inputCls} bg-slate-100 text-slate-500`} value="견적서 참조" disabled readOnly />
                    ) : (
                      <>
                        {selected?.billingAmount != null && (
                          <p className="text-[11px] text-blue-500 mb-1">관리자 사전승인 금액 참고: ₩{Number(selected.billingAmount).toLocaleString()}</p>
                        )}
                        <input
                          type="number"
                          className={inputCls}
                          placeholder="예: 350000"
                          value={materialCost}
                          onChange={(e) => setMaterialCost(e.target.value)}
                        />
                        {!(Number(materialCost) > 0) ? (
                          <p className="text-[11px] text-red-500 mt-1">수리비를 입력해주세요</p>
                        ) : (
                          selected?.billingAmount != null && Number(materialCost) !== Number(selected.billingAmount) && (
                            <p className="text-[11px] text-amber-600 mt-1 flex items-start gap-1">
                              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                              사전승인 금액과 달라요 — 맞는지 한 번 더 확인해주세요
                            </p>
                          )
                        )}
                      </>
                    )}
                  </Field>
                </>
              )}

              {billStep === 1 && (
                billingParts ? (
                  <div className="space-y-4">
                    {billingParts.map((part, i) => (
                      <div key={i} className="border border-slate-200 rounded-xl p-3">
                        <p className="text-xs font-extrabold text-slate-700 mb-2">{part.name}{part.qty ? ` ${part.qty}` : ""}</p>
                        <Field label="교체 전">
                          <MultiPhotoUpload
                            photos={partPhotos[i]?.before ?? []}
                            uploadFolder={`billings/${uploadSession}/part${i}/before`}
                            onUploaded={(url) => updatePartPhotos(i, "before", (arr) => [...arr, { url }])}
                            onRemove={(idx) => updatePartPhotos(i, "before", (arr) => arr.filter((_, bi) => bi !== idx))}
                            label="교체 전 표준 화질 사진 등록"
                            compactHint
                          />
                        </Field>
                        <Field label="교체 후">
                          <MultiPhotoUpload
                            photos={partPhotos[i]?.after ?? []}
                            uploadFolder={`billings/${uploadSession}/part${i}/after`}
                            onUploaded={(url) => updatePartPhotos(i, "after", (arr) => [...arr, { url }])}
                            onRemove={(idx) => updatePartPhotos(i, "after", (arr) => arr.filter((_, ai) => ai !== idx))}
                            label="교체 후 표준 화질 사진 등록"
                            compactHint
                          />
                        </Field>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <Field label="교체 전">
                      <MultiPhotoUpload
                        photos={materialPhotos.before}
                        uploadFolder={`billings/${uploadSession}/before`}
                        onUploaded={(url) => setMaterialPhotos((p) => ({ ...p, before: [...p.before, { url }] }))}
                        onRemove={(idx) => setMaterialPhotos((p) => ({ ...p, before: p.before.filter((_, i) => i !== idx) }))}
                        label="교체 전 표준 화질 사진 등록"
                        compactHint
                      />
                    </Field>
                    <Field label="교체 후">
                      <MultiPhotoUpload
                        photos={materialPhotos.after}
                        uploadFolder={`billings/${uploadSession}/after`}
                        onUploaded={(url) => setMaterialPhotos((p) => ({ ...p, after: [...p.after, { url }] }))}
                        onRemove={(idx) => setMaterialPhotos((p) => ({ ...p, after: p.after.filter((_, i) => i !== idx) }))}
                        label="교체 후 표준 화질 사진 등록"
                        compactHint
                      />
                    </Field>
                  </>
                )
              )}

              {billStep === 2 && (
                <>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
                    <p className="text-xs font-extrabold text-slate-700">완료보고서 미리보기</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{selected?.siteName}{selected?.elevatorNo ? ` · ${selected.elevatorNo}` : ""}</p>

                    {billingParts ? (
                      <div className="space-y-3 mt-2">
                        {billingParts.map((part, i) => (
                          <div key={i}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-slate-800">{part.name}{part.qty ? ` ${part.qty}` : ""}</p>
                              {!isQuoteBilling && (
                                <p className="text-sm font-extrabold text-blue-700 shrink-0">₩{Number(part.amount || 0).toLocaleString()}</p>
                              )}
                            </div>
                            <div className="flex gap-1.5 mt-1">
                              {partPhotos[i]?.before?.[0] && (
                                <img src={partPhotos[i].before[0].url} alt={`${part.name} 교체 전`} className="flex-1 min-w-0 aspect-square rounded-lg object-cover border border-slate-200" />
                              )}
                              {partPhotos[i]?.after?.[0] && (
                                <img src={partPhotos[i].after[0].url} alt={`${part.name} 교체 후`} className="flex-1 min-w-0 aspect-square rounded-lg object-cover border border-slate-200" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-800">{selected?.part}</p>
                          {!isQuoteBilling && (
                            <p className="text-sm font-extrabold text-blue-700 shrink-0">₩{Number(materialCost || 0).toLocaleString()}</p>
                          )}
                        </div>
                        {(materialPhotos.before[0] || materialPhotos.after[0]) && (
                          <div className="flex gap-1.5 mt-1">
                            {materialPhotos.before[0] && (
                              <img src={materialPhotos.before[0].url} alt="교체 전" className="flex-1 min-w-0 aspect-square rounded-lg object-cover border border-slate-200" />
                            )}
                            {materialPhotos.after[0] && (
                              <img src={materialPhotos.after[0].url} alt="교체 후" className="flex-1 min-w-0 aspect-square rounded-lg object-cover border border-slate-200" />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200">
                      <p className="text-xs font-bold text-slate-500">합계</p>
                      <p className="text-sm font-extrabold text-blue-700">
                        {isQuoteBilling ? "견적서 참조" : (
                          <>
                            ₩{Number(materialCost || 0).toLocaleString()}
                            <span className="text-[11px] font-semibold text-slate-400 ml-1">(VAT별도)</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {!absentMode ? (
                    <>
                      <Field label="서명자 성함*">
                        <input type="text" className={inputCls} placeholder="예: 김O식 관리소장" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
                      </Field>
                      <Field label="서명자 연락처*">
                        <input type="tel" className={inputCls} placeholder="010-0000-0000" value={signerPhone} onChange={(e) => setSignerPhone(formatPhone(e.target.value))} />
                      </Field>
                      <Field label="고객 서명*">
                        <SignaturePad
                          url={signatureUrl}
                          uploadFolder={`billings/${uploadSession}/signature`}
                          onSigned={setSignatureUrl}
                          onClear={() => setSignatureUrl(null)}
                        />
                      </Field>
                      <button type="button" onClick={() => setAbsentMode(true)} className="w-full text-center text-xs font-bold text-slate-400 underline underline-offset-2 mt-1">
                        고객이 부재중이에요
                      </button>
                    </>
                  ) : (
                    <>
                      <Field label="담당자 (성함 또는 직책)">
                        <input type="text" className={inputCls} placeholder="예: 김O식 관리소장" value={approverName} onChange={(e) => setApproverName(e.target.value)} />
                      </Field>
                      <Field label="연락처">
                        <input type="tel" className={inputCls} placeholder="010-0000-0000" value={approverPhone} onChange={(e) => setApproverPhone(formatPhone(e.target.value))} />
                      </Field>
                      <label className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 mt-1">
                        <input type="checkbox" checked={absentConfirmed} onChange={(e) => setAbsentConfirmed(e.target.checked)} />
                        <span className="text-xs font-bold text-slate-700">전화로 승인받았습니다</span>
                      </label>
                      <button type="button" onClick={() => setAbsentMode(false)} className="w-full text-center text-xs font-bold text-slate-400 underline underline-offset-2 mt-2">
                        고객이 돌아왔어요 — 서명으로
                      </button>
                    </>
                  )}
                </>
              )}

              <div className="flex gap-2 mt-2">
                {billStep > 0 && (
                  <button type="button" onClick={() => setBillStep(billStep - 1)} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">이전</button>
                )}
                {billStep >= 1 && (
                  <button type="button" onClick={saveDraft} className="px-4 py-3 rounded-xl text-sm font-bold text-blue-700 border border-blue-200 bg-blue-50">임시저장</button>
                )}
                {billStep < 2 ? (
                  <button type="button" onClick={() => { const err = matStepError(billStep); if (err) { toastBill(err); return; } setBillStep(billStep + 1); }} className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 active:bg-blue-800">다음</button>
                ) : (
                  <div className="flex-1"><PrimaryButton onClick={() => { const err = matStepError(2); if (err) { toastBill(err); return; } submitMaterial(); }}>청구 요청 제출</PrimaryButton></div>
                )}
              </div>
              {submitted && !submitted.manual && (
                <p className="text-xs text-emerald-600 font-bold text-center mt-3 flex items-center justify-center gap-1">
                  <Check size={14} /> 제출 완료 · "{submitted.siteName} {submitted.part}" 할 일이 자동 완료되었습니다
                </p>
              )}
            </div>
          </div>
        )
    );

    return (
        <div className="px-5 pt-4">
          <p className="text-[11px] text-slate-400 mb-3 px-1">자재 신청 없이 현장에서 바로 교체한 부품(예비 재고 사용 등)을 직접 입력해 청구합니다.</p>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 overflow-visible">
            <div className="flex gap-1 mb-2">
              {MAN_BILL_TITLES.map((t, i) => <div key={t} className={`flex-1 h-1 rounded-full ${i <= billStep ? "bg-blue-600" : "bg-slate-200"}`} />)}
            </div>
            <p className="text-sm font-extrabold text-slate-800 mb-3">{billStep + 1}. {MAN_BILL_TITLES[billStep]}</p>

            {billStep === 0 && (
              <>
                <Field label="현장 선택">
                  <SiteSearchSelect value={manualForm.siteId} onChange={(id) => {
                    const s = sites.find((x) => x.id === id);
                    const us = s ? siteUnitList(s, allUnits) : [];
                    setManualForm({ ...manualForm, siteId: id, units: us.length === 1 ? [us[0].unitNo] : [] });
                  }} />
                </Field>
                {manualForm.siteId && (
                  <UnitPickGrid
                    site={sites.find((s) => s.id === manualForm.siteId)}
                    selected={manualForm.units}
                    onToggle={(u) => setManualForm({ ...manualForm, units: manualForm.units.includes(u) ? manualForm.units.filter((x) => x !== u) : [...manualForm.units, u] })}
                  />
                )}
              </>
            )}

            {billStep === 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setManualForm({ ...manualForm, fromKit: !manualForm.fromKit, parts: [emptyPartRow()] })}
                  className={`w-full flex items-center gap-2.5 border rounded-xl px-3.5 py-3 mb-4 text-left ${manualForm.fromKit ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${manualForm.fromKit ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                    {manualForm.fromKit && <Check size={13} className="text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">상비부품에서 사용함</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">체크하면 자재 담당자에게 보충 요청이 자동으로 전달됩니다</p>
                  </div>
                </button>
                <Field label="교체내역">
                  <PartsRowsInput
                    rows={manualForm.parts}
                    setRows={(rows) => setManualForm({ ...manualForm, parts: rows })}
                    nameOptions={manualForm.fromKit ? KIT_PARTS : undefined}
                    namePlaceholder={manualForm.fromKit ? "상비부품 목록에서 선택하세요" : "예: 1층 승장도어 스위치"}
                    nameLabel="부품명 (해당 층까지 기재)"
                  />
                </Field>
                <Field label="교체일자">
                  <input
                    type="date"
                    className={inputCls}
                    value={manualForm.replaceDate}
                    onChange={(e) => setManualForm({ ...manualForm, replaceDate: e.target.value })}
                  />
                </Field>
                <Field label="교체확인서 받은 현장담당자 연락처">
                  <input
                    className={inputCls}
                    placeholder="예: 010-1234-5678"
                    value={manualForm.contactPhone}
                    onChange={(e) => setManualForm({ ...manualForm, contactPhone: formatPhone(e.target.value) })}
                  />
                </Field>
                <Field label="수리비 (필수)">
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="예: 150000"
                    value={manualForm.cost}
                    onChange={(e) => setManualForm({ ...manualForm, cost: e.target.value })}
                  />
                  {!(Number(manualForm.cost) > 0) && (
                    <p className="text-[11px] text-red-500 mt-1">수리비를 입력해주세요</p>
                  )}
                </Field>
              </>
            )}

            {billStep === 2 && (
              <>
                <Field label="교체 전 사진 (필수)">
                  <MultiPhotoUpload
                    photos={manualPhotos.before}
                    uploadFolder={`billings/${uploadSession}/before`}
                    onUploaded={(url) => setManualPhotos((p) => ({ ...p, before: [...p.before, { url }] }))}
                    onRemove={(idx) => setManualPhotos((p) => ({ ...p, before: p.before.filter((_, i) => i !== idx) }))}
                    label="교체 전 표준 화질 사진 등록"
                  />
                </Field>
                <Field label="교체 후 사진 (필수)">
                  <MultiPhotoUpload
                    photos={manualPhotos.after}
                    uploadFolder={`billings/${uploadSession}/after`}
                    onUploaded={(url) => setManualPhotos((p) => ({ ...p, after: [...p.after, { url }] }))}
                    onRemove={(idx) => setManualPhotos((p) => ({ ...p, after: p.after.filter((_, i) => i !== idx) }))}
                    label="교체 후 표준 화질 사진 등록"
                  />
                </Field>
              </>
            )}

            {billStep === 3 && (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
                  <p className="text-xs font-extrabold text-slate-700">완료보고서 미리보기</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{sites.find((s) => s.id === manualForm.siteId)?.name}{manualForm.units.length ? ` · ${manualForm.units.join(", ")}` : ""}</p>
                  <div className="mt-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">{formatPartRows(manualForm.parts)}</p>
                      <p className="text-sm font-extrabold text-blue-700 shrink-0">₩{Number(manualForm.cost || 0).toLocaleString()}</p>
                    </div>
                    {(manualPhotos.before[0] || manualPhotos.after[0]) && (
                      <div className="flex gap-1.5 mt-1">
                        {manualPhotos.before[0] && (
                          <img src={manualPhotos.before[0].url} alt="교체 전" className="flex-1 min-w-0 aspect-square rounded-lg object-cover border border-slate-200" />
                        )}
                        {manualPhotos.after[0] && (
                          <img src={manualPhotos.after[0].url} alt="교체 후" className="flex-1 min-w-0 aspect-square rounded-lg object-cover border border-slate-200" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200">
                    <p className="text-xs font-bold text-slate-500">합계</p>
                    <p className="text-sm font-extrabold text-blue-700">
                      ₩{Number(manualForm.cost || 0).toLocaleString()}
                      <span className="text-[11px] font-semibold text-slate-400 ml-1">(VAT별도)</span>
                    </p>
                  </div>
                </div>

                {!manualAbsentMode ? (
                  <>
                    <Field label="서명자 성함*">
                      <input type="text" className={inputCls} placeholder="예: 김O식 관리소장" value={manualSignerName} onChange={(e) => setManualSignerName(e.target.value)} />
                    </Field>
                    <Field label="서명자 연락처*">
                      <input type="tel" className={inputCls} placeholder="010-0000-0000" value={manualSignerPhone} onChange={(e) => setManualSignerPhone(formatPhone(e.target.value))} />
                    </Field>
                    <Field label="고객 서명*">
                      <SignaturePad
                        url={manualSignatureUrl}
                        uploadFolder={`billings/${uploadSession}/manual-signature`}
                        onSigned={setManualSignatureUrl}
                        onClear={() => setManualSignatureUrl(null)}
                      />
                    </Field>
                    <button type="button" onClick={() => setManualAbsentMode(true)} className="w-full text-center text-xs font-bold text-slate-400 underline underline-offset-2 mt-1">
                      고객이 부재중이에요
                    </button>
                  </>
                ) : (
                  <>
                    <Field label="담당자 (성함 또는 직책)">
                      <input type="text" className={inputCls} placeholder="예: 김O식 관리소장" value={manualApproverName} onChange={(e) => setManualApproverName(e.target.value)} />
                    </Field>
                    <Field label="연락처">
                      <input type="tel" className={inputCls} placeholder="010-0000-0000" value={manualApproverPhone} onChange={(e) => setManualApproverPhone(formatPhone(e.target.value))} />
                    </Field>
                    <label className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 mt-1">
                      <input type="checkbox" checked={manualAbsentConfirmed} onChange={(e) => setManualAbsentConfirmed(e.target.checked)} />
                      <span className="text-xs font-bold text-slate-700">전화로 승인받았습니다</span>
                    </label>
                    <button type="button" onClick={() => setManualAbsentMode(false)} className="w-full text-center text-xs font-bold text-slate-400 underline underline-offset-2 mt-2">
                      고객이 돌아왔어요 — 서명으로
                    </button>
                  </>
                )}
              </>
            )}

            <div className="flex gap-2 mt-2">
              {billStep > 0 && (
                <button type="button" onClick={() => setBillStep((s) => s - 1)} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">이전</button>
              )}
              {billStep < 3 ? (
                <button type="button" onClick={() => { const err = manStepError(billStep); if (err) { toastBill(err); return; } setBillStep((s) => s + 1); }} className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 active:bg-blue-800">다음</button>
              ) : (
                <div className="flex-1"><PrimaryButton onClick={() => { const err = manStepError(3); if (err) { toastBill(err); return; } submitManual(); }}>청구 요청 제출</PrimaryButton></div>
              )}
            </div>
            {submitted && submitted.manual && (
              <p className="text-xs text-emerald-600 font-bold text-center mt-3 flex items-center justify-center gap-1">
                <Check size={14} />
                제출 완료 · "{submitted.siteName} {submitted.part}" 청구가 접수되었습니다
                {submitted.fromKit && " · 상비부품 보충 요청도 함께 전달됐습니다"}
              </p>
            )}
          </div>
        </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0 relative">
        <button
          onClick={() => { setMode("material"); setBillStep(0); setBillToast(null); }}
          className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1.5 ${mode === "material" ? "text-blue-700" : "text-slate-400"}`}
        >
          자재 지급건
        </button>
        <button
          onClick={() => { setMode("manual"); setBillStep(0); setBillToast(null); }}
          className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1.5 ${mode === "manual" ? "text-blue-700" : "text-slate-400"}`}
        >
          직접 입력
        </button>
        <SwipeIndicatorBar swipe={swipe} />
      </div>

      <SwipeSubtabTrack
        swipe={swipe}
        tabs={billingSubTabs}
        trackClassName="flex-1"
        paneClassName="overflow-y-auto pb-4"
        renderTab={renderBillingPane}
      />

      {/* 필수 미입력 안내 토스트 (자재·견적과 동일 패턴) */}
      {billToast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 max-w-[85%] ${billToast.ok ? "bg-emerald-600" : "bg-slate-900"}`}>
          {billToast.ok ? <Check size={14} className="shrink-0" /> : <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
          {billToast.msg}
        </div>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* ROOM (게시판) incl. admin dashboard                                  */
/* ------------------------------------------------------------------ */

export function BillingCard({ b, onPhotoClick }) {
  const photoSlots = [
    ...(b.beforePhotoUrls ?? []).map((url) => ({ label: "교체 전", url })),
    ...(b.afterPhotoUrls ?? []).map((url) => ({ label: "교체 후", url })),
    ...(b.confirmPhotoUrl ? [{ label: "확인서", url: b.confirmPhotoUrl }] : []),
  ];
  return (
    <div className="border border-slate-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-slate-800">{b.siteName} · {b.part}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${b.type === "material" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
          {b.type === "material" ? "자재지급" : "직접입력"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{b.engineer} · {b.replaceDate} 교체{b.contactPhone ? ` · 현장담당 ${b.contactPhone}` : ""}</span>
        <span className="font-bold text-slate-600 shrink-0 ml-2">{b.cost ? `₩${Number(b.cost).toLocaleString()}` : "-"}</span>
      </div>
      {photoSlots.length > 0 && (
        <div className="flex gap-2 mt-2">
          {photoSlots.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => (onPhotoClick ? onPhotoClick(photoSlots.map((p) => p.url), i) : window.open(s.url, "_blank"))}
              className="flex flex-col items-center gap-0.5"
            >
              <img src={s.url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
              <span className="text-[9px] text-slate-400">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export function BillingHistoryScreen({ billings, onBack }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("전체");

  const filtered = billings.filter(
    (b) => (type === "전체" || (type === "자재지급" && b.type === "material") || (type === "직접입력" && b.type === "manual")) && b.siteName.toLowerCase().includes(query.trim().toLowerCase())
  );

  // 날짜별 그룹핑 (최신 날짜 먼저)
  const groups = {};
  filtered.forEach((b) => {
    (groups[b.replaceDate] ??= []).push(b);
  });
  const dates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));
  const total = filtered.reduce((sum, b) => sum + (Number(b.cost) || 0), 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="청구 내역" onBack={onBack} onHome={onBack} />

      <div className="px-5 py-3 bg-blue-950 shrink-0 flex items-center justify-between">
        <span className="text-xs text-blue-200">이번 달 총 {filtered.length}건</span>
        <span className="text-sm font-extrabold text-white">₩{total.toLocaleString()}</span>
      </div>

      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {["전체", "자재지급", "직접입력"].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 ${type === t ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {dates.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 청구 내역이 없습니다</p>
        ) : (
          dates.map((d) => (
            <div key={d} className="mb-4">
              <p className="text-xs font-bold text-slate-400 mb-2 sticky top-0 bg-white py-1">{d} · {groups[d].length}건</p>
              <div className="space-y-2">
                {groups[d].map((b) => <BillingCard key={b.id} b={b} />)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
