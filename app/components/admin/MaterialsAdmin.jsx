"use client";

// 자재신청 처리 — 지급완료 액션 포함.
// 입력이 필요 없는 전환(없음)은 없고, 사진·담당기사·금액처럼 입력이 필요한 전환(자재 지급완료)만
// 모달을 쓴다 (docs/superpowers/specs/2026-07-21-materials-admin-actions-design.md).
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { notify } from "@/lib/push";
import { uploadPhoto } from "@/lib/photos";
import { unitIdFor, addDays, shortDate, parsePartQty } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { locOf, addressOf, personOf, assigneeNames, billingCompleteFor, StatusBadge, AdminTable, inputCls, Modal, PhotoGrid } from "@/app/components/admin/adminShared";

const MATERIAL_TONE = { 승인대기: "blue", 지급완료: "green", 반려: "red", 교체완료: "indigo" };
const MATERIAL_REJECT_REASONS = ["중복 요청", "현장 확인 필요", "내용 부족", "재고 보유"];

// 부품별 금액 필수 입력값을 지급 문자열("부품명(₩1,000)")에서 되찾아 수정 모달 기본값으로 쓴다.
function parseAmountFromBillingPart(billingPart, part) {
  if (!billingPart) return "";
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = billingPart.match(new RegExp(`${escaped}\\(₩([0-9,]+)\\)`));
  return m ? m[1].replace(/,/g, "") : "";
}

