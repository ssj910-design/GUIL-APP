"use client";

// 검사관리 — 전체 현장의 정기검사 현황을 국가승강기정보센터 실시간 데이터로 관제한다.
// 승강기고유번호가 등록된 현장은 실시간, 나머지는 수기입력 검사이력을 보여준다(모바일 검사관리와 동일 기준).
import { useState } from "react";
import { TODAY_STR } from "@/lib/constants";
import { addDays } from "@/lib/utils";
import { useLiveInspections, siteToUnitQueries } from "@/app/hooks/useLiveInspections";
import { Badge } from "@/app/components/ui";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { StatusBadge, AdminTable, FilterPills, inputCls } from "@/app/components/admin/adminShared";

const RESULT_LABEL = { pass: "합격", conditional: "조건부합격", fail: "불합격" };

export default function InspectionsAdmin({ data }) {
  const { sites, units, inspections } = data;
  const [view, setView] = useState("dueSoon");
  const [search, setSearch] = useState("");
  const [failTarget, setFailTarget] = useState(null);

  const liveInspections = useLiveInspections(sites.flatMap(siteToUnitQueries));
  const liveSiteIds = new Set(liveInspections.map((i) => i.siteId));
  const combined = [...liveInspections, ...inspections.filter((i) => !liveSiteIds.has(i.siteId))];

  const withUnitLabel = combined.map((i) => {
    const u = units.find((x) => x.id === i.unitId);
    return { ...i, unitLabel: u?.unitNo ?? i.elevatorNo ?? "-" };
  });

  const dueSoon = withUnitLabel.filter((i) => i.dueDate >= TODAY_STR && i.dueDate <= addDays(TODAY_STR, 60));
  const flagged = withUnitLabel.filter((i) => i.result === "conditional" || i.result === "fail");

  const base = view === "dueSoon" ? dueSoon : view === "flagged" ? flagged : withUnitLabel;
  const rows = base
    .filter((i) => !search || (i.siteName ?? "").includes(search))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-1">검사관리</h1>
      <p className="text-xs text-slate-500 mb-4">
        승강기고유번호가 등록된 현장은 국가승강기정보센터 실시간 데이터, 나머지는 수기입력 이력입니다.
      </p>
      <div className="flex items-center justify-between gap-3 mb-3">
        <FilterPills
          value={view}
          onChange={setView}
          options={[
            { value: "dueSoon", label: "60일 이내", count: dueSoon.length },
            { value: "flagged", label: "조건부·불합격", count: flagged.length },
            { value: "all", label: "전체", count: withUnitLabel.length },
          ]}
        />
        <input className={`${inputCls} max-w-56`} placeholder="현장명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <AdminTable head={["현장 · 호기", "종류", "검사기관", "기한", "결과", "비고"]}>
        {rows.map((i) => {
          const isLive = i.id?.startsWith("gov-");
          const clickable = isLive && (i.result === "conditional" || i.result === "fail");
          return (
            <tr
              key={i.id}
              className={`border-b border-slate-50 ${clickable ? "cursor-pointer hover:bg-slate-50" : ""}`}
              onClick={clickable ? () => setFailTarget(i) : undefined}
            >
              <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{i.siteName} · {i.unitLabel}</td>
              <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{i.type}</td>
              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{i.org}</td>
              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{i.dueDate}</td>
              <td className="px-3 py-2.5">
                {i.result ? <Badge result={i.result} /> : <StatusBadge tone="slate">예정</StatusBadge>}
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-500">
                {i.notes || "-"}
                {clickable && <span className="ml-2 text-[10px] text-blue-600 font-semibold whitespace-nowrap">클릭해서 부적합 상세</span>}
              </td>
            </tr>
          );
        })}
      </AdminTable>
      {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-10">해당 조건의 검사 이력이 없습니다</p>}

      {failTarget && <InspectionFailDetailSheet inspection={failTarget} onClose={() => setFailTarget(null)} />}
    </div>
  );
}
