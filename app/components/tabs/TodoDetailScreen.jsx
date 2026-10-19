"use client";

// 할 일 상세 화면 — 목록에서 행을 누르면 카드가 펴지는 대신 이 화면으로 들어온다(게시판 글 상세와
// 같은 슬라이드). 구성은 관리자웹 할일 상세와 같다: 제목·현장·호기·주소·내용·기한·배정일·요청자·
// 담당자·지급사진·첨부파일·작업내역. 관리자는 ⋮ 메뉴의 "수정"으로 웹과 같은 항목을 전부 고칠 수
// 있다(저장 규칙은 lib/todoEdit.js 공용). 기사는 보기 + 기존 기능(완료·재배정 요청·기한 연장·반납사진).
import { useContext, useState } from "react";
import { ArrowLeft, MoreVertical, Check, Lock, Repeat, X } from "lucide-react";
import { PrimaryButton, PhotoGrid, DDay, inputCls } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload } from "@/app/components/formWidgets";
import { TodoHistory } from "@/app/components/TodoHistory";
import { confirmAsync } from "@/app/components/ConfirmHost";
import { useBackHandler } from "@/app/hooks/useBackHandler";
import { TODAY_STR } from "@/lib/constants";
import { canHaveMultipleAssignees, canSetBilling, todoFormFrom } from "@/lib/todoEdit";
import { BillingSetupFields, billingSetupValid } from "@/app/components/BillingSetupFields";

const SOURCE_LABEL = {
  manual: "관리자 부여", quote: "견적 연동", material: "자재 연동",
  inspection: "검사 보완", selfcheck: "자체점검 지적", waste_return: "폐자재·여유부품 반납",
};

