"use client";

// 현장관리 — 관리자 콘솔의 핵심 화면.
// v2 기본: 호기(units)를 직접 편집한다. 단 007(옛 컬럼 정리) 전까지는
// 모바일 앱이 아직 참조하는 sites의 옛 컬럼(unit_count, gov_elevator_nos,
// elevator_model)도 함께 동기화한다(듀얼라이트).
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapUnit } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";
import { addDays } from "@/lib/utils";
import { useLiveInspections } from "@/app/hooks/useLiveInspections";
import { Badge } from "@/app/components/ui";
import { InspectionFailDetailSheet } from "@/app/components/InspectionFailDetailSheet";
import { Modal, StatusBadge } from "@/app/components/admin/adminShared";
import ImportSites from "@/app/components/admin/ImportSites";

const CONTRACT_TYPES = ["POG(일반계약)", "FM(종합계약)"];
const CONTACT_ROLES = ["대표", "담당자", "관리소장", "건물주", "경비실", "입주민 대표", "기타"];
const UNIT_TYPES = ["엘리베이터", "에스컬레이터", "휠체어리프트", "카리프트"];
const inputCls = "border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500";

// units 배열로 sites 옛 컬럼 동기화 값 계산
function legacySiteFields(siteUnits) {
  const act = siteUnits.filter((u) => u.isActive !== false).sort((a, b) => a.seq - b.seq);
  const maxSeq = act.length ? act[act.length - 1].seq : 0;
  const govArr = Array.from({ length: maxSeq }, (_, i) => act.find((u) => u.seq === i + 1)?.govNo || null);
  return { unit_count: act.length, gov_elevator_nos: govArr, elevator_model: act[0]?.model || null };
}

