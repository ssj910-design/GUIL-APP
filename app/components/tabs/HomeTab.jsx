import { useState, useContext } from "react";
import { ShieldCheck, AlertOctagon } from "lucide-react";
import { TODAY_STR } from "@/lib/constants";
import { unitsToInspections } from "@/lib/utils";
import { Badge, DDay, DrillHeader, SmsToast } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { FailureDetailSheet, DispatchEtaModal, ArrivalTimeModal, ArrivalResultModal, FailureMiniCard } from "@/app/components/tabs/FailureTab";


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


export function HomeTab({ inspections, failures, onDispatch, onArrive, onResult, toast }) {
  const sites = useContext(SitesContext);
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
  const dueSoon = inspections
    .filter((i) => mySiteIds.has(i.siteId) && i.dueDate && !i.result)
    .map((i) => ({ ...i, daysLeft: Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) }))
    .filter((i) => i.daysLeft >= 0 && i.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const flagged = combinedInspections
    .filter((i) => i.result === "conditional" || i.result === "fail")
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  // 배정자를 지정해 접수한 건은 그 배정자에게만, 미배정(미정) 건은 전원에게 노출됩니다.
  const activeMine = failures.filter((f) => f.status !== "완료" && (f.assignee === CURRENT_ENGINEER || !f.assignee));

  if (historySite) {
    return <FailureHistoryDetailScreen site={historySite} failures={failures} onBack={() => setHistorySite(null)} />;
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4 relative">
      {/* 고장 처리 현황 */}
      <div className="px-5 pt-4">
        <h3 className="font-bold text-slate-800 text-sm mb-2">고장 처리 현황</h3>
        <div className="space-y-2.5">
          {activeMine.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-5">
              <p className="text-xs text-slate-400 text-center">진행 중인 고장이 없습니다</p>
            </div>
          ) : (
            activeMine.map((f) => (
              <FailureMiniCard
                key={f.id}
                f={f}
                onOpenDetail={setDetailTarget}
                onDispatch={setDispatchTarget}
                onArrive={setArriveTarget}
                onOpenResult={setResultTarget}
              />
            ))
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
                {dueSoon.map((i) => (
                  <div key={i.id} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{i.siteName} · {i.elevatorNo}</p>
                      <p className="text-[11px] text-slate-500">{i.type} · {i.org}</p>
                    </div>
                    <DDay dueDate={i.dueDate} />
                  </div>
                ))}
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
              <div className="space-y-2">
                {flagged.map((i) => {
                  const isLive = i.id?.startsWith("gov-");
                  return (
                    <div
                      key={i.id}
                      onClick={isLive ? () => setInspectionFailTarget(i) : undefined}
                      onTouchEnd={isLive ? (e) => { e.preventDefault(); setInspectionFailTarget(i); } : undefined}
                      className={`bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 touch-manipulation ${isLive ? "active:bg-red-100 cursor-pointer" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-slate-800">{i.siteName} · {i.elevatorNo}</p>
                        <Badge result={i.result} />
                      </div>
                      <p className="text-[11px] text-slate-500 mb-1.5">{i.type} · {i.org}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-red-600 leading-relaxed">{i.notes || "지적사항 확인 필요"}</p>
                        <span className="shrink-0 ml-2 flex items-center gap-1">
                          <span className="text-[10px] text-slate-400">보완기한</span>
                          <DDay dueDate={i.dueDate} />
                        </span>
                      </div>
                      {isLive && <p className="text-[10px] text-blue-600 font-semibold mt-1.5">터치해서 부적합 상세 항목 보기</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="px-4 pb-3 text-[9.5px] text-slate-300">
            {liveInspections.length > 0
              ? "* 승강기고유번호가 등록된 현장은 국가승강기정보센터 실시간 데이터, 나머지는 수기입력 데이터입니다"
              : "* 프로토타입 시연용 시뮬레이션 데이터입니다 (현장관리에서 승강기고유번호를 등록하면 실시간 데이터로 전환됩니다)"}
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
        />
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
