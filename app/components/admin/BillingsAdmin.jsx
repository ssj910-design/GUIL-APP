"use client";

// 부품교체·공사 내역 — 청구 건 조회 + 합계. 각 건 클릭 시 상세보기(사진 포함)에서
// 내용(관리자 메모) 추가, 담당자 변경, 기한(교체일자) 수정이 가능하다.
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { shortDate } from "@/lib/utils";
import { locOf, addressOf, personOf, StatusBadge, AdminTable, Modal, inputCls, PhotoGrid, DateTextInput, EditableDate } from "@/app/components/admin/adminShared";

const BILLING_METHODS = ["계좌이체", "CMS", "지로"];

// 현장 담당자(현장 측 연락 담당) — 청구는 unitId(v2)만 있고 siteId가 없어 units를 거쳐 찾는다.
function siteManagerOf(data, unitId, fallbackSiteName) {
  const unit = data.units.find((u) => u.id === unitId);
  const site = unit ? data.sites.find((s) => s.id === unit.siteId) : data.sites.find((s) => s.name === fallbackSiteName);
  return site?.manager || "-";
}

function BillingDetailModal({ b, data, onClose, onSave, onToggleFree }) {
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

  // 무상 처리 — 켤 때는 사유를 받아 내용(notes)에 남긴다. 이미 무상이면 사유 없이 바로 해제.
  async function handleToggleFree() {
    if (b.isFree) {
      await onToggleFree(b, null);
      onClose();
      return;
    }
    const reason = prompt("무상 처리 사유를 입력해주세요 (부품 하자 A/S, 서비스 차원 등)");
    if (reason === null) return; // 취소
    await onToggleFree(b, reason.trim() || null);
    onClose();
  }

  return (
    <Modal title="상세내역" onClose={onClose} wide>
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 · 호기</p><p className="font-semibold text-slate-800">{locOf(data, b.unitId, b.siteName, b.elevatorNo)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 주소</p><p className="font-semibold text-slate-800">{addressOf(data, b.unitId, b.siteName)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">교체내역</p><p className="font-semibold text-slate-800">{b.part}</p></div>
          <div>
            <p className="text-xs font-bold text-slate-400 mb-1">금액</p>
            {b.isFree ? (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">무상</span>
            ) : (
              <p className="font-semibold text-slate-800">{b.cost ? Number(b.cost).toLocaleString() + "원" : "-"}</p>
            )}
          </div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">제출일</p><p className="font-semibold text-slate-800">{shortDate(b.submittedAt)}</p></div>
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
            <DateTextInput key={form.replaceDate ?? "unset"} value={form.replaceDate} onChange={(v) => setForm({ ...form, replaceDate: v })} />
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
        <PhotoGrid urls={photos} />
      </div>

      <div className="flex justify-between mt-4">
        <button onClick={handleToggleFree} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-5 py-2.5">
          {b.isFree ? "무상 해제하기" : "무상 처리하기"}
        </button>
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
  // 무상 처리된 건은 합계에서 제외한다.
  const total = rows.reduce((sum, b) => sum + (b.isFree ? 0 : Number(b.cost) || 0), 0);

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

  // 청구일·청구방식 — 목록에서 바로 수기입력하는 필드라 저장도 즉시 처리한다.
  async function updateManualField(b, column, key, value) {
    const { error } = await supabase.from("billings").update({ [column]: value || null }).eq("id", b.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, billings: prev.billings.map((x) => (x.id === b.id ? { ...x, [key]: value || null } : x)) }));
  }

  // 무상 처리 — 청구 상세내역에서만 지원(모바일 앱엔 없음). 금액은 그대로 두고 표시·합계에서만
  // 제외한다. 켤 때 받은 사유는 내용(notes)에 남겨 상세내역에서 그대로 볼 수 있게 한다.
  async function toggleFree(b, reason) {
    const next = !b.isFree;
    const notesReady = data.billings.some((x) => x.notes !== undefined);
    const patch = { is_free: next };
    if (next && reason && notesReady) {
      patch.notes = (b.notes ? b.notes + "\n" : "") + `[무상처리] ${reason}`;
    }
    const { error } = await supabase.from("billings").update(patch).eq("id", b.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      billings: prev.billings.map((x) => (x.id === b.id ? { ...x, isFree: next, ...(patch.notes !== undefined ? { notes: patch.notes } : {}) } : x)),
    }));
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-xl font-extrabold">부품교체·공사 내역</h1>
        <p className="text-sm text-slate-500">
          {q && `검색결과 ${rows.length}건 / `}총 {billings.length}건 · <span className="font-extrabold text-slate-900">{total.toLocaleString()}원</span>
        </p>
      </div>
      <div className="relative mb-3 max-w-72">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className={`${inputCls} pl-8`} placeholder="현장·부품·기사명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <AdminTable head={["현장 · 호기", "담당자", "작업자", "교체내역", "금액", "교체일", "근거", "청구일", "청구방식"]}>
        {rows.map((b) => (
          <tr key={b.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setDetail(b)}>
            <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, b.unitId, b.siteName, b.elevatorNo)}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">{siteManagerOf(data, b.unitId, b.siteName)}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, b.engineerId, b.engineer)}</td>
            <td className="px-3 py-2.5 text-slate-600">{b.part}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">
              {b.isFree ? (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">무상</span>
              ) : (
                <span className="font-bold">{b.cost ? Number(b.cost).toLocaleString() + "원" : "-"}</span>
              )}
            </td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{shortDate(b.replaceDate)}</td>
            <td className="px-3 py-2.5">
              {b.materialRequestId || b.type === "material"
                ? <StatusBadge tone="blue">자재 지급건</StatusBadge>
                : <StatusBadge tone="slate">직접 입력</StatusBadge>}
            </td>
            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
              <EditableDate key={b.billingDate ?? "unset"} value={b.billingDate} onCommit={(v) => updateManualField(b, "billing_date", "billingDate", v)} />
            </td>
            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
              <select
                className={`${inputCls} min-w-24`}
                value={b.billingMethod ?? ""}
                onChange={(e) => updateManualField(b, "billing_method", "billingMethod", e.target.value)}
              >
                <option value="">선택</option>
                {BILLING_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </td>
          </tr>
        ))}
      </AdminTable>

      {detail && <BillingDetailModal b={detail} data={data} onClose={() => setDetail(null)} onSave={saveBilling} onToggleFree={toggleFree} />}
    </div>
  );
}