// 호기 상세정보 — 승강기정보(국가승강기정보센터 연동)/고장내역/검사내역/부품교체내역
function UnitDetailModal({ unit, site, failures, inspections, billings, onClose }) {
  const [tab, setTab] = useState("정보");
  const [failTarget, setFailTarget] = useState(null);
  const liveInspections = useLiveInspections(
    unit.govNo ? [{ key: unit.id, siteId: site.id, siteName: site.name, govElevatorNo: unit.govNo }] : []
  );
  const liveInfo = liveInspections[0];
  const unitFailures = failures
    .filter((f) => (f.unitId ? f.unitId === unit.id : f.siteId === site.id))
    .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
  const unitInspections = liveInspections.length > 0
    ? liveInspections
    : inspections.filter((i) => (i.unitId ? i.unitId === unit.id : i.siteId === site.id));
  const unitBillings = billings.filter((b) => (b.unitId ? b.unitId === unit.id : b.siteName === site.name));

  // 모바일 앱 "승강기정보 - 정보" 탭과 동일한 항목·순서.
  const infoRows = [
    ["건물명", site.name],
    ["호기", unit.unitNo],
    ["승강기번호", liveInfo?.govElevatorNo || unit.govNo || "미등록"],
    ["승강기종류", liveInfo?.kindNm || unit.kind || "-"],
    ["승강기형식", liveInfo?.form || unit.form || "-"],
    ["승강기모델", unit.model || "-"],
    ["제조업체", unit.manufacturer || "-"],
    ["설치일자", liveInfo?.frstInstallationDe || unit.installDate || "-"],
    ["운행층수", liveInfo?.groundFloorCnt ? `지상 ${liveInfo.groundFloorCnt} / 지하 ${liveInfo.undgrndFloorCnt ?? 0}` : unit.floors || "-"],
    ["운행구간", liveInfo?.shuttleSection || unit.runSection || "-"],
    ["적재하중", liveInfo?.liveLoad ? `${liveInfo.liveLoad}kg` : unit.loadKg ? `${unit.loadKg}kg` : "-"],
    ["정원", liveInfo?.ratedCap ? `${liveInfo.ratedCap}인승` : unit.capacityPersons ? `${unit.capacityPersons}인승` : "-"],
    ["정격속도", unit.ratedSpeed ? `${unit.ratedSpeed}m/s` : "-"],
    ["보험", unit.insurer ? `${unit.insurer} (~${unit.insuranceEnd ?? "?"})` : "-"],
  ];

  return (
    <Modal title={`${site.name} · ${unit.unitNo} 상세정보`} onClose={onClose} wide>
      <div className="flex gap-1 mb-4 border-b border-slate-100 shrink-0">
        {["정보", "고장내역", "검사내역", "부품교체내역"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-xs font-bold ${tab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* 탭마다 팝업 크기가 달라지지 않도록 고정 높이 + 내부 스크롤로 통일 */}
      <div className="h-[26rem] overflow-y-auto">
        {tab === "정보" && (
          <div className="space-y-2 text-sm">
            {infoRows.map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-400">{label}</span>
                <span className="font-semibold text-slate-800">{value}</span>
              </div>
            ))}
            {liveInfo && <p className="text-[10px] text-slate-400 pt-2">* 국가승강기정보센터 실시간 데이터</p>}
          </div>
        )}

        {tab === "고장내역" && (
          unitFailures.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">등록된 고장 이력이 없습니다</p> : (
            <div className="space-y-2">
              {unitFailures.map((f) => (
                <div key={f.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm">{f.errorCode}</p>
                    <StatusBadge tone={f.status === "완료" ? "green" : f.status === "진행중" ? "amber" : "red"}>
                      {f.escalation ? `${f.status}·${f.escalation}` : f.status}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-slate-500">{f.reportedAt} 접수 · {f.assignee ?? "미배정"}</p>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "검사내역" && (
          unitInspections.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">등록된 검사 이력이 없습니다</p> : (
            <div className="space-y-2">
              {unitInspections.map((i) => {
                const isLive = i.id?.startsWith("gov-");
                const clickable = isLive && (i.result === "conditional" || i.result === "fail");
                return (
                  <div
                    key={i.id}
                    onClick={clickable ? () => setFailTarget(i) : undefined}
                    className={`border border-slate-200 rounded-lg p-3 ${clickable ? "cursor-pointer hover:bg-slate-50" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-sm">{i.type}</p>
                      {i.result ? <Badge result={i.result} /> : <StatusBadge tone="slate">예정</StatusBadge>}
                    </div>
                    <p className="text-xs text-slate-500">{i.org} · 기한 {i.dueDate}</p>
                    {clickable && <p className="text-[10px] text-blue-600 font-semibold mt-1">클릭해서 부적합 상세 항목 보기</p>}
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === "부품교체내역" && (
          unitBillings.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">등록된 부품교체 내역이 없습니다</p> : (
            <div className="space-y-2">
              {unitBillings.map((b) => {
                const photos = [...(b.beforePhotoUrls ?? []), ...(b.afterPhotoUrls ?? [])];
                return (
                  <div key={b.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-bold text-sm">{b.part}</p>
                      <span className="text-sm font-bold">{b.cost ? Number(b.cost).toLocaleString() + "원" : "-"}</span>
                    </div>
                    <p className="text-xs text-slate-500">{b.replaceDate ?? "-"} · {b.engineer ?? "-"}</p>
                    {photos.length > 0 && (
                      <div className="flex gap-1.5 mt-2 overflow-x-auto">
                        {photos.map((url, i) => (
                          <img key={i} src={url} alt="" className="w-14 h-14 rounded object-cover border border-slate-200 shrink-0" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {failTarget && <InspectionFailDetailSheet inspection={failTarget} onClose={() => setFailTarget(null)} />}
    </Modal>
  );
}

function UnitRow({ unit, onSave, onToggleActive, onDelete, onOpenDetail }) {
  const [form, setForm] = useState({ unitType: unit.unitType, model: unit.model ?? "", installDate: unit.installDate ?? "", govNo: unit.govNo ?? "" });
  const [saving, setSaving] = useState(false);
  const dirty = form.unitType !== unit.unitType || form.model !== (unit.model ?? "") || form.installDate !== (unit.installDate ?? "") || form.govNo !== (unit.govNo ?? "");

  return (
    <tr className={`border-b border-slate-50 ${unit.isActive === false ? "opacity-40" : ""}`}>
      <td className="px-4 py-2 font-bold whitespace-nowrap">
        <button onClick={() => onOpenDetail(unit)} className="text-blue-700 hover:underline">{unit.unitNo}</button>
      </td>
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
        <button onClick={() => onToggleActive(unit)} className="text-xs font-bold text-slate-400 border border-slate-200 rounded-lg px-2 py-1.5 mr-1">
          {unit.isActive === false ? "복구" : "비활성"}
        </button>
        <button onClick={() => onDelete(unit)} className="text-xs font-bold text-red-500 border border-red-100 rounded-lg px-2 py-1.5">
          <Trash2 size={13} />
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
  const { sites, units, profiles, failures, inspections, billings, siteManagers } = data;
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [siteForm, setSiteForm] = useState(null); // 선택 현장 기본정보 편집값
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingContacts, setEditingContacts] = useState(false);
  const [editingUnits, setEditingUnits] = useState(false);
  const [importing, setImporting] = useState(false); // 공단 엑셀 일괄 등록
  const [unitDetail, setUnitDetail] = useState(null);

  const site = sites.find((s) => s.id === selectedId);
  const siteUnits = units.filter((u) => u.siteId === selectedId).sort((a, b) => a.seq - b.seq);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [bulkEngineer, setBulkEngineer] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  // 계약 만료 판정: 종료일 30일 내(임박) / 지남(만료). 종료일 미입력 현장은 대상 아님.
  const in30 = (d) => d && d >= TODAY_STR && d <= addDays(TODAY_STR, 30);
  const isExpired = (d) => d && d < TODAY_STR;
  const dday = (d) => Math.ceil((new Date(d) - new Date(TODAY_STR)) / 86400000);
  const expiringSites = sites.filter((s) => s.isActive !== false && (in30(s.contractEnd) || isExpired(s.contractEnd)));
  const endedSites = sites.filter((s) => s.isActive === false);
  const [contractFilter, setContractFilter] = useState("all"); // all | expiring | ended

  const filtered = sites
    .filter((s) => !search || s.name.includes(search) || (s.address ?? "").includes(search))
    .filter((s) => !onlyUnassigned || !s.assignedEngineer)
    .filter((s) =>
      contractFilter === "ended" ? s.isActive === false :
      contractFilter === "expiring" ? s.isActive !== false && (in30(s.contractEnd) || isExpired(s.contractEnd)) :
      true);
  const engineers = profiles.filter((p) => p.role === "engineer");
  // contract_date/maintenance_cost 컬럼은 각 마이그레이션 실행 전엔 존재하지 않는다 — undefined면 아직 미실행으로 간주.
  const contractDateReady = sites.some((s) => s.contractDate !== undefined);
  const maintenanceCostReady = sites.some((s) => s.maintenanceCost !== undefined);

  const contacts = siteManagers.filter((m) => m.siteId === selectedId);

  // 읽기전용 "승강기 정보" 표에 국가승강기정보센터 실시간 종류·설치일자를 채워준다.
  const siteUnitQueries = siteUnits
    .filter((u) => u.govNo)
    .map((u) => ({ key: u.id, siteId: u.siteId, siteName: site?.name, govElevatorNo: u.govNo }));
  const liveUnitInfo = useLiveInspections(siteUnitQueries);
  const liveOf = (unitId) => liveUnitInfo.find((i) => i.id === `gov-${unitId}`);

  const [renew, setRenew] = useState(null); // 재계약 폼 {start, end} (null=닫힘)

  function select(s) {
    setSelectedId(s.id);
    setEditingInfo(false);
    setEditingContacts(false);
    setEditingUnits(false);
    setRenew(null);
    setSiteForm({
      name: s.name, address: s.address ?? "", contractType: s.contractType ?? CONTRACT_TYPES[0],
      notes: s.notes ?? "", assignedEngineer: s.assignedEngineer ?? "",
      phone: s.phone ?? "", fax: s.fax ?? "", email: s.email ?? "",
      contractDate: s.contractDate ?? "", contractEnd: s.contractEnd ?? "", maintenanceCost: s.maintenanceCost ?? "",
    });
  }

  // 재계약 확정 — 새 기간 저장 + 계약종료 상태였다면 복구
  async function renewContract() {
    const { error } = await supabase.from("sites")
      .update({ contract_date: renew.start || null, contract_end: renew.end || null, is_active: true })
      .eq("id", selectedId);
    if (error) { alert("재계약 저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, contractDate: renew.start, contractEnd: renew.end, isActive: true } : s)),
    }));
    setRenew(null);
    setSiteForm((f) => ({ ...f, contractDate: renew.start, contractEnd: renew.end }));
  }

  // 체크한 현장들에 담당 기사 일괄 배정 (site_assignments + 옛 컬럼 듀얼라이트)
  async function bulkAssign() {
    const ids = [...checkedIds];
    const p = profiles.find((x) => x.name === bulkEngineer);
    if (!ids.length || !p) return;
    setBulkBusy(true);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      await supabase.from("site_assignments").delete().in("site_id", chunk);
      await supabase.from("site_assignments").insert(chunk.map((siteId) => ({ site_id: siteId, tech_id: p.id, is_lead: true })));
      await supabase.from("sites").update({ assigned_engineer: bulkEngineer }).in("id", chunk);
    }
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((x) => (checkedIds.has(x.id) ? { ...x, assignedEngineer: bulkEngineer } : x)),
    }));
    setBulkBusy(false);
    setCheckedIds(new Set());
    setAssignMode(false);
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

  async function deleteUnit(unit) {
    if (!confirm(`"${unit.unitNo}"를 완전히 삭제할까요? 연결된 고장·검사·청구 이력은 남아있지만 호기 정보와의 연결은 사라집니다.`)) return;
    const { error } = await supabase.from("units").delete().eq("id", unit.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    const nextUnits = units.filter((u) => u.id !== unit.id);
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
    if (siteForm.assignedEngineer !== (site.assignedEngineer ?? "")) {
      await changeLead(siteForm.assignedEngineer);
    }
    await supabase.from("sites").update({
      name: siteForm.name, address: siteForm.address, contract_type: siteForm.contractType, notes: siteForm.notes || null,
      phone: siteForm.phone || null, fax: siteForm.fax || null, email: siteForm.email || null,
      ...(contractDateReady ? { contract_date: siteForm.contractDate || null } : {}),
      contract_end: siteForm.contractEnd || null,
      ...(maintenanceCostReady ? { maintenance_cost: siteForm.maintenanceCost === "" ? null : Number(siteForm.maintenanceCost) } : {}),
    }).eq("id", selectedId);
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, ...siteForm, assignedEngineer: siteForm.assignedEngineer } : s)),
    }));
    setEditingInfo(false);
  }

  function cancelEditInfo() {
    select(site);
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

  return (
    <div className="max-w-[100rem]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-extrabold">현장관리</h1>
          <p className="text-xs text-slate-500 mt-0.5">호기(승강기 1대) 단위로 모델·설치일·승강기고유번호를 관리합니다</p>
        </div>
        {/* 현장 등록은 공단 엑셀 업로드로만 — API 단건 등록은 팀 결정으로 제거 (2026-07-17) */}
        <button onClick={() => setImporting(true)}
          className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
          <Plus size={15} /> 공단 엑셀로 현장 등록
        </button>
      </div>

      {importing && <ImportSites data={data} setData={setData} onClose={() => setImporting(false)} />}

      {/* 계약 만료 알림 배너 */}
      {expiringSites.length > 0 && contractFilter !== "expiring" && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm font-bold text-amber-700 flex-1">
            ⚠️ 계약 만료 30일 내(만료 포함) 현장 {expiringSites.length}곳 — 재계약 협의가 필요합니다
          </p>
          <button onClick={() => setContractFilter("expiring")} className="text-xs font-bold text-white bg-amber-600 rounded-lg px-3 py-1.5 whitespace-nowrap">
            모아보기
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-7 gap-5 items-stretch">
        {/* 현장 목록 */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[28rem] xl:h-[40rem]">
          <div className="p-3 border-b border-slate-100 shrink-0 space-y-2">
            <input className={inputCls} placeholder="현장명·주소 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            {/* 계약 상태 필터 — 종료 계약 모아보기 */}
            <div className="flex gap-1.5">
              {[["all", `전체 (${sites.length})`], ["expiring", `만료임박 (${expiringSites.length})`], ["ended", `종료 계약 (${endedSites.length})`]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setContractFilter(v)}
                  className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border ${contractFilter === v ? "bg-blue-700 text-white border-blue-700" : "text-slate-500 border-slate-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 cursor-pointer">
                <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />
                미배정만 ({sites.filter((x) => !x.assignedEngineer).length})
              </label>
              <button
                onClick={() => { setAssignMode(!assignMode); setCheckedIds(new Set()); }}
                className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border ${assignMode ? "bg-blue-700 text-white border-blue-700" : "text-blue-700 border-blue-200"}`}
              >
                {assignMode ? "배정 모드 끄기" : "기사 일괄 배정"}
              </button>
            </div>
            {assignMode && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCheckedIds(checkedIds.size === filtered.length ? new Set() : new Set(filtered.map((x) => x.id)))}
                  className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 whitespace-nowrap"
                >
                  {checkedIds.size === filtered.length && filtered.length > 0 ? "전체 해제" : `목록 전체 (${filtered.length})`}
                </button>
                <select className={`${inputCls} flex-1`} value={bulkEngineer} onChange={(e) => setBulkEngineer(e.target.value)}>
                  <option value="">기사 선택</option>
                  {engineers.map((p) => <option key={p.id}>{p.name}</option>)}
                </select>
                <button
                  onClick={bulkAssign}
                  disabled={bulkBusy || !checkedIds.size || !bulkEngineer}
                  className="text-[11px] font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-lg px-2.5 py-1.5 whitespace-nowrap"
                >
                  {bulkBusy ? "배정 중..." : `${checkedIds.size}개 배정`}
                </button>
              </div>
            )}
          </div>
          <ul className="flex-1 overflow-y-auto">
            {filtered.map((s) => {
              const cnt = units.filter((u) => u.siteId === s.id && u.isActive !== false).length;
              const open = failures.filter((f) => f.siteId === s.id && f.status !== "완료").length;
              return (
                <li key={s.id} className="flex items-stretch">
                  {assignMode && (
                    <label className="flex items-center px-2 border-b border-slate-50 cursor-pointer">
                      <input type="checkbox" checked={checkedIds.has(s.id)} onChange={() => {
                        const next = new Set(checkedIds);
                        next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                        setCheckedIds(next);
                      }} />
                    </label>
                  )}
                  <button onClick={() => select(s)}
                    className={`flex-1 text-left px-4 py-3 border-b border-slate-50 ${selectedId === s.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <div className="flex items-center justify-between">
                      <p className={`font-bold text-sm ${s.isActive === false ? "text-slate-300 line-through" : ""}`}>
                        {s.name} <span className="text-slate-400 font-semibold">· {cnt}대</span>
                      </p>
                      <span className="flex gap-1">
                        {s.assignedEngineer
                          ? <span className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">{s.assignedEngineer}</span>
                          : <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">미배정</span>}
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
        <div className="xl:col-span-5 xl:h-[40rem] xl:overflow-y-auto space-y-4 pr-0.5">
          {!site ? (
            <div className="bg-white rounded-xl border border-slate-200 h-40 xl:h-full flex items-center justify-center text-sm text-slate-400">
              목록에서 현장을 선택하세요
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                {!editingInfo ? (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 text-sm">
                        <div><p className="text-xs font-bold text-slate-400 mb-1">현장명</p><p className="font-semibold text-slate-800">{site.name}</p></div>
                        <div className="col-span-2"><p className="text-xs font-bold text-slate-400 mb-1">주소</p><p className="font-semibold text-slate-800">{site.address || "-"}</p></div>
                      </div>
                    </div>
                    <div className="flex items-start justify-between mt-3">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-1 text-sm">
                        <div><p className="text-xs font-bold text-slate-400 mb-1">계약구분</p><p className="font-semibold text-slate-800">{site.contractType || "-"}</p></div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">보수료(VAT별도)</p><p className="font-semibold text-slate-800">{maintenanceCostReady ? (site.maintenanceCost != null ? Number(site.maintenanceCost).toLocaleString() + "원" : "-") : "마이그레이션 대기"}</p></div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">계약일자</p><p className="font-semibold text-slate-800">{contractDateReady ? (site.contractDate || "-") : "마이그레이션 대기"}</p></div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">계약종료일</p>
                          <p className="font-semibold text-slate-800">
                            {site.contractEnd || "-"}
                            {isExpired(site.contractEnd) && <span className="ml-1.5 text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-1.5 py-0.5">만료</span>}
                            {in30(site.contractEnd) && <span className="ml-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5">D-{dday(site.contractEnd)}</span>}
                          </p>
                        </div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">담당 기사</p><p className="font-semibold text-slate-800">{site.assignedEngineer || "미배정"}</p></div>
                      </div>
                    </div>
                    <div className="flex items-start justify-between mt-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 text-sm">
                        <div><p className="text-xs font-bold text-slate-400 mb-1">전화번호</p><p className="font-semibold text-slate-800">{site.phone || "-"}</p></div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">팩스</p><p className="font-semibold text-slate-800">{site.fax || "-"}</p></div>
                        <div><p className="text-xs font-bold text-slate-400 mb-1">이메일</p><p className="font-semibold text-slate-800">{site.email || "-"}</p></div>
                        <div className="col-span-3"><p className="text-xs font-bold text-slate-400 mb-1">비고(전달사항)</p><p className="text-slate-700">{site.notes || "-"}</p></div>
                      </div>
                      <button onClick={() => setEditingInfo(true)} className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 whitespace-nowrap ml-3">
                        수정하기
                      </button>
                    </div>
                    {/* 재계약 안내 — 계약종료 상태이거나 종료일이 임박/지난 현장에만 표시 */}
                    {(site.isActive === false || isExpired(site.contractEnd) || in30(site.contractEnd)) && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-sm font-bold text-amber-700">
                          {site.isActive === false
                            ? "계약이 종료된 현장입니다"
                            : isExpired(site.contractEnd)
                            ? `계약이 만료되었습니다 (${site.contractEnd})`
                            : `계약 만료까지 D-${dday(site.contractEnd)} (${site.contractEnd})`}
                          {" — "}재계약 여부를 협의하세요
                        </p>
                        {!renew ? (
                          <button
                            onClick={() => {
                              const start = site.contractEnd && site.contractEnd >= TODAY_STR ? addDays(site.contractEnd, 1) : TODAY_STR;
                              setRenew({ start, end: addDays(start, 365) });
                            }}
                            className="mt-2 text-xs font-bold text-white bg-amber-600 rounded-lg px-3 py-2"
                          >
                            재계약 진행
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-end gap-2 mt-2">
                            <div><p className="text-[10px] font-bold text-amber-700 mb-1">새 계약일자</p>
                              <input className={inputCls} type="date" value={renew.start} onChange={(e) => setRenew({ ...renew, start: e.target.value })} /></div>
                            <div><p className="text-[10px] font-bold text-amber-700 mb-1">새 계약종료일</p>
                              <input className={inputCls} type="date" value={renew.end} onChange={(e) => setRenew({ ...renew, end: e.target.value })} /></div>
                            <button onClick={renewContract} className="text-xs font-bold text-white bg-amber-600 rounded-lg px-3 py-2">재계약 확정</button>
                            <button onClick={() => setRenew(null)} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-3 py-2 bg-white">취소</button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <button onClick={toggleSiteActive} className="text-sm font-bold text-slate-400 border border-slate-200 rounded-xl px-3 py-2 whitespace-nowrap">
                        {site.isActive === false ? "계약 복구" : "계약종료"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><p className="text-xs font-bold text-slate-500 mb-1">현장명</p><input className={inputCls} value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} /></div>
                      <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">주소</p><input className={inputCls} value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div><p className="text-xs font-bold text-slate-500 mb-1">계약구분</p>
                        <select className={inputCls} value={siteForm.contractType} onChange={(e) => setSiteForm({ ...siteForm, contractType: e.target.value })}>
                          {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
                          {!CONTRACT_TYPES.includes(siteForm.contractType) && <option>{siteForm.contractType}</option>}
                        </select></div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 mb-1">보수료(VAT별도){!maintenanceCostReady && " (마이그레이션 대기)"}</p>
                        <input className={inputCls} type="number" placeholder="원" disabled={!maintenanceCostReady} value={siteForm.maintenanceCost} onChange={(e) => setSiteForm({ ...siteForm, maintenanceCost: e.target.value })} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 mb-1">계약일자{!contractDateReady && " (마이그레이션 대기)"}</p>
                        <input className={inputCls} type="date" disabled={!contractDateReady} value={siteForm.contractDate} onChange={(e) => setSiteForm({ ...siteForm, contractDate: e.target.value })} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 mb-1">계약종료일</p>
                        <input className={inputCls} type="date" value={siteForm.contractEnd} onChange={(e) => setSiteForm({ ...siteForm, contractEnd: e.target.value })} />
                      </div>
                      <div><p className="text-xs font-bold text-slate-500 mb-1">담당 기사</p>
                        <select className={inputCls} value={siteForm.assignedEngineer} onChange={(e) => setSiteForm({ ...siteForm, assignedEngineer: e.target.value })}>
                          <option value="">미배정</option>
                          {engineers.map((p) => <option key={p.id}>{p.name}</option>)}
                        </select></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><p className="text-xs font-bold text-slate-500 mb-1">전화번호</p><input className={inputCls} placeholder="관리사무소 대표번호" value={siteForm.phone} onChange={(e) => setSiteForm({ ...siteForm, phone: e.target.value })} /></div>
                      <div><p className="text-xs font-bold text-slate-500 mb-1">팩스</p><input className={inputCls} value={siteForm.fax} onChange={(e) => setSiteForm({ ...siteForm, fax: e.target.value })} /></div>
                      <div><p className="text-xs font-bold text-slate-500 mb-1">이메일</p><input className={inputCls} value={siteForm.email} onChange={(e) => setSiteForm({ ...siteForm, email: e.target.value })} /></div>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1"><p className="text-xs font-bold text-slate-500 mb-1">비고(전달사항)</p><input className={inputCls} value={siteForm.notes} onChange={(e) => setSiteForm({ ...siteForm, notes: e.target.value })} /></div>
                      <button onClick={cancelEditInfo} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5 whitespace-nowrap">취소</button>
                      <button onClick={saveSiteInfo} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">저장</button>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold">현장 담당자 <span className="text-slate-400">({contacts.length})</span></h2>
                  {editingContacts ? (
                    <div className="flex items-center gap-2">
                      <button onClick={addContact} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5">
                        <Plus size={13} /> 담당자 추가
                      </button>
                      <button onClick={() => setEditingContacts(false)} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5">완료</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingContacts(true)} className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5">수정하기</button>
                  )}
                </div>
                {contacts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">등록된 담당자가 없습니다</p>
                ) : editingContacts ? (
                  <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm table-fixed">
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
                  </table></div>
                ) : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm table-fixed">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="w-8" /><th className="text-left px-2 py-2 font-semibold w-28">역할</th>
                        <th className="text-left px-2 py-2 font-semibold w-24">이름</th>
                        <th className="text-left px-2 py-2 font-semibold w-36">전화번호</th>
                        <th className="text-left px-2 py-2 font-semibold">이메일</th>
                        <th className="text-left px-2 py-2 font-semibold w-28">팩스</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c) => (
                        <tr key={c.id} className="border-b border-slate-50">
                          <td className="pl-4 py-2 w-8 text-center">{c.isPrimary && <span className="text-amber-500">★</span>}</td>
                          <td className="px-2 py-2">{c.role}</td>
                          <td className="px-2 py-2">{c.name || "-"}</td>
                          <td className="px-2 py-2">{c.phone || "-"}</td>
                          <td className="px-2 py-2">{c.email || "-"}</td>
                          <td className="px-2 py-2">{c.fax || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold">승강기 정보 <span className="text-slate-400">({siteUnits.length})</span></h2>
                  {editingUnits ? (
                    <div className="flex items-center gap-2">
                      <button onClick={addUnit} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5">
                        <Plus size={13} /> 호기 추가
                      </button>
                      <button onClick={() => setEditingUnits(false)} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5">완료</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingUnits(true)} className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5">수정하기</button>
                  )}
                </div>
                {editingUnits ? (
                  <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm table-fixed">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="text-left px-4 py-2 font-semibold w-14">호기</th>
                        <th className="text-left px-2 py-2 font-semibold w-28">종류</th>
                        <th className="text-left px-2 py-2 font-semibold">모델</th>
                        <th className="text-left px-2 py-2 font-semibold w-32">설치일</th>
                        <th className="text-left px-2 py-2 font-semibold w-32">승강기고유번호</th>
                        <th className="w-40" />
                      </tr>
                    </thead>
                    <tbody>
                      {siteUnits.map((u) => (
                        <UnitRow key={u.id} unit={u} onSave={saveUnit} onToggleActive={toggleUnitActive} onDelete={deleteUnit} onOpenDetail={setUnitDetail} />
                      ))}
                    </tbody>
                  </table></div>
                ) : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm table-fixed">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="text-left px-4 py-2 font-semibold w-14">호기</th>
                        <th className="text-left px-2 py-2 font-semibold w-32">승강기고유번호</th>
                        <th className="text-left px-2 py-2 font-semibold w-28">종류</th>
                        <th className="text-left px-2 py-2 font-semibold">모델</th>
                        <th className="text-left px-2 py-2 font-semibold w-40">운행층수</th>
                        <th className="text-left px-2 py-2 font-semibold w-32">설치일자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteUnits.map((u) => {
                        const live = liveOf(u.id);
                        return (
                          <tr key={u.id} className={`border-b border-slate-50 ${u.isActive === false ? "opacity-40" : ""}`}>
                            <td className="px-4 py-2 font-bold whitespace-nowrap">
                              <button onClick={() => setUnitDetail(u)} className="text-blue-700 hover:underline">{u.unitNo}</button>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">{u.govNo || "미등록"}</td>
                            <td className="px-2 py-2 truncate" title={live?.kindNm || u.kind || u.unitType}>{live?.kindNm || u.kind || u.unitType}</td>
                            <td className="px-2 py-2 truncate" title={u.model ?? ""}>{u.model || "-"}</td>
                            <td className="px-2 py-2 truncate">{live?.groundFloorCnt ? `지상 ${live.groundFloorCnt} / 지하 ${live.undgrndFloorCnt ?? 0}` : u.floors || "-"}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{live?.frstInstallationDe || u.installDate || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                )}
                <p className="px-4 py-2.5 text-[10px] text-slate-400 border-t border-slate-50">
                  * 호기명을 클릭하면 상세정보(승강기정보·고장·검사·부품교체내역)를 볼 수 있습니다. 승강기고유번호를 등록하면 종류·설치일자가 국가승강기정보센터 실시간 데이터로 전환됩니다.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {unitDetail && (
        <UnitDetailModal
          unit={unitDetail}
          site={sites.find((s) => s.id === unitDetail.siteId)}
          failures={failures}
          inspections={inspections}
          billings={billings}
          onClose={() => setUnitDetail(null)}
        />
      )}
    </div>
  );
}
