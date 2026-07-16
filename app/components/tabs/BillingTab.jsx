import { useState, useContext } from "react";
import { Receipt, Check, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { siteUnits } from "@/lib/utils";
import { TODAY_STR, KIT_PARTS } from "@/lib/constants";
import { DDay, PrimaryButton, Field, inputCls, DrillHeader } from "@/app/components/ui";
import { SitesContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload, SinglePhotoUpload } from "@/app/components/formWidgets";
import { emptyPartRow, formatPartRows, PartsRowsInput } from "@/app/components/tabs/MaterialTab";


/* ------------------------------------------------------------------ */
/* BILLING (비용청구)                                                    */
/* ------------------------------------------------------------------ */

export function BillingTab({ todos, setTodos, onSubmitBilling, onUseKitPart }) {
  const sites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [uploadSession] = useState(() => Date.now());
  const [mode, setMode] = useState("material"); // material | manual
  const openTodos = todos.filter((t) => !t.done && t.assignee === CURRENT_ENGINEER);
  const [selectedId, setSelectedId] = useState(openTodos[0]?.id ?? "");
  const [materialCost, setMaterialCost] = useState("");
  const [materialReplaceDate, setMaterialReplaceDate] = useState(TODAY_STR);
  const [submitted, setSubmitted] = useState(null);
  const [manualForm, setManualForm] = useState({ siteId: "", unit: "", parts: [emptyPartRow()], replaceDate: TODAY_STR, contactPhone: "", cost: "", fromKit: false });
  const [materialPhotos, setMaterialPhotos] = useState({ before: [], after: [], confirm: null });
  const [manualPhotos, setManualPhotos] = useState({ before: [], after: [], confirm: null });

  const selected = todos.find((t) => t.id === selectedId);
  const manualValid = manualForm.siteId && formatPartRows(manualForm.parts) && manualForm.replaceDate && manualForm.contactPhone.trim();

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
    await supabase.from("todos").update({ done: true }).in("id", idsToComplete);
    setTodos((prev) => prev.map((t) => (idsToComplete.includes(t.id) ? { ...t, done: true } : t)));
    onSubmitBilling({
      type: "material",
      siteName: selected.siteName,
      elevatorNo: selected.elevatorNo,
      unitId: selected.unitId ?? null,
      materialRequestId: selected.materialRequestId ?? null,
      part: selected.part,
      cost: materialCost,
      replaceDate: materialReplaceDate,
      contactPhone: null,
      beforePhotoUrls: materialPhotos.before.map((p) => p.url),
      afterPhotoUrls: materialPhotos.after.map((p) => p.url),
      confirmPhotoUrl: materialPhotos.confirm,
    });
    setSubmitted({ siteName: selected.siteName, part: selected.part, manual: false });
    setSelectedId(openTodos.find((t) => t.id !== selected.id)?.id ?? "");
    setMaterialCost("");
    setMaterialReplaceDate(TODAY_STR);
    setMaterialPhotos({ before: [], after: [], confirm: null });
    setTimeout(() => setSubmitted(null), 2600);
  }

  function submitManual() {
    if (!manualValid) return;
    const site = sites.find((s) => s.id === manualForm.siteId);
    const partText = formatPartRows(manualForm.parts);
    onSubmitBilling({
      type: "manual",
      siteName: site.name,
      elevatorNo: manualForm.unit,
      siteId: site.id,
      part: partText,
      cost: manualForm.cost,
      beforePhotoUrls: manualPhotos.before.map((p) => p.url),
      afterPhotoUrls: manualPhotos.after.map((p) => p.url),
      confirmPhotoUrl: manualPhotos.confirm,
      replaceDate: manualForm.replaceDate,
      contactPhone: manualForm.contactPhone,
    });
    if (manualForm.fromKit) {
      manualForm.parts
        .filter((r) => r.name.trim() && r.qty)
        .forEach((r) => onUseKitPart({ part: r.name.trim(), siteName: site.name }));
    }
    setSubmitted({ siteName: site.name, part: partText, manual: true, fromKit: manualForm.fromKit });
    setManualForm({ siteId: "", unit: "", parts: [emptyPartRow()], replaceDate: TODAY_STR, contactPhone: "", cost: "", fromKit: false });
    setManualPhotos({ before: [], after: [], confirm: null });
    setTimeout(() => setSubmitted(null), 2600);
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="px-5 pt-4 flex gap-2">
        <button
          onClick={() => setMode("material")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${mode === "material" ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}
        >
          자재 지급건
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${mode === "manual" ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}
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
              <Field label="교체 전 사진">
                <MultiPhotoUpload
                  photos={materialPhotos.before}
                  uploadFolder={`billings/${uploadSession}/before`}
                  onUploaded={(url) => setMaterialPhotos((p) => ({ ...p, before: [...p.before, { url }] }))}
                  onRemove={(idx) => setMaterialPhotos((p) => ({ ...p, before: p.before.filter((_, i) => i !== idx) }))}
                  label="교체 전 표준 화질 사진 등록"
                  required={false}
                />
              </Field>
              <Field label="교체 후 사진">
                <MultiPhotoUpload
                  photos={materialPhotos.after}
                  uploadFolder={`billings/${uploadSession}/after`}
                  onUploaded={(url) => setMaterialPhotos((p) => ({ ...p, after: [...p.after, { url }] }))}
                  onRemove={(idx) => setMaterialPhotos((p) => ({ ...p, after: p.after.filter((_, i) => i !== idx) }))}
                  label="교체 후 표준 화질 사진 등록"
                  required={false}
                />
              </Field>
              <Field label="교체확인서">
                <SinglePhotoUpload
                  label="교체확인서 종이 사진 등록"
                  url={materialPhotos.confirm}
                  uploadFolder={`billings/${uploadSession}`}
                  onUploaded={(url) => setMaterialPhotos((p) => ({ ...p, confirm: url }))}
                  onRemove={() => setMaterialPhotos((p) => ({ ...p, confirm: null }))}
                />
              </Field>
              <Field label="수리비">
                <input
                  type="number"
                  className={inputCls}
                  placeholder="예: 350000"
                  value={materialCost}
                  onChange={(e) => setMaterialCost(e.target.value)}
                />
              </Field>
              <PrimaryButton onClick={submitMaterial} disabled={!selected}>청구 요청 제출</PrimaryButton>
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
            <Field label="현장 선택">
              <SiteSearchSelect value={manualForm.siteId} onChange={(id) => setManualForm({ ...manualForm, siteId: id, unit: "" })} />
            </Field>
            <Field label="호기 선택">
              <select className={inputCls} value={manualForm.unit} onChange={(e) => setManualForm({ ...manualForm, unit: e.target.value })} disabled={!manualForm.siteId}>
                <option value="">호기를 선택해주세요</option>
                {manualForm.siteId && siteUnits(sites.find((s) => s.id === manualForm.siteId)).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
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
            <Field label="교체내역 (부품명, 수량)">
              <PartsRowsInput
                rows={manualForm.parts}
                setRows={(rows) => setManualForm({ ...manualForm, parts: rows })}
                nameOptions={manualForm.fromKit ? KIT_PARTS : undefined}
                namePlaceholder={manualForm.fromKit ? "상비부품 목록에서 선택하세요" : "예: 도어 롤러"}
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
                onChange={(e) => setManualForm({ ...manualForm, contactPhone: e.target.value })}
              />
            </Field>
            <Field label="교체 전 사진">
              <MultiPhotoUpload
                photos={manualPhotos.before}
                uploadFolder={`billings/${uploadSession}/before`}
                onUploaded={(url) => setManualPhotos((p) => ({ ...p, before: [...p.before, { url }] }))}
                onRemove={(idx) => setManualPhotos((p) => ({ ...p, before: p.before.filter((_, i) => i !== idx) }))}
                label="교체 전 표준 화질 사진 등록"
                required={false}
              />
            </Field>
            <Field label="교체 후 사진">
              <MultiPhotoUpload
                photos={manualPhotos.after}
                uploadFolder={`billings/${uploadSession}/after`}
                onUploaded={(url) => setManualPhotos((p) => ({ ...p, after: [...p.after, { url }] }))}
                onRemove={(idx) => setManualPhotos((p) => ({ ...p, after: p.after.filter((_, i) => i !== idx) }))}
                label="교체 후 표준 화질 사진 등록"
                required={false}
              />
            </Field>
            <Field label="교체확인서">
              <SinglePhotoUpload
                label="교체확인서 종이 사진 등록"
                url={manualPhotos.confirm}
                uploadFolder={`billings/${uploadSession}`}
                onUploaded={(url) => setManualPhotos((p) => ({ ...p, confirm: url }))}
                onRemove={() => setManualPhotos((p) => ({ ...p, confirm: null }))}
              />
            </Field>
            <Field label="수리비">
              <input
                type="number"
                className={inputCls}
                placeholder="예: 150000"
                value={manualForm.cost}
                onChange={(e) => setManualForm({ ...manualForm, cost: e.target.value })}
              />
            </Field>
            <PrimaryButton onClick={submitManual} disabled={!manualValid}>청구 요청 제출</PrimaryButton>
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
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* ROOM (우리방) incl. admin dashboard                                  */
/* ------------------------------------------------------------------ */

export function BillingCard({ b }) {
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
            <a key={i} href={s.url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-0.5">
              <img src={s.url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
              <span className="text-[9px] text-slate-400">{s.label}</span>
            </a>
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
