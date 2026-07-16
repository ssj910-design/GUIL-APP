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

export default function SitesAdmin({ data, setData }) {
  const { sites, units, profiles, failures } = data;
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [siteForm, setSiteForm] = useState(null); // 선택 현장 기본정보 편집값
  const [newSite, setNewSite] = useState(null);   // 신규 등록 폼 (null=닫힘)

  const site = sites.find((s) => s.id === selectedId);
  const siteUnits = units.filter((u) => u.siteId === selectedId).sort((a, b) => a.seq - b.seq);
  const filtered = sites.filter((s) => !search || s.name.includes(search) || (s.address ?? "").includes(search));
  const engineers = profiles.filter((p) => p.role === "engineer");

  function select(s) {
    setSelectedId(s.id);
    setSiteForm({ name: s.name, address: s.address ?? "", contractType: s.contractType ?? CONTRACT_TYPES[0], notes: s.notes ?? "" });
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

  async function createSite() {
    if (!newSite.name.trim()) return;
    const id = "site-" + Date.now();
    const count = Math.max(1, Number(newSite.unitCount) || 1);
    const { error } = await supabase.from("sites").insert({
      id, name: newSite.name.trim(), address: newSite.address || null,
      contract_type: newSite.contractType, unit_count: count,
      assigned_engineer: newSite.engineer || null,
    });
    if (error) { alert("등록 실패: " + error.message); return; }
    const { data: created } = await supabase.from("units")
      .insert(Array.from({ length: count }, (_, i) => ({ site_id: id, seq: i + 1, unit_no: `${i + 1}호기` })))
      .select();
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
        <div className="bg-white rounded-xl border border-blue-200 p-5 mb-4 grid grid-cols-6 gap-3 items-end">
          <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">현장명 *</p><input className={inputCls} value={newSite.name} onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} /></div>
          <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">주소</p><input className={inputCls} value={newSite.address} onChange={(e) => setNewSite({ ...newSite, address: e.target.value })} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">계약구분</p>
            <select className={inputCls} value={newSite.contractType} onChange={(e) => setNewSite({ ...newSite, contractType: e.target.value })}>
              {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">호기 수</p><input className={inputCls} type="number" min="1" value={newSite.unitCount} onChange={(e) => setNewSite({ ...newSite, unitCount: e.target.value })} /></div>
          <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">담당 기사</p>
            <select className={inputCls} value={newSite.engineer} onChange={(e) => setNewSite({ ...newSite, engineer: e.target.value })}>
              <option value="">미배정</option>
              {engineers.map((p) => <option key={p.id}>{p.name}</option>)}
            </select></div>
          <div className="col-span-4 flex gap-2 justify-end">
            <button onClick={() => setNewSite(null)} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">취소</button>
            <button onClick={createSite} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5">등록 (호기 자동 생성)</button>
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
                      <p className="font-bold text-sm">{s.name} <span className="text-slate-400 font-semibold">· {cnt}대</span></p>
                      {open > 0 && <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-2 py-0.5">고장 {open}</span>}
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
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="grid grid-cols-6 gap-3 items-end">
                  <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">현장명</p><input className={inputCls} value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} /></div>
                  <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">주소</p><input className={inputCls} value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })} /></div>
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
                  <div className="col-span-5"><p className="text-xs font-bold text-slate-500 mb-1">비고(전달사항)</p><input className={inputCls} value={siteForm.notes} onChange={(e) => setSiteForm({ ...siteForm, notes: e.target.value })} /></div>
                  <button onClick={saveSiteInfo} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5">기본정보 저장</button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold">호기 목록 <span className="text-slate-400">({siteUnits.length})</span></h2>
                  <button onClick={addUnit} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5">
                    <Plus size={13} /> 호기 추가
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-100">
                      <th className="text-left px-4 py-2 font-semibold w-16">호기</th>
                      <th className="text-left px-2 py-2 font-semibold w-32">종류</th>
                      <th className="text-left px-2 py-2 font-semibold">모델</th>
                      <th className="text-left px-2 py-2 font-semibold w-36">설치일</th>
                      <th className="text-left px-2 py-2 font-semibold w-36">승강기고유번호</th>
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
