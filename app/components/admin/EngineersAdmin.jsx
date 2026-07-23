"use client";

// 기사 관리 — 프로필(연락처·담당지역) 편집 + 배정 현장·업무량 한눈에.
import { useState, useRef } from "react";
import { GripVertical, Paperclip } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadPhoto } from "@/lib/photos";
import { formatPhone, shortDate } from "@/lib/utils";
import { StatusBadge, AdminTable, inputCls, DateTextInput, EditableDate, EditableText, Modal } from "@/app/components/admin/adminShared";
import ImportEngineers from "@/app/components/admin/ImportEngineers";
import DutyAdmin from "@/app/components/admin/DutyAdmin";
import LeavesAdmin from "@/app/components/admin/LeavesAdmin";
import WorkCalendar from "@/app/components/admin/WorkCalendar";
import AttendanceAdmin from "@/app/components/admin/AttendanceAdmin";

function EngineerRow({ p, unitCount, onSave, onDelete, onOpenContract, dragProps }) {
  const [form, setForm] = useState({
    phone: p.phone ?? "", minwonId: p.minwon_id ?? "", hireDate: p.hire_date ?? "",
    address: p.address ?? "", vehicleNo: p.vehicle_no ?? "",
  });
  const dirty = form.phone !== (p.phone ?? "") || form.minwonId !== (p.minwon_id ?? "")
    || form.hireDate !== (p.hire_date ?? "") || form.address !== (p.address ?? "") || form.vehicleNo !== (p.vehicle_no ?? "");
  return (
    <tr
      onDragOver={dragProps.onDragOver}
      onDrop={dragProps.onDrop}
      className={`border-b border-slate-50 ${dragProps.isDragging ? "opacity-30" : ""} ${dragProps.isOver ? "bg-blue-50" : ""}`}
    >
      <td
        draggable
        onDragStart={dragProps.onDragStart}
        onDragEnd={dragProps.onDragEnd}
        className="pl-5 pr-1 py-2.5 text-slate-300 cursor-grab active:cursor-grabbing"
        title="드래그해서 순서 변경"
      >
        <GripVertical size={15} />
      </td>
      <td className="pr-3 py-2.5 whitespace-nowrap">
        <p className="font-bold">{p.name}</p>
        <p className="text-[10px] text-slate-400 font-semibold">{p.member_type ?? "구분 없음"}</p>
      </td>
      <td className="px-3 py-2.5 w-32">
        <EditableDate value={form.hireDate} onCommit={(v) => setForm({ ...form, hireDate: v })} />
      </td>
      <td className="px-3 py-2.5 w-48">
        <EditableText value={form.address} placeholder="주소" onCommit={(v) => setForm({ ...form, address: v })} />
      </td>
      <td className="px-3 py-2.5 w-36">
        <EditableText value={form.phone} placeholder="연락처" format={formatPhone} onCommit={(v) => setForm({ ...form, phone: v })} />
      </td>
      <td className="px-3 py-2.5 w-32">
        <EditableText value={form.vehicleNo} placeholder="차량번호" onCommit={(v) => setForm({ ...form, vehicleNo: v })} />
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap text-slate-600 font-semibold">{unitCount}대</td>
      <td className="px-3 py-2.5 w-32">
        <EditableText value={form.minwonId} placeholder="민원24 점검자 ID" onCommit={(v) => setForm({ ...form, minwonId: v })} />
      </td>
      <td className="px-3 py-2.5">
        {p.auth_user_id ? <StatusBadge tone="green">계정 연결됨</StatusBadge> : <StatusBadge tone="slate">계정 없음</StatusBadge>}
      </td>
      <td className="px-3 py-2.5 text-right pr-4 whitespace-nowrap">
        <button onClick={() => onOpenContract(p)}
          className="text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5">
          근로계약서
        </button>
        <button disabled={!dirty} onClick={() => onSave(p, form)}
          className="ml-1.5 text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-3 py-1.5">
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


// 모바일용 인사기록카드 — 12칸짜리 표를 가로로 미는 대신 한 사람을 한 장에 담는다.
function EngineerCard({ p, unitCount, onSave, onDelete, onOpenContract }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    phone: p.phone ?? "", minwonId: p.minwon_id ?? "", hireDate: p.hire_date ?? "",
    address: p.address ?? "", vehicleNo: p.vehicle_no ?? "",
  });
  const dirty = form.phone !== (p.phone ?? "") || form.minwonId !== (p.minwon_id ?? "")
    || form.hireDate !== (p.hire_date ?? "") || form.address !== (p.address ?? "") || form.vehicleNo !== (p.vehicle_no ?? "");
  const Line = ({ k, v }) => (
    <div className="flex justify-between gap-3 py-1 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-400 shrink-0">{k}</span>
      <span className="text-[11px] font-semibold text-slate-600 text-right break-all">{v || "-"}</span>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-slate-800">{p.name}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {p.member_type ?? "구분 미지정"}
            {p.hire_date && ` · 입사 ${shortDate(p.hire_date)}`}
          </p>
        </div>
        {p.auth_user_id ? <StatusBadge tone="green">계정 연결</StatusBadge> : <StatusBadge tone="slate">계정 없음</StatusBadge>}
      </div>

      <div className="mt-3">
        <Line k="주소" v={p.address} />
        <Line k="연락처" v={p.phone} />
        <Line k="차량번호" v={p.vehicle_no} />
        <Line k="담당대수" v={`${unitCount}대`} />
        <Line k="아이디(민원24)" v={p.minwon_id} />
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
          <div>
            <p className="text-[11px] font-bold text-slate-500 mb-1">입사일</p>
            <DateTextInput value={form.hireDate} onChange={(v) => setForm({ ...form, hireDate: v })} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 mb-1">주소</p>
            <input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 mb-1">연락처</p>
            <input className={inputCls} inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 mb-1">차량번호</p>
            <input className={inputCls} value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 mb-1">아이디(민원24)</p>
            <input className={inputCls} value={form.minwonId} onChange={(e) => setForm({ ...form, minwonId: e.target.value })} />
          </div>
        </div>
      )}

      <div className="flex gap-1.5 mt-3">
        <button onClick={() => setOpen((v) => !v)}
          className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg py-2.5">
          {open ? "접기" : "수정"}
        </button>
        {open && (
          <button disabled={!dirty} onClick={() => { onSave(p, form); setOpen(false); }}
            className="flex-1 text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg py-2.5">저장</button>
        )}
        <button onClick={() => onOpenContract(p)}
          className="text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-3 py-2.5">근로계약서</button>
        <button onClick={() => onDelete(p)}
          className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">삭제</button>
      </div>
    </div>
  );
}


