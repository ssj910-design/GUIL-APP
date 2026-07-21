"use client";

// 검사관리 — 전체 현장의 정기검사 현황을 관제한다.
// 검사예정일(기한)은 국가승강기정보센터 API 유효기간이 아니라 이 화면에서 관리자가 수기입력하는 값(inspections.due_date)이 기준이다.
// 실시간 연동 현장(승강기고유번호 등록됨)도 여기서 검사예정일을 수기로 입력·수정할 수 있다 — API 유효기간은 참고용으로만 함께 보여준다.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { unitsToInspections } from "@/lib/utils";
import { mapInspection } from "@/lib/mappers";
import { Badge, DDay, inputCls as mobileInputCls } from "@/app/components/ui";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { StatusBadge, AdminTable, FilterPills, inputCls, Modal } from "@/app/components/admin/adminShared";

function daysLeftOf(dueDate, today) {
  return Math.ceil((new Date(dueDate) - new Date(today)) / 86400000);
}

// 검사예정일(수기입력)을 인라인으로 수정할 수 있는 행. 실시간 연동 현장이어도 수기입력 기한은 항상 편집 가능하다.
function InspectionRow({ i, onSaveDueDate, onOpenFail, clickable }) {
  const [date, setDate] = useState(i.dueDate ?? "");
  const [time, setTime] = useState(i.dueTime ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = date !== (i.dueDate ?? "") || time !== (i.dueTime ?? "");
  const isFlagged = i.result === "conditional" || i.result === "fail";
  // 조건부/불합격의 보완기한은 관리자 수기입력(다음 검사 예정일)이 아니라
  // 국가승강기정보센터 검사 유효기간(유효기간종료일)을 기준으로 본다.
  const ddayDate = isFlagged ? (i.apiDueDate || i.dueDate) : i.dueDate;

  return (
    <tr className={`border-b border-slate-50 ${clickable ? "cursor-pointer hover:bg-slate-50" : ""}`} onClick={clickable ? () => onOpenFail(i) : undefined}>
      <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{i.siteName} · {i.unitLabel}</td>
      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{i.type}</td>
      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{i.org}</td>
      <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          <input type="date" className={mobileInputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" className={mobileInputCls} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        {i.apiDueDate && (
          <p className="text-[9px] text-emerald-600 mt-0.5">
            {isFlagged ? "보완기한(검사 유효기간) " : "API 유효기간 참고 "}~{i.apiDueDate}
          </p>
        )}
      </td>
      <td className="px-3 py-2.5">
        {ddayDate ? <DDay dueDate={ddayDate} /> : <span className="text-[10px] text-slate-400">미입력</span>}
      </td>
      <td className="px-3 py-2.5">
        {i.result ? <Badge result={i.result} /> : <StatusBadge tone="slate">예정</StatusBadge>}
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-500">
        {i.notes || "-"}
        {clickable && <span className="ml-2 text-[10px] text-blue-600 font-semibold whitespace-nowrap">클릭해서 부적합 상세</span>}
      </td>
      <td className="px-3 py-2.5 text-right pr-4" onClick={(e) => e.stopPropagation()}>
        <button
          disabled={!dirty || saving}
          onClick={async () => { setSaving(true); await onSaveDueDate(i, date, time); setSaving(false); }}
          className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-3 py-1.5"
        >
          저장
        </button>
      </td>
    </tr>
  );
}