// 2026년 10월 9일 금요일 — 상세 화면용 풀 날짜.
function fullDate(d) {
  return new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

function Section({ label, right, children }) {
  return (
    <div className="border-t border-slate-100 py-3.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-400">{label}</p>
        {right}
      </div>
      {children}
    </div>
  );
}

// 이름 검색 자동완성 + 선택된 사람은 지울 수 있는 태그 — 요청자(단일)·담당자(복수) 공용.
function PersonPicker({ candidates, selectedIds, onAdd, onRemove, placeholder }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const found = q ? candidates.filter((p) => !selectedIds.includes(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const selected = selectedIds.map((id) => candidates.find((p) => p.id === id)).filter(Boolean);
  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 text-sm font-bold bg-slate-100 text-slate-700 rounded-full pl-3 pr-2 py-1.5">
              {p.name}
              <button type="button" onClick={() => onRemove(p.id)} aria-label={`${p.name} 제외`} className="w-4 h-4 rounded-full bg-slate-300 text-white flex items-center justify-center">
                <X size={10} strokeWidth={3.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input className={inputCls} placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
        {found.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {found.map((p) => (
              <button
                type="button" key={p.id}
                onClick={() => { onAdd(p.id); setQuery(""); }}
                className="w-full text-left px-3 py-2.5 text-sm border-b border-slate-50 last:border-0 active:bg-slate-50"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TodoDetailScreen({
  todo, group, requester, supplyPhotoUrls = [], role,
  canToggle, photoLocked, onToggle, onBack,
  onAddPhoto, onRemovePhoto,
  onRequestReassign, onClearReassignRequest, onExtendDueDate,
  onSaveEdit, onDeleteGroup, billingReady,
}) {
  const { profiles = [] } = useContext(AuthContext);
  const sites = useContext(SitesContext);
  const units = useContext(UnitsContext);
  const isAdmin = role === "admin";
  const [editing, setEditing] = useState(false);
  const [navDir, setNavDir] = useState("fwd");
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignReason, setReassignReason] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendDate, setExtendDate] = useState(todo.dueDate ?? "");
  const [extendReason, setExtendReason] = useState("");

  const isGroup = group.length > 1;
  const multi = canHaveMultipleAssignees(todo);
  const groupDone = group.every((m) => m.done);
  const overdue = !groupDone && todo.dueDate && new Date(todo.dueDate) < new Date(TODAY_STR);
  const reqRow = group.find((m) => m.reassignRequested);
  const doneCount = group.filter((m) => m.done).length;
  const isManualLike = (todo.source === "manual" && !todo.billingRequired) || todo.source === "inspection" || todo.source === "selfcheck" || todo.source === "waste_return";

  function closeEdit() { setNavDir("back"); setEditing(false); }
  function openEdit() {
    setMenuOpen(false);
    setForm(todoFormFrom(group, { units, sites }));
    setNavDir("fwd");
    setEditing(true);
  }
  useBackHandler(true, () => { if (editing) closeEdit(); else onBack(); });

  // 현장 주소 — 호기(unit_id)로 현장을 찾고, 없으면(옛 데이터) 현장명으로 찾는다.
  const todoUnit = units.find((u) => u.id === todo.unitId);
  const siteAddress = sites.find((s) => s.id === todoUnit?.siteId)?.address
    ?? sites.find((s) => s.name === todo.siteName)?.address ?? "";
  const unitLabel = (() => {
    if (todo.elevatorNos?.length > 1) return todo.elevatorNos.join(", ");
    return todo.elevatorNo || "전체(현장 공통)";
  })();

  async function save() {
    if (!form.title.trim() || saving || uploading) return;
    if (canSetBilling(todo) && billingReady && !billingSetupValid(form, units.filter((u) => u.siteId === form.siteId && u.isActive !== false))) return;
    setSaving(true);
    const res = await onSaveEdit(group, form);
    setSaving(false);
    if (res?.error) { alert(res.error); return; }
    closeEdit();
  }

  async function removeAssignee(id) {
    if (group.some((m) => m.assigneeId === id && m.done)) { alert("이미 완료한 담당자는 뺄 수 없습니다."); return; }
    setForm((f) => ({ ...f, assigneeIds: f.assigneeIds.filter((x) => x !== id) }));
  }

  async function handleDelete() {
    setMenuOpen(false);
    const msg = isGroup ? `이 할 일을 삭제하시겠습니까?\n담당자 ${group.length}명 전원의 할일이 함께 삭제됩니다.` : "이 할 일을 삭제하시겠습니까?";
    if (!(await confirmAsync(msg))) return;
    await onDeleteGroup(group);
    onBack();
  }

  const slideCls = navDir === "back" ? "room-slide-in-left" : "room-slide-in-right";

  /* ---------------------------- 수정 모드 ---------------------------- */
  if (editing && form) {
    const siteUnits = units.filter((u) => u.siteId === form.siteId && u.isActive !== false);
    const engineers = profiles.filter((p) => (p.role === "engineer" || p.admin_tier === "material") && p.is_active !== false)
      .map((p) => ({ id: p.id, name: p.name }));
    const admins = profiles.filter((p) => p.role === "admin" && p.is_active !== false).map((p) => ({ id: p.id, name: p.name }));
    const label = "block text-xs font-bold text-slate-500 mb-1.5";
    return (
      <div key="edit" className={`flex-1 flex flex-col overflow-hidden bg-white ${slideCls}`}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100 shrink-0">
          <button type="button" onClick={closeEdit} className="text-sm font-bold text-slate-500 px-2 py-1.5">취소</button>
          <h2 className="text-base font-extrabold text-slate-900">할 일 수정</h2>
          <button
            type="button" onClick={save} disabled={!form.title.trim() || saving || uploading || (canSetBilling(todo) && billingReady && !billingSetupValid(form, siteUnits))}
            className="text-sm font-extrabold text-blue-700 px-2 py-1.5 disabled:text-slate-300"
          >
            {saving ? "저장 중" : "저장"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-10 space-y-5">
          <div>
            <label className={label}>제목</label>
            <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className={label}>현장</label>
            <SiteSearchSelect value={form.siteId} onChange={(id) => setForm({ ...form, siteId: id, unitId: "", unitIds: [] })} />
          </div>
          {!form.billingRequired && (
            <div>
              <label className={label}>호기</label>
              <select className={inputCls} value={form.unitId} disabled={!form.siteId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                <option value="">전체(현장 공통)</option>
                {siteUnits.map((u) => <option key={u.id} value={u.id}>{u.unitNo}</option>)}
              </select>
            </div>
          )}
          {canSetBilling(todo) && billingReady && (
            <div>
              <label className={label}>청구</label>
              <BillingSetupFields form={form} setForm={setForm} siteUnits={siteUnits} siteSelected={!!form.siteId} />
            </div>
          )}
          <div>
            <label className={label}>내용</label>
            <textarea className={inputCls} rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>기한</label>
              <input type="date" className={inputCls} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div>
              <label className={label}>배정일</label>
              <input type="date" className={inputCls} value={form.assignedDate} onChange={(e) => setForm({ ...form, assignedDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}>요청자</label>
            <PersonPicker
              candidates={admins}
              selectedIds={form.requesterId ? [form.requesterId] : []}
              onAdd={(id) => setForm((f) => ({ ...f, requesterId: id }))}
              onRemove={() => setForm((f) => ({ ...f, requesterId: "" }))}
              placeholder="관리자 이름 검색"
            />
          </div>
          <div>
            <label className={label}>담당자</label>
            <PersonPicker
              candidates={engineers}
              selectedIds={form.assigneeIds}
              onAdd={(id) => setForm((f) => ({ ...f, assigneeIds: multi ? [...f.assigneeIds, id] : [id] }))}
              onRemove={removeAssignee}
              placeholder="이름 검색으로 추가"
            />
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              {multi
                ? "추가한 담당자에게도 같은 할일이 생기고 알림이 갑니다. 이미 완료한 담당자는 뺄 수 없습니다."
                : "이 할일은 담당자 1명만 지정할 수 있습니다 (새로 고르면 교체)."}
            </p>
          </div>
          {!isGroup && (
            <div>
              <label className={label}>{todo.source === "waste_return" ? "반납 사진" : "파일 첨부"}</label>
              <MultiPhotoUpload
                required={false}
                photos={form.photoUrls.map((url) => ({ url }))}
                uploadFolder={`todos/${todo.id}`}
                onUploaded={(url) => setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, url] }))}
                onRemove={(idx) => setForm((f) => ({ ...f, photoUrls: f.photoUrls.filter((_, i) => i !== idx) }))}
                onUploadingChange={setUploading}
                label="첨부 사진·영상"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------------------- 상세 보기 ---------------------------- */
  const attachUrls = todo.source === "waste_return" ? [] : (todo.photoUrls ?? []);
  return (
    <div key="detail" className={`flex-1 flex flex-col overflow-hidden bg-white relative ${slideCls}`}>
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-1">
          <button type="button" onClick={onBack} aria-label="뒤로" className="w-9 h-9 flex items-center justify-center text-slate-800 active:text-slate-400">
            <ArrowLeft size={22} strokeWidth={2.5} />
          </button>
          <h2 className="text-base font-extrabold text-slate-900">할 일 상세</h2>
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="더보기" className="w-9 h-9 flex items-center justify-center text-slate-700 active:bg-slate-100 rounded-full">
            <MoreVertical size={20} />
          </button>
        )}
      </div>
      {menuOpen && (
        <>
          <div className="absolute inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-3 top-[52px] z-20 min-w-[130px] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <button type="button" onClick={openEdit} className="w-full text-left px-4 py-3 text-sm font-bold text-slate-800 active:bg-slate-50">수정</button>
            <button type="button" onClick={handleDelete} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 border-t border-slate-100 active:bg-red-50">삭제</button>
          </div>
        </>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-5 pb-8">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold px-2 py-1 rounded-md ${groupDone ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {groupDone ? "완료된 할 일" : "미완료된 할 일"}
            </span>
            <span className="text-[11px] font-bold text-slate-400">{SOURCE_LABEL[todo.source] ?? "자재 연동"}</span>
            {!groupDone && <DDay dueDate={todo.dueDate} size="xs" />}
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 leading-snug mt-3 break-keep">{todo.title}</h1>
          <p className="text-sm font-bold text-slate-500 mt-1.5">{todo.siteName ? `${todo.siteName} · ${unitLabel}` : "현장 없음"}</p>
          {siteAddress && <p className="text-xs text-slate-400 mt-0.5">{siteAddress}</p>}
          {todo.description ? (
            <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-wrap break-keep mt-4">{todo.description}</p>
          ) : null}
        </div>

        <div className="px-5">
          {reqRow && isAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1"><Repeat size={13} strokeWidth={2.5} /> 재배정 요청됨 · {reqRow.assignee}</p>
              {reqRow.reassignReason && <p className="text-[13px] text-slate-700">사유: {reqRow.reassignReason}</p>}
              {reqRow.reassignTo && <p className="text-[13px] text-slate-700">희망 담당자: <b>{reqRow.reassignTo}</b></p>}
              <p className="text-[11px] text-slate-400 mt-1">⋮ → 수정에서 담당자를 바꾸면 요청이 자동 해제됩니다.</p>
              <button type="button" onClick={() => onClearReassignRequest(reqRow.id)} className="mt-2 text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 active:bg-slate-50">요청 반려</button>
            </div>
          )}
          {!isAdmin && onRequestReassign && !todo.done && (
            todo.reassignRequested ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                <p className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1"><Repeat size={13} strokeWidth={2.5} /> 재배정 요청됨 · 관리자 확인 중</p>
                {todo.reassignTo && <p className="text-[13px] text-slate-700">희망 담당자: <b>{todo.reassignTo}</b></p>}
                <button type="button" onClick={() => onClearReassignRequest(todo.id)} className="mt-2 text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 active:bg-slate-50">요청 취소</button>
              </div>
            ) : reassignOpen ? (
              <div className="border border-slate-200 rounded-xl p-3 mb-3">
                <p className="text-xs font-bold text-slate-600 mb-2">담당자 재배정 요청</p>
                <select className={`${inputCls} mb-2`} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                  <option value="">희망 담당자 (선택 안 함 가능)</option>
                  {profiles.filter((p) => p.role === "engineer" && p.is_active !== false && p.name !== todo.assignee).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                <textarea className={inputCls} rows={2} placeholder="사유 (예: 오늘 다른 현장 처리 중)" value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} />
                <div className="flex gap-1.5 mt-2">
                  <button type="button" onClick={() => setReassignOpen(false)} className="flex-1 text-xs font-bold py-2 rounded-lg bg-slate-100 text-slate-500 active:bg-slate-200">취소</button>
                  <button type="button" onClick={() => { onRequestReassign(todo.id, reassignReason.trim(), reassignTo); setReassignOpen(false); }} className="flex-1 text-xs font-bold py-2 rounded-lg bg-blue-700 text-white active:bg-blue-800">요청 보내기</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setReassignReason(""); setReassignTo(""); setReassignOpen(true); }} className="w-full mb-3 text-xs font-bold text-blue-700 border border-blue-200 rounded-xl py-2.5 active:bg-blue-50 flex items-center justify-center gap-1.5">
                <Repeat size={13} strokeWidth={2.5} /> 담당자 재배정 요청
              </button>
            )
          )}

          <Section
            label="기한"
            right={!isAdmin && onExtendDueDate && !todo.done ? (
              <button type="button" onClick={() => { setExtendDate(todo.dueDate ?? ""); setExtendReason(""); setExtending(true); }} className="text-xs font-bold text-blue-600">연장</button>
            ) : null}
          >
            <p className={`text-base font-bold ${overdue ? "text-red-600" : "text-slate-800"}`}>
              {todo.dueDate ? fullDate(todo.dueDate) : "없음"}{overdue ? " · 기한 경과" : ""}
            </p>
          </Section>
          <Section label="배정일">
            <p className="text-base font-bold text-slate-800">{todo.assignedDate ? fullDate(todo.assignedDate) : "-"}</p>
          </Section>
          <Section label="요청자">
            {requester ? <span className="inline-block text-sm font-bold px-3 py-1.5 rounded-full bg-blue-900 text-white">{requester}</span> : <p className="text-sm text-slate-400">-</p>}
          </Section>
          <Section label="담당자" right={isGroup ? <span className="text-xs font-bold text-slate-400">{doneCount}/{group.length} 완료</span> : null}>
            <div className="flex flex-wrap gap-2">
              {group.map((m) => (
                <span key={m.id} className={`inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-full ${m.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                  {m.done && <Check size={13} strokeWidth={3} />}{m.assignee}
                </span>
              ))}
            </div>
            {((todo.source !== "manual" && todo.source !== "waste_return") || todo.billingRequired) && (
              <p className="text-[11px] text-slate-400 mt-2">
                완료 조건: {isGroup ? "담당자 중 1명 비용청구" : "비용청구 시 자동완료"}
              </p>
            )}
          </Section>
          {todo.billingAmount != null && (
            <Section label="청구 부품·금액">
              <p className="text-sm font-bold text-blue-700">
                {todo.billingPart ? `${todo.billingPart} · ` : ""}합계 ₩{Number(todo.billingAmount).toLocaleString()}
              </p>
            </Section>
          )}
          {supplyPhotoUrls.length > 0 && (
            <Section label={`지급된 자재 사진 (${supplyPhotoUrls.length})`}>
              <PhotoGrid urls={supplyPhotoUrls} cols={3} />
            </Section>
          )}
          {todo.source === "waste_return" ? (
            <Section label="반납 사진">
              {todo.wasteReturnRows?.length > 0 && (
                <p className="text-[11px] font-bold text-slate-500 mb-2">
                  반납 항목: {todo.wasteReturnRows.map((r) => `${r.name} ${r.qtyRequired}EA`).join(", ")}
                </p>
              )}
              <MultiPhotoUpload
                photos={(todo.photoUrls ?? []).map((url) => ({ url }))}
                onUploaded={(url) => onAddPhoto(todo.id, url)}
                onRemove={(idx) => onRemovePhoto(todo.id, idx)}
                label="반납 사진"
                uploadFolder={`todos/${todo.id}`}
              />
            </Section>
          ) : (
            <Section label={`파일 첨부${attachUrls.length ? ` (${attachUrls.length})` : ""}`}>
              {attachUrls.length ? <PhotoGrid urls={attachUrls} cols={3} /> : <p className="text-xs text-slate-400">첨부된 파일이 없습니다</p>}
            </Section>
          )}

          <div className="pt-1 pb-5">
            {canToggle && !photoLocked ? (
              <PrimaryButton onClick={async () => { await onToggle(); onBack(); }}>
                {groupDone ? "완료 취소" : "완료하기"}
              </PrimaryButton>
            ) : groupDone ? (
              <div className="text-sm font-bold px-3 py-3 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center gap-1">
                <Check size={15} /> 완료됨
              </div>
            ) : (
              <div className="text-xs font-bold px-3 py-3 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center gap-1">
                <Lock size={12} /> {photoLocked ? "반납 사진 업로드 후 완료 가능" : isManualLike ? "완료 처리 불가" : "비용청구 시 자동완료"}
              </div>
            )}
          </div>
        </div>

        <div className="border-t-8 border-slate-50 px-5 py-5 pb-10">
          <TodoHistory
            ids={group.map((m) => m.id)}
            refreshKey={`${group.map((m) => (m.done ? 1 : 0)).join("")}|${todo.dueDate}|${todo.title}|${todo.assigneeId}|${todo.description}|${group.length}|${(todo.photoUrls ?? []).length}`}
          />
        </div>
      </div>

      {extending && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center px-8" onClick={() => setExtending(false)}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-slate-800 mb-3">마감일 연장</p>
            <input type="date" className={`${inputCls} mb-2`} value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
            <textarea className={inputCls} rows={2} placeholder="연장 사유를 입력하세요" value={extendReason} onChange={(e) => setExtendReason(e.target.value)} />
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setExtending(false)} className="flex-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl py-2.5 active:bg-slate-200">취소</button>
              <button
                type="button" disabled={!extendDate || !extendReason.trim()}
                onClick={() => { onExtendDueDate(todo.id, extendDate, extendReason.trim()); setExtending(false); }}
                className="flex-1 text-sm font-bold text-white bg-blue-700 rounded-xl py-2.5 active:bg-blue-800 disabled:bg-slate-300"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
