"use client";

// 자산 분석 (docs/ANALYTICS.md A그룹) — "현황 집계"가 아니라 "판단용" 통계.
// 노후도·제조사별로 대당 고장률과 부품비를 내서 계약 조건·교체 영업의 근거로 쓴다.
//
// 표본 주의: 고장·청구 기록이 적으면 대당 수치가 크게 튄다. 그래서 화면에
// 표본 수를 함께 띄우고, 기준 미달이면 경고를 보여준다.
import { useState } from "react";
import { TODAY_STR } from "@/lib/constants";
import { locOf } from "@/app/components/admin/adminShared";

const MONTHS = 12;                 // 분석 기간
const MIN_SAMPLE = 30;             // 이 아래면 '표본 부족'으로 표시
const AGE_BUCKETS = [
  { label: "10년 미만", min: 0, max: 9 },
  { label: "10~19년", min: 10, max: 19 },
  { label: "20~29년", min: 20, max: 29 },
  { label: "30년 이상", min: 30, max: 999 },
];

const won = (n) => `${Math.round(n).toLocaleString()}원`;

function Table({ head, rows, note }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto mb-5">
      <table className="w-full text-sm" style={{ minWidth: "44rem" }}>
        <thead>
          <tr className="text-xs text-slate-400 border-b border-slate-100">
            {head.map((h, i) => <th key={i} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i === 0 ? "pl-5 text-left" : "text-right"}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      {note && <p className="text-[11px] text-slate-400 px-5 py-2.5 border-t border-slate-50">{note}</p>}
    </div>
  );
}

