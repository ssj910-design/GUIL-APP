"use client";

// 계약 만료 대시보드 (docs/ANALYTICS.md B-2) — "어느 계약부터 협상에 들어갈 것인가".
// 만료일만 보면 순서를 못 정한다. 같은 줄에 노후도·고장·부품비를 붙여
// "곧 끝나는데 손이 많이 가는 현장"을 위로 올리는 게 이 화면의 목적이다.
//
// 손익(B-1)은 sites.maintenance_cost가 채워져야 계산된다. 지금은 계약금액 칸이
// 비어 있으면 '미입력'으로 표시하고, 채워진 현장만 대당 단가를 보여준다.
import { useState } from "react";
import { TODAY_STR } from "@/lib/constants";
import { shortDate } from "@/lib/utils";

const MONTHS = 12;
const won = (n) => `${Math.round(n).toLocaleString()}원`;
const dday = (end) => Math.ceil((new Date(end) - new Date(TODAY_STR)) / 86400000);

const RANGES = [
  { key: "3개월", max: 90 },
  { key: "6개월", max: 180 },
  { key: "1년", max: 365 },
  { key: "전체", max: Infinity },
];

export default function ContractDashboard({ data }) {
  const { sites, units, failures, billings } = data;
  const [range, setRange] = useState("6개월");
  const [sort, setSort] = useState("만료순"); // 만료순 | 고장순

  const since = new Date(`${TODAY_STR}T00:00:00`);
  since.setMonth(since.getMonth() - MONTHS);
  const sinceIso = since.toISOString();

  const thisYear = Number(TODAY_STR.slice(0, 4));
  const maxDays = RANGES.find((r) => r.key === range).max;

  const rows = sites
    .filter((s) => s.isActive !== false && s.contractEnd)
    .map((s) => {
      const d = dday(s.contractEnd);
      const su = units.filter((u) => u.siteId === s.id && u.isActive !== false);
      const ages = su.map((u) => (u.installDate ? thisYear - Number(u.installDate.slice(0, 4)) : null)).filter((a) => a != null);
      const avgAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
      const unitIds = new Set(su.map((u) => u.id));
      const fails = failures.filter((f) => unitIds.has(f.unitId) && (!f.createdAt || f.createdAt >= sinceIso)).length;
      const cost = billings
        .filter((b) => unitIds.has(b.unitId) && (!b.submittedAt || b.submittedAt >= sinceIso.slice(0, 10)))
        .reduce((n, b) => n + (Number(b.cost) || 0), 0);
      const fee = Number(s.maintenanceCost) || null;
      return { s, d, n: su.length, avgAge, oldCnt: ages.filter((a) => a >= 20).length, fails, cost, fee };
    })
    .filter((r) => r.d <= maxDays)
    .sort((a, b) => (sort === "만료순" ? a.d - b.d : b.fails - a.fails || a.d - b.d));

  // 계약종료일이 없으면 이 화면에 아예 나타나지 않는다 — 몇 건이 빠져 있는지 알려준다
  const activeSites = sites.filter((s) => s.isActive !== false);
  const noEnd = activeSites.filter((s) => !s.contractEnd).length;
  const noFee = rows.filter((r) => !r.fee).length;
  const expired = rows.filter((r) => r.d < 0).length;
  const soon = rows.filter((r) => r.d >= 0 && r.d <= 90).length;

  const ddayTone = (d) =>
    d < 0 ? "bg-slate-800 text-white" : d <= 30 ? "bg-red-500 text-white" : d <= 90 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600";

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`text-[11px] font-bold rounded-lg px-3 py-1.5 border ${
                range === r.key ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-400 border-slate-200"
              }`}>
              {r.key} 내
            </button>
          ))}
        </div>
        <button onClick={() => setSort(sort === "만료순" ? "고장순" : "만료순")}
          className="ml-auto text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
          {sort} ↕
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          ["대상 계약", `${rows.length}건`, "text-slate-900"],
          ["이미 만료", `${expired}건`, "text-slate-900"],
          ["90일 내 만료", `${soon}건`, "text-red-600"],
          ["계약금액 미입력", `${noFee}건`, noFee ? "text-amber-600" : "text-slate-400"],
        ].map(([label, value, tone]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-[11px] text-slate-400 font-semibold">{label}</p>
            <p className={`text-lg font-extrabold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {noEnd > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs font-bold text-amber-800">
            계약종료일이 없는 현장 {noEnd.toLocaleString()}건 — 이 표에 나오지 않습니다
          </p>
          <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
            전체 {activeSites.length.toLocaleString()}개 현장 중 {activeSites.length - noEnd}건만 종료일이 등록돼 있습니다.
            현장정보에서 계약종료일을 채우면 이 대시보드가 실제 협상 순서표가 됩니다.
          </p>
        </div>
      )}

      {noFee > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs font-bold text-amber-800">계약금액이 없는 현장 {noFee}건 — 손익 판단 불가</p>
          <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
            현장정보에서 월 계약금액을 넣으면 "이 현장이 남는 장사인가"를 이 표에서 바로 볼 수 있습니다.
            지금은 노후도·고장 건수만으로 우선순위를 봅니다.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "60rem" }}>
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              {["현장", "만료일", "D-day", "호기", "평균 연차", `고장(${MONTHS}개월)`, "부품비", "월 계약금액", "판단 힌트"].map((h, i) => (
                <th key={h} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i === 0 ? "pl-5 text-left" : i >= 8 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-xs text-slate-400">
                해당 기간에 만료되는 계약이 없습니다 (계약종료일이 등록된 현장만 나옵니다)
              </td></tr>
            ) : rows.map(({ s, d, n, avgAge, oldCnt, fails, cost, fee }) => {
              // 판단 힌트 — 자동 결론이 아니라 무엇을 살펴야 하는지 짚어준다
              const hints = [];
              if (avgAge >= 25) hints.push({ t: "노후 — 부품교체 조건부 연장 검토", tone: "text-red-600" });
              else if (avgAge >= 20) hints.push({ t: "20년대 진입 — 교체 영업 여지", tone: "text-amber-600" });
              if (fails >= 3) hints.push({ t: `고장 잦음(${fails}건) — 원가 확인`, tone: "text-red-600" });
              if (fee && cost > fee * 12 * 0.5) hints.push({ t: "부품비가 연 계약액의 절반 초과", tone: "text-red-600" });
              if (!fee) hints.push({ t: "계약금액 미입력", tone: "text-amber-600" });
              if (!hints.length) hints.push({ t: "특이사항 없음", tone: "text-slate-400" });
              return (
                <tr key={s.id} className="border-b border-slate-50">
                  <td className="pl-5 pr-3 py-2.5">
                    <p className="font-bold whitespace-nowrap">{s.name}</p>
                    <p className="text-[10px] text-slate-400">{s.contractType ?? "계약구분 없음"} · {s.assignedEngineer ?? "담당 미지정"}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-500 text-[11px]">{shortDate(s.contractEnd)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <span className={`text-[11px] font-extrabold rounded-full px-2 py-1 ${ddayTone(d)}`}>
                      {d < 0 ? `만료 ${-d}일` : `D-${d}`}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">{n}대</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {avgAge == null ? <span className="text-slate-300">-</span> : (
                      <>
                        <span className={avgAge >= 25 ? "font-bold text-red-600" : avgAge >= 20 ? "font-bold text-amber-600" : ""}>
                          {avgAge.toFixed(0)}년
                        </span>
                        {oldCnt > 0 && <span className="text-[10px] text-slate-400"> (20년+ {oldCnt})</span>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">{fails}건</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{cost ? won(cost) : "-"}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {fee ? <span className="font-bold">{won(fee)}</span> : <span className="text-amber-500 text-[11px] font-bold">미입력</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {hints.map((h) => <p key={h.t} className={`text-[11px] font-semibold ${h.tone} whitespace-nowrap`}>{h.t}</p>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 mt-2.5 px-1 leading-relaxed">
        판단 힌트는 자동 결론이 아니라 확인할 지점입니다. 계약금액이 채워지면
        「연 계약액 − (부품비 + 추정 인건비)」로 실제 손익을 계산할 예정입니다.
      </p>
    </div>
  );
}
