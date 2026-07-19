import { useState, useContext } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { unitsToInspections, formatMonthDay, stripCityPrefix, groupBySite, findUnitForInspection, govDateToDashed } from "@/lib/utils";
import { Badge, DDay, PhotoUpload, FilterBar, PrimaryButton, Sheet, Field, inputCls } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { usePriorFlaggedInspection } from "@/app/hooks/useLiveInspections";


/* ------------------------------------------------------------------ */
/* INSPECTION (검사관리) - centerpiece                                  */
/* ------------------------------------------------------------------ */

// 검사도래현장 카드 한 장: 직전 검사가 조건부합격/조건후합격이면 현장명을 눌러 당시 부적합내역을 볼 수 있다.
function DueSoonCard({ insp, address, govElevatorNo, onOpenFail, onRegister }) {
  const { latest, detailRecord } = usePriorFlaggedInspection(govElevatorNo);
  const clickable = Boolean(latest);
  return (
    <div
      onClick={clickable ? () => onOpenFail({
        id: `unit-hist-${govElevatorNo}`,
        siteName: insp.siteName,
        elevatorNo: insp.elevatorNo,
        result: "conditional",
        govElevatorNo,
        startDate: govDateToDashed(detailRecord.inspctDe),
      }) : undefined}
      className={`bg-white rounded-xl border border-slate-200 p-3.5 touch-manipulation ${clickable ? "cursor-pointer active:bg-slate-50" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 text-sm">{insp.siteName} · {insp.elevatorNo}</p>
          <p className="text-[11px] text-slate-400 truncate">{address}</p>
          <p className="text-xs text-slate-500">{insp.type}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          {latest && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-300">
              직전검사 {latest.dispWords}
            </span>
          )}
          <span className="text-xs font-bold text-blue-700 whitespace-nowrap">
            {insp.dueDate ? formatMonthDay(insp.dueDate) : "-"}{insp.dueTime ? ` ${insp.dueTime}` : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">검사 결과 미등록</span>
        <button
          onClick={(e) => { e.stopPropagation(); onRegister(insp); }}
          className="text-xs font-bold text-white bg-blue-700 px-3 py-1.5 rounded-lg active:bg-blue-800"
        >
          결과 등록
        </button>
      </div>
    </div>
  );
}

export function InspectionTab({ inspections, setInspections }) {
  const sites = useContext(SitesContext);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const { name: CURRENT_ENGINEER, role } = useContext(AuthContext);
  const mySites = role === "admin" ? sites : sites.filter((s) => s.assignedEngineer === CURRENT_ENGINEER);
  const mySiteIds = new Set(mySites.map((s) => s.id));
  const [subTab, setSubTab] = useState("검사도래현장");
  const [openRegister, setOpenRegister] = useState(null); // inspection object or null
  const [form, setForm] = useState({});
  const [inspectionFailTarget, setInspectionFailTarget] = useState(null);

  // 검사유효기간은 units의 DB 캐시를 쓴다 (전 호기 실시간 API 호출 금지 — 트래픽 한도).
  // 조건부/불합격 현장은 담당현장만(관리자는 전체) — 도래현장 탭은 기존대로 전체 유지.
  const allUnits = useContext(UnitsContext);
  const liveInspections = unitsToInspections(allUnits, mySites).filter((i) => mySiteIds.has(i.siteId));
  const liveSiteIds = new Set(liveInspections.map((i) => i.siteId));
  const combined = [...liveInspections, ...inspections.filter((i) => !liveSiteIds.has(i.siteId) && mySiteIds.has(i.siteId))];

  // 도래현장: 관리자가 수기입력한 검사일자(inspections.due_date) 기준, 검사일이 30일 이내로 남은 현장만 (국가승강기정보센터 API 연동 현장은 제외)
  const dueSoon = groupBySite(
    inspections
      .filter((i) => i.dueDate && !i.result)
      .map((i) => ({ ...i, daysLeft: Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) }))
      .filter((i) => i.daysLeft >= 0 && i.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  );
  // 보완기한이 61일 이상 남은 건 아직 급하지 않으니 목록에서 뺀다(60일은 노출) — 기한 미정은 계속 노출.
  const flagged = groupBySite(
    combined
      .filter((i) => i.result === "conditional" || i.result === "fail")
      .filter((i) => !i.dueDate || Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) <= 60)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
  );

  function startRegister(insp) {
    setForm({
      siteId: insp.siteId,
      type: insp.type,
      org: insp.org,
      result: "",
      nextDate: "",
      notes: "",
    });
    setOpenRegister(insp);
  }

  async function submit() {
    const nextDueDate = form.nextDate || openRegister.dueDate;
    await supabase
      .from("inspections")
      .update({ result: form.result, notes: form.notes, due_date: nextDueDate })
      .eq("id", openRegister.id);
    setInspections((prev) =>
      prev.map((i) => (i.id === openRegister.id ? { ...i, result: form.result, notes: form.notes, dueDate: nextDueDate } : i))
    );
    setOpenRegister(null);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0">
        {["검사도래현장", "조건부/불합격 현장"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1.5 ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 flex items-start shrink-0">
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 도래 {dueSoon.length}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 조건부/불합격 {flagged.length}</span>
          </div>
        </div>
        <div className="w-px self-stretch bg-slate-200 mx-3" />
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">전체 진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 도래 {dueSoon.length}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 조건부/불합격 {flagged.length}</span>
          </div>
        </div>
      </div>

      <FilterBar
        pills={[
          { label: "현장", value: "전체" },
          { label: "담당자", value: "전체" },
          { label: "부서", value: "전체", active: true },
        ]}
        startDate="2026년 07월 01일 水"
        endDate="2026년 08월 31일 月"
      />

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
        {subTab === "검사도래현장" ? (
          dueSoon.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">도래한 검사 현장이 없습니다</p>
          ) : (
            dueSoon.map((insp) => {
              const priorUnit = findUnitForInspection(insp, allUnits);
              return (
                <DueSoonCard
                  key={insp.id}
                  insp={insp}
                  address={stripCityPrefix(siteById.get(insp.siteId)?.address)}
                  govElevatorNo={priorUnit?.govNo}
                  onOpenFail={setInspectionFailTarget}
                  onRegister={startRegister}
                />
              );
            })
          )
        ) : flagged.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">조건부·불합격 현장이 없습니다</p>
        ) : (
          flagged.map((insp) => {
            const isLive = insp.id?.startsWith("unit-");
            return (
              <div
                key={insp.id}
                onClick={isLive ? () => setInspectionFailTarget(insp) : undefined}
                className={`bg-white rounded-xl border border-red-100 p-2.5 touch-manipulation ${isLive ? "active:bg-slate-50 cursor-pointer" : ""}`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-800 text-sm truncate min-w-0">{insp.siteName} · {insp.elevatorNo}</p>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">{insp.type}</span>
                      <Badge result={insp.result} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-400 truncate min-w-0">{stripCityPrefix(siteById.get(insp.siteId)?.address)}</p>
                    <div className="shrink-0 flex items-center gap-1">
                      {insp.dueDate && <span className="text-xs font-bold text-blue-700">{formatMonthDay(insp.dueDate)}</span>}
                      <DDay dueDate={insp.dueDate} />
                    </div>
                  </div>
                  {insp.notes && (
                    <p className="text-[11px] text-red-600 leading-relaxed">지적사항: {insp.notes}</p>
                  )}
                </div>
                {(insp.result === "fail" || !isLive) && (
                  <div className="flex items-center justify-between mt-1.5">
                    {insp.result === "fail" && <span className="text-[11px] text-red-500 font-semibold">재검사 필요</span>}
                    {!isLive && (
                      <button
                        onClick={() => startRegister(insp)}
                        className="ml-auto text-xs font-bold text-white bg-blue-700 px-3 py-1.5 rounded-lg active:bg-blue-800"
                      >
                        재검사 결과 등록
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {openRegister && (
        <Sheet title="검사 결과 등록" onClose={() => setOpenRegister(null)}>
          <Field label="현장">
            <select className={inputCls} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.elevatorNo}</option>)}
            </select>
          </Field>
          <Field label="검사 구분">
            <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {["정기검사", "정밀안전검사", "수시검사", "재검사"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="검사 기관">
            <select className={inputCls} value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })}>
              <option>한국승강기안전공단</option>
              <option>지정검사기관 A</option>
              <option>지정검사기관 B</option>
            </select>
          </Field>
          <Field label="검사 판정">
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "pass", label: "합격", emoji: "🟢", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
                { v: "conditional", label: "조건부합격", emoji: "🟡", cls: "border-amber-300 bg-amber-50 text-amber-700" },
                { v: "fail", label: "불합격", emoji: "🔴", cls: "border-red-300 bg-red-50 text-red-700" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setForm({ ...form, result: opt.v })}
                  className={`rounded-xl border-2 py-3 flex flex-col items-center gap-1 text-xs font-bold ${form.result === opt.v ? opt.cls + " ring-2 ring-offset-1 ring-blue-400" : "border-slate-200 text-slate-400"}`}
                >
                  <span className="text-lg leading-none">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
          {form.result && form.result !== "fail" && (
            <Field label="차기 검사 예정일 (유효기간)">
              <input type="date" className={inputCls} value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} />
            </Field>
          )}
          <Field label="증빙 서류 사진">
            <PhotoUpload label="검사합격증 · 검사필증 사진 등록" />
          </Field>
          <Field label="지적사항 및 특이사항">
            <textarea
              className={inputCls}
              rows={3}
              placeholder="조건부합격 · 불합격 시 보완할 내용을 적어주세요"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <PrimaryButton disabled={!form.result} onClick={submit}>
            검사 결과 제출
          </PrimaryButton>
          <p className="text-[11px] text-slate-400 text-center mt-2">제출 시 본사 관리자 페이지로 즉시 연동됩니다</p>
        </Sheet>
      )}
      {inspectionFailTarget && (
        <InspectionFailDetailSheet inspection={inspectionFailTarget} onClose={() => setInspectionFailTarget(null)} />
      )}
    </div>
  );
}