export default function MaterialsAdmin({ data, setData }) {
  const { materialRequests: allMaterialRequests } = data;
  const [search, setSearch] = useState("");
  const [payTarget, setPayTarget] = useState(null); // 지급완료 처리 중인 자재신청
  // 지급완료 체크는 모달이 닫히는 것 말고는 눈에 보이는 반응이 없어(목록 배지 변화는 필터에
  // 가려 안 보일 수 있음) "됐나?" 싶은 게 당연하다 — 처리 직후 잠깐 토스트를 띄운다.
  const [toast, setToast] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null); // 상세내역 보는 중인 자재신청
  const [rejectTarget, setRejectTarget] = useState(null); // 반려 사유 입력 중인 자재신청
  // todos.billing_part_rows 컬럼 존재 여부 — 마이그레이션 112 실행 전엔 컬럼이 없어, 있을 때만
  // 부품별 구조화 행(이름·수량·금액)을 같이 쓴다.
  const billingPartRowsReady = (data.todos ?? []).some((t) => t.billingPartRows !== undefined);

  const query = search.trim().toLowerCase();
  // 기사가 요청 후 취소한 건은 삭제하지 않고 데이터는 그대로 남겨(cancelled_at/cancelled_by로
  // 감사 기록 보존) 화면에만 안 보이게 한다.
  const materialRequests = allMaterialRequests.filter((m) =>
    m.status !== "취소" &&
    (!query || locOf(data, m.unitId, m.siteName, m.elevatorNo).toLowerCase().includes(query) || (m.part ?? "").toLowerCase().includes(query) || personOf(data, m.requesterId, m.engineer).toLowerCase().includes(query))
  );

  // 지급 전(승인대기) 신청만 반려한다 — 지급 후 잘못 나간 건은 기사가 모바일에서 반려(재지급 흐름)하므로
  // 그 목록("기사 반려")과 섞이지 않게 지급 전 건으로 한정한다.
  async function handleMaterialReject(request, reason) {
    const { data: rows, error } = await supabase.from("material_requests")
      .update({ status: "반려", reject_reason: reason, rejected_date: TODAY_STR })
      .eq("id", request.id).eq("status", "승인대기").select("id");
    if (error) { alert("반려 처리 실패: " + error.message); return false; }
    if (!rows?.length) { alert("그 사이 신청 상태가 바뀌었습니다. 새로고침 후 다시 확인해주세요."); return false; }
    if (request.requesterId) {
      notify("material_rejected", {
        profileIds: [request.requesterId],
        title: "자재 신청이 반려됐어요",
        body: `${request.siteName ?? ""} · ${request.part} — ${reason}`,
        url: "/",
      });
    }
    setData((prev) => ({
      ...prev,
      materialRequests: prev.materialRequests.map((r) => (r.id === request.id ? { ...r, status: "반려", rejectReason: reason, rejectedDate: TODAY_STR } : r)),
    }));
    return true;
  }

  async function handleMaterialSupplyComplete(request, { assigneeId, billingPart, billingAmount, billingPartRows, photoUrls }) {
    const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
    const assigneeName = engineer?.name ?? request.engineer;

    const todoId = "todo-" + request.id;
    const dueDate = addDays(TODAY_STR, 30);
    const unitId = request.unitId ?? unitIdFor(data.units, request.siteId, request.elevatorNo);
    const rowsToSave = billingPartRows?.length ? billingPartRows : null;
    const todoRow = {
      id: todoId,
      material_request_id: request.id,
      source: "material",
      title: `${request.siteName} ${request.part} 교체 및 확인서 제출`,
      site_name: request.siteName,
      elevator_no: request.elevatorNo,
      part: request.part,
      assignee: assigneeName,
      assigned_date: TODAY_STR,
      due_date: dueDate,
      done: false,
      unit_id: unitId,
      assignee_id: assigneeId || null,
      billing_part: billingPart,
      billing_amount: billingAmount,
      ...(billingPartRowsReady ? { billing_part_rows: rowsToSave } : {}),
    };
    // 할 일을 먼저 upsert(=재시도 시 같은 id로 다시 써도 안전)한 뒤 상태를 바꾼다 —
    // 반대 순서면 상태 변경 후 할 일 생성이 실패했을 때 DB(지급완료)와 화면(승인대기)이
    // 어긋나고, insert였다면 재시도 시 같은 id 충돌로 영구히 막히는 문제가 있었다.
    const { error: todoError } = await supabase.from("todos").upsert(todoRow);
    if (todoError) { alert("할 일 생성 실패: " + todoError.message); return; }

    const patch = {
      status: "지급완료",
      supplied_date: TODAY_STR,
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("material_requests").update(patch).eq("id", request.id);
    if (error) { alert("지급완료 처리 실패: " + error.message); return; }
    if (assigneeId) notify("supply_ready", { profileIds: [assigneeId], title: "자재 지급 완료 — 수령 확인해주세요", body: `${request.siteName}${request.elevatorNo ? ` · ${request.elevatorNo}` : ""} · ${request.part}`, url: `/?openTodo=${todoId}` });

    setData((prev) => ({
      ...prev,
      materialRequests: prev.materialRequests.map((r) =>
        r.id === request.id
          ? { ...r, status: "지급완료", suppliedDate: TODAY_STR, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls }
          : r
      ),
      todos: [
        {
          id: todoId, materialRequestId: request.id, quoteRequestId: null, source: "material", title: todoRow.title,
          siteName: request.siteName, elevatorNo: request.elevatorNo, part: request.part,
          assignee: assigneeName, assignedDate: TODAY_STR, dueDate, done: false,
          unitId, assigneeId: assigneeId || null, billingPart, billingAmount, billingPartRows: rowsToSave,
        },
        ...prev.todos,
      ],
    }));
  }

  // 지급완료된 자재신청 수정 — 상태/지급일은 그대로 두고 사진·담당기사·금액만 바꾼다
  // (연결된 할 일은 이미 있으므로 새로 만들지 않고 그 자리에서 update).
  async function handleMaterialEdit(request, { assigneeId, billingPart, billingAmount, billingPartRows, photoUrls }) {
    const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
    const assigneeName = engineer?.name ?? request.engineer;

    const patch = {
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("material_requests").update(patch).eq("id", request.id);
    if (error) { alert("수정 실패: " + error.message); return; }

    const todoId = "todo-" + request.id;
    // 담당기사가 바뀌었는지는 여기서 고쳐 쓰기 전 할 일에 남아있던 담당자와 비교해서 판단한다 —
    // material_requests엔 담당기사 컬럼이 없어 할 일이 유일한 기준이다.
    const prevAssigneeId = (data.todos ?? []).find((t) => t.id === todoId)?.assigneeId;
    const assigneeChanged = assigneeId && assigneeId !== prevAssigneeId;
    const rowsToSave = billingPartRows?.length ? billingPartRows : null;
    const todoPatch = {
      assignee: assigneeName, assignee_id: assigneeId || null, billing_part: billingPart, billing_amount: billingAmount,
      ...(billingPartRowsReady ? { billing_part_rows: rowsToSave } : {}),
    };
    const { error: todoError } = await supabase.from("todos").update(todoPatch).eq("id", todoId);
    if (todoError) { alert("할 일 수정 실패: " + todoError.message); return; }
    if (assigneeChanged) {
      notify("supply_ready", { profileIds: [assigneeId], title: "자재 지급 담당자로 변경됨 — 수령 확인해주세요", body: `${request.siteName}${request.elevatorNo ? ` · ${request.elevatorNo}` : ""} · ${request.part}`, url: `/?openTodo=${todoId}` });
    }

    setData((prev) => ({
      ...prev,
      materialRequests: prev.materialRequests.map((r) =>
        r.id === request.id ? { ...r, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls } : r
      ),
      todos: prev.todos.map((t) =>
        t.id === todoId ? { ...t, assignee: assigneeName, assigneeId: assigneeId || null, billingPart, billingAmount, billingPartRows: rowsToSave } : t
      ),
    }));
  }

  return (
    <div className="max-w-[100rem] mx-auto">
      <h1 className="text-xl font-extrabold mb-4">자재신청관리</h1>
      <div className="flex items-center justify-end gap-3 mb-3">
        <div className="relative max-w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-8`} placeholder="현장·부품·기사명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <AdminTable head={["신청일", "현장 · 호기", "자재", "긴급도", "신청 기사", "지급사진", "상태", "처리"]}>
        {materialRequests.map((m) => (
          <tr
            key={m.id}
            className="border-b border-slate-50 cursor-pointer hover:bg-slate-50"
            onClick={() => setDetailTarget(m)}
          >
            <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{shortDate(m.requestedDate)}</td>
            <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, m.unitId, m.siteName, m.elevatorNo)}</td>
            <td className="px-3 py-2.5 text-slate-600">{m.part}</td>
            <td className="px-3 py-2.5">
              {m.urgency === "긴급" ? <StatusBadge tone="red">긴급</StatusBadge> : <span className="text-slate-500 text-xs">{m.urgency}</span>}
            </td>
            <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, m.requesterId, m.engineer)}</td>
            <td className="px-3 py-2.5 text-xs text-slate-500">{m.supplyPhotoUrls?.length ? `${m.supplyPhotoUrls.length}장` : "-"}</td>
            <td className="px-3 py-2.5">
              {(() => {
                const displayStatus =
                  m.status === "지급완료" && billingCompleteFor(data.todos ?? [], "materialRequestId", m.id)
                    ? "교체완료"
                    : m.status;
                return <StatusBadge tone={MATERIAL_TONE[displayStatus] ?? "slate"}>{displayStatus}</StatusBadge>;
              })()}
              {m.status === "반려" && m.rejectReason && <p className="text-[10px] text-red-500 mt-1">{m.rejectReason}</p>}
            </td>
            <td className="px-3 py-2.5 whitespace-nowrap">
              {m.status === "승인대기" ? (
                <button onClick={(e) => { e.stopPropagation(); setPayTarget(m); }} className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors px-2.5 py-1.5 rounded-lg">
                  지급하기
                </button>
              ) : m.status === "지급완료" ? (
                <button onClick={(e) => { e.stopPropagation(); setPayTarget(m); }} className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors px-2.5 py-1.5 rounded-lg">
                  수정
                </button>
              ) : (
                <span className="text-xs text-slate-300">-</span>
              )}
            </td>
          </tr>
        ))}
      </AdminTable>
      {materialRequests.length === 0 && <p className="text-xs text-slate-400 text-center py-6">해당하는 건이 없습니다</p>}
      <p className="text-[10px] text-slate-400 mt-2">* 지급 전 신청은 상세내역에서 반려할 수 있습니다. 지급 후 잘못 나간 자재의 반려는 기사가 모바일에서 진행합니다.</p>

      {payTarget && (
        <MaterialSupplyModal
          request={payTarget}
          profiles={data.profiles ?? []}
          todos={data.todos ?? []}
          onClose={() => setPayTarget(null)}
          onSubmit={async (input) => {
            const isEdit = payTarget.status === "지급완료";
            if (isEdit) await handleMaterialEdit(payTarget, input);
            else await handleMaterialSupplyComplete(payTarget, input);
            setPayTarget(null);
            setToast(isEdit ? "수정했습니다." : "지급완료 처리했습니다.");
            setTimeout(() => setToast(null), 1800);
          }}
        />
      )}

      {detailTarget && (
        <MaterialDetailModal request={detailTarget} data={data} onClose={() => setDetailTarget(null)} onReject={() => setRejectTarget(detailTarget)} />
      )}

      {rejectTarget && (
        <MaterialRejectModal
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSubmit={async (reason) => {
            if (!(await handleMaterialReject(rejectTarget, reason))) return;
            setRejectTarget(null);
            setDetailTarget(null);
            setToast("반려 처리했습니다.");
            setTimeout(() => setToast(null), 1800);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-slate-800/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function MaterialSupplyModal({ request, profiles, todos, onClose, onSubmit }) {
  const isEdit = request.status === "지급완료";
  const existingTodo = todos.find((t) => t.materialRequestId === request.id);
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
  const defaultAssigneeId = existingTodo?.assigneeId || request.requesterId || engineers.find((p) => p.name === request.engineer)?.id || "";
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
  const [photos, setPhotos] = useState(request.supplyPhotoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const parts = (request.part ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const [amounts, setAmounts] = useState(() => {
    const initial = {};
    parts.forEach((part, i) => {
      const found = parseAmountFromBillingPart(existingTodo?.billingPart, part);
      if (found) initial[i] = found;
    });
    return initial;
  });
  const total = parts.reduce((sum, _, i) => sum + (Number(amounts[i]) || 0), 0);
  const billingPartText = parts
    .map((part, i) => (amounts[i] ? `${part}(₩${Number(amounts[i]).toLocaleString()})` : part))
    .join(", ");
  const allAmountsFilled = parts.every((_, i) => amounts[i] !== undefined && amounts[i] !== "");
  const billingPartRows = parts.map((part, i) => {
    const { name, qty } = parsePartQty(part);
    return { name: name || part, qty: qty || null, amount: Number(amounts[i]) || 0 };
  });

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, `materials/${request.id}/supply`)));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    setSaving(true);
    await onSubmit({ assigneeId, billingPart: billingPartText || null, billingAmount: total || null, billingPartRows, photoUrls: photos });
    setSaving(false);
  }

  return (
    <Modal title={`${request.siteName ?? "-"} · ${request.part} — ${isEdit ? "지급 내역 수정" : "지급완료 처리"}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">지급 사진 (선택)</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {photos.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                <button
                  onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
            사진 추가
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">담당 기사</label>
          <select className={inputCls} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">담당자 선택 (기본 {request.engineer})</option>
            {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">부품별 금액 (필수)</label>
          <div className="space-y-1.5">
            {parts.map((part, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs text-slate-700 flex-1 truncate">{part}</span>
                <input
                  type="number"
                  className={`${inputCls} w-28`}
                  placeholder="금액"
                  value={amounts[i] ?? ""}
                  onChange={(e) => setAmounts((m) => ({ ...m, [i]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {parts.length > 1 && <p className="text-[10px] text-slate-400 text-right mt-1">합계 ₩{total.toLocaleString()}</p>}
          {!allAmountsFilled && <p className="text-[10px] text-red-500 mt-1">모든 부품의 금액을 입력해주세요</p>}
        </div>

        <button
          onClick={submit}
          disabled={saving || uploading || !allAmountsFilled}
          className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
        >
          {saving ? "처리 중..." : isEdit ? "수정 저장" : "지급완료 처리"}
        </button>
      </div>
    </Modal>
  );
}

// 청구내역(BillingsAdmin.jsx의 BillingDetailModal)과 동일한 구성 —
// 라벨/값 그리드 + 사진 그리드. 실제 수정(담당기사/금액/사진)은 목록의
// "지급완료 처리"/"수정" 버튼이 여는 전용 모달에서 하므로 여기는 읽기 전용이다.
function MaterialRejectModal({ request, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!reason.trim() || saving) return;
    setSaving(true);
    await onSubmit(reason.trim());
    setSaving(false);
  }

  return (
    <Modal title={`반려 — ${request.siteName ?? ""} · ${request.part}`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">신청 기사에게 사유와 함께 알림이 갑니다.</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {MATERIAL_REJECT_REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${reason === r ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-500 border-slate-200"}`}>
            {r}
          </button>
        ))}
      </div>
      <textarea className={inputCls} rows={3} placeholder="사유 (직접 입력 가능)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="text-sm font-bold text-slate-500 px-4 py-2 rounded-lg border border-slate-200">닫기</button>
        <button onClick={submit} disabled={!reason.trim() || saving} className="text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-300 px-4 py-2 rounded-lg">
          {saving ? "처리 중..." : "반려하기"}
        </button>
      </div>
    </Modal>
  );
}

