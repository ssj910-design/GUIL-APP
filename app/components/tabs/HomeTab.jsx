import { useState, useContext, useEffect } from "react";
import { ShieldCheck, AlertOctagon } from "lucide-react";
import { TODAY_STR } from "@/lib/constants";
import { unitsToInspections, formatMonthDay, stripCityPrefix, groupBySite, findUnitForInspection, govDateToDashed } from "@/lib/utils";
import { Badge, DDay, DrillHeader, SmsToast } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { usePriorFlaggedInspection } from "@/app/hooks/useLiveInspections";
import { FailureDetailSheet, DispatchEtaModal, ArrivalTimeModal, ArrivalResultModal, FailureMiniCard, AssignEngineerSheet } from "@/app/components/tabs/FailureTab";


// 검사도래현장 한 줄: 직전 검사가 조건부합격/조건후합격이면 현장명을 눌러 당시 부적합내역을 볼 수 있다.
function DueSoonRow({ i, address, govElevatorNo, onOpenFail }) {
  const { latest, detailRecord } = usePriorFlaggedInspection(govElevatorNo);
  const clickable = Boolean(latest);
  return (
    <div
      onClick={clickable ? () => onOpenFail({
        id: `unit-hist-${govElevatorNo}`,
        siteName: i.siteName,
        elevatorNo: i.elevatorNo,
        result: "conditional",
        govElevatorNo,
        startDate: govDateToDashed(detailRecord.inspctDe),
      }) : undefined}
      className={`flex items-center justify-between bg-blue-50 rounded-lg px-2.5 py-1.5 gap-2 touch-manipulation ${clickable ? "cursor-pointer active:bg-blue-100" : ""}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{i.siteName} · {i.elevatorNo}</p>
        <p className="text-[11px] text-slate-400 truncate">{address}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        {latest && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-300">
            직전검사 {latest.dispWords}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">{i.type}</span>
          <span className="text-xs font-bold text-blue-700 whitespace-nowrap">
            {i.dueDate ? formatMonthDay(i.dueDate) : "-"}{i.dueTime ? ` ${i.dueTime}` : ""}
          </span>
        </span>
      </div>
    </div>
  );
}


function FailureHistoryDetailScreen({ site, failures, onBack }) {
  const history = failures.filter((f) => f.siteId === site.id);
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="고장처리내역 상세" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="bg-slate-100 rounded-xl p-3 mb-4">
          <p className="font-bold text-slate-800">{site.name} · {site.elevatorNo}</p>
          <p className="text-xs text-slate-400 mt-0.5">{site.address}</p>
        </div>
        <div className="space-y-2.5">
          {history.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">고장 이력이 없습니다</p>
          ) : (
            history.map((f) => (
              <div key={f.id} className="border border-slate-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-slate-800 text-sm">{f.errorCode}</p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${f.status === "완료" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{f.status}</span>
                </div>
                <p className="text-xs text-slate-500 mb-1">{f.reportedAt} 접수 · {f.assignee ?? "미배정"}</p>
                {f.escalation && <p className="text-xs font-bold text-red-600">조치 결과: {f.escalation}</p>}
                {f.processResult && <p className="text-xs text-slate-500">처리결과: {f.processResult}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}


// 출퇴근 체크 — 기사는 출근/퇴근·당직 버튼, 관리자는 오늘 출근 인원 요약.
// 17:30이 지나도록 퇴근 처리가 없으면 모달로 한 번 물어본다 (캡처용 강제: ?off=1).
function AttendanceBar({ attendances, onAttendance }) {
  const { role, selfId, engineers } = useContext(AuthContext);
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  if (role === "admin") {
    const inCount = attendances.filter((a) => a.checkedInAt).length;
    const done = attendances.filter((a) => a.checkedOutAt);
    return (
      <div className="px-5 pt-4">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-500">오늘 출근</p>
          <p className="text-sm font-bold text-slate-800">
            {inCount} / {engineers.length}명
            {done.length > 0 && (
              <span className="ml-1.5 text-[11px] font-semibold text-slate-400">
                퇴근 {done.filter((a) => a.status === "퇴근").length} · 당직 {done.filter((a) => a.status === "당직").length}
              </span>
            )}
          </p>
        </div>
      </div>
    );
  }

  const mine = attendances.find((a) => a.profileId === selfId);
  const hhmm = (iso) => new Date(iso).toTimeString().slice(0, 5);
  const forced = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("off");
  const afterOff = forced || now.getHours() * 60 + now.getMinutes() >= 17 * 60 + 30;
  const showOffModal = !!mine?.checkedInAt && !mine.checkedOutAt && afterOff && !dismissed;

  return (
    <>
      <div className="px-5 pt-4">
        {!mine?.checkedInAt ? (
          <button
            onClick={() => onAttendance("in")}
            className="w-full bg-blue-700 text-white text-sm font-bold py-3.5 rounded-xl active:bg-blue-800"
          >
            출근 체크
          </button>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500">
              출근 <span className="text-slate-800">{hhmm(mine.checkedInAt)}</span>
              {mine.checkedOutAt && (
                <span className="ml-2">{mine.status} <span className="text-slate-800">{hhmm(mine.checkedOutAt)}</span></span>
              )}
            </p>
            {!mine.checkedOutAt && (
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => onAttendance("duty")} className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">당직</button>
                <button onClick={() => onAttendance("out")} className="text-[11px] font-bold text-slate-600 bg-slate-100 rounded-lg px-2.5 py-1.5">퇴근</button>
              </div>
            )}
          </div>
        )}
      </div>
      {showOffModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-8">
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 text-center">
            <p className="text-base font-extrabold text-slate-800">퇴근 시간입니다</p>
            <p className="text-xs text-slate-500 mt-1.5">17:30 — 오늘 근무를 마감해 주세요</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { onAttendance("duty"); setDismissed(true); }} className="flex-1 bg-amber-500 text-white text-sm font-bold py-3 rounded-xl active:bg-amber-600">당직</button>
              <button onClick={() => { onAttendance("out"); setDismissed(true); }} className="flex-1 bg-blue-700 text-white text-sm font-bold py-3 rounded-xl active:bg-blue-800">퇴근</button>
            </div>
            <button onClick={() => setDismissed(true)} className="text-[11px] text-slate-400 font-semibold mt-3">나중에</button>
          </div>
        </div>
      )}
    </>
  );
}

export function HomeTab({ attendances = [], onAttendance, inspections, failures, onDispatch, onArrive, onResult, onRefuse, onAssign, onShowAllFailures, toast }) {
  const sites = useContext(SitesContext);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const { name: CURRENT_ENGINEER, role } = useContext(AuthContext);
  const mySites = role === "admin" ? sites : sites.filter((s) => s.assignedEngineer === CURRENT_ENGINEER);
  // 지원요청/운행정지는 각각 독립적으로 판단해 배지를 함께 표시합니다 (관리자 대시보드와 동일 기준).
  const openEscalations = failures.filter((f) => f.escalation && f.status !== "완료");
  const supportSiteIds = new Set(openEscalations.filter((f) => f.escalation === "지원요청").map((f) => f.siteId));
  const stoppedSiteIds = new Set(openEscalations.filter((f) => f.escalation === "운행정지").map((f) => f.siteId));
  const escalatedSiteIds = new Set([...supportSiteIds, ...stoppedSiteIds]);
  const criticalSites = mySites.filter((s) => s.failures30d >= 3 || escalatedSiteIds.has(s.id));
  const [detailTarget, setDetailTarget] = useState(null);
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [resultTarget, setResultTarget] = useState(null);
  const [arriveTarget, setArriveTarget] = useState(null);
  const [historySite, setHistorySite] = useState(null);
  const [inspectionFailTarget, setInspectionFailTarget] = useState(null);

  // 검사유효기간은 units의 DB 캐시를 쓴다 (전 호기 실시간 API 호출 금지 — 트래픽 한도).
  const allUnits = useContext(UnitsContext);
  const mySiteIds = new Set(mySites.map((s) => s.id));
  const liveInspections = unitsToInspections(allUnits, mySites).filter((i) => mySiteIds.has(i.siteId));
  const liveSiteIds = new Set(liveInspections.map((i) => i.siteId));
  const combinedInspections = [...liveInspections, ...inspections.filter((i) => !liveSiteIds.has(i.siteId) && mySiteIds.has(i.siteId))];

  // 도래현장: 관리자가 수기입력한 검사일자(inspections.due_date) 기준으로 검사일이 30일 이내로 남은 담당현장만 (국가승강기정보센터 API 연동 현장은 제외)
  const dueSoon = groupBySite(
    inspections
      .filter((i) => mySiteIds.has(i.siteId) && i.dueDate && !i.result)
      .map((i) => ({ ...i, daysLeft: Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) }))
      .filter((i) => i.daysLeft >= 0 && i.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  );

  // 조건부/불합격 카드의 "검사일정"은 관리자가 InspectionsAdmin에서 수기입력한 방문 예정 일시(inspections.due_date/due_time)다
  // — 보완기한(API 검사 유효기간)과는 별개 정보로 함께 보여준다.
  const manualByUnitId = new Map(inspections.filter((i) => i.unitId).map((i) => [i.unitId, i]));
  const manualBySiteId = new Map(inspections.filter((i) => !i.unitId).map((i) => [i.siteId, i]));

  // 보완기한이 61일 이상 남은 건 아직 급하지 않으니 목록에서 뺀다(60일은 노출) — 기한 미정은 계속 노출.
  const flagged = groupBySite(
    combinedInspections
      .filter((i) => i.result === "conditional" || i.result === "fail")
      .filter((i) => !i.dueDate || Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) <= 60)
      .map((i) => {
        const manual = manualByUnitId.get(i.unitId) ?? manualBySiteId.get(i.siteId) ?? null;
        return { ...i, scheduleDate: manual?.dueDate ?? null, scheduleTime: manual?.dueTime ?? null };
      })
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
  );

  // 관리자는 남의 배정 건까지 전부 봐야 한다(누구 응답을 기다리는지 알아야 재배정 가능).
  // 기사는 본인 배정 건 + 미배정(전원 노출) 건만.
  const activeMine = failures.filter(
    (f) => f.status !== "완료" && (role === "admin" || f.assignee === CURRENT_ENGINEER || !f.assignee)
  );
  // 진행 중(작업중·출동중)을 위로, 그다음 응답대기·미배정 — 접수 순서는 유지
  const stageRank = (f) => (f.status === "진행중" ? 0 : f.assignee ? 1 : 2);
  // 관리자 홈은 액션이 필요한 것만(미배정·응답대기) — 출동중·작업중은 "모두 보기"로
  const listSource = role === "admin"
    ? activeMine.filter((f) => f.status === "미처리").sort((a, b) => (a.assignee ? 1 : 0) - (b.assignee ? 1 : 0))
    : [...activeMine].sort((a, b) => stageRank(a) - stageRank(b));
  const [showAllFailures, setShowAllFailures] = useState(false);
  const shownFailures = showAllFailures ? listSource : listSource.slice(0, 5);

  if (historySite) {
    return <FailureHistoryDetailScreen site={historySite} failures={failures} onBack={() => setHistorySite(null)} />;
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4 relative">
      {onAttendance && <AttendanceBar attendances={attendances} onAttendance={onAttendance} />}

      {/* 고장 처리 현황 */}
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-800 text-sm">
            고장 처리 현황
            {role === "admin" && (
              <span className="ml-1.5 font-medium text-[11px] text-slate-500">
                미배정 {listSource.filter((f) => !f.assignee).length} · 응답대기 {listSource.filter((f) => f.assignee).length}
              </span>
            )}
          </h3>
          {role === "admin" && onShowAllFailures && (
            <button onClick={onShowAllFailures} className="text-[11px] font-bold text-blue-700">
              모두 보기 (출동·작업·완료 포함) →
            </button>
          )}
        </div>
        <div className="space-y-2.5">
          {listSource.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-5">
              <p className="text-xs text-slate-400 text-center">{role === "admin" ? "배정 대기 중인 고장이 없습니다" : "진행 중인 고장이 없습니다"}</p>
            </div>
          ) : (
            shownFailures.map((f) => (
              <FailureMiniCard
                key={f.id}
                f={f}
                onOpenDetail={setDetailTarget}
                onDispatch={setDispatchTarget}
                onArrive={setArriveTarget}
                onOpenResult={setResultTarget}
                onRefuse={onRefuse}
                onAssignOpen={setAssignTarget}
              />
            ))
          )}
          {listSource.length > 5 && (
            <button
              onClick={() => setShowAllFailures(!showAllFailures)}
              className="w-full text-center text-xs font-bold text-blue-700 bg-white border border-slate-200 rounded-xl py-2.5"
            >
              {showAllFailures ? "접기" : `전체 ${listSource.length}건 보기`}
            </button>
          )}
        </div>
      </div>

      {/* 집중 관리 현장 */}
      <div className="px-5 pt-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon size={18} className="text-red-600" />
            <h3 className="font-extrabold text-red-700 text-sm whitespace-nowrap">집중 관리현장(고장 3회 이상 · 지원요청/운행정지)</h3>
          </div>
          {criticalSites.length === 0 ? (
            <p className="text-xs text-red-500">현재 집중 관리 대상 현장이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {criticalSites.map((s) => {
                const stopped = stoppedSiteIds.has(s.id);
                const support = supportSiteIds.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => setHistorySite(s)}
                    className={`w-full flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border text-left active:bg-red-50 ${stopped ? "border-red-300" : "border-red-100"}`}
                  >
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{s.name} · {s.elevatorNo}</p>
                      <p className="text-[11px] text-slate-400">{s.address}</p>
                    </div>
                    <span className="flex gap-1 shrink-0">
                      {support && <span className="text-xs font-extrabold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">지원요청</span>}
                      {stopped && <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-1 rounded-full">운행정지</span>}
                      {s.failures30d > 0 && <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-1 rounded-full">{s.failures30d}회 고장</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 공공데이터 실시간 검사 관제 */}
      <div className="px-5 pt-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-blue-950 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold text-blue-950 bg-white px-1.5 py-0.5 rounded">공공데이터</span>
              <span className="text-xs font-extrabold text-white">실시간 검사 관제</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/40 rounded-full pl-1.5 pr-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <span className="text-[10px] font-extrabold text-emerald-300 tracking-wide">LIVE</span>
            </div>
          </div>
          <p className="px-4 pt-2.5 text-[10px] text-slate-400">국가승강기정보센터(행정안전부) Open API 연동 · 담당 현장 승강기 고유번호 기준 실시간 조회</p>

          <div className="px-4 pt-3 pb-3.5">
            <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
              <ShieldCheck size={13} /> 검사도래현장 · 30일 이내
            </p>
            {dueSoon.length === 0 ? (
              <p className="text-xs text-slate-400 py-1.5">30일 이내 검사 도래 현장이 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {dueSoon.map((i) => {
                  const priorUnit = findUnitForInspection(i, allUnits);
                  return (
                    <DueSoonRow
                      key={i.id}
                      i={i}
                      address={stripCityPrefix(siteById.get(i.siteId)?.address)}
                      govElevatorNo={priorUnit?.govNo}
                      onOpenFail={setInspectionFailTarget}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 pb-4 pt-3 border-t border-slate-100">
            <p className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1.5">
              <AlertOctagon size={13} /> 조건부/불합격 현장 · 보완조치 필요
            </p>
            {flagged.length === 0 ? (
              <p className="text-xs text-slate-400 py-1.5">조건부·불합격 현장이 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {flagged.map((i) => {
                  const isLive = i.id?.startsWith("unit-");
                  return (
                    <div
                      key={i.id}
                      onClick={isLive ? () => setInspectionFailTarget(i) : undefined}
                      className={`bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 space-y-0.5 touch-manipulation ${isLive ? "active:bg-red-100 cursor-pointer" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-800 truncate min-w-0">{i.siteName} · {i.elevatorNo}</p>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">{i.type}</span>
                          <Badge result={i.result} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-400 truncate min-w-0">{stripCityPrefix(siteById.get(i.siteId)?.address)}</p>
                        <div className="shrink-0 flex items-center gap-1">
                          {i.dueDate && <span className="text-xs font-bold text-blue-700">{formatMonthDay(i.dueDate)}</span>}
                          <DDay dueDate={i.dueDate} />
                        </div>
                      </div>
                      {(i.notes || i.scheduleDate) && (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {i.notes && <p className="text-[11px] text-red-600 leading-relaxed">{i.notes}</p>}
                          </div>
                          {i.scheduleDate && (
                            <span className="shrink-0 text-[10px] text-blue-600 font-semibold">
                              검사일정 {formatMonthDay(i.scheduleDate)}{i.scheduleTime ? ` ${i.scheduleTime}` : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="px-4 pb-3 text-[9.5px] text-slate-300">
            {liveInspections.length > 0
              ? "* 승강기고유번호가 등록된 현장은 국가승강기정보센터 실시간 데이터, 나머지는 수기입력 데이터입니다"
              : "* 프로토타입 시연용 시뮬레이션 데이터입니다 (현장정보에서 승강기고유번호를 등록하면 실시간 데이터로 전환됩니다)"}
          </p>
        </div>
      </div>

      {detailTarget && (
        <FailureDetailSheet
          failure={detailTarget}
          onClose={() => setDetailTarget(null)}
          onDispatch={setDispatchTarget}
          onArrive={setArriveTarget}
          onOpenResult={setResultTarget}
          onAssignOpen={setAssignTarget}
        />
      )}
      {assignTarget && (
        <AssignEngineerSheet failure={assignTarget} failures={failures} onAssign={onAssign} onClose={() => setAssignTarget(null)} />
      )}
      {dispatchTarget && (
        <DispatchEtaModal
          failure={dispatchTarget}
          onClose={() => setDispatchTarget(null)}
          onConfirm={(eta) => {
            onDispatch(dispatchTarget, eta);
            setDispatchTarget(null);
          }}
        />
      )}
      {arriveTarget && (
        <ArrivalTimeModal
          failure={arriveTarget}
          onClose={() => setArriveTarget(null)}
          onConfirm={(time) => {
            onArrive(arriveTarget, time);
            setArriveTarget(null);
          }}
        />
      )}
      {resultTarget && (
        <ArrivalResultModal
          failure={resultTarget}
          onClose={() => setResultTarget(null)}
          onConfirm={(result) => {
            onResult(resultTarget, result);
            setResultTarget(null);
          }}
        />
      )}
      {inspectionFailTarget && (
        <InspectionFailDetailSheet inspection={inspectionFailTarget} onClose={() => setInspectionFailTarget(null)} />
      )}
      <SmsToast message={toast} />
    </div>
  );
}
