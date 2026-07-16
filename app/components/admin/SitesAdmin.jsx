"use client";

// 현장·호기 관리 — 관리자 콘솔의 핵심 화면.
// v2 기본: 호기(units)를 직접 편집한다. 단 007(옛 컬럼 정리) 전까지는
// 모바일 앱이 아직 참조하는 sites의 옛 컬럼(unit_count, gov_elevator_nos,
// elevator_model)도 함께 동기화한다(듀얼라이트).
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapUnit } from "@/lib/mappers";

const CONTRACT_TYPES = ["POG(일반계약)", "FM(종합계약)"];
const CONTACT_ROLES = ["관리소장", "건물주", "경비실", "입주민 대표", "기타"];
const UNIT_TYPES = ["엘리베이터", "에스컬레이터", "휠체어리프트", "카리프트"];
const inputCls = "border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500";

// units 배열로 sites 옛 컬럼 동기화 값 계산
function legacySiteFields(siteUnits) {
  const act = siteUnits.filter((u) => u.isActive !== false).sort((a, b) => a.seq - b.seq);
  const maxSeq = act.length ? act[act.length - 1].seq : 0;
  const govArr = Array.from({ length: maxSeq }, (_, i) => act.find((u) => u.seq === i + 1)?.govNo || null);
  return { unit_count: act.length, gov_elevator_nos: govArr, elevator_model: act[0]?.model || null };
}

