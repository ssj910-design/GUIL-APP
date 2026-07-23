import { useState, useContext } from "react";
import { TODAY_STR } from "@/lib/constants";
import { unitsToInspections, formatMonthDay, stripCityPrefix, groupBySite, findUnitForInspection, govDateToDashed } from "@/lib/utils";
import { Badge, DDay, MapLinkButtons } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { usePriorFlaggedInspection } from "@/app/hooks/useLiveInspections";


/* ------------------------------------------------------------------ */
/* INSPECTION (검사관리) - centerpiece                                  */
/* ------------------------------------------------------------------ */

// 검사도래현장 카드 한 장: 직전 검사가 조건부합격/조건후합격이면 현장명을 눌러 당시 부적합내역을 볼 수 있다.
function DueSoonCard({ insp, address, govElevatorNo, onOpenFail, site }) {
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
      className={`bg-white rounded-xl border border-slate-200 border-l-4 border-l-blue-500 overflow-hidden touch-manipulation ${clickable ? "cursor-pointer active:bg-slate-50" : ""}`}
    >
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="font-bold text-slate-800 text-[15px] truncate min-w-0">{insp.siteName} · {insp.elevatorNo}</p>
          <span className="shrink-0 flex items-center gap-1.5">
            <span className="text-xs font-extrabold text-blue-700 whitespace-nowrap">
              {insp.dueDate ? formatMonthDay(insp.dueDate) : "-"}{insp.dueTime ? ` ${insp.dueTime}` : ""}
            </span>
            <DDay dueDate={insp.dueDate} />
          </span>
        </div>
        <p className="text-[12px] text-slate-400 truncate mb-2">
          <span className="font-medium text-slate-500">{insp.type}</span>{address ? ` · ${address}` : ""}
        </p>
        <div className="flex items-center gap-2">
          {site && <MapLinkButtons site={site} />}
          {latest && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-300">
              직전검사 {latest.dispWords}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function InspectionTab({ inspections }) {
  const sites = useContext(SitesContext);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const { name: CURRENT_ENGINEER, role } = useContext(AuthContext);
  const mySites = role === "admin" ? sites : sites.filter((s) => s.assignedEngineer === CURRENT_ENGINEER);
  const mySiteIds = new Set(mySites.map((s) => s.id));
  const [subTab, setSubTab] = useState("검사도래현장");
  const [inspectionFailTarget, setInspectionFailTarget] = useState(null);
  const [flagSort, setFlagSort] = useState("imminent"); // 조건부/불합격 정렬: imminent(재검 임박순) | severity(불합격순)

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
  // 기한 미정(dueDate 없음)은 Infinity로 취급해 맨 아래로 — 임박순 정렬이 뒤집히지 않게.
  const flagCmp = flagSort === "severity"
    ? (a, b) => {
        const sev = (a.result === "fail" ? 0 : 1) - (b.result === "fail" ? 0 : 1);
        if (sev !== 0) return sev;
        return (a.dueDate ? +new Date(a.dueDate) : Infinity) - (b.dueDate ? +new Date(b.dueDate) : Infinity);
      }
    : (a, b) => (a.dueDate ? +new Date(a.dueDate) : Infinity) - (b.dueDate ? +new Date(b.dueDate) : Infinity);
  const flagged = groupBySite(
    combined
      .filter((i) => i.result === "conditional" || i.result === "fail")
      .filter((i) => !i.dueDate || Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) <= 60)
  ).sort(flagCmp);

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

      <div className="px-5 pt-4 pb-2 shrink-0 flex items-center justify-between">
        <p className="text-sm font-bold text-blue-700">진행상황</p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 도래 {dueSoon.length}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 조건부/불합격 {flagged.length}</span>
        </div>
      </div>

      {subTab === "조건부/불합격 현장" && (
        <div className="px-5 pb-2 shrink-0 flex gap-1.5">
          {[{ k: "imminent", label: "재검 임박순" }, { k: "severity", label: "불합격순" }].map((s) => (
            <button
              key={s.k}
              onClick={() => setFlagSort(s.k)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${flagSort === s.k ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-200"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
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
                  site={siteById.get(insp.siteId)}
                  govElevatorNo={priorUnit?.govNo}
                  onOpenFail={setInspectionFailTarget}
                />
              );
            })
          )
        ) : flagged.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">조건부·불합격 현장이 없습니다</p>
        ) : (
          flagged.map((insp) => {
            const isLive = insp.id?.startsWith("unit-");
            // 불합격=빨강(심각) / 조건부합격=주황(주의) — 고장카드처럼 왼쪽 색바로 구분
            const bar = insp.result === "fail" ? "border-l-red-500" : "border-l-amber-400";
            return (
              <div
                key={insp.id}
                onClick={isLive ? () => setInspectionFailTarget(insp) : undefined}
                className={`bg-white rounded-xl border border-slate-200 border-l-4 ${bar} overflow-hidden touch-manipulation ${isLive ? "active:bg-slate-50 cursor-pointer" : ""}`}
              >
                <div className="p-3.5">
                  {/* 우측엔 결과 배지 1개만 — 정기검사는 아래 주소 앞으로 빼서 우측 혼잡 해소 */}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-bold text-slate-800 text-[15px] truncate min-w-0">{insp.siteName} · {insp.elevatorNo}</p>
                    <Badge result={insp.result} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] text-slate-400 truncate min-w-0">
                      <span className="font-medium text-slate-500">{insp.type}</span>
                      {stripCityPrefix(siteById.get(insp.siteId)?.address) ? ` · ${stripCityPrefix(siteById.get(insp.siteId)?.address)}` : ""}
                    </p>
                    <span className="shrink-0 flex items-center gap-1.5">
                      {insp.dueDate && <span className="text-xs font-extrabold text-blue-700 whitespace-nowrap">{formatMonthDay(insp.dueDate)}</span>}
                      <DDay dueDate={insp.dueDate} />
                    </span>
                  </div>
                  {insp.notes && (
                    <p className="text-[11px] text-red-600 leading-relaxed bg-red-50 rounded-lg px-2.5 py-1.5 mt-2">지적사항: {insp.notes}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {inspectionFailTarget && (
        <InspectionFailDetailSheet inspection={inspectionFailTarget} onClose={() => setInspectionFailTarget(null)} />
      )}
    </div>
  );
}