export default function AssetAnalysis({ data }) {
  const { units, sites, failures, billings } = data;
  const [makerLimit, setMakerLimit] = useState(8);

  const deadSites = new Set(sites.filter((s) => s.isActive === false).map((s) => s.id));
  const active = units.filter((u) => u.isActive !== false && !deadSites.has(u.siteId));

  const thisYear = Number(TODAY_STR.slice(0, 4));
  const ageOf = (u) => (u.installDate ? thisYear - Number(u.installDate.slice(0, 4)) : null);

  // 분석 기간: 최근 12개월. reported_at은 연도가 없어 created_at을 쓴다.
  const since = new Date(`${TODAY_STR}T00:00:00`);
  since.setMonth(since.getMonth() - MONTHS);
  const sinceIso = since.toISOString();
  const recentFailures = failures.filter((f) => !f.createdAt || f.createdAt >= sinceIso);
  const recentBillings = billings.filter((b) => !b.submittedAt || b.submittedAt >= sinceIso.slice(0, 10));

  // 호기별 집계
  const failByUnit = new Map();
  for (const f of recentFailures) failByUnit.set(f.unitId, (failByUnit.get(f.unitId) ?? 0) + 1);
  const costByUnit = new Map();
  for (const b of recentBillings) costByUnit.set(b.unitId, (costByUnit.get(b.unitId) ?? 0) + (Number(b.cost) || 0));

  /** 호기 묶음 하나의 지표 — 대수, 고장 건수, 대당 고장, 부품비, 대당 부품비 */
  function metrics(group) {
    const n = group.length;
    const fails = group.reduce((s, u) => s + (failByUnit.get(u.id) ?? 0), 0);
    const cost = group.reduce((s, u) => s + (costByUnit.get(u.id) ?? 0), 0);
    return { n, fails, cost, perUnit: n ? fails / n : 0, costPerUnit: n ? cost / n : 0 };
  }

  const withAge = active.filter((u) => ageOf(u) != null);
  const ageRows = AGE_BUCKETS.map((b) => ({
    key: b.label,
    ...metrics(withAge.filter((u) => { const a = ageOf(u); return a >= b.min && a <= b.max; })),
  }));
  // 기준선 = 가장 젊은 구간. 노후 구간이 몇 배인지 보여주는 게 이 표의 핵심.
  const base = ageRows.find((r) => r.key === "10년 미만" && r.n > 0) ?? ageRows.find((r) => r.n > 0);
  const ratioOf = (r) => (base && base.perUnit > 0 ? r.perUnit / base.perUnit : null);

  const makers = [...new Set(active.map((u) => u.manufacturer).filter(Boolean))]
    .map((m) => ({ key: m, ...metrics(active.filter((u) => u.manufacturer === m)) }))
    .sort((a, b) => b.n - a.n);

  // 교체 제안 후보 — 노후 + 고장 잦음 + 부품비 큼
  const candidates = active
    .map((u) => ({ u, age: ageOf(u), fails: failByUnit.get(u.id) ?? 0, cost: costByUnit.get(u.id) ?? 0 }))
    .filter((c) => c.age >= 25 && (c.fails >= 3 || c.cost > 0))
    .sort((a, b) => b.fails - a.fails || b.cost - a.cost || b.age - a.age)
    .slice(0, 30);

  const totalFails = recentFailures.length;
  const lowSample = totalFails < MIN_SAMPLE;

  return (
    <div className="max-w-5xl">
      {lowSample && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-xs font-bold text-amber-800">표본 부족 — 최근 {MONTHS}개월 고장 {totalFails}건</p>
          <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
            대당 고장률은 기록이 {MIN_SAMPLE}건 이상 쌓여야 의미가 생깁니다. 지금 숫자는 화면 동작 확인용으로만 보세요.
            대수·노후도·제조사 분포는 등록 데이터라 지금도 정확합니다.
          </p>
        </div>
      )}

      {/* A-1 노후도별 */}
      <h2 className="text-sm font-extrabold text-slate-700 mb-1">노후도별 고장률</h2>
      <p className="text-[11px] text-slate-400 mb-2">
        가장 젊은 구간을 1.0배로 두고 몇 배나 손이 가는지 봅니다. 배수가 크면 그 구간은 정액 계약(POG)에서 손해가 나기 쉽습니다.
      </p>
      <Table
        head={["설치 연차", "대수", `고장(${MONTHS}개월)`, "대당 고장", "기준 대비", "부품비", "대당 부품비"]}
        note={`분석 기간: 최근 ${MONTHS}개월 · 계약종료 현장과 운행중지 호기는 제외`}
        rows={ageRows.map((r) => {
          const ratio = ratioOf(r);
          return (
            <tr key={r.key} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{r.key}</td>
              <td className="px-3 py-2.5 text-right">{r.n.toLocaleString()}대</td>
              <td className="px-3 py-2.5 text-right">{r.fails}건</td>
              <td className="px-3 py-2.5 text-right font-bold">{r.perUnit.toFixed(2)}</td>
              <td className="px-3 py-2.5 text-right">
                {ratio == null ? <span className="text-slate-300">-</span>
                  : <span className={ratio >= 2 ? "font-bold text-red-600" : ratio >= 1.3 ? "font-bold text-amber-600" : "text-slate-500"}>
                      {ratio.toFixed(1)}배
                    </span>}
              </td>
              <td className="px-3 py-2.5 text-right text-slate-500">{won(r.cost)}</td>
              <td className="px-3 py-2.5 text-right text-slate-500">{won(r.costPerUnit)}</td>
            </tr>
          );
        })}
      />

      {/* A-2 제조사별 */}
      <h2 className="text-sm font-extrabold text-slate-700 mb-1">제조사별</h2>
      <p className="text-[11px] text-slate-400 mb-2">
        대당 고장·부품비가 높은 제조사는 견적 단가에 반영할 근거가 됩니다.
      </p>
      <Table
        head={["제조사", "대수", "20년+", `고장(${MONTHS}개월)`, "대당 고장", "대당 부품비"]}
        note={makers.length > makerLimit ? undefined : "대수 순 정렬"}
        rows={makers.slice(0, makerLimit).map((r) => {
          const old20 = active.filter((u) => u.manufacturer === r.key && ageOf(u) >= 20).length;
          return (
            <tr key={r.key} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{r.key}</td>
              <td className="px-3 py-2.5 text-right">{r.n.toLocaleString()}대</td>
              <td className="px-3 py-2.5 text-right text-slate-500">
                {old20}대 <span className="text-slate-300">({Math.round((old20 / r.n) * 100)}%)</span>
              </td>
              <td className="px-3 py-2.5 text-right">{r.fails}건</td>
              <td className="px-3 py-2.5 text-right font-bold">{r.perUnit.toFixed(2)}</td>
              <td className="px-3 py-2.5 text-right text-slate-500">{won(r.costPerUnit)}</td>
            </tr>
          );
        })}
      />
      {makers.length > makerLimit && (
        <button onClick={() => setMakerLimit(makers.length)}
          className="w-full -mt-3 mb-5 text-xs font-bold text-blue-700 bg-white border border-slate-200 rounded-xl py-2.5">
          제조사 {makers.length - makerLimit}곳 더 보기
        </button>
      )}

      {/* A-3 교체 제안 후보 */}
      <h2 className="text-sm font-extrabold text-slate-700 mb-1">교체 제안 후보 {candidates.length}대</h2>
      <p className="text-[11px] text-slate-400 mb-2">
        25년 이상이면서 최근 {MONTHS}개월에 고장 3건 이상이거나 부품비가 발생한 호기입니다. 개보수 영업 리스트로 씁니다.
      </p>
      {candidates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-8 text-center mb-5">
          <p className="text-xs text-slate-400">해당하는 호기가 없습니다 (고장·부품 기록이 쌓이면 나타납니다)</p>
        </div>
      ) : (
        <Table
          head={["현장 · 호기", "제조사", "설치 연차", "고장", "부품비"]}
          rows={candidates.map(({ u, age, fails, cost }) => (
            <tr key={u.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 font-bold">{locOf(data, u.id, null, null)}</td>
              <td className="px-3 py-2.5 text-right text-slate-500">{u.manufacturer ?? "-"}</td>
              <td className="px-3 py-2.5 text-right">
                <span className={age >= 30 ? "font-bold text-red-600" : "font-bold text-amber-600"}>{age}년</span>
              </td>
              <td className="px-3 py-2.5 text-right">{fails}건</td>
              <td className="px-3 py-2.5 text-right text-slate-500">{cost ? won(cost) : "-"}</td>
            </tr>
          ))}
        />
      )}
    </div>
  );
}