// 조건부·불합격 전용 행 — 수기입력 기한/검사기관/결과 열 없이 보완기한과 부적합 내역만 본다.
function FlaggedRow({ i, site, onOpenFail, clickable }) {
  return (
    <tr className={`border-b border-slate-50 ${clickable ? "cursor-pointer hover:bg-slate-50" : ""}`} onClick={clickable ? () => onOpenFail(i) : undefined}>
      <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{i.siteName} · {i.unitLabel}</td>
      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{site?.assignedEngineer || "미배정"}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {i.result === "fail" ? (
          <span className="text-red-600 font-bold">불합격</span>
        ) : (
          <span className="text-slate-700">{i.apiDueDate || i.dueDate || "-"}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-blue-600 font-semibold">
        {clickable ? "클릭해서 부적합 상세" : "-"}
      </td>
    </tr>
  );
}

export default function InspectionsAdmin({ data, setData }) {
  const { sites, units, inspections } = data;
  const [view, setView] = useState("all");
  const [search, setSearch] = useState("");
  const [failTarget, setFailTarget] = useState(null);

  // 검사유효기간(API)은 units의 DB 캐시를 쓴다 (전 호기 실시간 API 호출 금지 — 트래픽 한도).
  // 실시간 연동 현장이라도 "기한"으로 쓰는 값은 수기입력(inspections.due_date)이다 — API 값은 참고용(apiDueDate)으로만 붙인다.
  const liveInspections = unitsToInspections(units, sites);
  const liveSiteIds = new Set(liveInspections.map((i) => i.siteId));
  const manualByUnitId = new Map(inspections.filter((i) => i.unitId).map((i) => [i.unitId, i]));
  const manualBySiteId = new Map(inspections.filter((i) => !i.unitId).map((i) => [i.siteId, i]));

  const combined = [
    ...liveInspections.map((li) => {
      const manual = manualByUnitId.get(li.unitId) ?? manualBySiteId.get(li.siteId) ?? null;
      return {
        ...li,
        isLive: true,
        manualId: manual?.id ?? null,
        apiDueDate: li.dueDate,
        dueDate: manual?.dueDate ?? "",
        dueTime: manual?.dueTime ?? "",
        notes: manual?.notes ?? "",
      };
    }),
    ...inspections
      .filter((i) => !liveSiteIds.has(i.siteId))
      .map((i) => ({ ...i, isLive: false, manualId: i.id, apiDueDate: null })),
  ];

  const withUnitLabel = combined.map((i) => {
    const u = units.find((x) => x.id === i.unitId);
    return { ...i, unitLabel: u?.unitNo ?? i.elevatorNo ?? "-", daysLeft: daysLeftOf(i.dueDate, TODAY_STR) };
  });

  const flagged = withUnitLabel.filter((i) => i.result === "conditional" || i.result === "fail");

  const base = view === "flagged" ? flagged : withUnitLabel;
  const rows = base
    .filter((i) => !search || (i.siteName ?? "").includes(search))
    .sort((a, b) => (a.dueDate ? a.daysLeft : Infinity) - (b.dueDate ? b.daysLeft : Infinity));

  // manualId가 있으면 기존 수기입력 행을 갱신하고, 없으면(실시간 연동 현장에 수기입력 기한이 처음 등록되는 경우) 새로 만든다.
  async function saveDueDate(i, newDate, newTime) {
    if (i.manualId) {
      const { error } = await supabase
        .from("inspections")
        .update({ due_date: newDate || null, due_time: newTime || null })
        .eq("id", i.manualId);
      if (error) { alert("저장 실패: " + error.message); return; }
      setData((prev) => ({
        ...prev,
        inspections: prev.inspections.map((x) => (x.id === i.manualId ? { ...x, dueDate: newDate, dueTime: newTime } : x)),
      }));
      return;
    }
    const { data: inserted, error } = await supabase
      .from("inspections")
      .insert({
        site_id: i.siteId,
        unit_id: i.unitId ?? null,
        site_name: i.siteName,
        elevator_no: i.elevatorNo,
        type: i.type,
        org: i.org,
        due_date: newDate || null,
        due_time: newTime || null,
      })
      .select()
      .single();
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, inspections: [...prev.inspections, mapInspection(inserted)] }));
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-1">검사관리</h1>
      <p className="text-xs text-slate-500 mb-4">
        검사예정일(기한)은 이 화면에서 수기입력한 값이 기준입니다. 승강기고유번호가 등록된 실시간 연동 현장은 API 유효기간을 참고로 함께 보여주되, 기한은 별도로 입력해야 도래현장·금일검사현장에 반영됩니다.
      </p>
      <div className="flex items-center justify-between gap-3 mb-3">
        <FilterPills
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "전체", count: withUnitLabel.length },
            { value: "flagged", label: "조건부·불합격", count: flagged.length },
          ]}
        />
        <input className={`${inputCls} max-w-56`} placeholder="현장명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <AdminTable head={view === "flagged" ? ["현장 · 호기", "담당자", "보완기한", "부적합 내역"] : ["현장 · 호기", "종류", "검사기관", "기한(수기입력)", "D-day", "결과", "비고", ""]}>
        {rows.map((i) => {
          const clickable = i.isLive && (i.result === "conditional" || i.result === "fail");
          return view === "flagged" ? (
            <FlaggedRow key={i.id} i={i} site={sites.find((s) => s.id === i.siteId)} onOpenFail={setFailTarget} clickable={clickable} />
          ) : (
            <InspectionRow key={i.id} i={i} onSaveDueDate={saveDueDate} onOpenFail={setFailTarget} clickable={clickable} />
          );
        })}
      </AdminTable>
      {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-10">해당 조건의 검사 이력이 없습니다</p>}

      {failTarget && <InspectionFailDetailSheet inspection={failTarget} onClose={() => setFailTarget(null)} Container={Modal} />}
    </div>
  );
}
