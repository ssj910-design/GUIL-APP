"use client";

// 검사관리 — 전체 현장의 정기검사 현황을 국가승강기정보센터 실시간 데이터로 관제한다.
// 승강기고유번호가 등록된 현장은 실시간, 나머지는 수기입력 검사이력을 보여준다(모바일 검사관리와 동일 기준).
// 도래현장(60일 이내)은 검사유효기한 기준 과거 60일(연체) ~ 미래 60일을 모두 포함한다.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { unitsToInspections } from "@/lib/utils";
import { Badge, DDay, inputCls as mobileInputCls } from "@/app/components/ui";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { StatusBadge, AdminTable, FilterPills, inputCls } from "@/app/components/admin/adminShared";

function daysLeftOf(dueDate, today) {
  return Math.ceil((new Date(dueDate) - new Date(today)) / 86400000);
}

// 수기입력(비실시간) 검사 건의 기한을 인라인으로 수정할 수 있는 행.
function InspectionRow({ i, onSaveDueDate, onOpenFail, clickable }) {
  const [date, setDate] = useState(i.dueDate ?? "");
  const [saving, setSaving] = useState(false);
  const isLive = i.id?.startsWith("gov-");
  const dirty = !isLive && date !== (i.dueDate ?? "");

  return (
    <tr className={`border-b border-slate-50 ${clickable ? "cursor-pointer hover:bg-slate-50" : ""}`} onClick={clickable ? () => onOpenFail(i) : undefined}>
      <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{i.siteName} · {i.unitLabel}</td>
      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{i.type}</td>
      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{i.org}</td>
      <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        {isLive ? (
          <span className="text-slate-500">{i.dueDate}</span>
        ) : (
          <input type="date" className={mobileInputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        )}
      </td>
      <td className="px-3 py-2.5"><DDay dueDate={i.dueDate} /></td>
      <td className="px-3 py-2.5">
        {i.result ? <Badge result={i.result} /> : <StatusBadge tone="slate">예정</StatusBadge>}
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-500">
        {i.notes || "-"}
        {clickable && <span className="ml-2 text-[10px] text-blue-600 font-semibold whitespace-nowrap">클릭해서 부적합 상세</span>}
      </td>
      <td className="px-3 py-2.5 text-right pr-4" onClick={(e) => e.stopPropagation()}>
        {!isLive && (
          <button
            disabled={!dirty || saving}
            onClick={async () => { setSaving(true); await onSaveDueDate(i, date); setSaving(false); }}
            className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-3 py-1.5"
          >
            저장
          </button>
        )}
      </td>
    </tr>
  );
}

export default function InspectionsAdmin({ data, setData }) {
  const { sites, units, inspections } = data;
  const [view, setView] = useState("dueSoon");
  const [search, setSearch] = useState("");
  const [failTarget, setFailTarget] = useState(null);

  // 검사유효기간은 units의 DB 캐시를 쓴다 (전 호기 실시간 API 호출 금지 — 트래픽 한도).
  const liveInspections = unitsToInspections(units, sites);
  const liveSiteIds = new Set(liveInspections.map((i) => i.siteId));
  const combined = [...liveInspections, ...inspections.filter((i) => !liveSiteIds.has(i.siteId))];

  const withUnitLabel = combined.map((i) => {
    const u = units.find((x) => x.id === i.unitId);
    return { ...i, unitLabel: u?.unitNo ?? i.elevatorNo ?? "-", daysLeft: daysLeftOf(i.dueDate, TODAY_STR) };
  });

  // 도래현장: 검사유효기한 기준 과거 60일(연체) ~ 미래 60일
  const dueSoon = withUnitLabel.filter((i) => i.daysLeft >= -60 && i.daysLeft <= 60);
  const flagged = withUnitLabel.filter((i) => i.result === "conditional" || i.result === "fail");

  const base = view === "dueSoon" ? dueSoon : view === "flagged" ? flagged : withUnitLabel;
  const rows = base
    .filter((i) => !search || (i.siteName ?? "").includes(search))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  async function saveDueDate(i, newDate) {
    const { error } = await supabase.from("inspections").update({ due_date: newDate || null }).eq("id", i.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      inspections: prev.inspections.map((x) => (x.id === i.id ? { ...x, dueDate: newDate } : x)),
    }));
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-1">검사관리</h1>
      <p className="text-xs text-slate-500 mb-4">
        승강기고유번호가 등록된 현장은 국가승강기정보센터 실시간 데이터, 나머지는 수기입력 이력입니다. 수기입력 건은 기한을 직접 수정할 수 있습니다.
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

      <AdminTable head={["현장 · 호기", "종류", "검사기관", "기한(수기입력 수정 가능)", "D-day", "결과", "비고", ""]}>
        {rows.map((i) => {
          const isLive = i.id?.startsWith("gov-");
          const clickable = isLive && (i.result === "conditional" || i.result === "fail");
          return (
            <InspectionRow key={i.id} i={i} onSaveDueDate={saveDueDate} onOpenFail={setFailTarget} clickable={clickable} />
          );
        })}
      </AdminTable>
      {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-10">해당 조건의 검사 이력이 없습니다</p>}

      {failTarget && <InspectionFailDetailSheet inspection={failTarget} onClose={() => setFailTarget(null)} />}
    </div>
  );
}
