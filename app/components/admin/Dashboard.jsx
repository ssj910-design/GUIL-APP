"use client";

// 관리자 대시보드 — 오늘 처리해야 할 일이 한눈에 보이는 화면.
// 호기·담당자 표기는 v2 FK(unitId/assigneeId)를 우선 쓰고, 옛 라벨은 fallback.
import { useState, useMemo } from "react";
import WeekStrip from "@/app/components/admin/WeekStrip";
import { AlertOctagon, Plus } from "lucide-react";
import { TODAY_STR } from "@/lib/constants";
import { addDays, unitsToInspections, stripCityPrefix, groupBySite, recentFailuresBySite, entrapmentSitesRecent, formatUnitLabel, shortDate, sortEngineersByDistance, parseErrorCode, engineerJobsByName, busyStatusOf } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/app/components/ui";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { Modal, StatusBadge, inputCls, PhotoGrid } from "@/app/components/admin/adminShared";
import { RegisterFailureModal } from "@/app/components/admin/FailuresAdmin";
import { confirmAsync } from "@/app/components/ConfirmHost";

function unitLabel(units, sites, unitId, fallbackSiteName, fallbackLabel) {
  const u = units.find((x) => x.id === unitId);
  if (!u) return { site: fallbackSiteName ?? "-", unit: formatUnitLabel(fallbackLabel) ?? "-", siteObj: sites.find((x) => x.name === fallbackSiteName) };
  const s = sites.find((x) => x.id === u.siteId);
  return { site: s?.name ?? fallbackSiteName ?? "-", unit: u.unitNo, siteObj: s };
}

