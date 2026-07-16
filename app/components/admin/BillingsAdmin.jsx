"use client";

// 청구내역 — 청구 건 조회 + 합계. 각 건 클릭 시 상세보기(사진 포함)에서
// 내용(관리자 메모) 추가, 담당자 변경, 기한(교체일자) 수정이 가능하다.
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { locOf, personOf, StatusBadge, AdminTable, Modal, inputCls } from "@/app/components/admin/adminShared";

function BillingDetailModal({ b, data, onClose, onSave }) {
  const { profiles } = data;
  const engineers = profiles.filter((p) => p.role === "engineer");
  const notesReady = data.billings.some((x) => x.notes !== undefined);
  const [form, setForm] = useState({
    notes: b.notes ?? "",
    engineerId: b.engineerId ?? "",
    replaceDate: b.replaceDate ?? "",
  });
  const [saving, setSaving] = useState(false);
  const photos = [...(b.beforePhotoUrls ?? []), ...(b.afterPhotoUrls ?? [])];
  if (b.confirmPhotoUrl) photos.push(b.confirmPhotoUrl);

  async function save() {
    setSaving(true);
    const engineerName = engineers.find((p) => p.id === form.engineerId)?.name ?? b.engineer;
    await onSave(b, {
      engineer_id: form.engineerId || null,
      engineer: engineerName,
      replace_date: form.replaceDate || null,
      ...(notesReady ? { notes: form.notes || null } : {}),
    });
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="청구 상세내역" onClose={onClose} wide>
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 · 호기</p><p className="font-semibold text-slate-800">{locOf(data, b.unitId, b.siteName, b.elevatorNo)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">교체내역</p><p className="font-semibold text-slate-800">{b.part}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">금액</p><p className="font-semibold text-slate-800">{b.cost ? Number(b.cost).toLocaleString() + "원" : "-"}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">제출일</p><p className="font-semibold text-slate-800">{b.submittedAt}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 담당자 연락처</p><p className="font-semibold text-slate-800">{b.contactPhone || "-"}</p></div>
          <div>
            {b.materialRequestId || b.type === "material"
              ? <StatusBadge tone="blue">자재 지급건</StatusBadge>
              : <StatusBadge tone="slate">직접 입력</StatusBadge>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">담당자 변경</p>
            <select className={inputCls} value={form.engineerId} onChange={(e) => setForm({ ...form, engineerId: e.target.value })}>
              <option value="">{b.engineer ?? "미배정"}</option>
              {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기한(교체일자) 수정</p>
            <input className={inputCls} type="date" value={form.replaceDate} onChange={(e) => setForm({ ...form, replaceDate: e.target.value })} />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">내용{!notesReady && " (마이그레이션 대기)"}</p>
          <textarea
            className={inputCls}
            rows={3}
            disabled={!notesReady}
            placeholder={notesReady ? "관리자 메모를 입력하세요" : "011 마이그레이션 실행 후 사용 가능합니다"}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">사진 ({photos.length}장)</p>
        {photos.length === 0 ? (
          <p className="text-xs text-slate-400">등록된 사진이 없습니다</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((url, i) => (
              <img key={i} src={url} alt="" className="w-full aspect-square rounded-lg object-cover border border-slate-200" />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end mt-4">
        <button disabled={saving} onClick={save} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
          저장
        </button>
      </div>
    </Modal>
  );
}

export default function BillingsAdmin({ data, setData }) {
  const { billings } = data;
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);

  const q = search.trim();
  const rows = billings.filter((b) =>
    !q ||
    locOf(data, b.unitId, b.siteName, b.elevatorNo).includes(q) ||
    (b.part ?? "").includes(q) ||
    personOf(data, b.engineerId, b.engineer).includes(q)
  );
  const total = rows.reduce((sum, b) => sum + (Number(b.cost) || 0), 0);

  async function saveBilling(b, patch) {
    const { error } = await supabase.from("billings").update(patch).eq("id", b.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      billings: prev.billings.map((x) => (x.id === b.id ? {
        ...x,
        engineerId: patch.engineer_id, engineer: patch.engineer, replaceDate: patch.replace_date,
        ...("notes" in patch ? { notes: patch.notes } : {}),
      } : x)),
    }));
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-xl font-extrabold">청구내역</h1>
        <p className="text-sm text-slate-500">
          {q && `검색결과 ${rows.length}건 / `}총 {billings.length}건 · <span className="font-extrabold text-slate-900">{total.toLocaleString()}원</span>
        </p>
      </div>
      <div className="relative mb-3 max-w-72">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className={`${inputCls} pl-8`} placeholder="현장·부품·기사명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <AdminTable head={["제출", "현장 · 호기", "교체내역", "교체일", "금액", "기사", "근거", "사진"]}>
        {rows.map((b) => (
          <tr key={b.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setDetail(b)}>
            <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{b.submittedAt}</td>
            <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, b.unitId, b.siteName, b.elevatorNo)}</td>
            <td className="px-3 py-2.5 text-slate-600">{b.part}</td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{b.replaceDate ?? "-"}</td>
            <td className="px-3 py-2.5 font-bold whitespace-nowrap">{b.cost ? Number(b.cost).toLocaleString() + "원" : "-"}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, b.engineerId, b.engineer)}</td>
            <td className="px-3 py-2.5">
              {b.materialRequestId || b.type === "material"
                ? <StatusBadge tone="blue">자재 지급건</StatusBadge>
                : <StatusBadge tone="slate">직접 입력</StatusBadge>}
            </td>
            <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
              전 {b.beforePhotoUrls?.length ?? 0} · 후 {b.afterPhotoUrls?.length ?? 0} · 확인서 {b.confirmPhotoUrl ? 1 : 0}
            </td>
          </tr>
        ))}
      </AdminTable>

      {detail && <BillingDetailModal b={detail} data={data} onClose={() => setDetail(null)} onSave={saveBilling} />}
    </div>
  );
}
