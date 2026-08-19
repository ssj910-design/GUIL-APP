"use client";

// 할 일 관리 — 전체 할일 관제 + 관리자 권한 완료/취소 토글 + 할 일 배정(생성).
// 완료 규칙(DESIGN-v2 §7-2): 자재·견적 할일의 정상 완료 경로는 비용청구지만,
// 관리자는 예외적으로 임의 토글 가능(모바일 관리자 모드와 동일 권한).
import { useContext, useState } from "react";
import { Plus, Search, Repeat } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadPhoto } from "@/lib/photos";
import { mapInventoryStockMovement } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";
import { addDays, shortDate, formatUnitLabel } from "@/lib/utils";
import {
  locOf, addressOf, personOf, StatusBadge, AdminTable, FilterPills,
  Modal, SortableTh, sortRows, inputCls, DateTextInput, AdminAuthContext, PhotoGrid,
} from "@/app/components/admin/adminShared";

const SOURCE_LABEL = { material: "자재", quote: "견적", manual: "수동", inspection: "검사보완", selfcheck: "자체점검지적", waste_return: "반납확인" };

// 폐자재/여유부품 반납 할일이 "반납확인대기" 큐에 뜨는 조건: 기사가 사진 올려 완료 처리했지만
// (Task 5의 사진 잠금) 관리자가 아직 확인수량을 입력해 재고에 반영하지 않은 상태.
function wasteReturnPending(t) {
  return t.source === "waste_return" && t.done && !t.stockConfirmedAt;
}

// 자재/견적 연동 할일은 title이 "현장명[ 호기] ..." 형태로 저장되는데, 목록에는 이미
// "현장·호기" 열이 있으니 중복을 피하려고 그 앞부분을 잘라서 보여준다.
// (호기 라벨이 없던 옛 형식 데이터도 함께 매칭한다. 수동 할일은 제목에 현장명이 없어 그대로 둔다.)
function displayTitle(t) {
  if (t.source === "manual" || !t.siteName || !t.title) return t.title;
  const unitLabel = formatUnitLabel(t.elevatorNo);
  const withUnit = `${t.siteName}${unitLabel ? ` ${unitLabel}` : ""} `;
  const withoutUnit = `${t.siteName} `;
  if (t.title.startsWith(withUnit)) return t.title.slice(withUnit.length);
  if (t.title.startsWith(withoutUnit)) return t.title.slice(withoutUnit.length);
  return t.title;
}

function TodoDetailModal({ t, data, onClose, onSave }) {
  const { sites, units, profiles } = data;
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
  const currentUnit = units.find((u) => u.id === t.unitId);
  const initialSiteId = currentUnit?.siteId ?? sites.find((s) => s.name === t.siteName)?.id ?? "";
  const [form, setForm] = useState({
    title: t.title ?? "",
    description: t.description ?? "",
    siteId: initialSiteId,
    unitId: t.unitId ?? "",
    assigneeId: t.assigneeId ?? "",
    assignedDate: t.assignedDate ?? "",
    dueDate: t.dueDate ?? "",
    done: t.done,
  });
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState(t.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const siteUnits = units.filter((u) => u.siteId === form.siteId);

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, `todos/${t.id}`)));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave(t, { ...form, photoUrls: photos });
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="할 일 상세내역" onClose={onClose}>
      {t.reassignRequested && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1"><Repeat size={13} strokeWidth={2.5} /> 담당자 재배정 요청됨</p>
          {t.reassignReason && <p className="text-[13px] text-slate-700">사유: {t.reassignReason}</p>}
          {t.reassignTo && <p className="text-[13px] text-slate-700">희망 담당자: <b>{t.reassignTo}</b></p>}
          <p className="text-[11px] text-slate-400 mt-1">아래 담당자를 변경하면 요청이 자동 해제됩니다.</p>
        </div>
      )}
      <div className="space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">구분</p>
          <p className="text-sm font-semibold text-slate-700">{SOURCE_LABEL[t.source] ?? t.source}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">할일 제목</p>
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">현장</p>
            <select className={inputCls} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value, unitId: "" })}>
              <option value="">현장 없음</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">호기</p>
            <select className={inputCls} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} disabled={!form.siteId}>
              <option value="">전체(현장 공통)</option>
              {siteUnits.map((u) => <option key={u.id} value={u.id}>{u.unitNo}</option>)}
            </select>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">현장 주소</p>
          <p className="text-sm font-semibold text-slate-700">{sites.find((s) => s.id === form.siteId)?.address || "-"}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">내용</p>
          <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">담당자</p>
            <select className={inputCls} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">미배정</option>
              {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">상태</p>
            <select className={inputCls} value={form.done ? "done" : "open"} onChange={(e) => setForm({ ...form, done: e.target.value === "done" })}>
              <option value="open">진행</option>
              <option value="done">완료</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">배정일</p>
            <DateTextInput key={form.assignedDate} value={form.assignedDate} onChange={(v) => setForm({ ...form, assignedDate: v })} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기한</p>
            <DateTextInput key={form.dueDate} value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
          </div>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">사진 ({photos.length}장)</p>
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
      <div className="flex justify-end mt-4">
        <button disabled={saving || !form.title.trim()} onClick={save} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
          저장
        </button>
      </div>
    </Modal>
  );
}