function MaterialDetailModal({ request: r, data, onClose, onReject }) {
  const assignee = assigneeNames(data, "materialRequestId", r.id);
  const displayStatus = r.status === "지급완료"
    ? (billingCompleteFor(data.todos ?? [], "materialRequestId", r.id) ? "교체완료" : "지급완료")
    : r.status;
  const tone = MATERIAL_TONE[displayStatus] ?? "slate";

  return (
    <Modal title="자재신청 상세내역" onClose={onClose} wide="2xl">
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 · 호기</p><p className="font-semibold text-slate-800">{locOf(data, r.unitId, r.siteName, r.elevatorNo)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">현장 주소</p><p className="font-semibold text-slate-800">{addressOf(data, r.unitId, r.siteName)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">부품 내역</p><p className="font-semibold text-slate-800">{r.part}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">긴급도</p><p className="font-semibold text-slate-800">{r.urgency}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">신청일</p><p className="font-semibold text-slate-800">{shortDate(r.requestedDate)}</p></div>
          <div><p className="text-xs font-bold text-slate-400 mb-1">신청 기사</p><p className="font-semibold text-slate-800">{personOf(data, r.requesterId, r.engineer)}</p></div>
          {assignee && (
            <div><p className="text-xs font-bold text-slate-400 mb-1">담당 기사</p><p className="font-semibold text-slate-800">{assignee}</p></div>
          )}
          <div><StatusBadge tone={tone}>{displayStatus}</StatusBadge></div>
        </div>

        {r.note && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기사 의견</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.note}</p>
          </div>
        )}

        {r.status === "반려" && r.rejectReason && (
          <div>
            <p className="text-xs font-bold text-red-500 mb-1">반려 사유</p>
            <p className="text-sm text-red-700">{r.rejectReason}</p>
          </div>
        )}
      </div>

      {r.photoUrls?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-bold text-slate-500 mb-2">기사 요청 사진 ({r.photoUrls.length}장)</p>
          <PhotoGrid urls={r.photoUrls} cols={6} />
        </div>
      )}
      {r.supplyPhotoUrls?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">지급 사진 ({r.supplyPhotoUrls.length}장)</p>
          <PhotoGrid urls={r.supplyPhotoUrls} cols={6} />
        </div>
      )}
      {r.status === "승인대기" && (
        <div className="flex justify-end mt-4">
          <button onClick={onReject} className="text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">
            반려
          </button>
        </div>
      )}
    </Modal>
  );
}
