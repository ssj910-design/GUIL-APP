"use client";

// 기사 관리 — 프로필(연락처·담당지역) 편집 + 배정 현장·업무량 한눈에.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge, AdminTable, inputCls } from "@/app/components/admin/adminShared";
import ImportEngineers from "@/app/components/admin/ImportEngineers";

function EngineerRow({ p, stats, onSave, onToggleDuty, onDelete }) {
  const [form, setForm] = useState({ phone: p.phone ?? "", region: p.region ?? "", minwonId: p.minwon_id ?? "", dutyOrder: p.duty_order ?? "" });
  const dirty = form.phone !== (p.phone ?? "") || form.region !== (p.region ?? "") || form.minwonId !== (p.minwon_id ?? "") || String(form.dutyOrder) !== String(p.duty_order ?? "");
  return (
    <tr className="border-b border-slate-50">
      <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{p.name}</td>
      <td className="px-3 py-2.5 w-36"><input className={inputCls} placeholder="연락처" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></td>
      <td className="px-3 py-2.5 w-28"><input className={inputCls} placeholder="담당지역" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></td>
      <td className="px-3 py-2.5 w-32"><input className={inputCls} placeholder="민원24 점검자 ID" value={form.minwonId} onChange={(e) => setForm({ ...form, minwonId: e.target.value })} /></td>
      <td className="px-3 py-2.5 w-32 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <input type="checkbox" checked={p.duty_enabled !== false} onChange={(e) => onToggleDuty(p, e.target.checked)}
            className="w-4 h-4 accent-blue-700" title="당직·숙직 대상" />
          <input className={`${inputCls} w-14`} inputMode="numeric" placeholder="순번"
            disabled={p.duty_enabled === false} value={form.dutyOrder}
            onChange={(e) => setForm({ ...form, dutyOrder: e.target.value.replace(/[^0-9]/g, "") })} />
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{p.member_type ?? "-"}</td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{p.tel ?? "-"}</td>
      <td className="px-3 py-2.5 text-center">
        {p.join_status ? <StatusBadge tone={p.join_status === "승인" ? "green" : "slate"}>{p.join_status}</StatusBadge> : "-"}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-400 text-[11px]">
        {p.joined_at ?? "-"}<br />{p.approved_at ?? "-"}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 text-[11px]">{p.edu_cert_no ?? "-"}</td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap text-slate-500">
        {stats.sites} / {stats.activeFailures} / {stats.openTodos}
      </td>
      <td className="px-3 py-2.5">
        {p.auth_user_id ? <StatusBadge tone="green">계정 연결됨</StatusBadge> : <StatusBadge tone="slate">계정 없음</StatusBadge>}
      </td>
      <td className="px-3 py-2.5 text-right pr-4 whitespace-nowrap">
        <button disabled={!dirty} onClick={() => onSave(p, form)}
          className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-3 py-1.5">
          저장
        </button>
        <button onClick={() => onDelete(p)}
          className="ml-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
          삭제
        </button>
      </td>
    </tr>
  );
}

export default function EngineersAdmin({ data, setData }) {
  const { profiles, sites, failures, todos } = data;
  // 순번(당직·숙직 근무표 배정 순서)대로 정렬 — 순번 없는 사람은 뒤로
  const engineers = profiles.filter((p) => p.role === "engineer" && p.is_active !== false)
    .slice().sort((a, b) => (a.duty_order ?? 999) - (b.duty_order ?? 999));
  const [newName, setNewName] = useState("");
  const [newOrder, setNewOrder] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

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

  // 삭제는 실제 행 제거가 아니라 비활성 처리 — 고장·할일·자체점검이 이 프로필을 참조하고 있어
  // 진짜 지우면 과거 기록의 담당자가 사라진다.
  async function remove(p) {
    if (!confirm(`${p.name} 님을 인사 목록에서 제외할까요?\n\n과거 기록(고장·할일·점검)의 담당자 표기는 그대로 남고, 목록과 배정 대상에서만 빠집니다.`)) return;
    const { error } = await supabase.from("profiles").update({ is_active: false, duty_enabled: false }).eq("id", p.id);
    if (error) { alert("제외 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, is_active: false, duty_enabled: false } : x)) }));
  }

  async function toggleDuty(p, on) {
    await supabase.from("profiles").update({ duty_enabled: on }).eq("id", p.id);
    setData((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, duty_enabled: on } : x)) }));
  }

  async function save(p, form) {
    await supabase.from("profiles").update({
      phone: form.phone || null, region: form.region || null,
      minwon_id: form.minwonId || null, duty_order: form.dutyOrder === "" ? null : Number(form.dutyOrder),
    }).eq("id", p.id);
    setData((prev) => ({
      ...prev,
      profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, phone: form.phone || null, region: form.region || null, minwon_id: form.minwonId || null, duty_order: form.dutyOrder === "" ? null : Number(form.dutyOrder) } : x)),
    }));
  }

  return (
    <div>
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
        <button onClick={() => setImporting(true)}
          className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          공단 회원목록 엑셀로 등록
        </button>
        <p className="text-[11px] text-slate-400 ml-auto max-w-xs text-right">순번 = 당직·숙직 근무표 자동 배정 순서. 당직을 서는 사람만 채우세요.</p>
      </div>
      {importing && <ImportEngineers data={data} setData={setData} onClose={() => setImporting(false)} />}
      <AdminTable minWidth="82rem" head={["이름", "휴대폰", "담당지역", "아이디(민원24)", "당직 / 순번", "회원구분", "연락처", "가입상태", "가입일/승인일", "교육수료번호", "현장/고장/할일", "로그인", ""]}>
        {engineers.map((p) => (
          <EngineerRow key={p.id} p={p} stats={statsOf(p)} onSave={save} onToggleDuty={toggleDuty} onDelete={remove} />
        ))}
      </AdminTable>
    </div>
  );
}