function AssignTodoModal({ data, onClose, onCreate }) {
  const { sites, units, profiles } = data;
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
  const [form, setForm] = useState({ siteId: "", unitId: "", title: "", description: "", assigneeId: "", dueDate: addDays(TODAY_STR, 7) });
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [folderToken] = useState(() => Date.now());
  const siteUnits = units.filter((u) => u.siteId === form.siteId);
  const valid = form.siteId && form.title.trim() && form.assigneeId;

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, `todos/assign-${folderToken}`)));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    if (!valid) return;
    await onCreate({ ...form, photoUrls: photos });
    onClose();
  }

  return (
    <Modal title="할 일 배정" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">현장</p>
          <select className={inputCls} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value, unitId: "" })}>
            <option value="">현장을 선택하세요</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">호기</p>
          <select className={inputCls} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} disabled={!form.siteId}>
            <option value="">전체(현장 공통)</option>
            {siteUnits.map((u) => <option key={u.id} value={u.id}>{u.unitNo}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">할일 제목</p>
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 비상통화장치 배터리 교체" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">내용</p>
          <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">담당자</p>
            <select className={inputCls} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">담당자를 선택하세요</option>
              {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">기한</p>
            <DateTextInput key={form.dueDate} value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">사진 (선택)</p>
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
        <div className="flex justify-end pt-2">
          <button disabled={!valid || uploading} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
            배정하기
          </button>
        </div>
      </div>
    </Modal>
  );
}

// "행마다 확인수량 입력칸" — QuoteItemsModal의 편집행 패턴 재사용. 실제 재고 반영·할일 갱신은
// 부모(confirmWasteReturn)가 맡는다 — 이 파일의 다른 모달들(TodoDetailModal→onSave,
// AssignTodoModal→onCreate)과 같은 관례: supabase 호출·setData는 항상 TodosAdmin 쪽에서.
function WasteReturnConfirmModal({ todo, onClose, onConfirm }) {
  const rows = todo.wasteReturnRows ?? [];
  const [confirmedQty, setConfirmedQty] = useState(
    () => Object.fromEntries(rows.map((r) => [r.productId, r.qtyRequired - r.qtyConfirmed]))
  );
  const [saving, setSaving] = useState(false);
  // 재고입고(insert)가 이미 성공했으면 "확인" 재클릭(할일 갱신 실패 후 재시도) 때 중복 입고를
  // 막는다 — 모달이 닫혔다 다시 열리면(부모가 언마운트) 새 useState라 자연히 초기화된다.
  const [movementsInserted, setMovementsInserted] = useState(false);
  // 입고가 실제로 반영된 수량의 스냅샷 — 재시도 때는 입력칸(live confirmedQty)이 그 사이 수정됐을 수
  // 있으므로, 할일 갱신도 반드시 이 값(=원장에 실제로 쌓인 수량)을 기준으로 재시도해야 한다.
  const [insertedQty, setInsertedQty] = useState(null);

  async function submit() {
    setSaving(true);
    const qtyForConfirm = movementsInserted ? insertedQty : confirmedQty;
    const result = await onConfirm(qtyForConfirm, movementsInserted);
    setSaving(false);
    if (result?.movementsInserted) {
      if (!movementsInserted) setInsertedQty(confirmedQty);
      setMovementsInserted(true);
    }
    if (result?.ok) onClose();
  }

  return (
    <Modal title="반납 확인" onClose={onClose}>
      <div className="space-y-3">
        {(todo.photoUrls ?? []).length > 0 && <PhotoGrid urls={todo.photoUrls} cols={4} />}
        {rows.map((r) => (
          <div key={r.productId} className="flex items-center justify-between gap-2 text-sm">
            <span>{r.name} (요청 {r.qtyRequired - r.qtyConfirmed}EA{r.qtyConfirmed > 0 ? `, 기확인 ${r.qtyConfirmed}EA` : ""})</span>
            <input
              type="number"
              min={0}
              max={r.qtyRequired - r.qtyConfirmed}
              disabled={movementsInserted}
              className={inputCls + " w-20 disabled:bg-slate-100 disabled:text-slate-400"}
              value={(movementsInserted ? insertedQty : confirmedQty)[r.productId] ?? 0}
              onChange={(e) => {
                const outstanding = r.qtyRequired - r.qtyConfirmed;
                const n = Math.max(0, Math.min(outstanding, Math.floor(Number(e.target.value) || 0)));
                setConfirmedQty((prev) => ({ ...prev, [r.productId]: n }));
              }}
            />
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-slate-300 text-center py-2">반납 항목 없음</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2">취소</button>
          <button onClick={submit} disabled={saving} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2">
            {saving ? "처리 중..." : "확인"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function TodosAdmin({ data, setData, initialView }) {
  const { name: adminName, id: adminId } = useContext(AdminAuthContext);
  const { todos, sites, units, profiles } = data;
  const [view, setView] = useState(initialView ?? "open");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(null);
  const [detail, setDetail] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  const viewFiltered = todos.filter((t) => (view === "open" ? !t.done : view === "reassign" ? (t.reassignRequested && !t.done) : true));
  const q = search.trim().toLowerCase();
  // "반납확인대기"는 완료된(done=true) 할일을 보여주는 큐라, 위 상태(진행/완료) 필터를 그대로
  // 태우면 기본값인 "미완료" 뷰에서 항상 0건으로 보인다 — 이 필터만 view를 건너뛰고 todos 전체에서 뽑는다.
  const rows = (sourceFilter === "waste_return" ? todos.filter(wasteReturnPending) : viewFiltered.filter((t) => sourceFilter === "all" || t.source === sourceFilter))
    .filter((t) => !q || (t.description ?? "").toLowerCase().includes(q) || (t.title ?? "").toLowerCase().includes(q) || locOf(data, t.unitId, t.siteName, t.elevatorNo).toLowerCase().includes(q) || personOf(data, t.assigneeId, t.assignee).toLowerCase().includes(q));

  // "반납확인대기" 필터를 고르면 "상태" 필터도 전체로 맞춰준다 — 안 그러면 기본값 "미완료"가
  // 계속 선택된 채로 보여, 완료된 항목들이 나오는 게 시각적으로 앞뒤가 안 맞아 보인다.
  function handleSourceFilterChange(value) {
    setSourceFilter(value);
    if (value === "waste_return") setView("all");
  }

  const getVal = (t, key) => {
    switch (key) {
      case "source": return SOURCE_LABEL[t.source] ?? t.source ?? "";
      case "title": return displayTitle(t) ?? "";
      case "loc": return locOf(data, t.unitId, t.siteName, t.elevatorNo);
      case "person": return personOf(data, t.assigneeId, t.assignee);
      case "assignedDate": return t.assignedDate ?? "";
      case "dueDate": return t.dueDate ?? "";
      case "done": return t.done ? 1 : 0;
      default: return "";
    }
  };
  const sortedRows = sortRows(rows, sort, getVal);

  async function saveTodoDetail(t, form) {
    const unit = units.find((u) => u.id === form.unitId);
    const site = sites.find((s) => s.id === form.siteId);
    const engineer = profiles.find((p) => p.id === form.assigneeId);
    const photoUrls = form.photoUrls ?? [];
    // 재배정 요청 중인 할일의 담당자를 여기서 바꾸면 요청은 처리된 것이므로 자동 해제한다 (모바일 담당자 변경과 동일 규칙).
    const reassigned = form.assigneeId !== (t.assigneeId ?? "");
    const patch = {
      title: form.title.trim(), description: form.description || null,
      site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
      assignee: engineer?.name ?? null, assignee_id: form.assigneeId || null,
      assigned_date: form.assignedDate || null, due_date: form.dueDate || null, done: form.done,
      photo_count: photoUrls.length, photo_urls: photoUrls.length ? photoUrls : null,
      ...(reassigned ? { reassign_requested: false, reassign_reason: null, reassign_to: null } : {}),
    };
    const { error } = await supabase.from("todos").update(patch).eq("id", t.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      todos: prev.todos.map((x) => (x.id === t.id ? {
        ...x,
        title: patch.title, description: patch.description ?? "",
        siteName: patch.site_name, elevatorNo: patch.elevator_no, unitId: patch.unit_id,
        assignee: patch.assignee, assigneeId: patch.assignee_id,
        assignedDate: patch.assigned_date, dueDate: patch.due_date, done: patch.done,
        photoCount: patch.photo_count, photoUrls,
        ...(reassigned ? { reassignRequested: false, reassignReason: null, reassignTo: null } : {}),
      } : x)),
    }));
  }

  // 관리자가 반납확인 모달에서 입력한 확인수량(confirmedQty: { productId: qty })을 반영한다.
  // - 확인된 만큼만 재고 입고(inventory_stock_movements, todo_id로 이 할일과 연결)로 기록.
  // - 전부 확인됐으면(stock_confirmed_at 채워 큐에서 빠짐) 기록용으로 rows를 누적 확인수량 그대로 남긴다.
  // - 일부만 확인됐으면 done=false로 재오픈하고, waste_return_rows를 "남은 수량"만 담은 새 행으로
  //   다시 세팅한다(다음 회차엔 이게 새 요청량) — 사진도 비워 Task 5 잠금이 다시 걸리게 한다.
  // movementsAlreadyInserted: 이전 호출에서 재고입고까지는 성공했는데 할일 갱신이 실패해
  // 모달이 같은 확인수량으로 재시도하는 경우 — 입고를 또 하지 않고 할일 갱신만 재시도한다.
  async function confirmWasteReturn(t, confirmedQty, movementsAlreadyInserted) {
    const rows = t.wasteReturnRows ?? [];
    const movementRows = rows
      .filter((r) => (confirmedQty[r.productId] ?? 0) > 0)
      .map((r) => ({
        product_id: r.productId, type: "in", qty_delta: confirmedQty[r.productId],
        note: `할일 ${t.id} 반납확인`, todo_id: t.id, created_by: adminId ?? null,
      }));
    if (movementRows.length && !movementsAlreadyInserted) {
      const { data: inserted, error } = await supabase.from("inventory_stock_movements").insert(movementRows).select();
      if (error) { alert("재고 반영 실패: " + error.message); return { ok: false, movementsInserted: false }; }
      setData((prev) => ({ ...prev, inventoryStockMovements: [...prev.inventoryStockMovements, ...(inserted ?? []).map(mapInventoryStockMovement)] }));
    }

    const outstanding = rows.map((r) => ({ ...r, left: r.qtyRequired - r.qtyConfirmed - (confirmedQty[r.productId] ?? 0) }));
    const allDone = outstanding.every((r) => r.left <= 0);
    const stillOwed = outstanding.filter((r) => r.left > 0).map((r) => ({ productId: r.productId, name: r.name, qtyRequired: r.left, qtyConfirmed: 0 }));
    const finalRows = outstanding.map((r) => ({ productId: r.productId, name: r.name, qtyRequired: r.qtyRequired, qtyConfirmed: r.qtyConfirmed + (confirmedQty[r.productId] ?? 0) }));

    // 사진은 재오픈마다 지우지 않고 누적한다(1차/2차 제출 이력 보존, 설계서 참고).
    // 대신 photo_count에 "재오픈 시점까지의 사진 수"를 기준선으로 남겨, 기사 화면(TodoTab)의
    // 잠금 조건을 "사진이 1장이라도 있으면"에서 "기준선보다 사진이 늘었으면(=재오픈 후 새로 추가)"으로 바꾼다.
    const currentPhotoCount = t.photoUrls?.length ?? 0;
    const patch = allDone
      ? { waste_return_rows: finalRows, stock_confirmed_at: new Date().toISOString() }
      : {
          waste_return_rows: stillOwed, done: false, photo_count: currentPhotoCount,
          title: `폐자재/여유부품 반납 — ${stillOwed.map((r) => `${r.name} ${r.qtyRequired}EA`).join(", ")}`,
        };

    const { error: todoError } = await supabase.from("todos").update(patch).eq("id", t.id);
    if (todoError) { alert("할일 갱신 실패: " + todoError.message); return { ok: false, movementsInserted: true }; }

    setData((prev) => ({
      ...prev,
      todos: prev.todos.map((x) => (x.id === t.id ? {
        ...x,
        wasteReturnRows: allDone ? finalRows : stillOwed,
        stockConfirmedAt: allDone ? patch.stock_confirmed_at : null,
        done: allDone ? x.done : false,
        photoCount: allDone ? x.photoCount : currentPhotoCount,
        title: allDone ? x.title : patch.title,
      } : x)),
    }));
    return { ok: true, movementsInserted: true };
  }

  async function toggle(t) {
    await supabase.from("todos").update({ done: !t.done }).eq("id", t.id);
    setData((prev) => ({ ...prev, todos: prev.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }));
  }

  async function createTodo(form) {
    const unit = units.find((u) => u.id === form.unitId);
    const site = sites.find((s) => s.id === form.siteId);
    const engineer = profiles.find((p) => p.id === form.assigneeId);
    const id = "todo-manual-" + Date.now();
    const photoUrls = form.photoUrls ?? [];
    const row = {
      id, source: "manual", title: form.title.trim(), description: form.description || null,
      site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
      assignee: engineer?.name ?? null, assignee_id: form.assigneeId || null,
      assigned_date: TODAY_STR, due_date: form.dueDate || null, done: false,
      photo_count: photoUrls.length, photo_urls: photoUrls.length ? photoUrls : null,
      requested_by_id: adminId ?? null, requested_by_name: adminName,
    };
    const { error } = await supabase.from("todos").insert(row);
    if (error) { alert("배정 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      todos: [{
        id, source: "manual", title: row.title, description: row.description ?? "",
        siteName: row.site_name, elevatorNo: row.elevator_no, unitId: row.unit_id,
        assignee: row.assignee, assigneeId: row.assignee_id,
        assignedDate: row.assigned_date, dueDate: row.due_date, done: false,
        photoCount: photoUrls.length, photoUrls, part: null, materialRequestId: null, quoteRequestId: null,
        requestedById: row.requested_by_id, requestedByName: row.requested_by_name,
      }, ...prev.todos],
    }));
    // 배정된 기사에게 푸시 — 실패해도 등록 자체는 이미 끝났으니 조용히 넘어간다.
    if (form.assigneeId) {
      fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "todo_assigned",
          profileIds: [form.assigneeId],
          title: "할 일이 배정되었습니다",
          body: `${site?.name ? `${site.name} · ` : ""}${row.title}`,
          url: `/?openTodo=${id}`,
        }),
      }).catch(() => {});
    }
  }

  return (
    <div className="max-w-[100rem] mx-auto">
      <h1 className="text-xl font-extrabold mb-4">할 일 관리</h1>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400">상태</span>
            <FilterPills
              value={view}
              onChange={setView}
              options={[
                { value: "open", label: "미완료", count: todos.filter((t) => !t.done).length },
                { value: "all", label: "전체", count: todos.length },
                { value: "reassign", label: "재배정요청", count: todos.filter((t) => t.reassignRequested && !t.done).length },
              ]}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400">구분</span>
            <FilterPills
              value={sourceFilter}
              onChange={handleSourceFilterChange}
              options={[
                { value: "all", label: "전체", count: viewFiltered.length },
                { value: "material", label: "자재", count: viewFiltered.filter((t) => t.source === "material").length },
                { value: "quote", label: "견적", count: viewFiltered.filter((t) => t.source === "quote").length },
                { value: "manual", label: "수동", count: viewFiltered.filter((t) => t.source === "manual").length },
                { value: "inspection", label: "검사보완", count: viewFiltered.filter((t) => t.source === "inspection").length },
                { value: "selfcheck", label: "자체점검지적", count: viewFiltered.filter((t) => t.source === "selfcheck").length },
                { value: "waste_return", label: "반납확인대기", count: todos.filter(wasteReturnPending).length },
              ]}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-7 max-w-64`} placeholder="내용·현장·담당자 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setAssigning(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
            <Plus size={15} /> 할 일 배정
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="pl-5 w-8" />
              <SortableTh label="구분" sortKey="source" sort={sort} setSort={setSort} />
              <SortableTh label="현장 · 호기" sortKey="loc" sort={sort} setSort={setSort} />
              <SortableTh label="할일" sortKey="title" sort={sort} setSort={setSort} />
              <SortableTh label="담당자" sortKey="person" sort={sort} setSort={setSort} />
              <SortableTh label="배정일" sortKey="assignedDate" sort={sort} setSort={setSort} />
              <SortableTh label="기한" sortKey="dueDate" sort={sort} setSort={setSort} />
              <SortableTh label="상태" sortKey="done" sort={sort} setSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((t) => (
              <tr key={t.id} className={`border-b border-slate-50 ${t.done ? "opacity-50" : ""} cursor-pointer hover:bg-slate-50`} onClick={() => setDetail(t)}>
                <td className="pl-5 pr-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="w-4 h-4 rounded border-slate-300 cursor-pointer accent-blue-700" />
                </td>
                <td className="px-3 py-2.5"><StatusBadge tone={t.source === "manual" ? "slate" : "blue"}>{SOURCE_LABEL[t.source] ?? t.source}</StatusBadge></td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{locOf(data, t.unitId, t.siteName, t.elevatorNo)}</td>
                <td className="px-3 py-2.5 font-semibold">{displayTitle(t)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, t.assigneeId, t.assignee)}</td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{shortDate(t.assignedDate)}</td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{shortDate(t.dueDate)}</td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {wasteReturnPending(t) ? (
                    <button onClick={() => setConfirmTarget(t)} className="text-xs font-bold text-white bg-blue-700 rounded-lg px-2.5 py-1">반납확인</button>
                  ) : t.done ? (
                    <StatusBadge tone="green">완료</StatusBadge>
                  ) : (
                    <StatusBadge tone="amber">진행</StatusBadge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">* 자재·견적 할일의 정상 완료 경로는 기사 비용청구입니다. 체크박스는 관리자 예외 처리용.</p>

      {detail && <TodoDetailModal t={detail} data={data} onClose={() => setDetail(null)} onSave={saveTodoDetail} />}
      {assigning && <AssignTodoModal data={data} onClose={() => setAssigning(false)} onCreate={createTodo} />}
      {confirmTarget && (
        <WasteReturnConfirmModal
          todo={confirmTarget}
          onClose={() => setConfirmTarget(null)}
          onConfirm={(qty, movementsAlreadyInserted) => confirmWasteReturn(confirmTarget, qty, movementsAlreadyInserted)}
        />
      )}
    </div>
  );
}
