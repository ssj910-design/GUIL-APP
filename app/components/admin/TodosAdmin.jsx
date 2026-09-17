"use client";

// 할 일 관리 — 전체 할일 관제 + 관리자 권한 완료/취소 토글 + 할 일 배정(생성).
// 완료 규칙(DESIGN-v2 §7-2): 자재·견적 할일의 정상 완료 경로는 비용청구지만,
// 관리자는 예외적으로 임의 토글 가능(모바일 관리자 모드와 동일 권한).
import { useContext, useState } from "react";
import { Plus, Search, Repeat, Pencil, ChevronDown, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadPhoto } from "@/lib/photos";
import { confirmAsync } from "@/app/components/ConfirmHost";
import { mapInventoryStockMovement, mapTodo } from "@/lib/mappers";
import { notify } from "@/lib/push";
import { TODAY_STR } from "@/lib/constants";
import { addDays, shortDate, formatUnitLabel } from "@/lib/utils";
import {
  locOf, personOf, Modal, sortRows, inputCls, AdminAuthContext, PhotoGrid, SiteAutocomplete,
} from "@/app/components/admin/adminShared";

const SOURCE_LABEL = { material: "자재", quote: "견적", manual: "수동", inspection: "검사보완", selfcheck: "자체점검지적", waste_return: "반납확인" };

