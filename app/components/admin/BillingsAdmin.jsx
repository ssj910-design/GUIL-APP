"use client";

// 부품교체·공사 내역 — 청구 건 조회 + 합계. 각 건 클릭 시 상세보기(사진 포함)에서
// 내용(관리자 메모) 추가, 담당자 변경, 기한(교체일자) 수정이 가능하다.
import { useState, useContext } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { shortDate } from "@/lib/utils";
import { BRAND } from "@/lib/company";
import { locOf, addressOf, personOf, StatusBadge, AdminTable, Modal, inputCls, PhotoGrid, DateTextInput, EditableDate, AdminAuthContext } from "@/app/components/admin/adminShared";
import ReplacementCertificateViewer from "@/app/components/admin/ReplacementCertificateViewer";

const BILLING_METHODS = ["계좌이체", "CMS", "지로"];

// 청구 건 하나를 교체확인서 PDF 입력 형태로 바꾼다. 부품이 2개 이상(billing_part_rows
// 기반 구조화 저장건)이면 부품별 단가·금액까지 나오고, 그 전 방식(부품 1개 또는 옛
// 데이터)으로 남은 건은 단가 정보가 없어 수량만 보여준다 — 없는 값을 지어내지 않는다.
function buildCertificateData(b, data) {
  const items = (b.partPhotos?.length > 1 ? b.partPhotos : null)?.map((p) => ({
    name: p.name,
    qty: p.qty,
    amount: p.amount ?? null,
    beforeUrl: p.beforeUrls?.[0] ?? null,
    afterUrl: p.afterUrls?.[0] ?? null,
  })) ?? [{
    name: b.part,
    qty: null,
    amount: b.isFree ? null : b.cost,
    beforeUrl: b.beforePhotoUrls?.[0] ?? null,
    afterUrl: b.afterPhotoUrls?.[0] ?? null,
  }];

  return {
    docNumber: `${BRAND.code}-${b.id.slice(0, 8).toUpperCase()}`,
    issuedDate: shortDate(new Date().toISOString().slice(0, 10)),
    siteUnit: locOf(data, b.unitId, b.siteName, b.elevatorNo),
    address: addressOf(data, b.unitId, b.siteName),
    engineerName: personOf(data, b.engineerId, b.engineer),
    replaceDate: shortDate(b.replaceDate),
    items,
    totalCost: b.cost,
    isFree: b.isFree,
    approval: b.approvalMethod
      ? {
          method: b.approvalMethod,
          signatureUrl: b.signatureUrl,
          approverName: b.approverName,
          approverPhone: b.approverPhone,
          approvedAt: b.approvedAt ? shortDate(b.approvedAt.slice(0, 10)) : null,
        }
      : null,
  };
}

// 현장 담당자(현장 측 연락 담당) — 청구는 unitId(v2)만 있고 siteId가 없어 units를 거쳐 찾는다.
function siteManagerOf(data, unitId, fallbackSiteName) {
  const unit = data.units.find((u) => u.id === unitId);
  const site = unit ? data.sites.find((s) => s.id === unit.siteId) : data.sites.find((s) => s.name === fallbackSiteName);
  if (!site) return "-";
  // 콘솔은 옛 컬럼 sites.manager를 갱신하지 않아 늘 stale → v2 site_managers 대표 담당자 우선 (P1-6)
  const mgrs = (data.siteManagers ?? []).filter((m) => m.siteId === site.id);
  const primary = mgrs.find((m) => m.isPrimary) ?? mgrs[0];
  return primary?.name || site.manager || "-";
}

function BillingDetailModal({ b, data, onClose, onSave, onToggleFree, onAdjustPrice }) {
  const { profiles } = data;
  const isSuper = useContext(AdminAuthContext).tier === "super"; // 무상처리·가격조정은 최고관리자만
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
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

  // 가격 조정 — 청구 금액을 직접 다시 입력한다.
  async function handleAdjustPrice() {
    const input = prompt("새 가격을 입력해주세요 (원)", b.cost ?? "");
    if (input === null) return; // 취소
    const value = Number(input.replace(/[^0-9.-]/g, ""));
    if (!input.trim() || Number.isNaN(value)) { alert("올바른 숫자를 입력해주세요"); return; }
    await onAdjustPrice(b, value);
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
        <div className="flex gap-2">
          {isSuper ? (
            <>
              <button onClick={handleToggleFree} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-5 py-2.5">
                {b.isFree ? "무상 해제하기" : "무상 처리"}
              </button>
              <button onClick={handleAdjustPrice} className="text-sm font-bold text-blue-700 bg-white border border-blue-200 rounded-xl px-5 py-2.5">
                가격 조정
              </button>
            </>
          ) : (
            <p className="text-[11px] text-slate-400 self-center">무상 처리·가격 조정은 최고관리자만 가능합니다</p>
          )}
        </div>
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
  const [certTarget, setCertTarget] = useState(null);

  const q = search.trim().toLowerCase();
  const rows = billings.filter((b) =>
    !q ||
    locOf(data, b.unitId, b.siteName, b.elevatorNo).toLowerCase().includes(q) ||
    (b.part ?? "").toLowerCase().includes(q) ||
    personOf(data, b.engineerId, b.engineer).toLowerCase().includes(q)
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

  // 가격 조정 — 청구 상세내역에서 금액을 다시 입력했을 때 반영한다.
  async function adjustPrice(b, cost) {
    const { error } = await supabase.from("billings").update({ cost }).eq("id", b.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, billings: prev.billings.map((x) => (x.id === b.id ? { ...x, cost } : x)) }));
  }

  return (
    <div className="max-w-[100rem] mx-auto">
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
      <AdminTable head={["현장 · 호기", "담당자", "작업자", "교체내역", "금액", "교체일", "교체확인서", "청구일", "청구방식"]}>
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
            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setCertTarget(b)}
                className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap hover:bg-blue-100"
              >
                교체확인서 보기
              </button>
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

      {detail && <BillingDetailModal b={detail} data={data} onClose={() => setDetail(null)} onSave={saveBilling} onToggleFree={toggleFree} onAdjustPrice={adjustPrice} />}
      {certTarget && (
        <ReplacementCertificateViewer
          cert={buildCertificateData(certTarget, data)}
          filenameBase={`교체확인서_${locOf(data, certTarget.unitId, certTarget.siteName, certTarget.elevatorNo).replace(/[\\/:*?"<>|\s]+/g, "")}`}
          onClose={() => setCertTarget(null)}
        />
      )}
    </div>
  );
}
