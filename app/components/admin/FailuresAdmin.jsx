"use client";

// 고장관리 — 전체 고장 테이블 + 기사 배정(듀얼라이트) + 고장접수(신규 등록).
// 출동/도착/처리결과 입력은 현장 기사의 모바일 앱 몫이므로 여기서는 하지 않는다.
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR, FAULT_TYPES } from "@/lib/constants";
import { formatPhone, sortEngineersByDistance } from "@/lib/utils";
import { locOf, personOf, StatusBadge, AdminTable, Modal, inputCls } from "@/app/components/admin/adminShared";
import { FailureDetailContent } from "@/app/components/admin/Dashboard";

// 대시보드 KPI 카드와 같은 스타일이되, 클릭하면 상태 필터로도 쓰인다.
function StatBox({ label, value, tone = "text-slate-900", active, onClick, sub }) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-xl border px-5 py-4 transition ${
        active ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>}
    </button>
  );
}

// 현장 검색·자동완성 — 드롭다운 대신 이름/주소로 찾아서 고른다.
function SiteAutocomplete({ sites, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = sites.find((s) => s.id === value);
  const filtered = sites.filter((s) => (s.name ?? "").includes(query.trim()) || (s.address ?? "").includes(query.trim()));

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className={`${inputCls} pl-8`}
          placeholder="현장명·주소 검색"
          value={open ? query : selected?.name ?? ""}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => { onChange(s.id); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
            >
              <span className="font-semibold text-slate-700">{s.name}</span>
              <span className="text-slate-400 text-xs ml-1.5">{s.address}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-3">검색 결과가 없습니다</p>}
        </div>
      )}
    </div>
  );
}

// 배정 기사 <select> 공통 옵션 — 현장과 가까운 순으로 정렬하고 거리를 함께 표시한다.
function EngineerOptions({ engineers, site }) {
  return sortEngineersByDistance(engineers, site).map(({ engineer: p, km }) => (
    <option key={p.id} value={p.name}>
      {p.name}{km != null ? ` (${km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`})` : ""}
    </option>
  ));
}

export function RegisterFailureModal({ data, onClose, onCreate }) {
  const { sites, units, profiles } = data;
  const engineers = profiles.filter((p) => p.role === "engineer");
  const [form, setForm] = useState({
    siteId: "", unitIds: [], faultType: "", detail: "", details: {}, assignee: "", reporterPhone: "", notFault: false,
  });
  const [saving, setSaving] = useState(false);
  const site = sites.find((s) => s.id === form.siteId);
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
          <SiteAutocomplete
            sites={sites}
            value={form.siteId}
            onChange={(id) => {
              // 배정 기사는 현장 담당 기사를 기본값으로 — 다른 사람으로 바꾸고 싶으면 직접 고르면 된다.
              const s = sites.find((x) => x.id === id);
              setForm({ ...form, siteId: id, unitIds: [], assignee: s?.assignedEngineer || "" });
            }}
          />
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
            <input className={inputCls} placeholder="010-0000-0000" value={form.reporterPhone} onChange={(e) => setForm({ ...form, reporterPhone: formatPhone(e.target.value) })} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">배정 기사{site && <span className="text-slate-400 font-normal"> — 가까운 순</span>}</p>
            <select className={inputCls} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
              <option value="">미배정</option>
              <EngineerOptions engineers={engineers} site={site} />
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

  const rows = failures.filter((f) => {
    if (status !== "all" && f.status !== status) return false;
    const q = search.trim();
    if (!q) return true;
    const site = sites.find((s) => s.id === f.siteId);
    const haystack = [f.reportedAt, f.siteName, site?.name, f.errorCode, site?.assignedEngineer, f.assignee]
      .filter(Boolean)
      .join(" ");
    return haystack.includes(q);
  });

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
  // 지원요청·운행정지는 미완료 건에 걸린 에스컬레이션만 센다(대시보드 집중관리현장과 동일 기준).
  const openEscalations = failures.filter((f) => f.escalation && f.status !== "완료");
  const supportCount = openEscalations.filter((f) => f.escalation === "지원요청").length;
  const stoppedCount = openEscalations.filter((f) => f.escalation === "운행정지").length;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold">고장관리</h1>
        <button onClick={() => setRegistering(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
          <Plus size={15} /> 고장접수
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatBox label="전체" value={failures.length} active={status === "all"} onClick={() => setStatus("all")} />
        <StatBox
          label="미처리"
          value={count("미처리")}
          tone={count("미처리") ? "text-red-600" : "text-slate-900"}
          active={status === "미처리"}
          onClick={() => setStatus("미처리")}
        />
        <StatBox
          label="진행중"
          value={count("진행중")}
          tone="text-amber-600"
          active={status === "진행중"}
          onClick={() => setStatus("진행중")}
          sub={`지원요청 ${supportCount} · 운행정지 ${stoppedCount}`}
        />
        <StatBox label="완료" value={count("완료")} tone="text-emerald-600" active={status === "완료"} onClick={() => setStatus("완료")} />
      </div>

      <input
        className={`${inputCls} w-full mb-3`}
        placeholder="접수일자·현장명·증상·담당기사·배정기사 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

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
                {f.status === "완료" ? (
                  <span className="text-slate-600">{personOf(data, f.assigneeId, f.assignee)}</span>
                ) : (
                  <select
                    className={`${inputCls} min-w-28`}
                    value={personOf(data, f.assigneeId, f.assignee) === "-" ? "" : personOf(data, f.assigneeId, f.assignee)}
                    onChange={(e) => assign(f, e.target.value)}
                  >
                    <option value="">미배정</option>
                    <EngineerOptions engineers={engineers} site={sites.find((s) => s.id === f.siteId)} />
                  </select>
                )}
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
          <FailureDetailContent f={detail} units={units} sites={sites} profiles={profiles} />
        </Modal>
      )}

      {registering && (
        <RegisterFailureModal data={data} onClose={() => setRegistering(false)} onCreate={createFailure} />
      )}
    </div>
  );
}
