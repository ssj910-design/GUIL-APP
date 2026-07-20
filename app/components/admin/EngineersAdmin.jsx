"use client";

// 기사 관리 — 프로필(연락처·담당지역) 편집 + 배정 현장·업무량 한눈에.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge, AdminTable, inputCls } from "@/app/components/admin/adminShared";

function EngineerRow({ p, stats, onSave }) {
  const [form, setForm] = useState({ phone: p.phone ?? "", email: p.email ?? "", region: p.region ?? "", minwonId: p.minwon_id ?? "", dutyOrder: p.duty_order ?? "" });
  const dirty = form.phone !== (p.phone ?? "") || form.email !== (p.email ?? "") || form.region !== (p.region ?? "") || form.minwonId !== (p.minwon_id ?? "") || String(form.dutyOrder) !== String(p.duty_order ?? "");
  return (
    <tr className="border-b border-slate-50">
      <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{p.name}</td>
      <td className="px-3 py-2.5 w-36"><input className={inputCls} placeholder="연락처" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></td>
      <td className="px-3 py-2.5 w-48"><input className={inputCls} placeholder="이메일" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></td>
      <td className="px-3 py-2.5 w-28"><input className={inputCls} placeholder="담당지역" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></td>
      <td className="px-3 py-2.5 w-32"><input className={inputCls} placeholder="민원24 점검자 ID" value={form.minwonId} onChange={(e) => setForm({ ...form, minwonId: e.target.value })} /></td>
      <td className="px-3 py-2.5 w-20">
        <input className={inputCls} inputMode="numeric" placeholder="순번" value={form.dutyOrder}
          onChange={(e) => setForm({ ...form, dutyOrder: e.target.value.replace(/[^0-9]/g, "") })} />
      </td>
      <td className="px-3 py-2.5 text-center">{stats.sites}</td>
      <td className="px-3 py-2.5 text-center">{stats.activeFailures}</td>
      <td className="px-3 py-2.5 text-center">{stats.openTodos}</td>
      <td className="px-3 py-2.5">
        {p.auth_user_id ? <StatusBadge tone="green">계정 연결됨</StatusBadge> : <StatusBadge tone="slate">계정 없음</StatusBadge>}
      </td>
      <td className="px-3 py-2.5 text-right pr-4">
        <button disabled={!dirty} onClick={() => onSave(p, form)}
          className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-3 py-1.5">
          저장
        </button>
      </td>
    </tr>
  );
}

export default function EngineersAdmin({ data, setData }) {
  const { profiles, sites, failures, todos } = data;
  // 순번(당직·숙직 근무표 배정 순서)대로 정렬 — 순번 없는 사람은 뒤로
  const engineers = profiles.filter((p) => p.role === "engineer")
    .slice().sort((a, b) => (a.duty_order ?? 999) - (b.duty_order ?? 999));
  const [newName, setNewName] = useState("");
  const [newOrder, setNewOrder] = useState("");
  const [adding, setAdding] = useState(false);

  async function addEngineer() {
    const name = newName.trim();
    if (!name) return;
    if (profiles.some((p) => p.name === name)) { alert("같은 이름의 직원이 이미 있습니다."); return; }
    setAdding(true);
    const { data, error } = await supabase.from("profiles")
      .insert({ name, role: "engineer", duty_order: newOrder === "" ? null : Number(newOrder) }).select();
    setAdding(false);
    if (error) { alert("등록 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, profiles: [...prev.profiles, data[0]] }));
    setNewName("");
    setNewOrder("");
  }

  function statsOf(p) {
    return {
      sites: sites.filter((s) => s.assignedEngineer === p.name).length,
      activeFailures: failures.filter((f) => f.status !== "완료" && (f.assigneeId === p.id || f.assignee === p.name)).length,
      openTodos: todos.filter((t) => !t.done && (t.assigneeId === p.id || t.assignee === p.name)).length,
    };
  }

  async function save(p, form) {
    await supabase.from("profiles").update({
      phone: form.phone || null, email: form.email || null, region: form.region || null,
      minwon_id: form.minwonId || null, duty_order: form.dutyOrder === "" ? null : Number(form.dutyOrder),
    }).eq("id", p.id);
    setData((prev) => ({
      ...prev,
      profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, phone: form.phone || null, email: form.email || null, region: form.region || null, minwon_id: form.minwonId || null, duty_order: form.dutyOrder === "" ? null : Number(form.dutyOrder) } : x)),
    }));
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-1">인사관리</h1>
      <p className="text-xs text-slate-500 mb-4">
        계정 연결 = 로그인 계정과 연결된 프로필 (Phase 2에서 가입 시 자동 연결). 민원24 ID = 공단에 등록된 점검자 ID — 자체점검 자동 보고(SELCHK_USID)에 사용됩니다.
      </p>
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex items-end gap-2 flex-wrap">
        <div>
          <p className="text-[11px] font-bold text-slate-500 mb-1">기사 이름</p>
          <input className={inputCls} placeholder="예: 이승준" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="w-24">
          <p className="text-[11px] font-bold text-slate-500 mb-1">순번</p>
          <input className={inputCls} inputMode="numeric" placeholder="1" value={newOrder}
            onChange={(e) => setNewOrder(e.target.value.replace(/[^0-9]/g, ""))} />
        </div>
        <button onClick={addEngineer} disabled={!newName.trim() || adding}
          className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-4 py-2">
          {adding ? "등록 중…" : "기사 추가"}
        </button>
        <p className="text-[11px] text-slate-400 ml-auto">순번 = 당직·숙직 근무표 자동 배정 순서 (근무표의 이름 옆 괄호 숫자)</p>
      </div>
      <AdminTable head={["이름", "연락처", "이메일", "담당지역", "민원24 ID", "순번", "담당 현장", "진행 고장", "미완료 할일", "로그인", ""]}>
        {engineers.map((p) => (
          <EngineerRow key={p.id} p={p} stats={statsOf(p)} onSave={save} />
        ))}
      </AdminTable>
    </div>
  );
}