// 라벨(왼쪽 고정폭)·입력칸(오른쪽) 한 줄짜리 폼 행 — 할일배정/할일상세 공용 레이아웃.
function FieldRow({ label, children }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-slate-50 last:border-0">
      <p className="w-16 shrink-0 text-xs font-bold text-slate-500 pt-2">{label}</p>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// 이름 검색 자동완성 + 선택된 사람은 삭제 가능한 태그로 표시 — 요청자(단일)·담당자(복수) 공용.
// 단일 선택(요청자)은 onAdd를 "기존 선택 교체"로 넘겨주는 쪽(호출부)에서 처리한다.
function PersonPicker({ candidates, selectedIds, onAdd, onRemove, placeholder }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? candidates.filter((p) => !selectedIds.includes(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const selected = candidates.filter((p) => selectedIds.includes(p.id));
  return (
    <div>
      <div className="relative">
        <input
          className={inputCls}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setQuery(""), 150)}
        />
        {filtered.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((p) => (
              <button
                type="button"
                key={p.id}
                onMouseDown={() => { onAdd(p.id); setQuery(""); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2.5 py-1">
              {p.name}
              <button type="button" onClick={() => onRemove(p.id)} className="text-slate-400 hover:text-slate-600">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// 기한 — 빠른 선택 버튼(없음/오늘/내일/다음 주) + 직접 날짜 선택. 달력은 네이티브 input[type=date]가
// 클릭하면 바로 뜨는 걸 그대로 쓴다(별도 캘린더 컴포넌트 불필요).
function DueDateField({ value, onChange }) {
  const quick = [
    { key: "none", label: "없음", date: "" },
    { key: "today", label: "오늘", date: TODAY_STR },
    { key: "tomorrow", label: "내일", date: addDays(TODAY_STR, 1) },
    { key: "nextweek", label: "다음 주", date: addDays(TODAY_STR, 7) },
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {quick.map((qd) => (
        <button
          key={qd.key}
          type="button"
          onClick={() => onChange(qd.date)}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg ${value === qd.date ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          {qd.label}
        </button>
      ))}
      <input type="date" className={`${inputCls} flex-1 min-w-[140px]`} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// 파일첨부 — 썸네일 미리보기(×삭제) + "내 PC" 버튼. 할일배정(생성)·할일상세(단건 수정) 공용.
function PhotoAddSection({ photos, setPhotos, uploading, onFiles }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
          내 PC
          <input type="file" accept="image/*" multiple className="hidden" onChange={onFiles} disabled={uploading} />
        </label>
        <span className="text-xs text-slate-400">첨부파일 {photos.length}개</span>
      </div>
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
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
      )}
    </div>
  );
}

// 상태·구분 필터 — 평소엔 접힌 한 줄("상태: 미완료 (36)")로 있다가 눌러야 목록이 펼쳐진다.
// 예전엔 FilterPills로 옵션 전부를 펼쳐뒀는데, 상태(3)+구분(7) 총 10개 버튼이 늘 떠 있으니
// 목록 컬럼(340px)에선 너무 붐벼서 드롭다운으로 접었다.
function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <div className="relative flex-1 min-w-0" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-1 text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
      >
        <span className="truncate">{label}: {current?.label}{current?.count != null ? ` (${current.count})` : ""}</span>
        <ChevronDown size={12} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onMouseDown={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left text-xs font-semibold px-3 py-2 hover:bg-slate-50 ${value === o.value ? "text-blue-700 bg-blue-50" : "text-slate-600"}`}
            >
              {o.label}{o.count != null ? ` (${o.count})` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 폐자재/여유부품 반납 할일이 "반납확인대기" 큐에 뜨는 조건: 기사가 사진 올려 완료 처리했지만
// (Task 5의 사진 잠금) 관리자가 아직 확인수량을 입력해 재고에 반영하지 않은 상태.
function wasteReturnPending(t) {
  return t.source === "waste_return" && t.done && !t.stockConfirmedAt;
}

// 자재/견적 연동 할일은 담당자 수만큼 각자 별도 행으로 저장돼 있다 —
// 목록에서는 같은 요청을 공유하는 행을 한 건으로 묶어서 보여준다. 요청 연결이 없는(수동·검사보완 등)
// 할일은 원래도 1건뿐이라 그대로 둔다.
function groupKeyOf(t) {
  if (t.source === "quote" && t.quoteRequestId) return `quote:${t.quoteRequestId}`;
  if (t.source === "material" && t.materialRequestId) return `material:${t.materialRequestId}`;
  // 관리자 직접 할일부여(복수 담당자)도 담당자 수만큼 행이 생기는데, 요청 id가 없어 위와 같은
  // 방식으로 묶을 수 없다 — 대신 id가 "todo-manual-<생성시각>-<순번>" 형태로 배정 배치마다
  // 같은 시각을 공유하므로 순번만 떼어 배치 키로 쓴다.
  if (t.source === "manual" && typeof t.id === "string" && /^todo-manual-\d+-\d+$/.test(t.id)) {
    // 생성시각(ms)이 우연히 겹친 다른 배정까지 한 건으로 묶이지 않게 제목·현장도 키에 넣는다.
    return `${t.id.replace(/-\d+$/, "")}|${t.title ?? ""}|${t.siteName ?? ""}`;
  }
  return `solo:${t.id}`;
}

// 담당자를 여러 명으로 늘릴 수 있는 할일 — 새로 만든 담당자 행이 groupKeyOf로 같은 건에 계속
// 묶여야 한다. 요청 연결이 없는 검사보완·자체점검지적·반납 등(1건짜리)은 담당자 교체만 된다.
function canHaveMultipleAssignees(t) {
  return (t.source === "quote" && !!t.quoteRequestId)
    || (t.source === "material" && !!t.materialRequestId)
    || (t.source === "manual" && typeof t.id === "string" && /^todo-manual-\d+-\d+$/.test(t.id));
}

// 할일의 "현장 · 호기" — 여러 호기를 한 건으로 묶은 자재·견적 할일은 unit_id가 대표 호기 하나뿐이라
// 그대로 쓰면 "1호기"로만 보인다. 호기 목록(elevator_nos)이 2개 이상이면 그걸 보여준다.
function todoLocOf(data, t) {
  if (t.elevatorNos?.length > 1) {
    const siteName = data.sites.find((s) => s.id === data.units.find((u) => u.id === t.unitId)?.siteId)?.name ?? t.siteName ?? "-";
    return `${siteName} · ${formatUnitLabel(t.elevatorNos)}`;
  }
  return locOf(data, t.unitId, t.siteName, t.elevatorNo);
}

// 목록 한 줄 — 완료 토글(원)은 그룹 전원에게 같이 적용한다(기존 표의 체크박스와 동일 규칙).
function TodoListRow({ group, data, selected, onSelect, onToggleGroup }) {
  const t = group[0];
  const effectiveDone = (m) => (wasteReturnPending(m) ? false : m.done);
  const groupDone = group.every(effectiveDone);
  const overdue = !groupDone && t.dueDate && new Date(t.dueDate) < new Date(TODAY_STR);
  return (
    <div
      onClick={() => onSelect(group)}
      className={`flex items-start gap-2.5 px-3.5 py-3 border-b border-slate-50 cursor-pointer ${selected ? "bg-blue-50/60" : "hover:bg-slate-50"} ${groupDone ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleGroup(group, groupDone); }}
        className={`w-4 h-4 mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center ${groupDone ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}
      >
        {groupDone && <Check size={10} className="text-white" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold truncate ${groupDone ? "line-through text-slate-400" : "text-slate-800"}`}>{t.title}</p>
        <p className="text-[11px] text-slate-400 truncate">{todoLocOf(data, t)}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
          기한 : <span className={`font-semibold ${overdue ? "text-red-600" : "text-slate-600"}`}>{t.dueDate ? shortDate(t.dueDate) : "없음"}</span>
          {" · "}담당자 : {group.map((m) => personOf(data, m.assigneeId, m.assignee)).join(", ")}
        </p>
      </div>
    </div>
  );
}

// 평소엔 읽기전용으로 보여주고(오탈자 실수 방지), "수정"을 눌러야 할일배정과 같은 구성의
// 입력 폼이 뜬다. 담당자 여러 명(그룹)의 완료 체크리스트는 "필드 수정"이 아니라 그때그때
// 처리하는 상태 액션이라 읽기전용/수정 여부와 무관하게 항상 조작 가능하게 둔다. 팝업 모달이
// 아니라 목록 오른쪽에 항상 떠 있는 패널이라 onClose 대신 onDeleted(삭제 시 선택 해제)를 받는다.
function DetailPanel({ group, data, onDeleted, onSave, onSaveGroup, onChangeAssignees, onDelete, onDeleteGroup, onToggleMember, onToggleGroup, onOpenWasteReturn }) {
  const { sites, units, profiles } = data;
  const isGroup = group.length > 1;
  const t = group[0];
  const multi = canHaveMultipleAssignees(t);
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
  const admins = profiles.filter((p) => p.role === "admin" && p.is_active !== false);
  const currentUnit = units.find((u) => u.id === t.unitId);
  const initialSiteId = currentUnit?.siteId ?? sites.find((s) => s.name === t.siteName)?.id ?? "";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: t.title ?? "",
    description: t.description ?? "",
    siteId: initialSiteId,
    unitId: t.unitId ?? "",
    assigneeId: t.assigneeId ?? "",
    assigneeIds: group.map((m) => m.assigneeId).filter(Boolean),
    requesterId: t.requestedById ?? "",
    assignedDate: t.assignedDate ?? "",
    dueDate: t.dueDate ?? "",
    done: t.done,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    if (isGroup) await onSaveGroup(group, form);
    // 여러 명 가능한 할일은 담당자 구성을 아래 onChangeAssignees가 따로 처리한다(여기선 담당자 유지).
    else await onSave(t, { ...form, assigneeId: multi ? (t.assigneeId ?? "") : (form.assigneeIds[0] ?? ""), photoUrls: photos });
    if (multi) await onChangeAssignees(group, form.assigneeIds);
    setSaving(false);
    setEditing(false);
  }

  // 이미 완료한 담당자를 빼면 그 사람의 완료 기록(행)이 지워지므로 막는다.
  function removeAssignee(id) {
    if (group.some((m) => m.assigneeId === id && m.done)) { alert("이미 완료한 담당자는 뺄 수 없습니다."); return; }
    setForm((f) => ({ ...f, assigneeIds: f.assigneeIds.filter((x) => x !== id) }));
  }

  async function handleDelete() {
    const msg = isGroup
      ? `이 할 일을 삭제하시겠습니까? 담당자 ${group.length}명 전원의 할일이 함께 삭제됩니다.`
      : "이 할 일을 삭제하시겠습니까?";
    if (!(await confirmAsync(msg))) return;
    setDeleting(true);
    if (isGroup) await onDeleteGroup(group);
    else await onDelete(t);
    setDeleting(false);
    onDeleted();
  }

  // 완료하기 — 그룹이든 단건이든 한 번에 전원(1명이면 본인) 완료 처리. 목록의 원형 토글과 같은 동작.
  async function completeNow() {
    await onToggleGroup(group);
    setForm((f) => ({ ...f, done: true }));
  }

  const siteName = sites.find((s) => s.id === form.siteId)?.name || "현장 없음";
  // 여러 호기 할일은 호기를 따로 바꾸지 않은 동안 호기 목록 전체를 보여준다(todoLocOf와 같은 기준).
  const unitNo = t.elevatorNos?.length > 1 && form.unitId === (t.unitId ?? "")
    ? formatUnitLabel(t.elevatorNos)
    : siteUnits.find((u) => u.id === form.unitId)?.unitNo || "전체(현장 공통)";
  const requesterName = admins.find((p) => p.id === form.requesterId)?.name || t.requestedByName || "-";
  // 자재·견적 지급 때 올린 사진은 할일이 아니라 요청(material/quote_requests.supply_photo_urls)에
  // 저장된다 — 기사 앱 할일 상세(TodoTab getSupplyPhotos)와 같은 기준으로 가져와 보여준다.
  const supplyPhotos = t.source === "quote"
    ? (data.quoteRequests ?? []).find((q) => q.id === t.quoteRequestId)?.supplyPhotoUrls ?? []
    : t.source === "material"
      ? (data.materialRequests ?? []).find((r) => r.id === t.materialRequestId)?.supplyPhotoUrls ?? []
      : [];
  const effectiveDone = (m) => (wasteReturnPending(m) ? false : m.done);
  const groupDone = group.every(effectiveDone);

  const memberList = (
    <div>
      <p className="text-xs font-bold text-slate-500 mb-1">담당자 ({group.length}명)</p>
      <div className="space-y-1.5">
        {group.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={m.done} onChange={() => onToggleMember(m)} className="w-4 h-4 rounded accent-blue-700" />
            <span className={m.done ? "line-through text-slate-400" : "text-slate-700 font-semibold"}>{personOf(data, m.assigneeId, m.assignee)}</span>
            {m.done && <span className="text-[10px] text-emerald-600 font-bold ml-auto">완료</span>}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">담당자 추가·제외는 연필(수정) 버튼에서 할 수 있습니다. 1명만 완료해도 전원 완료로 처리됩니다.</p>
    </div>
  );

  return (
    <div className="flex flex-col min-w-0 border-l border-slate-100" style={{ flex: 38 }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
        {!editing ? (
          <>
            <span className="text-sm font-bold text-slate-700">
              {SOURCE_LABEL[t.source] ?? t.source} · {groupDone ? "완료된 할 일" : "미완료된 할 일"}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(true)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                <Pencil size={15} />
              </button>
              <button disabled={deleting} onClick={handleDelete} className="text-[11px] font-bold text-red-500 hover:bg-red-50 disabled:opacity-50 rounded-lg px-2 py-1.5">
                {deleting ? "삭제 중..." : isGroup ? `전체 삭제 (${group.length}명)` : "삭제"}
              </button>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(false)} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2">취소</button>
            <button disabled={saving || !form.title.trim() || (multi && form.assigneeIds.length === 0)} onClick={save} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2">
              {saving ? "저장 중..." : "저장"}
            </button>
          </>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
      {t.reassignRequested && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1"><Repeat size={13} strokeWidth={2.5} /> 담당자 재배정 요청됨</p>
          {t.reassignReason && <p className="text-[13px] text-slate-700">사유: {t.reassignReason}</p>}
          {t.reassignTo && <p className="text-[13px] text-slate-700">희망 담당자: <b>{t.reassignTo}</b></p>}
          <p className="text-[11px] text-slate-400 mt-1">아래 담당자를 변경하면 요청이 자동 해제됩니다.</p>
        </div>
      )}

      {!editing ? (
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-1">{form.title}</h2>
          <p className="text-sm font-semibold text-slate-500 mb-3">{siteName} · {unitNo}</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">{form.description || "-"}</p>
          <div className="border-t border-slate-100">
            <FieldRow label="기한"><p className="text-sm font-semibold text-slate-700 pt-0.5">{form.dueDate ? shortDate(form.dueDate) : "없음"}</p></FieldRow>
            <FieldRow label="배정일"><p className="text-sm font-semibold text-slate-700 pt-0.5">{shortDate(form.assignedDate)}</p></FieldRow>
            <FieldRow label="요청자"><p className="text-sm font-semibold text-slate-700 pt-0.5">{requesterName}</p></FieldRow>
            {isGroup ? <FieldRow label="담당자">{memberList}</FieldRow> : (
              <FieldRow label="담당자"><p className="text-sm font-semibold text-slate-700 pt-0.5">{personOf(data, t.assigneeId, t.assignee)}</p></FieldRow>
            )}
            {supplyPhotos.length > 0 && (
              <FieldRow label="지급사진">
                <PhotoGrid urls={supplyPhotos} cols={4} />
              </FieldRow>
            )}
            {!isGroup && (
              <FieldRow label="파일첨부">
                <PhotoGrid urls={photos} cols={4} />
              </FieldRow>
            )}
          </div>
          {!isGroup && wasteReturnPending(t) ? (
            <button onClick={() => onOpenWasteReturn(t)} className="w-full mt-4 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl py-3">
              반납확인
            </button>
          ) : !isGroup && (
            <button onClick={completeNow} disabled={groupDone} className="w-full mt-4 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 rounded-xl py-3">
              {groupDone ? "완료됨" : "완료하기"}
            </button>
          )}
        </div>
      ) : (
        <div>
          <FieldRow label="제목">
            <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </FieldRow>
          <FieldRow label="현장">
            <select className={inputCls} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value, unitId: "" })}>
              <option value="">현장 없음</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="호기">
            <select className={inputCls} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} disabled={!form.siteId}>
              <option value="">전체(현장 공통)</option>
              {siteUnits.map((u) => <option key={u.id} value={u.id}>{u.unitNo}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="내용">
            <textarea className={inputCls} rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FieldRow>
          <FieldRow label="기한">
            <DueDateField value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
          </FieldRow>
          <FieldRow label="요청자">
            <PersonPicker
              candidates={admins}
              selectedIds={form.requesterId ? [form.requesterId] : []}
              onAdd={(id) => setForm((f) => ({ ...f, requesterId: id }))}
              onRemove={() => setForm((f) => ({ ...f, requesterId: "" }))}
              placeholder="관리자 이름 검색"
            />
          </FieldRow>
          {/* 할일 배정(AssignTodoModal)과 같은 이름 검색·태그 방식 — 여러 명 가능한 할일은 추가·제외,
              1건짜리 할일(검사보완·반납 등)은 새로 고르면 교체된다. */}
          <FieldRow label="담당자">
            <PersonPicker
              candidates={engineers}
              selectedIds={form.assigneeIds}
              onAdd={(id) => setForm((f) => ({ ...f, assigneeIds: multi ? [...f.assigneeIds, id] : [id] }))}
              onRemove={removeAssignee}
              placeholder="이름 검색으로 추가"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              {multi
                ? "추가한 담당자에게도 같은 할일이 생기고 알림이 갑니다. 이미 완료한 담당자는 뺄 수 없습니다."
                : "이 할일은 담당자 1명만 지정할 수 있습니다 (새로 고르면 교체)."}
            </p>
          </FieldRow>
          {!isGroup && (
            <FieldRow label="상태">
              <select className={inputCls} value={form.done ? "done" : "open"} onChange={(e) => setForm({ ...form, done: e.target.value === "done" })}>
                <option value="open">진행</option>
                <option value="done">완료</option>
              </select>
            </FieldRow>
          )}
          <FieldRow label="배정일">
            <input type="date" className={inputCls} value={form.assignedDate} onChange={(e) => setForm({ ...form, assignedDate: e.target.value })} />
          </FieldRow>
          {!isGroup && (
            <FieldRow label="파일첨부">
              <PhotoAddSection photos={photos} setPhotos={setPhotos} uploading={uploading} onFiles={handleFiles} />
            </FieldRow>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function AssignTodoModal({ data, onClose, onCreate }) {
  const { sites, units, profiles } = data;
  const { name: adminName, id: adminId } = useContext(AdminAuthContext);
  // 배정 대상 = 기사 + 자재담당관리자(admin_tier "material") — 관리자가 자재담당자에게도 배정할 수 있어야 한다.
  const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false); // 제외된 기사는 배정 목록에서 뺀다
  const admins = profiles.filter((p) => p.role === "admin" && p.is_active !== false);
  const [form, setForm] = useState({
    siteId: "", unitId: "", title: "", description: "", assigneeIds: [],
    requesterId: adminId ?? "", dueDate: addDays(TODAY_STR, 7),
  });
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [folderToken] = useState(() => Date.now());
  const siteUnits = units.filter((u) => u.siteId === form.siteId);
  const valid = form.siteId && form.title.trim() && form.assigneeIds.length > 0;

  function toggleAssignee(id) {
    setForm((f) => ({ ...f, assigneeIds: f.assigneeIds.includes(id) ? f.assigneeIds.filter((x) => x !== id) : [...f.assigneeIds, id] }));
  }

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
    <Modal title="할 일 배정" onClose={onClose} wide="md">
      <div>
        <FieldRow label="제목">
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 비상통화장치 배터리 교체" />
        </FieldRow>
        <FieldRow label="현장">
          <SiteAutocomplete sites={sites} value={form.siteId} onChange={(id) => setForm({ ...form, siteId: id, unitId: "" })} />
        </FieldRow>
        <FieldRow label="호기">
          <select className={inputCls} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} disabled={!form.siteId}>
            <option value="">전체(현장 공통)</option>
            {siteUnits.map((u) => <option key={u.id} value={u.id}>{u.unitNo}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="내용">
          <textarea className={inputCls} rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </FieldRow>
        <FieldRow label="기한">
          <DueDateField value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
        </FieldRow>
        <FieldRow label="요청자">
          <PersonPicker
            candidates={admins}
            selectedIds={form.requesterId ? [form.requesterId] : []}
            onAdd={(id) => setForm((f) => ({ ...f, requesterId: id }))}
            onRemove={() => setForm((f) => ({ ...f, requesterId: "" }))}
            placeholder="관리자 이름 검색"
          />
        </FieldRow>
        <FieldRow label="담당자">
          <PersonPicker candidates={engineers} selectedIds={form.assigneeIds} onAdd={toggleAssignee} onRemove={toggleAssignee} placeholder="이름 검색" />
          <p className="text-[10px] text-slate-400 mt-1">2명 이상 선택 가능 — 각자에게 별도로 배정, 1명만 완료해도 전원 완료 처리됩니다.</p>
        </FieldRow>
        <FieldRow label="파일첨부">
          <PhotoAddSection photos={photos} setPhotos={setPhotos} uploading={uploading} onFiles={handleFiles} />
        </FieldRow>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-5 py-2.5">취소</button>
        <button disabled={!valid || uploading} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
          배정하기
        </button>
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
  // 선택된 항목은 모달이 아니라 오른쪽 패널에 계속 떠 있어야 해서, group 배열 자체가 아니라
  // groupKeyOf 값만 들고 있다가 매 렌더마다 최신 목록에서 다시 찾는다 — 다른 경로(목록의 원형
  // 토글 등)로 done이 바뀌어도 패널이 그 변화를 바로 반영한다.
  const [selectedKey, setSelectedKey] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  const viewFiltered = todos.filter((t) => (view === "open" ? !t.done : view === "reassign" ? (t.reassignRequested && !t.done) : true));
  const q = search.trim().toLowerCase();
  // "반납확인대기"는 완료된(done=true) 할일을 보여주는 큐라, 위 상태(진행/완료) 필터를 그대로
  // 태우면 기본값인 "미완료" 뷰에서 항상 0건으로 보인다 — 이 필터만 view를 건너뛰고 todos 전체에서 뽑는다.
  const rows = (sourceFilter === "waste_return" ? todos.filter(wasteReturnPending) : viewFiltered.filter((t) => sourceFilter === "all" || t.source === sourceFilter))
    .filter((t) => !q || (t.description ?? "").toLowerCase().includes(q) || (t.title ?? "").toLowerCase().includes(q) || todoLocOf(data, t).toLowerCase().includes(q) || personOf(data, t.assigneeId, t.assignee).toLowerCase().includes(q));

  // "반납확인대기" 필터를 고르면 "상태" 필터도 전체로 맞춰준다 — 안 그러면 기본값 "미완료"가
  // 계속 선택된 채로 보여, 완료된 항목들이 나오는 게 시각적으로 앞뒤가 안 맞아 보인다.
  function handleSourceFilterChange(value) {
    setSourceFilter(value);
    if (value === "waste_return") setView("all");
  }

  // 같은 요청(quoteRequestId/materialRequestId)을 공유하는 행을 한 그룹으로 묶는다.
  const groupsMap = new Map();
  // 같은 행이 두 번 들어오면(페이지네이션 경계에서 created_at이 같은 행이 겹쳐 오는 경우 등)
  // 담당자가 한 명인데 "2명"으로 보인다 — id 기준으로 한 번 걸러낸다.
  const seenIds = new Set();
  for (const t of rows) {
    if (seenIds.has(t.id)) continue;
    seenIds.add(t.id);
    const key = groupKeyOf(t);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(t);
  }
  const groups = [...groupsMap.values()];
  // 현재 필터·검색에 안 걸리면(예: 완료 처리해서 "미완료" 뷰에서 빠짐) 선택도 자연히 사라진다.
  const selectedGroup = selectedKey ? groups.find((g) => groupKeyOf(g[0]) === selectedKey) ?? null : null;

  const getVal = (group, key) => {
    const t = group[0];
    switch (key) {
      case "source": return SOURCE_LABEL[t.source] ?? t.source ?? "";
      case "title": return t.title ?? "";
      case "loc": return todoLocOf(data, t);
      case "person": return group.map((m) => personOf(data, m.assigneeId, m.assignee)).join(", ");
      case "assignedDate": return t.assignedDate ?? "";
      case "dueDate": return t.dueDate ?? "";
      case "done": return group.every((m) => (wasteReturnPending(m) ? false : m.done)) ? 1 : 0;
      default: return "";
    }
  };
  const sortedGroups = sortRows(groups, null, getVal);

  async function saveTodoDetail(t, form) {
    const unit = units.find((u) => u.id === form.unitId);
    const site = sites.find((s) => s.id === form.siteId);
    const engineer = profiles.find((p) => p.id === form.assigneeId);
    const requester = profiles.find((p) => p.id === form.requesterId);
    const photoUrls = form.photoUrls ?? [];
    // 재배정 요청 중인 할일의 담당자를 여기서 바꾸면 요청은 처리된 것이므로 자동 해제한다 (모바일 담당자 변경과 동일 규칙).
    const reassigned = form.assigneeId !== (t.assigneeId ?? "");
    const patch = {
      title: form.title.trim(), description: form.description || null,
      site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
      assignee: engineer?.name ?? null, assignee_id: form.assigneeId || null,
      requested_by_id: form.requesterId || null, requested_by_name: requester?.name ?? null,
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
        requestedById: patch.requested_by_id, requestedByName: patch.requested_by_name,
        assignedDate: patch.assigned_date, dueDate: patch.due_date, done: patch.done,
        photoCount: patch.photo_count, photoUrls,
        ...(reassigned ? { reassignRequested: false, reassignReason: null, reassignTo: null } : {}),
      } : x)),
    }));
  }

  // 담당자 여러 명(그룹)의 할 일 상세 저장 — 공통 필드(제목·현장·호기·내용·배정일·기한·요청자)만
  // 그룹 전원에게 동일하게 적용한다. 담당자 구성·완료 여부는 개별 처리(onToggleMember)로 따로 다룬다.
  async function saveGroupDetail(group, form) {
    const unit = units.find((u) => u.id === form.unitId);
    const site = sites.find((s) => s.id === form.siteId);
    const requester = profiles.find((p) => p.id === form.requesterId);
    const ids = group.map((t) => t.id);
    const patch = {
      title: form.title.trim(), description: form.description || null,
      site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
      requested_by_id: form.requesterId || null, requested_by_name: requester?.name ?? null,
      assigned_date: form.assignedDate || null, due_date: form.dueDate || null,
    };
    const { error } = await supabase.from("todos").update(patch).in("id", ids);
    if (error) { alert("저장 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      todos: prev.todos.map((x) => (ids.includes(x.id) ? {
        ...x,
        title: patch.title, description: patch.description ?? "",
        siteName: patch.site_name, elevatorNo: patch.elevator_no, unitId: patch.unit_id,
        requestedById: patch.requested_by_id, requestedByName: patch.requested_by_name,
        assignedDate: patch.assigned_date, dueDate: patch.due_date,
      } : x)),
    }));
  }

  // 담당자 구성 변경(추가·제외·교체) — 빠진 사람과 새 사람을 짝지어 기존 행의 담당자만 바꾸고,
  // 남는 빠진 사람 행은 삭제, 남는 새 사람은 기존 행을 복제해 새로 만든다. 새 행 id는 목록에서
  // 같은 건으로 계속 묶이도록(groupKeyOf) 출처별 규칙을 따른다. 새로 배정된 사람에게만 알림.
  async function changeAssignees(group, assigneeIds) {
    const removed = group.filter((m) => m.assigneeId && !assigneeIds.includes(m.assigneeId));
    const addedIds = assigneeIds.filter((id) => !group.some((m) => m.assigneeId === id));
    if (!removed.length && !addedIds.length) return;
    const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? null;
    const clearReassign = { reassign_requested: false, reassign_reason: null, reassign_to: null };
    const swaps = removed.slice(0, addedIds.length).map((m, i) => ({ m, assigneeId: addedIds[i] }));
    const toDelete = removed.slice(addedIds.length);
    const toAdd = addedIds.slice(removed.length);

    for (const { m, assigneeId } of swaps) {
      const { error } = await supabase.from("todos").update({ assignee: nameOf(assigneeId), assignee_id: assigneeId, ...clearReassign }).eq("id", m.id);
      if (error) { alert("담당자 변경 실패: " + error.message); return; }
    }
    if (toDelete.length) {
      const { error } = await supabase.from("todos").delete().in("id", toDelete.map((m) => m.id));
      if (error) { alert("담당자 제외 실패: " + error.message); return; }
    }
    let insertedRows = [];
    if (toAdd.length) {
      // 사람별 값(완료·청구금액·재고확인·재배정 요청)은 비우고 나머지(제목·현장·기한·내용·첨부 등)는 그대로 복제.
      const base = group.find((m) => !m.done) ?? group[0];
      const { data: baseRow, error: baseError } = await supabase.from("todos").select("*").eq("id", base.id).single();
      if (baseError) { alert("담당자 추가 실패: " + baseError.message); return; }
      const { created_at: _createdAt, ...copy } = baseRow;
      const manualPrefix = base.id.replace(/-\d+$/, "");
      let nextIdx = Math.max(...group.map((m) => Number(m.id.match(/-(\d+)$/)?.[1] ?? 0))) + 1;
      const rows = toAdd.map((assigneeId) => ({
        ...copy,
        id: base.source === "manual"
          ? `${manualPrefix}-${nextIdx++}`
          : `todo-${base.source}-${base.quoteRequestId ?? base.materialRequestId}-${crypto.randomUUID()}`,
        assignee: nameOf(assigneeId), assignee_id: assigneeId,
        done: false, billing_amount: null, billing_part: null, billing_part_rows: null, stock_confirmed_at: null,
        ...clearReassign,
      }));
      const { data: inserted, error } = await supabase.from("todos").insert(rows).select();
      if (error) { alert("담당자 추가 실패: " + error.message); return; }
      insertedRows = inserted ?? [];
    }

    const swapTo = new Map(swaps.map(({ m, assigneeId }) => [m.id, assigneeId]));
    const deletedIds = new Set(toDelete.map((m) => m.id));
    setData((prev) => ({
      ...prev,
      todos: [
        ...insertedRows.map(mapTodo),
        ...prev.todos.filter((x) => !deletedIds.has(x.id)).map((x) => (swapTo.has(x.id)
          ? { ...x, assignee: nameOf(swapTo.get(x.id)), assigneeId: swapTo.get(x.id), reassignRequested: false, reassignReason: null, reassignTo: null }
          : x)),
      ],
    }));
    const newlyAssigned = [...swaps.map(({ m, assigneeId }) => ({ id: m.id, assigneeId })), ...insertedRows.map((r) => ({ id: r.id, assigneeId: r.assignee_id }))];
    for (const n of newlyAssigned) {
      notify("todo_assigned", {
        profileIds: [n.assigneeId],
        title: "할 일이 배정되었습니다",
        body: `${group[0].siteName ? `${group[0].siteName} · ` : ""}${group[0].title}`,
        url: `/?openTodo=${n.id}`,
      });
    }
  }

  // 할 일 삭제 — 확인 대화상자는 TodoDetailModal에서 이미 거쳤다.
  async function deleteTodo(t) {
    const { error } = await supabase.from("todos").delete().eq("id", t.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, todos: prev.todos.filter((x) => x.id !== t.id) }));
  }

  // 그룹(담당자 여러 명) 전원의 할 일을 한 번에 삭제 — 확인 대화상자는 TodoDetailModal에서 이미 거쳤다.
  async function deleteTodoGroup(group) {
    const ids = group.map((t) => t.id);
    const { error } = await supabase.from("todos").delete().in("id", ids);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, todos: prev.todos.filter((x) => !ids.includes(x.id)) }));
  }

  // 관리자가 반납확인 모달에서 입력한 확인수량(confirmedQty: { productId: qty })을 반영한다.
  // - 확인된 만큼만 재고 입고(inventory_stock_movements, todo_id로 이 할일과 연결)로 기록.
  // - 전부 확인됐으면(stock_confirmed_at 채워 큐에서 빠짐) 기록용으로 rows를 누적 확인수량 그대로 남긴다.
  // - 일부만 확인됐으면 done=false로 재오픈하고, waste_return_rows를 "남은 수량"만 담은 새 행으로
  //   다시 세팅한다(다음 회차엔 이게 새 요청량) — 사진은 지우지 않고, photo_count에 기준선을
  //   남겨 새 사진이 추가될 때까지 잠금이 다시 걸리게 한다.
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

  // 담당자 여러 명이 한 팀으로 묶인 수동 할일(관리자 배정)은 1명만 완료해도 전원 완료 처리한다
  // — 표에서도 이미 groupKeyOf로 한 행으로 묶어 보여주므로 완료 처리도 그룹 단위로 맞춘다.
  // 완료 취소는 그룹 단위로 묶지 않는다(자체점검 지적사항과 동일한 비대칭 규칙).
  async function toggle(t) {
    const done = !t.done;
    const ids = done && t.source === "manual"
      ? todos.filter((x) => groupKeyOf(x) === groupKeyOf(t)).map((x) => x.id)
      : [t.id];
    const { error } = await supabase.from("todos").update({ done }).in("id", ids);
    if (error) { alert("완료 처리 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, todos: prev.todos.map((x) => (ids.includes(x.id) ? { ...x, done } : x)) }));
  }

  // 목록의 원형 토글·상세패널의 "완료하기" 버튼 공용 — 자재/견적처럼 요청 하나를 공유하는
  // 그룹(group.length > 1)도 한 번에 다 같이 뒤집는다(기존 표 체크박스와 동일 규칙).
  async function toggleGroupDone(group) {
    const effectiveDone = (m) => (wasteReturnPending(m) ? false : m.done);
    const groupDone = group.every(effectiveDone);
    await Promise.all(group.filter((m) => effectiveDone(m) === groupDone).map((m) => toggle(m)));
  }

  // 담당자를 2명 이상 고르면(AssignTodoModal), DB에 담당자 배열 컬럼이 없어(단일 assignee_id)
  // 각자에게 같은 내용으로 할일을 하나씩 따로 만든다 — 재배정·완료 처리도 사람별로 독립적이어야 하므로
  // 오히려 이 편이 자연스럽다.
  async function createTodo(form) {
    const unit = units.find((u) => u.id === form.unitId);
    const site = sites.find((s) => s.id === form.siteId);
    const requester = profiles.find((p) => p.id === form.requesterId);
    const photoUrls = form.photoUrls ?? [];
    const batchId = Date.now(); // 담당자마다 부르면 ms가 달라져 같은 배정이 한 건으로 안 묶인다
    const rows = form.assigneeIds.map((assigneeId, i) => {
      const engineer = profiles.find((p) => p.id === assigneeId);
      return {
        id: `todo-manual-${batchId}-${i}`, source: "manual", title: form.title.trim(), description: form.description || null,
        site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
        assignee: engineer?.name ?? null, assignee_id: assigneeId,
        assigned_date: TODAY_STR, due_date: form.dueDate || null, done: false,
        photo_count: photoUrls.length, photo_urls: photoUrls.length ? photoUrls : null,
        requested_by_id: form.requesterId || adminId || null, requested_by_name: requester?.name ?? adminName,
      };
    });
    const { error } = await supabase.from("todos").insert(rows);
    if (error) { alert("배정 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      todos: [
        ...rows.map((row) => ({
          id: row.id, source: "manual", title: row.title, description: row.description ?? "",
          siteName: row.site_name, elevatorNo: row.elevator_no, unitId: row.unit_id,
          assignee: row.assignee, assigneeId: row.assignee_id,
          assignedDate: row.assigned_date, dueDate: row.due_date, done: false,
          photoCount: photoUrls.length, photoUrls, part: null, materialRequestId: null, quoteRequestId: null,
          requestedById: row.requested_by_id, requestedByName: row.requested_by_name,
        })),
        ...prev.todos,
      ],
    }));
    // 배정된 기사들에게 각각 푸시 — 실패해도 등록 자체는 이미 끝났으니 조용히 넘어간다.
    for (const row of rows) {
      fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "todo_assigned",
          profileIds: [row.assignee_id],
          title: "할 일이 배정되었습니다",
          body: `${site?.name ? `${site.name} · ` : ""}${row.title}`,
          url: `/?openTodo=${row.id}`,
        }),
      }).catch(() => {});
    }
  }

  return (
    <div>
      {/* 카드 테두리·그림자·바깥 여백 없이 화면 전체(사이드바 바로 옆부터)를 채운다 — 목록·상세
          사이 구분은 세로선 하나로만. 이 여백 제거는 AdminApp.jsx에서 할일관리 화면만 예외
          처리했다(다른 화면은 기존 공용 여백 그대로). */}
      <div className="bg-white flex" style={{ height: "calc(100vh - 2.5rem)" }}>
        {/* 목록 — 검색·필터(상태/구분 드롭다운)까지 전부 이 컬럼 안에 있다: 목록을 거르는
            조작이라는 게 시각적으로 바로 보이게(예전엔 목록·상세 위에 걸친 별도 툴바였음).
            상세(38)보다 넓게(62) — 비율 기반이라 창을 넓히면 목록도 같이 넓어진다. */}
        <div className="flex flex-col" style={{ flex: 62 }}>
          <div className="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between">
            <h1 className="text-base font-extrabold text-slate-900">할 일 관리</h1>
            <button onClick={() => setAssigning(true)} className="flex items-center gap-1 text-xs font-bold text-white bg-blue-700 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
              <Plus size={13} /> 배정
            </button>
          </div>
          <div className="px-3.5 pb-2.5">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputCls} pl-7 py-1.5 text-xs`} placeholder="내용·현장·담당자 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="px-3.5 pb-3 flex items-center gap-1.5">
            <FilterDropdown
              label="상태"
              value={view}
              onChange={setView}
              options={[
                { value: "open", label: "미완료", count: todos.filter((t) => !t.done).length },
                { value: "all", label: "전체", count: todos.length },
                { value: "reassign", label: "재배정요청", count: todos.filter((t) => t.reassignRequested && !t.done).length },
              ]}
            />
            <FilterDropdown
              label="구분"
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
          <div className="flex-1 overflow-y-auto border-t border-slate-100">
            {sortedGroups.length === 0 ? (
              <p className="text-xs text-slate-300 text-center py-10">해당하는 할 일이 없습니다</p>
            ) : (
              sortedGroups.map((group) => (
                <TodoListRow
                  key={groupKeyOf(group[0])}
                  group={group}
                  data={data}
                  selected={selectedKey === groupKeyOf(group[0])}
                  onSelect={(g) => setSelectedKey(groupKeyOf(g[0]))}
                  onToggleGroup={toggleGroupDone}
                />
              ))
            )}
          </div>
        </div>

        {/* 상세 — 팝업 대신 항상 떠 있는 패널. 선택 없으면 안내만. */}
        {selectedGroup ? (
          <DetailPanel
            key={selectedKey}
            group={selectedGroup}
            data={data}
            onDeleted={() => setSelectedKey(null)}
            onSave={saveTodoDetail}
            onSaveGroup={saveGroupDetail}
            onChangeAssignees={changeAssignees}
            onDelete={deleteTodo}
            onDeleteGroup={deleteTodoGroup}
            onToggleMember={toggle}
            onToggleGroup={toggleGroupDone}
            onOpenWasteReturn={setConfirmTarget}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-sm text-slate-300 border-l border-slate-100" style={{ flex: 38 }}>왼쪽에서 할 일을 선택하세요</div>
        )}
      </div>
      <p className="text-[10px] text-slate-400 px-4 py-2">* 자재·견적 할일의 정상 완료 경로는 기사 비용청구입니다. 완료하기는 관리자 예외 처리용.</p>

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
