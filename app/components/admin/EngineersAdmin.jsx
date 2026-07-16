"use client";

// 기사 관리 — 프로필(연락처·담당지역) 편집 + 배정 현장·업무량 한눈에.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge, AdminTable, inputCls } from "@/app/components/admin/adminShared";

function EngineerRow({ p, stats, onSave }) {
  const [form, setForm] = useState({ phone: p.phone ?? "", email: p.email ?? "", region: p.region ?? "" });
  const dirty = form.phone !== (p.phone ?? "") || form.email !== (p.email ?? "") || form.region !== (p.region ?? "");
  return (
    <tr className="border-b border-slate-50">
      <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{p.name}</td>
      <td className="px-3 py-2.5 w-36"><input className={inputCls} placeholder="연락처" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></td>
      <td className="px-3 py-2.5 w-48"><input className={inputCls} placeholder="이메일" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></td>
      <td className="px-3 py-2.5 w-28"><input className={inputCls} placeholder="담당지역" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></td>
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
  const engineers = profiles.filter((p) => p.role === "engineer");

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
    }).eq("id", p.id);
    setData((prev) => ({
      ...prev,
      profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, ...{ phone: form.phone || null, email: form.email || null, region: form.region || null } } : x)),
    }));
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-1">기사 관리</h1>
      <p className="text-xs text-slate-500 mb-4">
        계정 연결 = 로그인 계정(Supabase Auth)과 연결된 프로필. Phase 2 로그인 활성화 때 계정 없는 기사는 가입만 하면 자동 연결됩니다.
      </p>
      <AdminTable head={["이름", "연락처", "이메일", "담당지역", "담당 현장", "진행 고장", "미완료 할일", "로그인", ""]}>
        {engineers.map((p) => (
          <EngineerRow key={p.id} p={p} stats={statsOf(p)} onSave={save} />
        ))}
      </AdminTable>
    </div>
  );
}
