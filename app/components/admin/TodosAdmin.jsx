"use client";

// 할 일 관리 — 전체 할일 관제 + 관리자 권한 완료/취소 토글 + 할 일 배정(생성).
// 완료 규칙(DESIGN-v2 §7-2): 자재·견적 할일의 정상 완료 경로는 비용청구지만,
// 관리자는 예외적으로 임의 토글 가능(모바일 관리자 모드와 동일 권한).
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { addDays } from "@/lib/utils";
import {
  locOf, personOf, StatusBadge, AdminTable, FilterPills,
  Modal, SortableTh, sortRows, inputCls, PhotoGrid,
} from "@/app/components/admin/adminShared";

const SOURCE_LABEL = { material: "자재", quote: "견적", manual: "수동" };

function TodoDetailModal({ t, data, onClose, onSave }) {
  const { sites, units, profiles } = data;
  const engineers = profiles.filter((p) => p.role === "engineer");
  const currentUnit = units.find((u) => u.id === t.unitId);
  const initialSiteId = currentUnit?.siteId ?? sites.find((s) => s.name === t.siteName)?.id ?? "";
  const [form, setForm] = useState({
    title: t.title ?? "",
    description: t.description ?? "",
    siteId: initialSiteId,
    unitId: t.unitId ?? "",
    assigneeId: t.assigneeId ?? "",
    assignedDate: t.assignedDate ?? "",
    dueDate: t.dueDate ?? "",
    done: t.done,
  });
  const [saving, setSaving] = useState(false);
  const siteUnits = units.filter((u) => u.siteId === form.siteId);

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave(t, form);
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="할 일 상세내역" onClose={onClose}>
      <div className="space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">구분</p>
          <p className="text-sm font-semibold text-slate-700">{SOURCE_LABEL[t.source] ?? t.source}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">할일 제목</p>
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">현장</p>
            <select className={inputCls} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value, unitId: "" })}>
              <option value="">현장 없음</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">호기</p>
            <select className={inputCls} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} disabled={!form.siteId}>
              <option value="">전체(현장 공통)</option>
              {siteUnits.map((u) => <option key={u.id} value={u.id}>{u.unitNo}</option>)}
            </select>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">내용</p>
          <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">담당자</p>
            <select className={inputCls} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">미배정</option>
              {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">상태</p>
            <select className={inputCls} value={form.done ? "done" : "open"} onChange={(e) => setForm({ ...form, done: e.target.value === "done" })}>
              <option value="open">진행</option>
              <option value="done">완료</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">배정일</p>
            <input className={inputCls} type="date" value={form.assignedDate} onChange={(e) => setForm({ ...form, assignedDate: e.target.value })} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기한</p>
            <input className={inputCls} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">지급된 자재 사진 ({t.photoUrls?.length ?? 0}장)</p>
        <PhotoGrid urls={t.photoUrls ?? []} />
      </div>
      <div className="flex justify-end mt-4">
        <button disabled={saving || !form.title.trim()} onClick={save} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
          저장
        </button>
      </div>
    </Modal>
  );
}

