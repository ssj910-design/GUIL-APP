"use client";

// 고장관리 — 전체 고장 테이블 + 기사 배정(듀얼라이트) + 고장접수(신규 등록).
// 출동/도착/처리결과 입력은 현장 기사의 모바일 앱 몫이므로 여기서는 하지 않는다.
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR, FAULT_TYPES } from "@/lib/constants";
import { locOf, personOf, StatusBadge, AdminTable, FilterPills, Modal, inputCls } from "@/app/components/admin/adminShared";
import { FailureDetailContent } from "@/app/components/admin/Dashboard";

function RegisterFailureModal({ data, onClose, onCreate }) {
  const { sites, units, profiles } = data;
  const engineers = profiles.filter((p) => p.role === "engineer");
  const [form, setForm] = useState({
    siteId: "", unitIds: [], faultType: "", detail: "", details: {}, assignee: "", reporterPhone: "", notFault: false,
  });
  const [saving, setSaving] = useState(false);
  const siteUnits = units.filter((u) => u.siteId === form.siteId);
  const detailFilled = form.unitIds.length > 1
    ? form.unitIds.every((id) => (form.details[id] ?? "").trim().length > 0)
    : form.detail.trim().length > 0;
  const valid = form.siteId && form.unitIds.length > 0 && form.faultType && detailFilled && form.reporterPhone.trim().length > 0;

  function toggleUnit(id) {
    setForm((f) => ({ ...f, unitIds: f.unitIds.includes(id) ? f.unitIds.filter((x) => x !== id) : [...f.unitIds, id] }));
  }

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="고장접수" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">현장 *</p>
          <select className={inputCls} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value, unitIds: [] })}>
            <option value="">현장을 선택하세요</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {form.siteId && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">
              호기 * {form.unitIds.length > 1 && <span className="text-blue-600 font-semibold">(선택 {form.unitIds.length}대 — 호기별로 각각 접수됩니다)</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {siteUnits.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUnit(u.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${
                    form.unitIds.includes(u.id) ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200 bg-white"
                  }`}
                >
                  {u.unitNo}
                </button>
              ))}
              {siteUnits.length === 0 && <p className="text-xs text-slate-400">등록된 호기가 없습니다</p>}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">고장구분 *</p>
          <select className={inputCls} value={form.faultType} onChange={(e) => setForm({ ...form, faultType: e.target.value })}>
            <option value="">선택하세요</option>
            {FAULT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {form.unitIds.length > 1 ? (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">호기별 상세증상 *</p>
            <div className="space-y-2">
              {form.unitIds.map((id) => {
                const u = siteUnits.find((x) => x.id === id);
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-sm font-bold text-slate-600">{u?.unitNo}</span>
                    <input
                      className={inputCls}
                      placeholder="이 호기의 증상"
                      value={form.details[id] ?? ""}
                      onChange={(e) => setForm({ ...form, details: { ...form.details, [id]: e.target.value } })}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">고장상세내역 *</p>
            <input className={inputCls} placeholder="예: 3층에서 문이 안 닫힘" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">신고자 연락처 *</p>
            <input className={inputCls} placeholder="010-0000-0000" value={form.reporterPhone} onChange={(e) => setForm({ ...form, reporterPhone: e.target.value })} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">배정 기사</p>
            <select className={inputCls} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
              <option value="">미배정</option>
              {engineers.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
          <span className="text-sm font-bold text-slate-600">고장아님(다발아님)으로 접수</span>
          <button type="button" onClick={() => setForm({ ...form, notFault: !form.notFault })}>
            <div className={`w-9 h-5 rounded-full flex items-center px-0.5 ${form.notFault ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start"}`}>
              <div className="w-4 h-4 rounded-full bg-white" />
            </div>
          </button>
        </div>
        <div className="flex justify-end pt-2">
          <button disabled={!valid || saving} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
            {saving ? "접수 중..." : "접수하기"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function FailuresAdmin({ data, setData }) {
  const { failures, profiles, units, sites } = data;
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [registering, setRegistering] = useState(false);
  const engineers = profiles.filter((p) => p.role === "engineer");

  const rows = failures.filter((f) =>
    (status === "all" || f.status === status) &&
    (!search || (f.siteName ?? "").includes(search) || (f.errorCode ?? "").includes(search))
  );

  async function assign(f, name) {
    const p = profiles.find((x) => x.name === name);
    await supabase.from("failures")
      .update({ assignee: name || null, assignee_id: p?.id ?? null })
      .eq("id", f.id);
    setData((prev) => ({
      ...prev,
      failures: prev.failures.map((x) => (x.id === f.id ? { ...x, assignee: name || null, assigneeId: p?.id ?? null } : x)),
    }));
  }

  async function createFailure(form) {
    const site = sites.find((s) => s.id === form.siteId);
    if (!site) return;
    const stamp = Date.now();
    const assigneeProfile = profiles.find((p) => p.name === form.assignee);
    const detailOf = (id) => (form.unitIds.length > 1 ? (form.details[id] ?? "").trim() : form.detail.trim());
    const reportedAt = TODAY_STR.slice(5).replace("-", "/") + " " + new Date().toTimeString().slice(0, 5);
    const rows = form.unitIds.map((unitId, i) => {
      const u = units.find((x) => x.id === unitId);
      const detail = detailOf(unitId);
      return {
        id: "f" + (stamp + i),
        siteId: site.id, siteName: site.name, elevatorNo: u?.unitNo ?? null, unitId,
        errorCode: form.faultType + (detail ? ` (${detail})` : ""),
        status: "미처리", reportedAt,
        assignee: form.assignee || null, assigneeId: assigneeProfile?.id ?? null,
        notFault: form.notFault, reporterPhone: form.reporterPhone.trim(),
      };
    });
    const { error } = await supabase.from("failures").insert(rows.map((f) => ({
      id: f.id, site_id: f.siteId, site_name: f.siteName, elevator_no: f.elevatorNo, unit_id: f.unitId,
      error_code: f.errorCode, status: f.status, reported_at: f.reportedAt,
      assignee: f.assignee, assignee_id: f.assigneeId, not_fault: f.notFault, reporter_phone: f.reporterPhone,
    })));
    if (error) { alert("접수 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      failures: [...rows.map((f) => ({ ...f, createdAt: new Date().toISOString() })), ...prev.failures],
    }));
  }

  const count = (s) => failures.filter((f) => f.status === s).length;

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-4">고장관리</h1>
      <div className="flex items-center justify-between gap-3 mb-3">
        <FilterPills
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "전체", count: failures.length },
            { value: "미처리", label: "미처리", count: count("미처리") },
            { value: "진행중", label: "진행중", count: count("진행중") },
            { value: "완료", label: "완료", count: count("완료") },
          ]}
        />
        <div className="flex items-center gap-2">
          <input className={`${inputCls} max-w-56`} placeholder="현장·증상 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button onClick={() => setRegistering(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
            <Plus size={15} /> 고장접수
          </button>
        </div>
      </div>

      <AdminTable head={["접수", "현장 · 호기", "증상", "처리내용", "신고자", "담당 기사", "출동/도착", "상태"]}>
        {rows.map((f) => {
          const tone = f.status === "완료" ? "green" : f.status === "진행중" ? "amber" : "red";
          return (
            <tr key={f.id} className="border-b border-slate-50 align-middle cursor-pointer hover:bg-slate-50" onClick={() => setDetail(f)}>
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{f.reportedAt}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, f.unitId, f.siteName, f.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{f.errorCode}{f.notFault ? " (고장아님)" : ""}</td>
              <td className="px-3 py-2.5 text-slate-600">{f.processContent || "-"}</td>
              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{f.reporterPhone ?? "-"}</td>
              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                <select
                  className={`${inputCls} min-w-28`}
                  value={personOf(data, f.assigneeId, f.assignee) === "-" ? "" : personOf(data, f.assigneeId, f.assignee)}
                  onChange={(e) => assign(f, e.target.value)}
                  disabled={f.status === "완료"}
                >
                  <option value="">미배정</option>
                  {engineers.map((p) => <option key={p.id}>{p.name}</option>)}
                </select>
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {f.dispatchedAt ? `출동 ${f.dispatchedAt}` : "-"}{f.arrivalTime ? ` · 도착 ${f.arrivalTime}` : ""}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge tone={tone}>{f.escalation ? `${f.status}·${f.escalation}` : f.status}</StatusBadge>
              </td>
            </tr>
          );
        })}
      </AdminTable>
      <p className="text-[10px] text-slate-400 mt-2">* 출동·도착·처리결과 입력은 기사 모바일 앱에서 진행됩니다. 여기서는 배정만 변경할 수 있습니다.</p>

      {detail && (
        <Modal title="고장상세보기" onClose={() => setDetail(null)}>
          <FailureDetailContent f={detail} units={units} sites={sites} />
        </Modal>
      )}

      {registering && (
        <RegisterFailureModal data={data} onClose={() => setRegistering(false)} onCreate={createFailure} />
      )}
    </div>
  );
}
