"use client";

// 통계 — 자산(승강기) 통계는 즉시, 운영(고장·부품·기사·비용) 통계는 기록이 쌓이며 채워진다.
// 별도 차트 라이브러리 없이 앱 팔레트 기반의 수평 막대(보조 표현)로 표시한다.
import { TODAY_STR } from "@/lib/constants";
import { addDays } from "@/lib/utils";
import { locOf, personOf } from "@/app/components/admin/adminShared";
import national from "@/lib/national-stats.json";

function countBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x) || "미상";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Bars({ title, rows, max = 8, unit = "대", tone = "bg-blue-600" }) {
  const top = rows.slice(0, max);
  const total = rows.reduce((n, [, c]) => n + c, 0);
  const peak = top[0]?.[1] ?? 1;
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-bold mb-3">{title} <span className="text-slate-400 font-semibold">· 총 {total.toLocaleString()}{unit}</span></h2>
      {top.length === 0 ? (
        <p className="text-xs text-slate-400 py-4">기록이 쌓이면 자동으로 채워집니다</p>
      ) : (
        <div className="space-y-2">
          {top.map(([label, count]) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <span className="w-40 truncate text-slate-600" title={label}>{label}</span>
              <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                <div className={`h-full ${tone} rounded`} style={{ width: `${(count / peak) * 100}%` }} />
              </div>
              <span className="w-16 text-right font-bold">{count.toLocaleString()}{unit}</span>
            </div>
          ))}
          {rows.length > max && <p className="text-[10px] text-slate-400">외 {rows.length - max}개 항목</p>}
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

export default function StatsAdmin({ data }) {
  const { units, sites, failures, billings, todos, profiles } = data;
  const active = units.filter((u) => u.isActive !== false);
  const in60 = (d) => d && d >= TODAY_STR && d <= addDays(TODAY_STR, 60);
  const ageOf = (u) => (u.installDate ? new Date(TODAY_STR).getFullYear() - Number(u.installDate.slice(0, 4)) : null);

  // ---- 자산 통계 ----
  const byKind = countBy(active, (u) => u.kind);
  const byForm = countBy(active, (u) => (u.form ?? "").split("-")[0]);
  const byMaker = countBy(active, (u) => u.manufacturer);
  const ageBuckets = countBy(
    active.filter((u) => u.installDate),
    (u) => {
      const age = new Date(TODAY_STR).getFullYear() - Number(u.installDate.slice(0, 4));
      return age >= 30 ? "30년 이상" : age >= 20 ? "20~29년" : age >= 10 ? "10~19년" : "10년 미만";
    }
  ).sort((a, b) => a[0].localeCompare(b[0], "ko"));

  // ---- 운영 통계 (기록이 쌓이며 채워짐) ----
  const failByKind = countBy(failures, (f) => units.find((u) => u.id === f.unitId)?.kind);
  const failBySite = countBy(failures, (f) => locOf(data, f.unitId, f.siteName, null).split(" · ")[0]);
  const partTop = countBy(billings.filter((b) => b.part), (b) => b.part.split("\n")[0]);
  const engineerRows = profiles
    .filter((p) => p.role === "engineer")
    .map((p) => {
      const done = failures.filter((f) => (f.assigneeId === p.id || f.assignee === p.name) && f.status === "완료").length;
      const doing = failures.filter((f) => (f.assigneeId === p.id || f.assignee === p.name) && f.status !== "완료").length;
      const todosDone = todos.filter((t) => (t.assigneeId === p.id || t.assignee === p.name) && t.done).length;
      const billed = billings.filter((b) => b.engineerId === p.id || b.engineer === p.name)
        .reduce((n, b) => n + (Number(b.cost) || 0), 0);
      return { p, done, doing, todosDone, billed };
    })
    .sort((a, b) => b.done - a.done);
  const totalBilled = billings.reduce((n, b) => n + (Number(b.cost) || 0), 0);
  const billBySite = countBy(billings, (b) => locOf(data, b.unitId, b.siteName, null).split(" · ")[0]);

  // ---- 전국 비교 (공단 파일데이터 집계 — lib/national-stats.json, 연 1회 갱신) ----
  const pctOf = (cnt) => (active.length ? (cnt / active.length) * 100 : 0);
  const natRows = [
    ["20년 이상 노후", active.filter((u) => ageOf(u) >= 20).length, national.pct.age20],
    ["30년 이상 노후", active.filter((u) => ageOf(u) >= 30).length, national.pct.age30],
    ["자동차용 비중", active.filter((u) => u.kind === "자동차용").length, national.pct.car],
    ["유압식 비중", active.filter((u) => (u.form ?? "").startsWith("유압")).length, national.pct.hydraulic],
  ];

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-1">통계</h1>
      <p className="text-xs text-slate-500 mb-4">자산 통계는 현재 등록 기준 · 고장/부품/기사/비용 통계는 기록이 쌓일수록 정확해집니다</p>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <Kpi label="관리 승강기" value={`${active.length}대`} />
        <Kpi label="20년 이상 노후" value={`${active.filter((u) => ageOf(u) >= 20).length}대`} tone="text-amber-600" />
        <Kpi label="검사만료 60일 내" value={`${active.filter((u) => in60(u.inspectionEnd)).length}대`} tone="text-red-600" />
        <Kpi label="보험만료 60일 내" value={`${active.filter((u) => in60(u.insuranceEnd)).length}대`} tone="text-amber-600" />
        <Kpi label="운행중지" value={`${units.filter((u) => u.isActive === false).length}대`} />
        <Kpi label="누적 청구액" value={`${totalBilled.toLocaleString()}원`} />
      </div>

      {/* 전국 비교 */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <h2 className="text-sm font-bold">
          전국 비교 <span className="text-slate-400 font-semibold">· 전국 운행중 {national.totalLive.toLocaleString()}대 · 유지관리업체 {national.companies.toLocaleString()}개사</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          구일은 관리대수 <b className="text-slate-700">전국 {national.guil.rank}위</b> ({national.guil.units.toLocaleString()}대 — 서울 {national.guil.seoul}·경기 {national.guil.gyeonggi}) · 공단 파일데이터 {national.asOf} 기준
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left py-2 font-semibold">지표</th>
              <th className="text-right py-2 font-semibold">우리</th>
              <th className="text-right py-2 font-semibold">전국(엘리베이터)</th>
            </tr>
          </thead>
          <tbody>
            {natRows.map(([label, cnt, natPct]) => (
              <tr key={label} className="border-b border-slate-50">
                <td className="py-2">{label}</td>
                <td className={`text-right py-2 font-bold ${pctOf(cnt) > natPct ? "text-amber-600" : "text-emerald-600"}`}>
                  {cnt.toLocaleString()}대 ({pctOf(cnt).toFixed(1)}%)
                </td>
                <td className="text-right py-2 text-slate-500">{natPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Bars title="승강기 종류별" rows={byKind} />
        <Bars title="구동 방식별" rows={byForm} max={5} />
        <Bars title="제조사별" rows={byMaker} />
        <Bars title="설치 경과년수 (노후도)" rows={ageBuckets} max={5} tone="bg-amber-500" />
        <Bars title="고장 — 승강기 종류별" rows={failByKind} unit="건" tone="bg-red-500" />
        <Bars title="고장 — 현장 TOP" rows={failBySite} unit="건" tone="bg-red-500" />
        <Bars title="부품 교체 TOP (청구 기준)" rows={partTop} unit="건" tone="bg-emerald-600" />
        <Bars title="청구 — 현장 TOP" rows={billBySite} unit="건" tone="bg-emerald-600" />
      </div>

      {/* 기사 실적 */}
      <section className="bg-white rounded-xl border border-slate-200 mt-5 overflow-hidden">
        <h2 className="text-sm font-bold px-5 py-3 border-b border-slate-100">기사 실적</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left pl-5 py-2 font-semibold">기사</th>
              <th className="text-center py-2 font-semibold">고장 처리완료</th>
              <th className="text-center py-2 font-semibold">진행 중</th>
              <th className="text-center py-2 font-semibold">할일 완료</th>
              <th className="text-right pr-5 py-2 font-semibold">청구 금액</th>
            </tr>
          </thead>
          <tbody>
            {engineerRows.map(({ p, done, doing, todosDone, billed }) => (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="pl-5 py-2.5 font-bold">{p.name}</td>
                <td className="text-center py-2.5">{done}</td>
                <td className="text-center py-2.5">{doing}</td>
                <td className="text-center py-2.5">{todosDone}</td>
                <td className="text-right pr-5 py-2.5 font-bold">{billed.toLocaleString()}원</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="px-5 py-2.5 text-[10px] text-slate-400 border-t border-slate-50">
          * 고장·할일·청구 기록이 쌓일수록 실적이 채워집니다 (실데이터 전환일: 2026-07-16)
        </p>
      </section>
    </div>
  );
}
