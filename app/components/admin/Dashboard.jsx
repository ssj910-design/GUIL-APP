"use client";

// 관리자 대시보드 — 오늘 처리해야 할 일이 한눈에 보이는 화면.
// 호기·담당자 표기는 v2 FK(unitId/assigneeId)를 우선 쓰고, 옛 라벨은 fallback.
import { TODAY_STR } from "@/lib/constants";
import { addDays } from "@/lib/utils";

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

export default function Dashboard({ data }) {
  const { sites, units, failures, inspections, materialRequests, quoteRequests, todos, billings, selfChecks, profiles } = data;

  const openFailures = failures.filter((f) => f.status === "미처리");
  const activeFailures = failures.filter((f) => f.status === "진행중");
  const pendingMaterials = materialRequests.filter((m) => m.status === "승인대기");
  const activeQuotes = quoteRequests.filter((q) => q.status !== "자재지급완료");
  const openTodos = todos.filter((t) => !t.done);
  const dueInspections = inspections.filter((i) => i.dueDate >= TODAY_STR && i.dueDate <= addDays(TODAY_STR, 60));
  const ym = TODAY_STR.slice(0, 7);
  const monthChecks = selfChecks.filter((c) => c.ym === ym);
  const doneChecks = monthChecks.filter((c) => c.status === "완료");

  const engineerName = (id, fallback) => profiles.find((p) => p.id === id)?.name ?? fallback ?? "미배정";

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-1">대시보드</h1>
      <p className="text-xs text-slate-500 mb-6">
        현장 {sites.length} · 호기 {units.length}대 · 기사 {profiles.filter((p) => p.role === "engineer").length}명 · 기준일 {TODAY_STR}
      </p>

      <div className="grid grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 최근 고장 */}
        <section className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <h2 className="px-5 py-3 text-sm font-bold border-b border-slate-100">최근 고장 접수</h2>
          <table className="w-full text-sm">
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
                  <tr key={f.id} className="border-b border-slate-50">
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
          </table>
        </section>

        {/* 검사 도래 */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <h2 className="px-5 py-3 text-sm font-bold border-b border-slate-100">검사 도래 (60일 이내)</h2>
          {dueInspections.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">도래 예정 검사가 없습니다</p>
          ) : (
            <ul>
              {dueInspections.map((i) => {
                const loc = unitLabel(units, sites, i.unitId, i.siteName, i.elevatorNo);
                return (
                  <li key={i.id} className="flex items-center justify-between px-5 py-2.5 border-b border-slate-50 text-sm">
                    <div>
                      <p className="font-semibold">{loc.site} · {loc.unit}</p>
                      <p className="text-xs text-slate-400">{i.type} · {i.org}</p>
                    </div>
                    <span className="text-xs font-bold text-blue-700 whitespace-nowrap">{i.dueDate}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="px-5 py-3 text-[10px] text-slate-400">
            * 수기입력 기준. 국가승강기정보센터 실시간 대조는 다음 단계에서.
          </p>
        </section>
      </div>
    </div>
  );
}