// 근로계약서 사본 첨부 — 사진/PDF 아무거나 photos 버킷에 올리고 URL만 저장한다.
function ContractModal({ p, onClose, onSave }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file, `contracts/${p.id}`);
      await onSave(p, url);
    } catch (err) {
      alert("업로드 실패: " + (err.message ?? "알 수 없는 오류"));
    }
    setUploading(false);
  }

  return (
    <Modal title={`${p.name} 근로계약서`} onClose={onClose}>
      {p.contract_url ? (
        <div className="space-y-3">
          <a href={p.contract_url} target="_blank" rel="noreferrer" className="block text-sm font-bold text-blue-700 underline">
            첨부된 계약서 사본 보기
          </a>
          <button onClick={() => onSave(p, null)}
            className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
            첨부 삭제
          </button>
        </div>
      ) : (
        <>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full border-2 border-dashed border-slate-300 rounded-xl py-8 flex flex-col items-center gap-1.5 text-slate-500 disabled:opacity-50"
          >
            <Paperclip size={22} />
            <span className="text-xs font-semibold">{uploading ? "업로드 중..." : "계약서 사본 첨부 (사진/PDF)"}</span>
          </button>
        </>
      )}
    </Modal>
  );
}

export default function EngineersAdmin({ data, setData, sub: subProp, onSub }) {
  const { profiles, sites, units } = data;
  // 표시 순서(staff_order)대로 정렬 — 순서 없는 사람은 뒤로. 당직 순번(duty_order)과는
  // 별개 컬럼이라 여기서 드래그로 바꿔도 당직 근무표 로직에 영향이 없다.
  const engineers = profiles.filter((p) => p.role === "engineer" && p.is_active !== false)
    .slice().sort((a, b) => (a.staff_order ?? 999) - (b.staff_order ?? 999));
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [contractTarget, setContractTarget] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const archived = profiles.filter((p) => p.is_active === false)
    .sort((a, b) => String(b.deleted_at ?? "").localeCompare(String(a.deleted_at ?? "")));
  const [subLocal, setSubLocal] = useState("직원");
  // 대시보드에서 특정 탭으로 바로 들어오는 경우가 있어 상위에서 제어할 수 있게 열어 둔다
  const sub = subProp ?? subLocal;
  const setSub = onSub ?? setSubLocal;

  function unitCountOf(p) {
    return units.filter((u) => u.isActive !== false && sites.some((s) => s.id === u.siteId && s.assignedEngineer === p.name)).length;
  }

  async function addEngineer() {
    const name = newName.trim();
    if (!name) return;
    if (profiles.some((p) => p.name === name)) { alert("같은 이름의 직원이 이미 있습니다."); return; }
    setAdding(true);
    const { data, error } = await supabase.from("profiles").insert({ name, role: "engineer" }).select();
    setAdding(false);
    if (error) { alert("등록 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, profiles: [...prev.profiles, data[0]] }));
    setNewName("");
  }

  // 드래그로 목록 순서를 바꾸면 전체 순서를 1..N으로 다시 매겨 staff_order에 저장한다.
  async function handleDrop(targetIndex) {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); setOverIndex(null); return; }
    const reordered = [...engineers];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDragIndex(null);
    setOverIndex(null);
    await Promise.all(reordered.map((p, idx) => supabase.from("profiles").update({ staff_order: idx + 1 }).eq("id", p.id)));
    const orderMap = new Map(reordered.map((p, idx) => [p.id, idx + 1]));
    setData((prev) => ({
      ...prev,
      profiles: prev.profiles.map((x) => (orderMap.has(x.id) ? { ...x, staff_order: orderMap.get(x.id) } : x)),
    }));
  }

  // 삭제는 실제 행 제거가 아니라 비활성 처리 — 고장·할일·자체점검이 이 프로필을 참조하고 있어
  // 진짜 지우면 과거 기록의 담당자가 사라진다.
  // 제외(삭제) — 행을 지우지 않고 사유·시각만 남긴다. 순번·근무제는 보존해 복구 시 그대로 돌아온다.
  // 모인 이력은 나중에 슈퍼관리자 콘솔에서 업체별 퇴사/제외 현황으로 쓴다.
  async function remove(p) {
    const reason = prompt(`${p.name} 님을 인사 목록에서 제외합니다.\n사유를 적어주세요 (퇴사·부서이동 등). 비워도 됩니다.`);
    if (reason === null) return; // 취소
    const patch = { is_active: false, deleted_at: new Date().toISOString(), delete_reason: reason.trim() || null };
    const { error } = await supabase.from("profiles").update(patch).eq("id", p.id);
    if (error) { alert("제외 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) }));
  }

  async function restore(p) {
    const patch = { is_active: true, deleted_at: null, delete_reason: null };
    await supabase.from("profiles").update(patch).eq("id", p.id);
    setData((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) }));
  }

  async function save(p, form) {
    const patch = {
      phone: form.phone || null,
      minwon_id: form.minwonId || null,
      hire_date: form.hireDate || null,
      address: form.address || null,
      vehicle_no: form.vehicleNo || null,
    };
    await supabase.from("profiles").update(patch).eq("id", p.id);
    setData((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) }));
  }

  async function saveContract(p, url) {
    await supabase.from("profiles").update({ contract_url: url }).eq("id", p.id);
    setData((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, contract_url: url } : x)) }));
    setContractTarget((t) => (t && t.id === p.id ? { ...t, contract_url: url } : t));
  }

  return (
    <div className="max-w-[100rem] mx-auto">
      <h1 className="text-xl font-extrabold mb-3">인사관리</h1>
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {["직원", "당직 근무표", "출근부", "연차관리", "워크 캘린더"].map((s) => (
          <button key={s} onClick={() => setSub(s)}
            className={`text-sm font-bold px-4 py-2.5 -mb-px border-b-2 ${
              sub === s ? "text-blue-700 border-blue-700" : "text-slate-400 border-transparent"
            }`}>
            {s}
          </button>
        ))}
      </div>
      {sub === "당직 근무표" && <DutyAdmin data={data} setData={setData} />}
      {sub === "연차관리" && <LeavesAdmin data={data} setData={setData} />}
      {sub === "출근부" && <AttendanceAdmin data={data} />}
      {sub === "워크 캘린더" && <WorkCalendar data={data} />}
      {sub !== "직원" ? null : (<>
      <p className="text-xs text-slate-500 mb-4">
        계정 연결 = 로그인 계정과 연결된 프로필 (Phase 2에서 가입 시 자동 연결). 민원24 ID = 공단에 등록된 점검자 ID — 자체점검 자동 보고(SELCHK_USID)에 사용됩니다. 목록 왼쪽 손잡이를 드래그하면 순서를 바꿀 수 있습니다.
      </p>
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex items-end gap-2 flex-wrap">
        <div>
          <p className="text-[11px] font-bold text-slate-500 mb-1">기사 이름</p>
          <input className={inputCls} placeholder="예: 이승준" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <button onClick={addEngineer} disabled={!newName.trim() || adding}
          className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-4 py-2">
          {adding ? "등록 중…" : "기사 추가"}
        </button>
        <button onClick={() => setImporting(true)}
          className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          공단 회원목록 엑셀로 등록
        </button>
        <p className="text-[11px] text-slate-400 ml-auto max-w-xs text-right">당직 순번·근무제 지정은 「당직 근무표」 탭에서 합니다.</p>
      </div>
      {importing && <ImportEngineers data={data} setData={setData} onClose={() => setImporting(false)} />}
      <div className="lg:hidden space-y-2.5">
        {engineers.map((p) => (
          <EngineerCard key={p.id} p={p} unitCount={unitCountOf(p)} onSave={save} onDelete={remove} onOpenContract={setContractTarget} />
        ))}
      </div>
      <div className="hidden lg:block">
      <AdminTable minWidth="76rem" head={["", "이름", "입사일", "주소", "연락처", "차량번호", "담당대수", "아이디(민원24)", "로그인", ""]}>
        {engineers.map((p, i) => (
          <EngineerRow
            key={p.id}
            p={p}
            unitCount={unitCountOf(p)}
            onSave={save}
            onDelete={remove}
            onOpenContract={setContractTarget}
            dragProps={{
              onDragStart: () => setDragIndex(i),
              onDragOver: (e) => { e.preventDefault(); setOverIndex(i); },
              onDrop: () => handleDrop(i),
              onDragEnd: () => { setDragIndex(null); setOverIndex(null); },
              isDragging: dragIndex === i,
              isOver: overIndex === i && dragIndex !== i,
            }}
          />
        ))}
      </AdminTable>
      </div>

      {contractTarget && <ContractModal p={contractTarget} onClose={() => setContractTarget(null)} onSave={saveContract} />}

      {archived.length > 0 && (
        <details className="mt-5 bg-white border border-slate-200 rounded-xl px-4 py-3">
          <summary className="text-xs font-bold text-slate-500 cursor-pointer">
            제외된 직원 {archived.length}명 — 기록 보관 중
          </summary>
          <p className="text-[11px] text-slate-400 mt-2 mb-2.5">
            데이터는 지워지지 않습니다. 과거 고장·할일·점검의 담당자 표기가 유지되며,
            슈퍼관리자 콘솔에서 퇴사·제외 이력으로 집계할 예정입니다.
          </p>
          <div className="space-y-1.5">
            {archived.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                <p className="text-xs text-slate-600 min-w-0">
                  <span className="font-bold text-slate-800">{p.name}</span>
                  <span className="text-slate-400"> · {p.member_type ?? "구분 없음"}</span>
                  <br />
                  <span className="text-[11px] text-slate-400">
                    {p.deleted_at ? String(p.deleted_at).slice(0, 10) : "일자 미상"} 제외
                    {p.delete_reason && ` · ${p.delete_reason}`}
                  </span>
                </p>
                <button onClick={() => restore(p)}
                  className="shrink-0 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                  복구
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      </>)}
    </div>
  );
}