function UnitRow({ unit, onSave, onToggleActive }) {
  const [form, setForm] = useState({ unitType: unit.unitType, model: unit.model ?? "", installDate: unit.installDate ?? "", govNo: unit.govNo ?? "" });
  const [saving, setSaving] = useState(false);
  const dirty = form.unitType !== unit.unitType || form.model !== (unit.model ?? "") || form.installDate !== (unit.installDate ?? "") || form.govNo !== (unit.govNo ?? "");

  return (
    <tr className={`border-b border-slate-50 ${unit.isActive === false ? "opacity-40" : ""}`}>
      <td className="px-4 py-2 font-bold whitespace-nowrap">{unit.unitNo}</td>
      <td className="px-2 py-2">
        <select className={inputCls} value={form.unitType} onChange={(e) => setForm({ ...form, unitType: e.target.value })}>
          {UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-2 py-2"><input className={inputCls} value={form.model} placeholder="모델명" onChange={(e) => setForm({ ...form, model: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={inputCls} type="date" value={form.installDate} onChange={(e) => setForm({ ...form, installDate: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={inputCls} value={form.govNo} placeholder="승강기고유번호" onChange={(e) => setForm({ ...form, govNo: e.target.value })} /></td>
      <td className="px-2 py-2 whitespace-nowrap text-right">
        <button
          disabled={!dirty || saving}
          onClick={async () => { setSaving(true); await onSave(unit, form); setSaving(false); }}
          className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-3 py-1.5 mr-1"
        >
          저장
        </button>
        <button onClick={() => onToggleActive(unit)} className="text-xs font-bold text-slate-400 border border-slate-200 rounded-lg px-2 py-1.5">
          {unit.isActive === false ? "복구" : "비활성"}
        </button>
      </td>
    </tr>
  );
}

// 현장 담당자(관리소장·건물주 등) 한 명 — 인라인 편집 행
function ContactRow({ c, onSave, onDelete, onSetPrimary }) {
  const [form, setForm] = useState({ name: c.name ?? "", phone: c.phone ?? "", email: c.email ?? "", fax: c.fax ?? "", role: c.role ?? CONTACT_ROLES[0] });
  const dirty = ["name", "phone", "email", "fax", "role"].some((k) => form[k] !== (c[k] ?? (k === "role" ? CONTACT_ROLES[0] : "")));
  return (
    <tr className="border-b border-slate-50">
      <td className="pl-4 py-2 w-8 text-center">
        <button title="대표 담당자로 지정" onClick={() => onSetPrimary(c)} className={c.isPrimary ? "text-amber-500" : "text-slate-200 hover:text-slate-400"}>★</button>
      </td>
      <td className="px-2 py-2">
        <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {CONTACT_ROLES.map((r) => <option key={r}>{r}</option>)}
          {!CONTACT_ROLES.includes(form.role) && <option>{form.role}</option>}
        </select>
      </td>
      <td className="px-2 py-2"><input className={inputCls} placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={inputCls} placeholder="전화번호" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={inputCls} placeholder="이메일" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></td>
      <td className="px-2 py-2"><input className={inputCls} placeholder="팩스" value={form.fax} onChange={(e) => setForm({ ...form, fax: e.target.value })} /></td>
      <td className="px-2 py-2 whitespace-nowrap text-right pr-3">
        <button disabled={!dirty} onClick={() => onSave(c, form)} className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-3 py-1.5 mr-1">저장</button>
        <button onClick={() => onDelete(c)} className="text-xs font-bold text-red-400 border border-red-100 rounded-lg px-2 py-1.5">삭제</button>
      </td>
    </tr>
  );
}

export default function SitesAdmin({ data, setData }) {
  const { sites, units, profiles, failures, siteManagers } = data;
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [siteForm, setSiteForm] = useState(null); // 선택 현장 기본정보 편집값
  const [newSite, setNewSite] = useState(null);   // 신규 등록 폼 (null=닫힘)

  const site = sites.find((s) => s.id === selectedId);
  const siteUnits = units.filter((u) => u.siteId === selectedId).sort((a, b) => a.seq - b.seq);
  const filtered = sites.filter((s) => !search || s.name.includes(search) || (s.address ?? "").includes(search));
  const engineers = profiles.filter((p) => p.role === "engineer");

  const contacts = siteManagers.filter((m) => m.siteId === selectedId);

  function select(s) {
    setSelectedId(s.id);
    setSiteForm({
      name: s.name, address: s.address ?? "", contractType: s.contractType ?? CONTRACT_TYPES[0],
      notes: s.notes ?? "", managerId: s.managerId ?? "",
      phone: s.phone ?? "", fax: s.fax ?? "", email: s.email ?? "",
    });
  }

  // ---- 저장 핸들러들 (units 우선 + sites 옛 컬럼 동기화) ----

  async function syncLegacy(siteId, nextUnits) {
    const legacy = legacySiteFields(nextUnits.filter((u) => u.siteId === siteId));
    await supabase.from("sites").update(legacy).eq("id", siteId);
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => s.id === siteId
        ? { ...s, unitCount: legacy.unit_count, govElevatorNos: legacy.gov_elevator_nos, elevatorModel: legacy.elevator_model }
        : s),
    }));
  }

  async function saveUnit(unit, form) {
    const patch = { unit_type: form.unitType, model: form.model || null, install_date: form.installDate || null, gov_no: form.govNo || null };
    const { error } = await supabase.from("units").update(patch).eq("id", unit.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    const nextUnits = units.map((u) => (u.id === unit.id ? { ...u, unitType: form.unitType, model: form.model || null, installDate: form.installDate || null, govNo: form.govNo || null } : u));
    setData((prev) => ({ ...prev, units: nextUnits }));
    await syncLegacy(unit.siteId, nextUnits);
  }

  async function toggleUnitActive(unit) {
    const next = !(unit.isActive !== false);
    await supabase.from("units").update({ is_active: next }).eq("id", unit.id);
    const nextUnits = units.map((u) => (u.id === unit.id ? { ...u, isActive: next } : u));
    setData((prev) => ({ ...prev, units: nextUnits }));
    await syncLegacy(unit.siteId, nextUnits);
  }

  async function addUnit() {
    const seq = siteUnits.length ? Math.max(...siteUnits.map((u) => u.seq)) + 1 : 1;
    const { data: created, error } = await supabase
      .from("units")
      .insert({ site_id: selectedId, seq, unit_no: `${seq}호기` })
      .select().single();
    if (error) { alert("호기 추가 실패: " + error.message); return; }
    const nextUnits = [...units, mapUnit(created)];
    setData((prev) => ({ ...prev, units: nextUnits }));
    await syncLegacy(selectedId, nextUnits);
  }

  async function saveSiteInfo() {
    await supabase.from("sites").update({
      name: siteForm.name, address: siteForm.address, contract_type: siteForm.contractType, notes: siteForm.notes || null,
      manager_id: siteForm.managerId || null,
      phone: siteForm.phone || null, fax: siteForm.fax || null, email: siteForm.email || null,
    }).eq("id", selectedId);
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, ...siteForm } : s)),
    }));
  }

  async function changeLead(engineerName) {
    const p = profiles.find((x) => x.name === engineerName);
    await supabase.from("site_assignments").delete().eq("site_id", selectedId);
    if (p) await supabase.from("site_assignments").insert({ site_id: selectedId, tech_id: p.id, is_lead: true });
    await supabase.from("sites").update({ assigned_engineer: engineerName || null }).eq("id", selectedId); // 듀얼라이트
    setData((prev) => ({ ...prev, sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, assignedEngineer: engineerName || null } : s)) }));
  }

  // ---- 현장 담당자(연락처부) ----

  async function addContact() {
    const row = { id: "sm-" + Date.now(), site_id: selectedId, name: "", phone: "", role: CONTACT_ROLES[0], is_primary: contacts.length === 0 };
    const { data: created, error } = await supabase.from("site_managers").insert(row).select().single();
    if (error) { alert("추가 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, siteManagers: [...prev.siteManagers, { id: created.id, siteId: selectedId, name: "", phone: "", email: "", fax: "", role: created.role, isPrimary: created.is_primary }] }));
  }

  async function saveContact(c, form) {
    await supabase.from("site_managers").update({
      name: form.name, phone: form.phone || null, email: form.email || null, fax: form.fax || null, role: form.role,
    }).eq("id", c.id);
    setData((prev) => ({ ...prev, siteManagers: prev.siteManagers.map((m) => (m.id === c.id ? { ...m, ...form } : m)) }));
  }

  async function deleteContact(c) {
    if (!confirm(`담당자 "${c.name || "(이름 없음)"}"를 삭제할까요?`)) return;
    await supabase.from("site_managers").delete().eq("id", c.id);
    setData((prev) => ({ ...prev, siteManagers: prev.siteManagers.filter((m) => m.id !== c.id) }));
  }

  async function setPrimary(c) {
    await supabase.from("site_managers").update({ is_primary: false }).eq("site_id", c.siteId);
    await supabase.from("site_managers").update({ is_primary: true }).eq("id", c.id);
    setData((prev) => ({ ...prev, siteManagers: prev.siteManagers.map((m) => (m.siteId === c.siteId ? { ...m, isPrimary: m.id === c.id } : m)) }));
  }

  // 계약종료/복구 (soft delete — 설계 원칙 4)
  async function toggleSiteActive() {
    const next = !(site.isActive !== false);
    await supabase.from("sites").update({ is_active: next }).eq("id", selectedId);
    setData((prev) => ({ ...prev, sites: prev.sites.map((x) => (x.id === selectedId ? { ...x, isActive: next } : x)) }));
  }

  // 공단 API: 고유번호 1개로 그 건물의 전체 호기 목록을 불러온다 (설계 §6)
  async function lookupGov() {
    const no = (newSite.govNo ?? "").trim();
    if (!no) return;
    setNewSite((ns) => ({ ...ns, looking: true }));
    try {
      const res = await fetch(`/api/elevator-info?elevatorNo=${encodeURIComponent(no)}`);
      const data = await res.json();
      const items = (data.items ?? []).map((it) => ({ ...it, checked: false })); // 기본 미선택 — 계약 호기만 명시적으로 체크
      if (!items.length) { alert("해당 고유번호로 건물을 찾지 못했습니다"); setNewSite((ns) => ({ ...ns, looking: false })); return; }
      setNewSite((ns) => ({
        ...ns,
        looking: false,
        found: items,
        name: ns.name || items[0].buldNm || "",
        address: ns.address || `${items[0].address1 ?? ""}${items[0].address2 ?? ""}`.trim(),
      }));
    } catch {
      alert("공단 조회에 실패했습니다");
      setNewSite((ns) => ({ ...ns, looking: false }));
    }
  }

  async function createSite() {
    if (!newSite.name.trim()) return;
    const id = "site-" + Date.now();
    const picked = (newSite.found ?? []).filter((it) => it.checked);
    // 이미 다른 현장에 등록된 승강기인지 사전 확인 (gov_no는 전국 유일)
    const dup = picked.map((it) => ({ it, u: units.find((u) => u.govNo === it.elevatorNo) })).find((x) => x.u);
    if (dup) {
      const dupSite = sites.find((x) => x.id === dup.u.siteId);
      alert(`승강기 ${dup.it.elevatorNo}는 이미 "${dupSite?.name ?? "다른 현장"}"에 등록되어 있습니다.`);
      return;
    }
    const count = picked.length || Math.max(1, Number(newSite.unitCount) || 1);
    const { error } = await supabase.from("sites").insert({
      id, name: newSite.name.trim(), address: newSite.address || null,
      contract_type: newSite.contractType, unit_count: count,
      assigned_engineer: newSite.engineer || null,
      gov_elevator_nos: picked.length ? picked.map((it) => it.elevatorNo) : null,
    });
    if (error) { alert("등록 실패: " + error.message); return; }
    const unitRows = picked.length
      ? picked.map((it, i) => ({
          site_id: id, seq: i + 1, unit_no: `${i + 1}호기`,
          gov_no: it.elevatorNo,
          unit_type: (it.elvtrDivNm ?? "엘리베이터").includes("에스컬레이터") ? "에스컬레이터" : "엘리베이터",
          install_date: it.frstInstallationDe || null,
        }))
      : Array.from({ length: count }, (_, i) => ({ site_id: id, seq: i + 1, unit_no: `${i + 1}호기` }));
    const { data: created, error: unitError } = await supabase.from("units").insert(unitRows).select();
    if (unitError) {
      await supabase.from("sites").delete().eq("id", id); // 호기 생성 실패 시 현장도 되돌림
      alert("호기 생성 실패: " + unitError.message);
      return;
    }
    const p = profiles.find((x) => x.name === newSite.engineer);
    if (p) await supabase.from("site_assignments").insert({ site_id: id, tech_id: p.id, is_lead: true });
    const s = { id, name: newSite.name.trim(), address: newSite.address, contractType: newSite.contractType, unitCount: count, assignedEngineer: newSite.engineer || null, govElevatorNos: [] };
    setData((prev) => ({ ...prev, sites: [...prev.sites, s], units: [...prev.units, ...(created ?? []).map(mapUnit)] }));
    setNewSite(null);
    select(s);
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-extrabold">현장·호기 관리</h1>
          <p className="text-xs text-slate-500 mt-0.5">호기(승강기 1대) 단위로 모델·설치일·승강기고유번호를 관리합니다</p>
        </div>
        <button onClick={() => setNewSite({ name: "", address: "", contractType: CONTRACT_TYPES[0], unitCount: 1, engineer: "" })}
          className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5">
          <Plus size={15} /> 새 현장 등록
        </button>
      </div>

      {/* 신규 등록 폼 */}
      {newSite && (
        <div className="bg-white rounded-xl border border-blue-200 p-5 mb-4 space-y-4">
          <div className="flex items-end gap-2">
            <div className="w-64">
              <p className="text-xs font-bold text-blue-700 mb-1">승강기고유번호로 자동 등록 (권장)</p>
              <input className={inputCls} placeholder="예: 0136226 — 건물 내 아무 호기나 1개" value={newSite.govNo ?? ""} onChange={(e) => setNewSite({ ...newSite, govNo: e.target.value })} />
            </div>
            <button onClick={lookupGov} disabled={newSite.looking} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5 whitespace-nowrap">
              {newSite.looking ? "조회 중..." : "공단에서 불러오기"}
            </button>
            <p className="text-[10px] text-slate-400 pb-1">번호 1개면 그 건물의 전체 호기·주소·설치일을 가져옵니다. 없으면 아래에 수기 입력.</p>
          </div>
          {newSite.found && (
            <div className="border border-blue-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-blue-50">
                <p className="text-xs font-bold text-blue-700">
                  이 건물의 승강기 {newSite.found.length}대 — <span className="text-red-600">유지보수 계약 대상만 체크</span>하세요. 체크한 호기만 등록됩니다 ({newSite.found.filter((i) => i.checked).length}개 선택)
                </p>
                <button
                  onClick={() => setNewSite((ns) => {
                    const all = ns.found.every((x) => x.checked);
                    return { ...ns, found: ns.found.map((x) => ({ ...x, checked: !all })) };
                  })}
                  className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2 py-1 bg-white whitespace-nowrap"
                >
                  {newSite.found.every((x) => x.checked) ? "전체 해제" : "전체 선택"}
                </button>
              </div>
              {newSite.found.map((it, idx) => (
                <label key={it.elevatorNo} className="flex items-center gap-3 px-4 py-2 border-t border-blue-50 text-sm cursor-pointer">
                  <input type="checkbox" checked={it.checked} onChange={() =>
                    setNewSite((ns) => ({ ...ns, found: ns.found.map((x, i) => (i === idx ? { ...x, checked: !x.checked } : x)) }))
                  } />
                  <span className="font-bold">{it.elevatorNo}</span>
                  <span className="text-slate-500">{it.installationPlace || "-"} · {it.elvtrKindNm || "-"} · {it.elvtrForm || "-"} · 설치 {it.frstInstallationDe || "-"}</span>
                  <span className="text-xs text-slate-400 ml-auto">검사 ~{it.applcEnDt || "-"} {it.resultNm ? `(${it.resultNm})` : ""}</span>
                </label>
              ))}
            </div>
          )}
          <div className="grid grid-cols-6 gap-3 items-end">
          <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">현장명 *</p><input className={inputCls} value={newSite.name} onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} /></div>
          <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">주소</p><input className={inputCls} value={newSite.address} onChange={(e) => setNewSite({ ...newSite, address: e.target.value })} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">계약구분</p>
            <select className={inputCls} value={newSite.contractType} onChange={(e) => setNewSite({ ...newSite, contractType: e.target.value })}>
              {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">호기 수 {newSite.found ? "(공단 결과 사용)" : ""}</p><input className={inputCls} type="number" min="1" disabled={!!newSite.found} value={newSite.found ? newSite.found.filter((i) => i.checked).length : newSite.unitCount} onChange={(e) => setNewSite({ ...newSite, unitCount: e.target.value })} /></div>
          <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">담당 기사</p>
            <select className={inputCls} value={newSite.engineer} onChange={(e) => setNewSite({ ...newSite, engineer: e.target.value })}>
              <option value="">미배정</option>
              {engineers.map((p) => <option key={p.id}>{p.name}</option>)}
            </select></div>
          <div className="col-span-4 flex gap-2 justify-end">
            <button onClick={() => setNewSite(null)} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">취소</button>
            <button
              onClick={createSite}
              disabled={newSite.found && !newSite.found.some((i) => i.checked)}
              className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
            >
              등록 {newSite.found ? `(체크한 ${newSite.found.filter((i) => i.checked).length}개 호기 생성)` : "(호기 자동 생성)"}
            </button>
          </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-5 items-start">
        {/* 현장 목록 */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <input className={inputCls} placeholder="현장명·주소 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ul className="max-h-[32rem] overflow-y-auto">
            {filtered.map((s) => {
              const cnt = units.filter((u) => u.siteId === s.id && u.isActive !== false).length;
              const open = failures.filter((f) => f.siteId === s.id && f.status !== "완료").length;
              return (
                <li key={s.id}>
                  <button onClick={() => select(s)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 ${selectedId === s.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <div className="flex items-center justify-between">
                      <p className={`font-bold text-sm ${s.isActive === false ? "text-slate-300 line-through" : ""}`}>
                        {s.name} <span className="text-slate-400 font-semibold">· {cnt}대</span>
                      </p>
                      <span className="flex gap-1">
                        {s.isActive === false && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">계약종료</span>}
                        {open > 0 && <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-2 py-0.5">고장 {open}</span>}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.address}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 상세 */}
        <div className="col-span-3 space-y-4">
          {!site ? (
            <div className="bg-white rounded-xl border border-slate-200 py-24 text-center text-sm text-slate-400">
              왼쪽에서 현장을 선택하세요
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-xs font-bold text-slate-500 mb-1">현장명</p><input className={inputCls} value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} /></div>
                  <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">주소</p><input className={inputCls} value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-xs font-bold text-slate-500 mb-1">계약구분</p>
                    <select className={inputCls} value={siteForm.contractType} onChange={(e) => setSiteForm({ ...siteForm, contractType: e.target.value })}>
                      {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
                      {!CONTRACT_TYPES.includes(siteForm.contractType) && <option>{siteForm.contractType}</option>}
                    </select></div>
                  <div><p className="text-xs font-bold text-slate-500 mb-1">담당 기사</p>
                    <select className={inputCls} value={site.assignedEngineer ?? ""} onChange={(e) => changeLead(e.target.value)}>
                      <option value="">미배정</option>
                      {engineers.map((p) => <option key={p.id}>{p.name}</option>)}
                    </select></div>
                  <div><p className="text-xs font-bold text-slate-500 mb-1">사무실 담당자</p>
                    <select className={inputCls} value={siteForm.managerId} onChange={(e) => setSiteForm({ ...siteForm, managerId: e.target.value })}>
                      <option value="">미지정</option>
                      {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-xs font-bold text-slate-500 mb-1">공통 전화번호</p><input className={inputCls} placeholder="관리사무소 대표번호" value={siteForm.phone} onChange={(e) => setSiteForm({ ...siteForm, phone: e.target.value })} /></div>
                  <div><p className="text-xs font-bold text-slate-500 mb-1">공통 팩스</p><input className={inputCls} value={siteForm.fax} onChange={(e) => setSiteForm({ ...siteForm, fax: e.target.value })} /></div>
                  <div><p className="text-xs font-bold text-slate-500 mb-1">공통 이메일</p><input className={inputCls} value={siteForm.email} onChange={(e) => setSiteForm({ ...siteForm, email: e.target.value })} /></div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1"><p className="text-xs font-bold text-slate-500 mb-1">비고(전달사항)</p><input className={inputCls} value={siteForm.notes} onChange={(e) => setSiteForm({ ...siteForm, notes: e.target.value })} /></div>
                  <button onClick={saveSiteInfo} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">저장</button>
                  <button onClick={toggleSiteActive} className="text-sm font-bold text-slate-400 border border-slate-200 rounded-xl px-3 py-2.5 whitespace-nowrap">
                    {site.isActive === false ? "계약 복구" : "계약종료"}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold">현장 담당자 — 개인 연락처 <span className="text-slate-400">({contacts.length})</span> <span className="text-[10px] text-slate-400 font-normal">★ = 대표(SMS·안내 수신) · 공통 연락처는 위 기본정보에</span></h2>
                  <button onClick={addContact} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5">
                    <Plus size={13} /> 담당자 추가
                  </button>
                </div>
                {contacts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">등록된 담당자가 없습니다</p>
                ) : (
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="w-8" /><th className="text-left px-2 py-2 font-semibold w-28">역할</th>
                        <th className="text-left px-2 py-2 font-semibold w-24">이름</th>
                        <th className="text-left px-2 py-2 font-semibold w-36">전화번호</th>
                        <th className="text-left px-2 py-2 font-semibold">이메일</th>
                        <th className="text-left px-2 py-2 font-semibold w-28">팩스</th><th className="w-28" />
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c) => (
                        <ContactRow key={c.id} c={c} onSave={saveContact} onDelete={deleteContact} onSetPrimary={setPrimary} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold">호기 목록 <span className="text-slate-400">({siteUnits.length})</span></h2>
                  <button onClick={addUnit} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5">
                    <Plus size={13} /> 호기 추가
                  </button>
                </div>
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-100">
                      <th className="text-left px-4 py-2 font-semibold w-14">호기</th>
                      <th className="text-left px-2 py-2 font-semibold w-28">종류</th>
                      <th className="text-left px-2 py-2 font-semibold">모델</th>
                      <th className="text-left px-2 py-2 font-semibold w-32">설치일</th>
                      <th className="text-left px-2 py-2 font-semibold w-32">승강기고유번호</th>
                      <th className="w-32" />
                    </tr>
                  </thead>
                  <tbody>
                    {siteUnits.map((u) => (
                      <UnitRow key={u.id} unit={u} onSave={saveUnit} onToggleActive={toggleUnitActive} />
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2.5 text-[10px] text-slate-400 border-t border-slate-50">
                  * 승강기고유번호를 등록하면 모바일 앱 검사관리가 국가승강기정보센터 실시간 데이터로 전환됩니다.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
