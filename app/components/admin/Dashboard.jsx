"use client";

// 관리자 대시보드 — 오늘 처리해야 할 일이 한눈에 보이는 화면.
// 호기·담당자 표기는 v2 FK(unitId/assigneeId)를 우선 쓰고, 옛 라벨은 fallback.
import { useState } from "react";
import { AlertOctagon } from "lucide-react";
import { TODAY_STR } from "@/lib/constants";
import { addDays, unitsToInspections } from "@/lib/utils";
import { Badge } from "@/app/components/ui";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { Modal, StatusBadge } from "@/app/components/admin/adminShared";

function unitLabel(units, sites, unitId, fallbackSiteName, fallbackLabel) {
  const u = units.find((x) => x.id === unitId);
  if (!u) return { site: fallbackSiteName ?? "-", unit: fallbackLabel ?? "-" };
  const s = sites.find((x) => x.id === u.siteId);
  return { site: s?.name ?? fallbackSiteName ?? "-", unit: u.unitNo };
}

function Kpi({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

// 고장상세내역 — 대시보드 집중관리현장 -> 고장내역 -> 이 고장 클릭 시. (FailuresAdmin에서도 재사용)
export function FailureDetailContent({ f, units, sites }) {
  const loc = unitLabel(units, sites, f.unitId, f.siteName, f.elevatorNo);
  const rows = [
    { label: "현장 · 호기", value: `${loc.site} · ${loc.unit}` },
    { label: "접수번호", value: f.errorCode },
    { label: "접수일시", value: f.reportedAt },
    { label: "신고자 연락처", value: f.reporterPhone || "-" },
    { label: "담당 기사", value: f.assignee || "미배정" },
    { label: "상태", value: f.escalation ? `${f.status} (${f.escalation})` : f.status },
  ];
  if (f.faultSymptom) rows.push({ label: "증상", value: f.faultSymptom });
  if (f.faultErrorCode) rows.push({ label: "에러코드", value: f.faultErrorCode });
  if (f.faultCause) rows.push({ label: "원인", value: f.faultCause });
  if (f.dispatchedAt) rows.push({ label: "출동", value: `${f.dispatchedAt}${f.etaMinutes ? ` (${f.etaMinutes}분 소요예정)` : ""}` });
  if (f.arrivalTime) rows.push({ label: "도착", value: f.arrivalTime });
  if (f.processContent) rows.push({ label: "처리내용", value: f.processContent });
  if (f.processNote) rows.push({ label: "비고", value: f.processNote });
  if (f.notFault) rows.push({ label: "구분", value: "고장 아님" });

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-4 text-sm border-b border-slate-50 pb-2">
          <span className="text-slate-400 shrink-0">{r.label}</span>
          <span className="font-semibold text-slate-800 text-right">{r.value}</span>
        </div>
      ))}
      {f.photoUrls?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 mt-3 mb-2">사진 ({f.photoUrls.length}장)</p>
          <div className="grid grid-cols-3 gap-2">
            {f.photoUrls.map((url, i) => (
              <img key={i} src={url} alt="" className="w-full aspect-square rounded-lg object-cover border border-slate-200" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ data }) {
  const { sites, units, failures, inspections, materialRequests, quoteRequests, todos, billings, selfChecks, profiles } = data;
  const [historySite, setHistorySite] = useState(null);
  const [failureDetail, setFailureDetail] = useState(null);
  const [failTarget, setFailTarget] = useState(null);

  const openFailures = failures.filter((f) => f.status === "미처리");
  const activeFailures = failures.filter((f) => f.status === "진행중");
  const pendingMaterials = materialRequests.filter((m) => m.status === "승인대기");
  const activeQuotes = quoteRequests.filter((q) => q.status !== "자재지급완료");
  const openTodos = todos.filter((t) => !t.done);
  const ym = TODAY_STR.slice(0, 7);
  const monthChecks = selfChecks.filter((c) => c.ym === ym);
  const doneChecks = monthChecks.filter((c) => c.status === "완료");

  // 검사유효기간은 units의 DB 캐시를 쓴다 (전 호기 실시간 API 호출 금지 — 트래픽 한도).
  const liveInspections = unitsToInspections(units, sites);
  const liveSiteIds = new Set(liveInspections.map((i) => i.siteId));
  const combinedInspections = [...liveInspections, ...inspections.filter((i) => !liveSiteIds.has(i.siteId))];

  // 금일검사현장: 국가승강기정보센터 API 연동 현장은 제외하고, 관리자가 수기입력한 검사일자(inspections.due_date) 기준으로만 판단한다.
  const todayInspections = inspections
    .filter((i) => i.dueDate === TODAY_STR)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const flaggedInspections = combinedInspections
    .filter((i) => i.result === "conditional" || i.result === "fail")
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  // 집중 관리현장: 최근 30일 고장 3회 이상, 또는 지원요청/운행정지 등 미해결 에스컬레이션이 있는 현장
  // (모바일 홈탭과 동일 기준). 지원요청/운행정지는 각각 독립적으로 판단해 배지를 함께 표시합니다.
  const openEscalations = failures.filter((f) => f.escalation && f.status !== "완료");
  const supportSiteIds = new Set(openEscalations.filter((f) => f.escalation === "지원요청").map((f) => f.siteId));
  const stoppedSiteIds = new Set(openEscalations.filter((f) => f.escalation === "운행정지").map((f) => f.siteId));
  const escalatedSiteIds = new Set([...supportSiteIds, ...stoppedSiteIds]);
  const criticalSites = sites.filter((s) => s.failures30d >= 3 || escalatedSiteIds.has(s.id));

  const engineerName = (id, fallback) => profiles.find((p) => p.id === id)?.name ?? fallback ?? "미배정";

  const historyFailures = historySite ? failures.filter((f) => f.siteId === historySite.id).sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)) : [];

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-1">대시보드</h1>
      <p className="text-xs text-slate-500 mb-6">
        현장 {sites.length} · 호기 {units.length}대 · 기사 {profiles.filter((p) => p.role === "engineer").length}명 · 기준일 {TODAY_STR}
      </p>

      {/* 계약 만료 임박 알림 — 종료일 30일 내(만료 포함) */}
      {(() => {
        const expiring = sites.filter((s) => s.isActive !== false && s.contractEnd && s.contractEnd <= addDays(TODAY_STR, 30));
        return expiring.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <p className="text-sm font-bold text-amber-700">
              ⚠️ 계약 만료 임박·만료 현장 {expiring.length}곳 — 현장관리에서 재계약을 진행하세요
              <span className="font-semibold text-amber-600"> ({expiring.slice(0, 3).map((s) => s.name).join(", ")}{expiring.length > 3 ? ` 외 ${expiring.length - 3}곳` : ""})</span>
            </p>
          </div>
        ) : null;
      })()}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
        <Kpi label="미처리 고장" value={openFailures.length} tone={openFailures.length ? "text-red-600" : "text-slate-900"} />
        <Kpi label="출동/진행 중" value={activeFailures.length} tone="text-amber-600" />
        <Kpi label="자재 지급대기" value={pendingMaterials.length} tone={pendingMaterials.length ? "text-blue-700" : "text-slate-900"} />
        <Kpi label="견적 진행 중" value={activeQuotes.length} />
        <Kpi label="미완료 할일" value={openTodos.length} />
        <Kpi
          label={`자체점검 (${ym})`}
          value={monthChecks.length ? `${doneChecks.length}/${monthChecks.length}` : "미생성"}
          tone={monthChecks.length && doneChecks.length < monthChecks.length ? "text-amber-600" : "text-slate-900"}
        />
      </div>

      {/* 집중 관리현장 */}
      <section className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-extrabold text-red-700 mb-3">집중 관리현장 (고장 3회 이상 · 지원요청/운행정지)</h2>
        {criticalSites.length === 0 ? (
          <p className="text-xs text-red-500">현재 집중 관리 대상 현장이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {criticalSites.map((s) => {
              const stopped = stoppedSiteIds.has(s.id);
              const support = supportSiteIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setHistorySite(s)}
                  className={`flex items-center justify-between bg-white rounded-lg px-3.5 py-2.5 border text-left ${stopped ? "border-red-300" : "border-red-100"}`}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{s.name} · {s.elevatorNo}</p>
                    <p className="text-[11px] text-slate-400 truncate">{s.address}</p>
                  </div>
                  <span className="flex gap-1 shrink-0 ml-2">
                    {support && <span className="text-xs font-extrabold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">지원요청</span>}
                    {stopped && <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-1 rounded-full">운행정지</span>}
                    {s.failures30d > 0 && <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-1 rounded-full">{s.failures30d}회 고장</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 최근 고장 */}
        <section className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <h2 className="px-5 py-3 text-sm font-bold border-b border-slate-100">최근 고장 접수</h2>
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left px-5 py-2 font-semibold">접수</th>
                <th className="text-left px-2 py-2 font-semibold">현장 · 호기</th>
                <th className="text-left px-2 py-2 font-semibold">증상</th>
                <th className="text-left px-2 py-2 font-semibold">담당</th>
                <th className="text-right px-5 py-2 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {failures.slice(0, 10).map((f) => {
                const loc = unitLabel(units, sites, f.unitId, f.siteName, f.elevatorNo);
                const stateCls =
                  f.status === "완료" ? "bg-emerald-50 text-emerald-700" :
                  f.status === "진행중" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600";
                return (
                  <tr key={f.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setFailureDetail(f)}>
                    <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">{f.reportedAt}</td>
                    <td className="px-2 py-2.5 font-semibold whitespace-nowrap">{loc.site} · {loc.unit}</td>
                    <td className="px-2 py-2.5 text-slate-600">{f.errorCode}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">{engineerName(f.assigneeId, f.assignee)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${stateCls}`}>
                        {f.escalation ? `${f.status}·${f.escalation}` : f.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>

        {/* 금일검사현장 */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <h2 className="px-5 py-3 text-sm font-bold border-b border-slate-100">금일검사현장</h2>
          {todayInspections.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">오늘 예정된 검사가 없습니다</p>
          ) : (
            <ul>
              {todayInspections.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-5 py-2.5 border-b border-slate-50 text-sm">
                  <div>
                    <p className="font-semibold">{i.siteName} · {i.elevatorNo}</p>
                    <p className="text-xs text-slate-400">{i.type} · {i.org}</p>
                  </div>
                  <span className="text-xs font-bold text-blue-700 whitespace-nowrap">{i.dueDate}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 조건부/불합격 현장 */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-6">
        <h2 className="px-5 py-3 text-sm font-bold border-b border-slate-100 flex items-center gap-1.5">
          <AlertOctagon size={14} className="text-red-600" /> 조건부/불합격 현장 · 보완조치 필요
        </h2>
        {flaggedInspections.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">조건부·불합격 현장이 없습니다</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 p-4">
            {flaggedInspections.map((i) => {
              const isLive = i.id?.startsWith("gov-");
              return (
                <div
                  key={i.id}
                  onClick={isLive ? () => setFailTarget(i) : undefined}
                  className={`bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5 ${isLive ? "cursor-pointer hover:bg-red-100" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-slate-800">{i.siteName} · {i.elevatorNo}</p>
                    <Badge result={i.result} />
                  </div>
                  <p className="text-[11px] text-slate-500 mb-1">{i.type} · {i.org}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-red-600">{i.notes || "지적사항 확인 필요"}</p>
                    <span className="text-[11px] text-slate-400 shrink-0 ml-2">보완기한 {i.dueDate}</span>
                  </div>
                  {isLive && <p className="text-[10px] text-blue-600 font-semibold mt-1">클릭해서 부적합 상세 항목 보기</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 집중관리현장 -> 고장내역 */}
      {historySite && (
        <Modal title={`${historySite.name} · 고장내역`} onClose={() => setHistorySite(null)} wide>
          {historyFailures.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">고장 이력이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {historyFailures.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFailureDetail(f)}
                  className="w-full text-left border border-slate-200 rounded-xl p-3 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-slate-800 text-sm">{f.errorCode}</p>
                    <StatusBadge tone={f.status === "완료" ? "green" : f.status === "진행중" ? "amber" : "red"}>
                      {f.escalation ? `${f.status}·${f.escalation}` : f.status}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-slate-500">{f.reportedAt} 접수 · {f.assignee ?? "미배정"}</p>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* 고장상세내역 */}
      {failureDetail && (
        <Modal title="고장상세내역" onClose={() => setFailureDetail(null)}>
          <FailureDetailContent f={failureDetail} units={units} sites={sites} />
        </Modal>
      )}

      {failTarget && <InspectionFailDetailSheet inspection={failTarget} onClose={() => setFailTarget(null)} />}
    </div>
  );
}