function AssignTodoModal({ data, onClose, onCreate }) {
  const { sites, units, profiles } = data;
  const engineers = profiles.filter((p) => p.role === "engineer");
  const [form, setForm] = useState({ siteId: "", unitId: "", title: "", description: "", assigneeId: "", dueDate: addDays(TODAY_STR, 7) });
  const siteUnits = units.filter((u) => u.siteId === form.siteId);
  const valid = form.siteId && form.title.trim() && form.assigneeId;

  async function submit() {
    if (!valid) return;
    await onCreate(form);
    onClose();
  }

  return (
    <Modal title="할 일 배정" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">현장</p>
          <select className={inputCls} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value, unitId: "" })}>
            <option value="">현장을 선택하세요</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">호기</p>
          <select className={inputCls} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} disabled={!form.siteId}>
            <option value="">전체(현장 공통)</option>
            {siteUnits.map((u) => <option key={u.id} value={u.id}>{u.unitNo}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">할일 제목</p>
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 비상통화장치 배터리 교체" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">내용</p>
          <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">담당자</p>
            <select className={inputCls} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">담당자를 선택하세요</option>
              {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기한</p>
            <input className={inputCls} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button disabled={!valid} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
            배정하기
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function TodosAdmin({ data, setData }) {
  const { todos, sites, units, profiles } = data;
  const [view, setView] = useState("open");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(null);
  const [detail, setDetail] = useState(null);
  const [assigning, setAssigning] = useState(false);

  const q = search.trim();
  const rows = todos
    .filter((t) => (view === "open" ? !t.done : true))
    .filter((t) => !q || (t.description ?? "").includes(q) || (t.title ?? "").includes(q) || locOf(data, t.unitId, t.siteName, t.elevatorNo).includes(q) || personOf(data, t.assigneeId, t.assignee).includes(q));

  const getVal = (t, key) => {
    switch (key) {
      case "source": return SOURCE_LABEL[t.source] ?? t.source ?? "";
      case "title": return t.title ?? "";
      case "loc": return locOf(data, t.unitId, t.siteName, t.elevatorNo);
      case "person": return personOf(data, t.assigneeId, t.assignee);
      case "assignedDate": return t.assignedDate ?? "";
      case "dueDate": return t.dueDate ?? "";
      case "done": return t.done ? 1 : 0;
      default: return "";
    }
  };
  const sortedRows = sortRows(rows, sort, getVal);

  async function saveTodoDetail(t, form) {
    const unit = units.find((u) => u.id === form.unitId);
    const site = sites.find((s) => s.id === form.siteId);
    const engineer = profiles.find((p) => p.id === form.assigneeId);
    const patch = {
      title: form.title.trim(), description: form.description || null,
      site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
      assignee: engineer?.name ?? null, assignee_id: form.assigneeId || null,
      assigned_date: form.assignedDate || null, due_date: form.dueDate || null, done: form.done,
    };
    const { error } = await supabase.from("todos").update(patch).eq("id", t.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      todos: prev.todos.map((x) => (x.id === t.id ? {
        ...x,
        title: patch.title, description: patch.description ?? "",
        siteName: patch.site_name, elevatorNo: patch.elevator_no, unitId: patch.unit_id,
        assignee: patch.assignee, assigneeId: patch.assignee_id,
        assignedDate: patch.assigned_date, dueDate: patch.due_date, done: patch.done,
      } : x)),
    }));
  }

  async function toggle(t) {
    await supabase.from("todos").update({ done: !t.done }).eq("id", t.id);
    setData((prev) => ({ ...prev, todos: prev.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }));
  }

  async function createTodo(form) {
    const unit = units.find((u) => u.id === form.unitId);
    const site = sites.find((s) => s.id === form.siteId);
    const engineer = profiles.find((p) => p.id === form.assigneeId);
    const id = "todo-manual-" + Date.now();
    const row = {
      id, source: "manual", title: form.title.trim(), description: form.description || null,
      site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
      assignee: engineer?.name ?? null, assignee_id: form.assigneeId || null,
      assigned_date: TODAY_STR, due_date: form.dueDate || null, done: false,
    };
    const { error } = await supabase.from("todos").insert(row);
    if (error) { alert("배정 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      todos: [{
        id, source: "manual", title: row.title, description: row.description ?? "",
        siteName: row.site_name, elevatorNo: row.elevator_no, unitId: row.unit_id,
        assignee: row.assignee, assigneeId: row.assignee_id,
        assignedDate: row.assigned_date, dueDate: row.due_date, done: false,
        photoCount: 0, photoUrls: [], part: null, materialRequestId: null, quoteRequestId: null,
      }, ...prev.todos],
    }));
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-4">할 일 관리</h1>
      <div className="flex items-center justify-between gap-3 mb-3">
        <FilterPills
          value={view}
          onChange={setView}
          options={[
            { value: "open", label: "미완료", count: todos.filter((t) => !t.done).length },
            { value: "all", label: "전체", count: todos.length },
          ]}
        />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-7 max-w-64`} placeholder="내용·현장·담당자 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setAssigning(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
            <Plus size={15} /> 할 일 배정
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <SortableTh label="구분" sortKey="source" sort={sort} setSort={setSort} className="pl-5" />
              <SortableTh label="할일" sortKey="title" sort={sort} setSort={setSort} />
              <SortableTh label="현장 · 호기" sortKey="loc" sort={sort} setSort={setSort} />
              <SortableTh label="담당자" sortKey="person" sort={sort} setSort={setSort} />
              <SortableTh label="배정일" sortKey="assignedDate" sort={sort} setSort={setSort} />
              <SortableTh label="기한" sortKey="dueDate" sort={sort} setSort={setSort} />
              <SortableTh label="상태" sortKey="done" sort={sort} setSort={setSort} />
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((t) => (
              <tr key={t.id} className={`border-b border-slate-50 ${t.done ? "opacity-50" : ""} cursor-pointer hover:bg-slate-50`} onClick={() => setDetail(t)}>
                <td className="pl-5 pr-3 py-2.5"><StatusBadge tone={t.source === "manual" ? "slate" : "blue"}>{SOURCE_LABEL[t.source] ?? t.source}</StatusBadge></td>
                <td className="px-3 py-2.5 font-semibold">{t.title}</td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{locOf(data, t.unitId, t.siteName, t.elevatorNo)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, t.assigneeId, t.assignee)}</td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{t.assignedDate}</td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{t.dueDate ?? "-"}</td>
                <td className="px-3 py-2.5">{t.done ? <StatusBadge tone="green">완료</StatusBadge> : <StatusBadge tone="amber">진행</StatusBadge>}</td>
                <td className="px-3 py-2.5 text-right pr-4">
                  <button onClick={(e) => { e.stopPropagation(); toggle(t); }} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5">
                    {t.done ? "완료 취소" : "완료 처리"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">* 자재·견적 할일의 정상 완료 경로는 기사 비용청구입니다. 완료 처리 버튼은 관리자 예외 처리용.</p>

      {detail && <TodoDetailModal t={detail} data={data} onClose={() => setDetail(null)} onSave={saveTodoDetail} />}
      {assigning && <AssignTodoModal data={data} onClose={() => setAssigning(false)} onCreate={createTodo} />}
    </div>
  );
}