function Kpi({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

// 재배정 팝업 — 배정 기사 select를 누르면 바로 바뀌던 것 대신, 버튼을 눌러야 여는 확인 단계.
// 모바일 AssignEngineerSheet와 같은 기준(바쁜 기사 경고, 미배정 알림 문구)으로 확인 팝업을 띄운다.
function ReassignModal({ failure, siteObj, engineers, engineerJobs, failures, onAssign, onClose }) {
  const rows = sortEngineersByDistance(engineers, siteObj);
  async function pick(name) {
    const st = name ? busyStatusOf(failures, name) : null;
    const msg = !name
      ? "미배정 하시겠습니까?\n모든 직원에게 알림이 갑니다."
      : st
        ? `${name}님은 지금 ${st}입니다.\n그래도 이 건을 배정할까요?`
        : `${name}으로 배정하시겠습니까?`;
    if (!(await confirmAsync(msg))) return;
    onAssign(failure, name);
    onClose();
  }
  return (
    <Modal title={`재배정 — ${failure.siteName}${failure.elevatorNo ? ` · ${formatUnitLabel(failure.elevatorNo)}` : ""}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => pick(null)} className="py-3 rounded-xl text-sm font-bold border text-red-500 border-red-200 bg-white hover:bg-red-50">
          미배정으로
        </button>
        {rows.map(({ engineer: p, km }) => {
          const job = engineerJobs.get(p.name);
          return (
            <button
              key={p.id}
              onClick={() => pick(p.name)}
              className="py-3 rounded-xl text-sm font-bold border text-slate-700 border-slate-200 bg-white hover:bg-blue-50"
            >
              {p.name}{km != null ? ` (${km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`})` : ""}
              {job && <span className="block text-[10px] font-normal text-slate-400 mt-0.5">{job.siteName} · {job.label}</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// 고장상세내역 — 대시보드 집중관리현장 -> 고장내역 -> 이 고장 클릭 시. (FailuresAdmin에서도 재사용)
// 청구내역(BillingsAdmin.jsx의 BillingDetailModal)과 동일한 구성 — 짧은 항목은
// 라벨/값 2열 그리드, 긴 텍스트(증상·처리내용 등)는 전체너비 블록, 사진은 PhotoGrid.
export function FailureDetailContent({ f, units, sites, profiles = [] }) {
  const loc = unitLabel(units, sites, f.unitId, f.siteName, f.elevatorNo);
  const { faultType, faultDetail } = parseErrorCode(f.errorCode);
  const reporter = profiles.find((p) => p.id === f.createdBy)?.name ?? "-";
  const gridRows = [
    { label: "현장 · 호기", value: `${loc.site} · ${loc.unit}` },
    { label: "현장 주소", value: loc.siteObj?.address ?? "-" },
    { label: "접수일시", value: f.reportedAt },
    { label: "접수자", value: reporter },
    { label: "담당 기사", value: loc.siteObj?.assignedEngineer || "미배정" },
    { label: "배정 기사", value: f.assignee || "미배정" },
    { label: "출동 / 도착시간", value: `${f.dispatchedAt || "-"} / ${f.arrivalTime || "-"}` },
    { label: "처리완료시간", value: f.completeTime || "-" },
    { label: "고장분류", value: faultType || "-" },
    { label: "신고내용", value: faultDetail || "-" },
  ];
  const textRows = [];
  if (f.faultSymptom) textRows.push({ label: "증상", value: f.faultSymptom });
  if (f.faultCause) textRows.push({ label: "원인", value: f.faultCause });
  if (f.faultErrorCode) textRows.push({ label: "에러코드", value: f.faultErrorCode });
  if (f.processContent) textRows.push({ label: "처리내용", value: f.processContent });
  if (f.processNote) textRows.push({ label: "비고", value: f.processNote });
  if (f.notFault) textRows.push({ label: "구분", value: "고장 아님" });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm">
        {gridRows.map((r) => (
          <div key={r.label}>
            <p className="text-xs font-bold text-slate-400 mb-1">{r.label}</p>
            <p className="font-semibold text-slate-800">{r.value}</p>
          </div>
        ))}
      </div>

      {textRows.map((r) => (
        <div key={r.label}>
          <p className="text-xs font-bold text-slate-500 mb-1">{r.label}</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.value}</p>
        </div>
      ))}

      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">사진 ({f.photoUrls?.length ?? 0}장)</p>
        <PhotoGrid urls={f.photoUrls ?? []} />
      </div>
    </div>
  );
}

export default function Dashboard({ data, setData, onOpenWorkCalendar }) {
  const { sites, units, failures, inspections, materialRequests, quoteRequests, todos, billings, selfChecks, profiles } = data;
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const engineers = profiles.filter((p) => p.role === "engineer");
  const engineerJobs = useMemo(() => engineerJobsByName(failures), [failures]);
  const [reassignTarget, setReassignTarget] = useState(null);
  const [historySite, setHistorySite] = useState(null);
  const [failureDetail, setFailureDetail] = useState(null);
  const [failTarget, setFailTarget] = useState(null);
  const [registering, setRegistering] = useState(false);

  // 고장관리(FailuresAdmin.jsx)의 접수 로직과 동일 — 여기서도 같은 위치에 고장접수 버튼을 두므로 그대로 둔다.
  async function createFailure(form) {
    const site = sites.find((s) => s.id === form.siteId);
    if (!site) return;
    const stamp = Date.now();
    const assigneeProfile = profiles.find((p) => p.name === form.assignee);
    const detailOf = (id) => (form.unitIds.length > 1 ? (form.details[id] ?? "").trim() : form.detail.trim());
    const reportedAt = TODAY_STR.slice(5).replace("-", "/") + " " + new Date().toTimeString().slice(0, 5);
    const rows = form.unitIds.map((unitId, i) => {
      const u = units.find((x) => x.id === unitId);
      const detail = detailOf(unitId);
      return {
        id: "f" + (stamp + i),
        siteId: site.id, siteName: site.name, elevatorNo: u?.unitNo ?? null, unitId,
        errorCode: form.faultType + (detail ? ` (${detail})` : ""),
        status: "미처리", reportedAt,
        assignee: form.assignee || null, assigneeId: assigneeProfile?.id ?? null,
        notFault: form.notFault, reporterPhone: form.reporterPhone.trim(),
      };
    });
    const { error } = await supabase.from("failures").insert(rows.map((f) => ({
      id: f.id, site_id: f.siteId, site_name: f.siteName, elevator_no: f.elevatorNo, unit_id: f.unitId,
      error_code: f.errorCode, status: f.status, reported_at: f.reportedAt,
      assignee: f.assignee, assignee_id: f.assigneeId, not_fault: f.notFault, reporter_phone: f.reporterPhone,
    })));
    if (error) { alert("접수 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      failures: [...rows.map((f) => ({ ...f, createdAt: new Date().toISOString() })), ...prev.failures],
    }));
  }

  async function assign(f, name) {
    const p = profiles.find((x) => x.name === name);
    await supabase.from("failures")
      .update({ assignee: name || null, assignee_id: p?.id ?? null })
      .eq("id", f.id);
    setData((prev) => ({
      ...prev,
      failures: prev.failures.map((x) => (x.id === f.id ? { ...x, assignee: name || null, assigneeId: p?.id ?? null } : x)),
    }));
  }

  const openFailures = failures.filter((f) => f.status === "미처리");
  const activeFailures = failures.filter((f) => f.status === "진행중");
  // 실시간 고장 현황: 완료되지 않은 건만 — 접수순(최신 우선)으로, 배정/도착 상태를 바로 볼 수 있게.
  const liveFailures = failures
    .filter((f) => f.status !== "완료")
    .sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
  // 최근 고장처리 현황(1주일): 처리완료된 건 중 최근 7일간 접수된 것만 — 미완료 건은 실시간 고장 현황에서 이미 보임.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentWeekFailures = failures
    .filter((f) => f.status === "완료" && f.createdAt && new Date(f.createdAt) >= weekAgo)
    .sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
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
  const todayInspections = groupBySite(
    inspections
      .filter((i) => i.dueDate === TODAY_STR)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
  );

  // 조건부/불합격 카드의 "검사일정"은 관리자가 InspectionsAdmin에서 수기입력한 방문 예정 일시(inspections.due_date/due_time)다
  // — 보완기한(API 검사 유효기간)과는 별개 정보로 함께 보여준다.
  const manualByUnitId = new Map(inspections.filter((i) => i.unitId).map((i) => [i.unitId, i]));
  const manualBySiteId = new Map(inspections.filter((i) => !i.unitId).map((i) => [i.siteId, i]));

  // 보완기한이 61일 이상 남은 건 아직 급하지 않으니 목록에서 뺀다(60일은 노출) — 기한 미정은 계속 노출.
  const flaggedInspections = groupBySite(
    combinedInspections
      .filter((i) => i.result === "conditional" || i.result === "fail")
      .filter((i) => !i.dueDate || Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) <= 60)
      .map((i) => {
        const manual = manualByUnitId.get(i.unitId) ?? manualBySiteId.get(i.siteId) ?? null;
        return { ...i, scheduleDate: manual?.dueDate ?? null, scheduleTime: manual?.dueTime ?? null };
      })
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
  );

  // 집중 관리현장: 최근 30일 고장 3회 이상, 또는 지원요청/운행정지 등 미해결 에스컬레이션이 있는 현장
  // (모바일 홈탭과 동일 기준). 지원요청/운행정지는 각각 독립적으로 판단해 배지를 함께 표시합니다.
  const openEscalations = failures.filter((f) => f.escalation && f.status !== "완료");
  const supportSiteIds = new Set(openEscalations.filter((f) => f.escalation === "지원요청").map((f) => f.siteId));
  const stoppedSiteIds = new Set(openEscalations.filter((f) => f.escalation === "운행정지").map((f) => f.siteId));
  const escalatedSiteIds = new Set([...supportSiteIds, ...stoppedSiteIds]);
  // 최근 30일 고장 목록은 실시간 계산 — 처리완료 여부와 무관하게 누적되어야 하므로
  // 현장에 수동 저장된 failures30d 대신 실제 failures 레코드에서 직접 센다.
  const recentFailuresBySiteId = recentFailuresBySite(failures);
  // 갇힘사고는 재발 횟수와 무관하게 최근 30일 내 1건만 있어도 집중관리 대상 — 30일이 지나면 자동으로 빠진다.
  const entrapmentSiteIds = entrapmentSitesRecent(failures);
  const criticalSites = sites.filter((s) =>
    (recentFailuresBySiteId.get(s.id)?.length ?? 0) >= 3 || escalatedSiteIds.has(s.id) || entrapmentSiteIds.has(s.id)
  );

  const engineerName = (id, fallback) => profiles.find((p) => p.id === id)?.name ?? fallback ?? "미배정";

  const historyFailures = historySite ? failures.filter((f) => f.siteId === historySite.id).sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)) : [];

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-extrabold">대시보드</h1>
        <button onClick={() => setRegistering(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
          <Plus size={15} /> 고장접수
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-6">
        현장 {sites.length} · 호기 {units.length}대 · 기사 {profiles.filter((p) => p.role === "engineer").length}명 · 기준일 {TODAY_STR}
      </p>

      {/* 계약 만료 임박 알림 — 종료일 30일 내(만료 포함) */}
      {(() => {
        const expiring = sites.filter((s) => s.isActive !== false && s.contractEnd && s.contractEnd <= addDays(TODAY_STR, 30));
        return expiring.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <p className="text-sm font-bold text-amber-700">
              ⚠️ 계약 만료 임박·만료 현장 {expiring.length}곳 — 현장정보에서 재계약을 진행하세요
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

      <WeekStrip data={data} onOpenCalendar={onOpenWorkCalendar} />

      {/* 집중 관리현장 */}
      <section className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-extrabold text-red-700 mb-3">집중관리현장(갇힘·운행정지·고장다발·지원요청)</h2>
        {criticalSites.length === 0 ? (
          <p className="text-xs text-red-500">현재 집중 관리 대상 현장이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {criticalSites.map((s) => {
              const stopped = stoppedSiteIds.has(s.id);
              const support = supportSiteIds.has(s.id);
              const trapped = entrapmentSiteIds.has(s.id);
              const recent = recentFailuresBySiteId.get(s.id) ?? [];
              const count30d = recent.length;
              const units = [...new Set(recent.map((f) => formatUnitLabel(f.elevatorNo)).filter(Boolean))];
              const unitText = units.length ? units.join(", ") : formatUnitLabel(s.elevatorNo);
              return (
                <button
                  key={s.id}
                  onClick={() => setHistorySite(s)}
                  className={`flex items-center justify-between bg-white rounded-lg px-3.5 py-2.5 text-left ${stopped ? "border-2 border-red-400" : "border border-red-100"}`}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{s.name}{unitText ? ` · ${unitText}` : ""}</p>
                    <p className="text-[11px] text-slate-400 truncate">{s.address}</p>
                  </div>
                  <span className="flex gap-1 shrink-0 ml-2">
                    {trapped && <span className="text-xs font-extrabold text-white bg-red-600 px-2 py-1 rounded-full">갇힘</span>}
                    {support && <span className="text-xs font-extrabold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">지원요청</span>}
                    {stopped && <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-1 rounded-full">운행정지</span>}
                    {count30d > 0 && <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-1 rounded-full">{count30d}회 고장</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 실시간 고장 현황 — 최근 고장처리 현황이 빠지면서 전체 너비로 확장 */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h2 className="px-5 py-3 text-sm font-bold border-b border-slate-100">실시간 고장 현황 · 미처리 {liveFailures.length}건</h2>
        {liveFailures.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">현재 처리 중인 고장이 없습니다</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left pl-5 pr-2 py-2 font-semibold">접수</th>
                <th className="text-left px-1 py-2 font-semibold">현장 · 호기</th>
                <th className="text-left px-2 py-2 font-semibold w-[30%]">증상</th>
                <th className="text-left px-2 py-2 font-semibold">담당 기사</th>
                <th className="text-left px-2 py-2 font-semibold">배정 기사</th>
                <th className="text-left px-2 py-2 font-semibold">출동</th>
                <th className="text-left px-2 py-2 font-semibold">도착</th>
                <th className="text-right px-5 py-2 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {liveFailures.map((f) => {
                const loc = unitLabel(units, sites, f.unitId, f.siteName, f.elevatorNo);
                const stateCls = f.status === "진행중" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600";
                return (
                  <tr key={f.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setFailureDetail(f)}>
                    <td className="pl-5 pr-2 py-2.5 text-slate-500 whitespace-nowrap">{f.reportedAt}</td>
                    <td className="px-1 py-2.5 font-semibold whitespace-nowrap">{loc.site} · {loc.unit}</td>
                    <td className="px-2 py-2.5 text-slate-600">{f.errorCode}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">{loc.siteObj?.assignedEngineer || "미배정"}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <span className="text-slate-700 font-semibold mr-2">{engineerName(f.assigneeId, f.assignee)}</span>
                      <button
                        onClick={() => setReassignTarget({ failure: f, siteObj: loc.siteObj })}
                        className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-50"
                      >
                        재배정
                      </button>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-slate-500">{f.dispatchedAt || "-"}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-slate-500">{f.arrivalTime || "-"}</td>
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
        )}
      </section>

      {/* 최근 고장처리 현황(1주일) — 금일검사현장 위로 이동 */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-6">
        <h2 className="px-5 py-3 text-sm font-bold border-b border-slate-100">최근 고장처리 현황 (1주일)</h2>
        {recentWeekFailures.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">최근 1주일간 접수된 고장이 없습니다</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2">
            {recentWeekFailures.map((f) => {
              const loc = unitLabel(units, sites, f.unitId, f.siteName, f.elevatorNo);
              const stateCls =
                f.status === "완료" ? "bg-emerald-50 text-emerald-700" :
                f.status === "진행중" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600";
              return (
                <li
                  key={f.id}
                  onClick={() => setFailureDetail(f)}
                  className="flex items-center justify-between px-5 py-2.5 border-b border-slate-50 text-sm gap-2 cursor-pointer hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{loc.site} · {loc.unit}</p>
                    <p className="text-[11px] text-slate-400 truncate">{f.reportedAt} · {f.errorCode}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      담당 {loc.siteObj?.assignedEngineer || "미배정"} · 배정 {engineerName(f.assigneeId, f.assignee)}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${stateCls}`}>
                    {f.escalation ? `${f.status}·${f.escalation}` : f.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 금일검사현장 — 조건부/불합격 현장 위로 이동 */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-6">
        <h2 className="px-5 py-3 text-sm font-bold border-b border-slate-100">금일검사현장</h2>
        {todayInspections.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">오늘 예정된 검사가 없습니다</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2">
            {todayInspections.map((i) => (
              <li key={i.id} className="flex items-center justify-between px-5 py-2.5 border-b border-slate-50 text-sm gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{i.siteName} · {i.elevatorNo}</p>
                  <p className="text-[11px] text-slate-400 truncate">{stripCityPrefix(siteById.get(i.siteId)?.address)}</p>
                </div>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-slate-400">{i.type}</span>
                  <span className="text-xs font-bold text-blue-700 whitespace-nowrap">{i.dueTime || shortDate(i.dueDate)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
              const isLive = i.id?.startsWith("unit-");
              return (
                <div
                  key={i.id}
                  onClick={isLive ? () => setFailTarget(i) : undefined}
                  className={`bg-red-50 border border-red-100 rounded-lg px-3 py-2 space-y-0.5 ${isLive ? "cursor-pointer hover:bg-red-100" : ""}`}
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
                    <span className="shrink-0 text-xs font-bold text-blue-700">보완기한 {i.dueDate ? shortDate(i.dueDate) : "미정"}</span>
                  </div>
                  {(i.notes || i.scheduleTime) && (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {i.notes && <p className="text-[11px] text-red-600">{i.notes}</p>}
                      </div>
                      {i.scheduleTime && (
                        <span className="shrink-0 ml-2 text-[11px] text-blue-600 font-semibold text-right">검사일정 {i.scheduleTime}</span>
                      )}
                    </div>
                  )}
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
                    <p className="font-bold text-slate-800 text-sm">{f.errorCode}{f.elevatorNo ? ` · ${formatUnitLabel(f.elevatorNo)}` : ""}</p>
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
          <FailureDetailContent f={failureDetail} units={units} sites={sites} profiles={profiles} />
        </Modal>
      )}

      {failTarget && <InspectionFailDetailSheet inspection={failTarget} onClose={() => setFailTarget(null)} Container={Modal} />}

      {registering && <RegisterFailureModal data={data} onClose={() => setRegistering(false)} onCreate={createFailure} />}

      {reassignTarget && (
        <ReassignModal
          failure={reassignTarget.failure}
          siteObj={reassignTarget.siteObj}
          engineers={engineers}
          engineerJobs={engineerJobs}
          failures={failures}
          onAssign={assign}
          onClose={() => setReassignTarget(null)}
        />
      )}
    </div>
  );
}
