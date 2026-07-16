"use client";

// 할일 관리 — 전체 할일 관제 + 관리자 권한 완료/취소 토글.
// 완료 규칙(DESIGN-v2 §7-2): 자재·견적 할일의 정상 완료 경로는 비용청구지만,
// 관리자는 예외적으로 임의 토글 가능(모바일 관리자 모드와 동일 권한).
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { locOf, personOf, StatusBadge, AdminTable, FilterPills } from "@/app/components/admin/adminShared";

const SOURCE_LABEL = { material: "자재", quote: "견적", manual: "수동" };

export default function TodosAdmin({ data, setData }) {
  const { todos } = data;
  const [view, setView] = useState("open");
  const rows = todos.filter((t) => (view === "open" ? !t.done : true));

  async function toggle(t) {
    await supabase.from("todos").update({ done: !t.done }).eq("id", t.id);
    setData((prev) => ({ ...prev, todos: prev.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }));
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-4">할일 관리</h1>
      <div className="mb-3">
        <FilterPills
          value={view}
          onChange={setView}
          options={[
            { value: "open", label: "미완료", count: todos.filter((t) => !t.done).length },
            { value: "all", label: "전체", count: todos.length },
          ]}
        />
      </div>
      <AdminTable head={["구분", "할일", "현장 · 호기", "담당자", "배정일", "기한", "상태", ""]}>
        {rows.map((t) => (
          <tr key={t.id} className={`border-b border-slate-50 ${t.done ? "opacity-50" : ""}`}>
            <td className="pl-5 pr-3 py-2.5"><StatusBadge tone={t.source === "manual" ? "slate" : "blue"}>{SOURCE_LABEL[t.source] ?? t.source}</StatusBadge></td>
            <td className="px-3 py-2.5 font-semibold">{t.title}</td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{locOf(data, t.unitId, t.siteName, t.elevatorNo)}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, t.assigneeId, t.assignee)}</td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{t.assignedDate}</td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{t.dueDate ?? "-"}</td>
            <td className="px-3 py-2.5">{t.done ? <StatusBadge tone="green">완료</StatusBadge> : <StatusBadge tone="amber">진행</StatusBadge>}</td>
            <td className="px-3 py-2.5 text-right pr-4">
              <button onClick={() => toggle(t)} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5">
                {t.done ? "완료 취소" : "완료 처리"}
              </button>
            </td>
          </tr>
        ))}
      </AdminTable>
      <p className="text-[10px] text-slate-400 mt-2">* 자재·견적 할일의 정상 완료 경로는 기사 비용청구입니다. 여기 버튼은 관리자 예외 처리용.</p>
    </div>
  );
}
