import { useState, useContext } from "react";
import { Receipt, Check, Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { siteUnits, formatPhone } from "@/lib/utils";
import { TODAY_STR, KIT_PARTS } from "@/lib/constants";
import { DDay, PrimaryButton, Field, inputCls, DrillHeader } from "@/app/components/ui";
import { SitesContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload, SinglePhotoUpload } from "@/app/components/formWidgets";
import { emptyPartRow, formatPartRows, PartsRowsInput, UnitPickGrid } from "@/app/components/tabs/MaterialTab";


/* ------------------------------------------------------------------ */
/* BILLING (비용청구)                                                    */
/* ------------------------------------------------------------------ */

const BILL_STEP_TITLES = ["청구 정보", "증빙 사진"]; // 자재 지급건(2-step)
const MAN_BILL_TITLES = ["현장·호기", "교체 내역·비용", "증빙 사진"]; // 직접 입력(3-step)

export function BillingTab({ todos, setTodos, onSubmitBilling, onUseKitPart }) {
  const sites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [uploadSession] = useState(() => Date.now());
  const [mode, setMode] = useState("material"); // material | manual
  // 자재지급건 청구는 기사가 자재신청/견적요청으로 만든 할일만 대상 — 관리자가 직접 부여한 할일(source: manual)은 제외.
  const openTodos = todos.filter((t) => !t.done && t.assignee === CURRENT_ENGINEER && t.source !== "manual");
  const [selectedId, setSelectedId] = useState(openTodos[0]?.id ?? "");
  const [materialCost, setMaterialCost] = useState("");
  const [materialReplaceDate, setMaterialReplaceDate] = useState(TODAY_STR);
  const [submitted, setSubmitted] = useState(null);
  const [manualForm, setManualForm] = useState({ siteId: "", units: [], parts: [emptyPartRow()], replaceDate: TODAY_STR, contactPhone: "", cost: "", fromKit: false });
  const [materialPhotos, setMaterialPhotos] = useState({ before: [], after: [], confirm: null });
  const [manualPhotos, setManualPhotos] = useState({ before: [], after: [], confirm: null });
  const [billStep, setBillStep] = useState(0); // 0 정보 · 1 증빙사진
  const [billToast, setBillToast] = useState(null); // { msg, ok }
  function toastBill(msg, ok = false) { setBillToast({ msg, ok }); setTimeout(() => setBillToast(null), 2500); }

  const selected = todos.find((t) => t.id === selectedId);
  // 견적 연동 건은 이미 견적서에 수리비가 정해져 있어, 직접 입력 대신 "견적서 참조"로 고정합니다.
  const isQuoteBilling = selected?.source === "quote";
  // 증빙 사진(교체 전·후·확인서)은 청구 필수 — 이게 없으면 제출을 막는다.
  const materialPhotosOk = materialPhotos.before.length > 0 && materialPhotos.after.length > 0 && !!materialPhotos.confirm;
  const manualPhotosOk = manualPhotos.before.length > 0 && manualPhotos.after.length > 0 && !!manualPhotos.confirm;
  const materialValid = selected && (isQuoteBilling || Number(materialCost) > 0) && materialPhotosOk;
  const manualValid = manualForm.siteId && manualForm.units.length > 0 && formatPartRows(manualForm.parts) && manualForm.replaceDate && manualForm.contactPhone.trim() && Number(manualForm.cost) > 0 && manualPhotosOk;

  // 스텝별 필수 검증 — 미입력이면 안내 문구 반환(다음/제출 막힘), 없으면 null.
  function matStepError(step) {
    if (step === 0) {
      if (!selected) return "청구 대상 건을 선택해주세요";
      if (!isQuoteBilling && !(Number(materialCost) > 0)) return "수리비를 입력해주세요";
    }
    if (step === 1) {
      if (materialPhotos.before.length === 0) return "교체 전 사진을 등록해주세요";
      if (materialPhotos.after.length === 0) return "교체 후 사진을 등록해주세요";
      if (!materialPhotos.confirm) return "교체확인서를 등록해주세요";
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
      if (!manualPhotos.confirm) return "교체확인서를 등록해주세요";
    }
    return null;
  }

  async function submitMaterial() {
    if (!selected) return;
    // 견적 지급 시 담당자를 2명 이상 지정한 경우, 같은 quoteRequestId(또는 materialRequestId)를
    // 공유하는 할 일이 여러 개 생성돼 있습니다. 그중 한 명이 비용청구를 하면 나머지 담당자의
    // 할 일도 함께 자동완료되도록, 이 건과 같은 요청을 공유하는 미완료 할 일을 모두 찾아 완료 처리합니다.
    const idsToComplete = (selected.quoteRequestId || selected.materialRequestId)
      ? todos
          .filter(
            (t) =>
              !t.done &&
              ((selected.quoteRequestId && t.quoteRequestId === selected.quoteRequestId) ||
                (selected.materialRequestId && t.materialRequestId === selected.materialRequestId))
          )
          .map((t) => t.id)
      : [selected.id];
    const ok = await onSubmitBilling({
      type: "material",
      siteName: selected.siteName,
      elevatorNo: selected.elevatorNo,
      unitId: selected.unitId ?? null,
      materialRequestId: selected.materialRequestId ?? null,
      part: selected.part,
      // billings.cost는 숫자 컬럼이라 "견적서 참조" 같은 문자열은 넣을 수 없습니다(넣으면 insert가
      // 조용히 실패합니다). 견적 연동 건은 실제 비용을 이 시스템에 남기지 않는다는 의미로 null 처리합니다.
      cost: isQuoteBilling ? null : materialCost,
      replaceDate: materialReplaceDate,
      contactPhone: null,
      beforePhotoUrls: materialPhotos.before.map((p) => p.url),
      afterPhotoUrls: materialPhotos.after.map((p) => p.url),
      confirmPhotoUrl: materialPhotos.confirm,
    });
    // ★ 청구 저장 성공 후에만 할일 완료 처리 — insert 실패 시 "완료됐는데 청구 없음"(자재 로스) 방지 (P1-2)
    if (!ok) return;
    await supabase.from("todos").update({ done: true }).in("id", idsToComplete);
    setTodos((prev) => prev.map((t) => (idsToComplete.includes(t.id) ? { ...t, done: true } : t)));
    setSubmitted({ siteName: selected.siteName, part: selected.part, manual: false });
    setSelectedId(openTodos.find((t) => t.id !== selected.id)?.id ?? "");
    setMaterialCost("");
    setMaterialReplaceDate(TODAY_STR);
    setMaterialPhotos({ before: [], after: [], confirm: null });
    setBillStep(0);
    setTimeout(() => setSubmitted(null), 2600);
  }

  async function submitManual() {
    if (!manualValid) return;
    const site = sites.find((s) => s.id === manualForm.siteId);
    const partText = formatPartRows(manualForm.parts);
    // 선택한 호기마다 청구 1건씩 생성 (호기 단위 정합 — 자재/견적과 동일)
    const targets = manualForm.units.length ? manualForm.units : [null];
    // 순차 await — insert 실패 시 즉시 중단하고 폼을 유지(리셋 안 함)해 재시도 가능 (P1-1/P1-2)
    for (const u of targets) {
      const ok = await onSubmitBilling({
        type: "manual",
        siteName: site.name,
        elevatorNo: u,
        siteId: site.id,
        part: partText,
        cost: manualForm.cost,
        beforePhotoUrls: manualPhotos.before.map((p) => p.url),
        afterPhotoUrls: manualPhotos.after.map((p) => p.url),
        confirmPhotoUrl: manualPhotos.confirm,
        replaceDate: manualForm.replaceDate,
        contactPhone: manualForm.contactPhone,
      });
      if (!ok) return;
    }
    if (manualForm.fromKit) {
      manualForm.parts
        .filter((r) => r.name.trim() && r.qty)
        .forEach((r) => onUseKitPart({ part: r.name.trim(), siteName: site.name, qty: Number(r.qty) }));
    }
    setSubmitted({ siteName: site.name, part: partText, manual: true, fromKit: manualForm.fromKit });
    setManualForm({ siteId: "", units: [], parts: [emptyPartRow()], replaceDate: TODAY_STR, contactPhone: "", cost: "", fromKit: false });
    setManualPhotos({ before: [], after: [], confirm: null });
    setBillStep(0);
    setTimeout(() => setSubmitted(null), 2600);
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="flex border-b border-slate-100 shrink-0">
        <button
          onClick={() => { setMode("material"); setBillStep(0); setBillToast(null); }}
          className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1.5 ${mode === "material" ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
        >
          자재 지급건
        </button>
        <button
          onClick={() => { setMode("manual"); setBillStep(0); setBillToast(null); }}
          className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1.5 ${mode === "manual" ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
        >
          직접 입력
        </button>
      </div>

      {mode === "material" ? (
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
                        <input
                          type="number"
                          className={inputCls}
                          placeholder="예: 350000"
                          value={materialCost}
                          onChange={(e) => setMaterialCost(e.target.value)}
                        />
                        {!(Number(materialCost) > 0) && (
                          <p className="text-[11px] text-red-500 mt-1">수리비를 입력해주세요</p>
                        )}
                      </>
                    )}
                  </Field>
                </>
              )}

              {billStep === 1 && (
                <>
                  <Field label="교체 전 사진 (필수)">
                    <MultiPhotoUpload
                      photos={materialPhotos.before}
                      uploadFolder={`billings/${uploadSession}/before`}
                      onUploaded={(url) => setMaterialPhotos((p) => ({ ...p, before: [...p.before, { url }] }))}
                      onRemove={(idx) => setMaterialPhotos((p) => ({ ...p, before: p.before.filter((_, i) => i !== idx) }))}
                      label="교체 전 표준 화질 사진 등록"
                    />
                  </Field>
                  <Field label="교체 후 사진 (필수)">
                    <MultiPhotoUpload
                      photos={materialPhotos.after}
                      uploadFolder={`billings/${uploadSession}/after`}
                      onUploaded={(url) => setMaterialPhotos((p) => ({ ...p, after: [...p.after, { url }] }))}
                      onRemove={(idx) => setMaterialPhotos((p) => ({ ...p, after: p.after.filter((_, i) => i !== idx) }))}
                      label="교체 후 표준 화질 사진 등록"
                    />
                  </Field>
                  <Field label="교체확인서 (필수)">
                    <SinglePhotoUpload
                      label="교체확인서 종이 사진 등록"
                      url={materialPhotos.confirm}
                      uploadFolder={`billings/${uploadSession}`}
                      onUploaded={(url) => setMaterialPhotos((p) => ({ ...p, confirm: url }))}
                      onRemove={() => setMaterialPhotos((p) => ({ ...p, confirm: null }))}
                    />
                  </Field>
                </>
              )}

              <div className="flex gap-2 mt-2">
                {billStep > 0 && (
                  <button type="button" onClick={() => setBillStep(0)} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">이전</button>
                )}
                {billStep < 1 ? (
                  <button type="button" onClick={() => { const err = matStepError(0); if (err) { toastBill(err); return; } setBillStep(1); }} className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 active:bg-blue-800">다음</button>
                ) : (
                  <div className="flex-1"><PrimaryButton onClick={() => { const err = matStepError(1); if (err) { toastBill(err); return; } submitMaterial(); }}>청구 요청 제출</PrimaryButton></div>
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
      ) : (
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
                    const us = s ? siteUnits(s) : [];
                    setManualForm({ ...manualForm, siteId: id, units: us.length === 1 ? [us[0]] : [] });
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
                <Field label="교체확인서 (필수)">
                  <SinglePhotoUpload
                    label="교체확인서 종이 사진 등록"
                    url={manualPhotos.confirm}
                    uploadFolder={`billings/${uploadSession}`}
                    onUploaded={(url) => setManualPhotos((p) => ({ ...p, confirm: url }))}
                    onRemove={() => setManualPhotos((p) => ({ ...p, confirm: null }))}
                  />
                </Field>
              </>
            )}

            <div className="flex gap-2 mt-2">
              {billStep > 0 && (
                <button type="button" onClick={() => setBillStep((s) => s - 1)} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">이전</button>
              )}
              {billStep < 2 ? (
                <button type="button" onClick={() => { const err = manStepError(billStep); if (err) { toastBill(err); return; } setBillStep((s) => s + 1); }} className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 active:bg-blue-800">다음</button>
              ) : (
                <div className="flex-1"><PrimaryButton onClick={() => { const err = manStepError(2); if (err) { toastBill(err); return; } submitManual(); }}>청구 요청 제출</PrimaryButton></div>
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
      )}

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
/* ROOM (우리방) incl. admin dashboard                                  */
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
    (b) => (type === "전체" || (type === "자재지급" && b.type === "material") || (type === "직접입력" && b.type === "manual")) && b.siteName.includes(query.trim())
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
      <DrillHeader title="비용청구 내역" onBack={onBack} onHome={onBack} />

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
