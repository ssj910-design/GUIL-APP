"use client";

// 관리자 콘솔 공용 헬퍼 — 표기(호기·담당자)는 v2 FK 우선, 옛 라벨 fallback.

export const inputCls = "border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500";

// 기록의 위치 표기: unitId → "현장 · N호기", 없으면 옛 텍스트
export function locOf(data, unitId, fallbackSiteName, fallbackLabel) {
  const u = data.units.find((x) => x.id === unitId);
  if (!u) return [fallbackSiteName, fallbackLabel].filter(Boolean).join(" · ") || "-";
  const s = data.sites.find((x) => x.id === u.siteId);
  return `${s?.name ?? fallbackSiteName ?? "-"} · ${u.unitNo}`;
}

// 담당자 표기: profileId → 이름, 없으면 옛 이름 텍스트
export function personOf(data, profileId, fallbackName) {
  return data.profiles.find((p) => p.id === profileId)?.name ?? fallbackName ?? "-";
}

const TONES = {
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
  slate: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ tone = "slate", children }) {
  return <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function AdminTable({ head, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 border-b border-slate-100">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2.5 font-semibold ${i === 0 ? "pl-5 text-left" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`text-xs font-bold rounded-full px-3 py-1.5 border ${
            value === o.value ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-200"
          }`}>
          {o.label}{o.count != null ? ` ${o.count}` : ""}
        </button>
      ))}
    </div>
  );
}
