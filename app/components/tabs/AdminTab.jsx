import { useState, useContext } from "react";
import { Package, Receipt, ChevronRight, FileText, PackageCheck, RotateCcw, PackageX, Search } from "lucide-react";
import { Badge, PhotoThumb, PrimaryButton, Sheet, Field, inputCls, DrillHeader } from "@/app/components/ui";
import { AuthContext } from "@/app/components/context";
import { MultiPhotoUpload } from "@/app/components/formWidgets";
import { parsePartQty, formatPhone, addDays } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { BillingHistoryScreen } from "@/app/components/tabs/BillingTab";


function AdminMenuRow({ icon: Icon, label, badge, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3.5 active:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <Icon size={15} className="text-slate-600" />
        </div>
        <span className="text-sm font-bold text-slate-800">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {!!badge && <span className="text-[11px] font-bold text-white bg-blue-700 px-2 py-0.5 rounded-full">{badge}</span>}
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    </button>
  );
}


function AssigneeSelect({ value, options, onChange }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.includes(value) ? null : <option value={value}>{value}</option>}
      {options.map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
  );
}

// 견적 지급 시 실제 시공할 기사를 2명 이상 지정할 수 있게 하는 다중 선택 UI입니다.
function MultiAssigneeSelect({ values, options, onChange }) {
  const extras = values.filter((v) => !options.includes(v));
  const allNames = [...options, ...extras];
  function toggle(name) {
    onChange(values.includes(name) ? values.filter((v) => v !== name) : [...values, name]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {allNames.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => toggle(name)}
          className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
            values.includes(name) ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-300"
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

// 청구금액 문자열("부품A(₩10,000), 부품B")에서 특정 부품의 금액만 다시 뽑아낸다 — 지급완료 내역 수정 시
// 기존에 입력된 부품별 금액을 폼에 미리 채워 넣기 위한 용도.
function parseAmountFromBillingPart(billingPart, part) {
  if (!billingPart) return "";
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = billingPart.match(new RegExp(`${escaped}\\(₩([0-9,]+)\\)`));
  return m ? m[1].replace(/,/g, "") : "";
}

// 지급완료된 자재신청 한 건을 수정하는 폼 — 담당기사·부품별 금액·할 일 기한·내용을 기존 할 일 값으로
// 미리 채우고, 저장 시 onSupplyEdit으로 그 할 일만 갱신한다(상태·지급일·사진은 별도).
function SupplyEditForm({ r, existingTodo, engineerNames, onSubmit, onAttachPhoto, onRemoveSupplyPhoto }) {
  const [assignee, setAssignee] = useState(existingTodo?.assignee ?? r.engineer);
  const parts = (r.part ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const [amounts, setAmounts] = useState(() => {
    const initial = {};
    parts.forEach((part, i) => {
      const found = parseAmountFromBillingPart(existingTodo?.billingPart, part);
      if (found) initial[i] = found;
    });
    return initial;
  });
  const [dueDate, setDueDate] = useState(existingTodo?.dueDate ?? addDays(TODAY_STR, 30));
  const [description, setDescription] = useState(existingTodo?.description ?? "");
  const [saving, setSaving] = useState(false);

  const total = parts.reduce((sum, _, i) => sum + (Number(amounts[i]) || 0), 0);
  const billingPartText = parts
    .map((part, i) => (amounts[i] ? `${part}(₩${Number(amounts[i]).toLocaleString()})` : part))
    .join(", ");
  const allAmountsFilled = parts.every((_, i) => Number(amounts[i]) > 0);

  async function submit() {
    if (!allAmountsFilled) return;
    setSaving(true);
    await onSubmit(assignee, billingPartText || null, total || null, dueDate, description);
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="bg-slate-100 rounded-xl p-3">
        <p className="text-[11px] text-slate-500">현장</p>
        <p className="font-bold text-slate-800">{r.siteName} · {r.part}</p>
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 block mb-1">지급 사진</label>
        <MultiPhotoUpload
          photos={(r.supplyPhotoUrls ?? (r.supplyPhotoUrl ? [r.supplyPhotoUrl] : [])).map((url) => ({ url }))}
          uploadFolder={`materials/${r.id}/supply`}
          onUploaded={(url) => onAttachPhoto(r.id, url)}
          onRemove={(idx) => onRemoveSupplyPhoto(r.id, idx)}
          label="지급할 자재 사진 촬영"
          required={false}
        />
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 block mb-1">담당 기사</label>
        <AssigneeSelect value={assignee} options={engineerNames} onChange={setAssignee} />
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 block mb-1">청구 부품별 금액</label>
        <div className="space-y-1.5">
          {parts.map((part, i) => {
            const { name, qty } = parsePartQty(part);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs text-slate-700 flex-1 truncate">{name || part}</span>
                <span className="text-xs text-slate-500 w-8">{qty || "-"}</span>
                <input
                  type="number"
                  className={`${inputCls} w-28`}
                  placeholder="금액"
                  value={amounts[i] ?? ""}
                  onChange={(e) => setAmounts((m) => ({ ...m, [i]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
        {parts.length > 1 && <p className="text-[10px] text-slate-400 text-right mt-1">합계 ₩{total.toLocaleString()}</p>}
        {!allAmountsFilled && <p className="text-[10px] text-red-500 mt-1">모든 부품의 금액을 입력해주세요</p>}
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 block mb-1">할 일 기한</label>
        <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 block mb-1">내용</label>
        <textarea
          className={inputCls}
          rows={3}
          placeholder="담당 기사에게 전달할 내용을 입력하세요"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <button
        onClick={submit}
        disabled={saving || !allAmountsFilled}
        className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
      >
        {saving ? "저장 중..." : "수정 저장"}
      </button>
    </div>
  );
}

// 지급완료 내역 전체보기 — "나의 자재 신청 전체보기"(MaterialHistoryScreen)와 동일한 구성
// (DrillHeader 전체화면 + 검색창 + 카드 목록). 카드 클릭 시 지급 내역 수정 폼이 열린다.
function SupplyHistoryScreen({ supplied, todos, engineerNames, onSupplyEdit, onAttachPhoto, onRemoveSupplyPhoto, onBack }) {
  const [query, setQuery] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const q = query.trim();
  const filtered = supplied
    .filter((r) => r.siteName.includes(q) || r.part.includes(q))
    .sort((a, b) => new Date(b.suppliedDate) - new Date(a.suppliedDate));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="지급완료 내역 전체보기" onBack={onBack} onHome={onBack} />
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명 또는 부품명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 지급완료 내역이 없습니다</p>
        ) : (
          filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setEditTarget(r)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{r.siteName} · {r.part}</p>
                <span className="text-xs font-bold px-2 py-1 rounded-full shrink-0 bg-emerald-100 text-emerald-700">지급완료</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">지급일 {r.suppliedDate} · D-30 시작</p>
            </button>
          ))
        )}
      </div>

      {editTarget && (
        <Sheet title={`${editTarget.siteName ?? "-"} · 지급 내역 수정`} onClose={() => setEditTarget(null)}>
          <SupplyEditForm
            r={editTarget}
            existingTodo={todos.find((t) => t.materialRequestId === editTarget.id)}
            engineerNames={engineerNames}
            onAttachPhoto={onAttachPhoto}
            onRemoveSupplyPhoto={onRemoveSupplyPhoto}
            onSubmit={async (assignee, billingPart, billingAmount, dueDate, description) => {
              await onSupplyEdit(editTarget.id, assignee, billingPart, billingAmount, dueDate, description);
              setEditTarget(null);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function MaterialRequestsScreen({ materialRequests, todos, onSupplyComplete, onSupplyEdit, onReprocess, onAttachPhoto, onRemoveSupplyPhoto, onBack }) {
  const { engineerNames } = useContext(AuthContext);
  const [detailTarget, setDetailTarget] = useState(null);
  const [assigneeMap, setAssigneeMap] = useState({});
  const [partAmountMap, setPartAmountMap] = useState({}); // { [requestId]: { [partIndex]: amount } }
  const [dueDateMap, setDueDateMap] = useState({});
  const [descriptionMap, setDescriptionMap] = useState({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const pending = materialRequests.filter((r) => r.status === "승인대기");
  const supplied = materialRequests.filter((r) => r.status === "지급완료");
  const rejected = materialRequests.filter((r) => r.status === "반려");

  if (historyOpen) {
    return (
      <SupplyHistoryScreen
        supplied={supplied}
        todos={todos}
        engineerNames={engineerNames}
        onSupplyEdit={onSupplyEdit}
        onAttachPhoto={onAttachPhoto}
        onRemoveSupplyPhoto={onRemoveSupplyPhoto}
        onBack={() => setHistoryOpen(false)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="자재출하관리" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {rejected.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <PackageX size={16} className="text-red-600" />
              <h3 className="font-extrabold text-red-700 text-sm">기사 반려 · 재지급 필요</h3>
            </div>
            <div className="space-y-2">
              {rejected.map((r) => (
                <div key={r.id} className="bg-white rounded-xl p-3 border border-red-100">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-slate-800 text-sm">{r.siteName} · {r.part}</p>
                    <span className="text-[11px] text-slate-400">{r.engineer}</span>
                  </div>
                  <p className="text-xs text-red-600 mb-2">사유: {r.rejectReason}</p>
                  <button
                    onClick={() => onReprocess(r.id)}
                    className="w-full flex items-center justify-center gap-1.5 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
                  >
                    <RotateCcw size={13} /> 재지급 대상으로 되돌리기
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-sm">자재 지급 대기</h3>
            <span className="text-xs font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="space-y-2.5">
            {pending.map((r) => {
              const parts = (r.part ?? "").split(",").map((s) => s.trim()).filter(Boolean);
              const amounts = partAmountMap[r.id] ?? {};
              const total = parts.reduce((sum, _, i) => sum + (Number(amounts[i]) || 0), 0);
              const billingPartText = parts
                .map((part, i) => (amounts[i] ? `${part}(₩${Number(amounts[i]).toLocaleString()})` : part))
                .join(", ");
              const allAmountsFilled = parts.every((_, i) => Number(amounts[i]) > 0);
              const dueDate = dueDateMap[r.id] ?? addDays(TODAY_STR, 30);
              const description = descriptionMap[r.id] ?? "";
              return (
                <div key={r.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800">{r.siteName} · {r.part}</p>
                    <button
                      onClick={() => setDetailTarget({ type: "material", data: r })}
                      className="text-[11px] font-bold text-blue-600 shrink-0 flex items-center gap-0.5"
                    >
                      상세보기 <ChevronRight size={12} />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{r.engineer} 기사 신청 · {r.requestedDate} · {r.urgency}</p>

                  <div className="mt-2.5">
                    <MultiPhotoUpload
                      photos={(r.supplyPhotoUrls ?? (r.supplyPhotoUrl ? [r.supplyPhotoUrl] : [])).map((url) => ({ url }))}
                      uploadFolder={`materials/${r.id}/supply`}
                      onUploaded={(url) => onAttachPhoto(r.id, url)}
                      onRemove={(idx) => onRemoveSupplyPhoto(r.id, idx)}
                      label="지급할 자재 사진 촬영"
                      required={false}
                    />
                  </div>

                  <div className="mt-2.5">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">담당 기사 (실제 교체할 기사, 기본값 신청자)</label>
                    <AssigneeSelect
                      value={assigneeMap[r.id] ?? r.engineer}
                      options={engineerNames}
                      onChange={(name) => setAssigneeMap((m) => ({ ...m, [r.id]: name }))}
                    />
                  </div>

                  <div className="mt-2.5">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">청구 부품별 금액</label>
                    <div className="flex gap-1.5 mb-1 px-0.5">
                      <span className="text-[10px] font-bold text-slate-400" style={{ flex: 2 }}>부품명</span>
                      <span className="text-[10px] font-bold text-slate-400" style={{ flex: 1 }}>수량</span>
                      <span className="text-[10px] font-bold text-slate-400" style={{ flex: 1.2 }}>금액</span>
                    </div>
                    <div className="space-y-1.5">
                      {parts.map((part, i) => {
                        const { name, qty } = parsePartQty(part);
                        return (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-700 truncate" style={{ flex: 2 }}>{name || part}</span>
                            <span className="text-xs text-slate-500" style={{ flex: 1 }}>{qty || "-"}</span>
                            <input
                              type="number"
                              className={inputCls}
                              style={{ flex: 1.2 }}
                              placeholder="금액"
                              value={amounts[i] ?? ""}
                              onChange={(e) => setPartAmountMap((m) => ({ ...m, [r.id]: { ...(m[r.id] ?? {}), [i]: e.target.value } }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {parts.length > 1 && (
                      <p className="text-[10px] text-slate-400 text-right mt-1">합계 ₩{total.toLocaleString()}</p>
                    )}
                    {!allAmountsFilled && (
                      <p className="text-[10px] text-red-500 mt-1">모든 부품의 금액을 입력해주세요</p>
                    )}
                  </div>

                  <div className="mt-2.5">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">할 일 기한</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={dueDate}
                      onChange={(e) => setDueDateMap((m) => ({ ...m, [r.id]: e.target.value }))}
                    />
                  </div>

                  <div className="mt-2.5">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">내용</label>
                    <textarea
                      className={inputCls}
                      rows={3}
                      placeholder="담당 기사에게 전달할 내용을 입력하세요"
                      value={description}
                      onChange={(e) => setDescriptionMap((m) => ({ ...m, [r.id]: e.target.value }))}
                    />
                  </div>

                  <button
                    onClick={() => allAmountsFilled && onSupplyComplete(r.id, assigneeMap[r.id] ?? r.engineer, billingPartText || null, total || null, dueDate, description)}
                    disabled={!allAmountsFilled}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg bg-blue-700 disabled:bg-slate-300 text-white active:bg-blue-800"
                  >
                    <PackageCheck size={14} /> 자재 지급 완료 체크
                  </button>
                </div>
              );
            })}
            {pending.length === 0 && <p className="text-xs text-slate-400 text-center py-3">지급 대기 중인 자재 신청이 없습니다</p>}
          </div>

        </div>

        {supplied.length > 0 && (
          <div className="px-0.5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 text-sm">지급완료 내역</h3>
              <button onClick={() => setHistoryOpen(true)} className="text-xs font-bold text-blue-600 flex items-center gap-0.5">
                전체보기 <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {detailTarget?.type === "material" && (
        <Sheet title="자재 신청 상세" onClose={() => setDetailTarget(null)}>
          <div className="space-y-3">
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">현장</p>
              <p className="font-bold text-slate-800">{detailTarget.data.siteName}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">부품 내역 (부품명, 수량)</p>
              <p className="font-bold text-slate-800 whitespace-pre-wrap">{detailTarget.data.part}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">긴급도</p>
                <p className="font-bold text-slate-800">{detailTarget.data.urgency}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">신청 기사</p>
                <p className="font-bold text-slate-800">{detailTarget.data.engineer}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3 col-span-2">
                <p className="text-[11px] text-slate-500">신청일</p>
                <p className="font-bold text-slate-800">{detailTarget.data.requestedDate}</p>
              </div>
            </div>
            {detailTarget.data.note && (
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">기사 의견 (교체 사유 및 특이사항)</p>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{detailTarget.data.note}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">기사가 첨부한 부품 규격 사진 ({detailTarget.data.photoCount ?? 1}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {detailTarget.data.photoUrls?.length > 0
                  ? detailTarget.data.photoUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
                    ))
                  : Array.from({ length: detailTarget.data.photoCount ?? 1 }).map((_, i) => <PhotoThumb key={i} />)}
              </div>
            </div>
            {detailTarget.data.status === "반려" && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="text-[11px] text-red-600 font-semibold">반려 사유</p>
                <p className="text-sm text-red-700 mt-0.5">{detailTarget.data.rejectReason}</p>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}


// 자재지급완료된 견적요청 한 건 수정 — 담당기사 구성·할 일 기한·내용을 기존 값으로 미리 채우고,
// 저장 시 onQuoteSupplyEdit으로 담당자별 할 일만 갱신한다(상태·지급일·사진은 별도).
function QuoteSupplyEditForm({ q, existingTodos, engineerNames, onSubmit, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto }) {
  const [assignees, setAssignees] = useState(existingTodos.length ? existingTodos.map((t) => t.assignee) : [q.engineer]);
  const [dueDate, setDueDate] = useState(existingTodos[0]?.dueDate ?? addDays(TODAY_STR, 30));
  const [description, setDescription] = useState(existingTodos[0]?.description ?? "");
  const [saving, setSaving] = useState(false);
  const canSave = assignees.length > 0;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    await onSubmit(assignees, dueDate, description);
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="bg-slate-100 rounded-xl p-3">
        <p className="text-[11px] text-slate-500">현장</p>
        <p className="font-bold text-slate-800">{q.siteName} · {q.constructionType}</p>
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 block mb-1">지급 사진</label>
        <MultiPhotoUpload
          photos={(q.supplyPhotoUrls ?? (q.supplyPhotoUrl ? [q.supplyPhotoUrl] : [])).map((url) => ({ url }))}
          uploadFolder={`quotes/${q.id}/supply`}
          onUploaded={(url) => onAttachQuotePhoto(q.id, url)}
          onRemove={(idx) => onRemoveQuoteSupplyPhoto(q.id, idx)}
          label="지급할 자재 사진 촬영"
          required={false}
        />
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 block mb-1">담당 기사 (실제 시공할 기사, 2명 이상 지정 가능)</label>
        <MultiAssigneeSelect values={assignees} options={engineerNames} onChange={setAssignees} />
        {assignees.length === 0 && <p className="text-[10px] text-slate-400 mt-1">담당 기사를 1명 이상 선택해주세요</p>}
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 block mb-1">할 일 기한</label>
        <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 block mb-1">내용</label>
        <textarea
          className={inputCls}
          rows={3}
          placeholder="담당 기사에게 전달할 내용을 입력하세요"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <button
        onClick={submit}
        disabled={saving || !canSave}
        className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
      >
        {saving ? "저장 중..." : "수정 저장"}
      </button>
    </div>
  );
}

// 자재지급완료 내역 전체보기 — SupplyHistoryScreen(자재출하관리)과 동일한 구성.
function QuoteSupplyHistoryScreen({ completed, todos, engineerNames, onQuoteSupplyEdit, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onBack }) {
  const [query, setQuery] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const q = query.trim();
  const filtered = completed
    .filter((r) => r.siteName.includes(q) || r.constructionType.includes(q))
    .sort((a, b) => new Date(b.suppliedDate) - new Date(a.suppliedDate));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="자재지급완료 내역 전체보기" onBack={onBack} onHome={onBack} />
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명 또는 공사내용으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 지급완료 내역이 없습니다</p>
        ) : (
          filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setEditTarget(r)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{r.siteName} · {r.constructionType}</p>
                <span className="text-xs font-bold px-2 py-1 rounded-full shrink-0 bg-emerald-100 text-emerald-700">자재지급완료</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">지급일 {r.suppliedDate} · D-30 시작</p>
            </button>
          ))
        )}
      </div>

      {editTarget && (
        <Sheet title={`${editTarget.siteName ?? "-"} · 지급 내역 수정`} onClose={() => setEditTarget(null)}>
          <QuoteSupplyEditForm
            q={editTarget}
            existingTodos={todos.filter((t) => t.quoteRequestId === editTarget.id)}
            engineerNames={engineerNames}
            onAttachQuotePhoto={onAttachQuotePhoto}
            onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
            onSubmit={async (assignees, dueDate, description) => {
              await onQuoteSupplyEdit(editTarget.id, assignees, dueDate, description);
              setEditTarget(null);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function QuoteRequestsScreen({ quoteRequests, todos, onAdvanceQuote, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onCompleteQuoteSupply, onQuoteSupplyEdit, onBack }) {
  const { engineerNames } = useContext(AuthContext);
  const [detailTarget, setDetailTarget] = useState(null);
  const [assigneesMap, setAssigneesMap] = useState({});
  const [dueDateMap, setDueDateMap] = useState({});
  const [descriptionMap, setDescriptionMap] = useState({});
  const [historyOpen, setHistoryOpen] = useState(false);

  const active = quoteRequests.filter((q) => q.status !== "자재지급완료");
  const completed = quoteRequests.filter((q) => q.status === "자재지급완료");

  if (historyOpen) {
    return (
      <QuoteSupplyHistoryScreen
        completed={completed}
        todos={todos}
        engineerNames={engineerNames}
        onQuoteSupplyEdit={onQuoteSupplyEdit}
        onAttachQuotePhoto={onAttachQuotePhoto}
        onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
        onBack={() => setHistoryOpen(false)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="견적 요청 관리" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="space-y-3">
            {active.map((q) => (
              <div key={q.id} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-slate-800">{q.siteName} · {q.constructionType}</p>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      q.status === "자재지급완료" ? "bg-emerald-100 text-emerald-700" :
                      q.status === "승인" ? "bg-indigo-100 text-indigo-700" :
                      q.status === "견적발행" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {q.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-1">{q.engineer} 기사 신청 · {q.requestedDate} · 현장담당 {q.contactPhone}</p>
                <button
                  onClick={() => setDetailTarget({ type: "quote", data: q })}
                  className="text-[11px] font-bold text-blue-600 mb-2 flex items-center gap-0.5"
                >
                  상세보기 <ChevronRight size={12} />
                </button>

                {q.status === "요청접수" && (
                  <button
                    onClick={() => onAdvanceQuote(q.id)}
                    className="w-full bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
                  >
                    견적발행 처리
                  </button>
                )}
                {q.status === "견적발행" && (
                  <button
                    onClick={() => onAdvanceQuote(q.id)}
                    className="w-full bg-indigo-600 text-white text-xs font-bold py-2.5 rounded-lg active:bg-indigo-700"
                  >
                    승인 처리
                  </button>
                )}
                {q.status === "승인" && (() => {
                  const assignees = assigneesMap[q.id] ?? [q.engineer];
                  const canComplete = assignees.length > 0;
                  const dueDate = dueDateMap[q.id] ?? addDays(TODAY_STR, 30);
                  const description = descriptionMap[q.id] ?? "";
                  return (
                    <>
                      <div className="mb-2">
                        <MultiPhotoUpload
                          photos={(q.supplyPhotoUrls ?? (q.supplyPhotoUrl ? [q.supplyPhotoUrl] : [])).map((url) => ({ url }))}
                          uploadFolder={`quotes/${q.id}/supply`}
                          onUploaded={(url) => onAttachQuotePhoto(q.id, url)}
                          onRemove={(idx) => onRemoveQuoteSupplyPhoto(q.id, idx)}
                          label="지급할 자재 사진 촬영"
                          required={false}
                        />
                      </div>
                      <div className="mb-2">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">담당 기사 (실제 시공할 기사, 2명 이상 지정 가능 · 기본값 신청자)</label>
                        <MultiAssigneeSelect
                          values={assignees}
                          options={engineerNames}
                          onChange={(names) => setAssigneesMap((m) => ({ ...m, [q.id]: names }))}
                        />
                      </div>
                      <div className="mb-2">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">할 일 기한</label>
                        <input
                          type="date"
                          className={inputCls}
                          value={dueDate}
                          onChange={(e) => setDueDateMap((m) => ({ ...m, [q.id]: e.target.value }))}
                        />
                      </div>
                      <div className="mb-2">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">내용</label>
                        <textarea
                          className={inputCls}
                          rows={3}
                          placeholder="담당 기사에게 전달할 내용을 입력하세요"
                          value={description}
                          onChange={(e) => setDescriptionMap((m) => ({ ...m, [q.id]: e.target.value }))}
                        />
                      </div>
                      <button
                        onClick={() => canComplete && onCompleteQuoteSupply(q.id, assignees, dueDate, description)}
                        disabled={!canComplete}
                        className={`w-full flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg ${
                          canComplete ? "bg-blue-700 text-white active:bg-blue-800" : "bg-slate-200 text-slate-400"
                        }`}
                      >
                        <PackageCheck size={14} /> 자재 지급 완료 체크
                      </button>
                      {assignees.length === 0 && (
                        <p className="text-[10px] text-slate-400 text-center mt-1">담당 기사를 1명 이상 선택해주세요</p>
                      )}
                    </>
                  );
                })()}
              </div>
            ))}
            {active.length === 0 && <p className="text-xs text-slate-400 text-center py-3">진행 중인 견적 요청이 없습니다</p>}
          </div>
        </div>

        {completed.length > 0 && (
          <div className="px-0.5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 text-sm">자재지급완료 내역</h3>
              <button onClick={() => setHistoryOpen(true)} className="text-xs font-bold text-blue-600 flex items-center gap-0.5">
                전체보기 <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {detailTarget?.type === "quote" && (
        <Sheet title="견적 요청 상세" onClose={() => setDetailTarget(null)}>
          <div className="space-y-3">
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">현장</p>
              <p className="font-bold text-slate-800">{detailTarget.data.siteName}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">견적 내역 (부품명, 수량)</p>
              <p className="font-bold text-slate-800 whitespace-pre-wrap">{detailTarget.data.constructionType}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">현장 견적 담당자 연락처</p>
                <p className="font-bold text-slate-800">{detailTarget.data.contactPhone}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">신청 기사</p>
                <p className="font-bold text-slate-800">{detailTarget.data.engineer}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3 col-span-2">
                <p className="text-[11px] text-slate-500">신청일</p>
                <p className="font-bold text-slate-800">{detailTarget.data.requestedDate}</p>
              </div>
            </div>
            {detailTarget.data.note && (
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">기사 의견 (견적 사유 및 특이사항)</p>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{detailTarget.data.note}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">기사가 첨부한 현장 상태 사진 ({detailTarget.data.photoCount ?? 1}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {detailTarget.data.photoUrls?.length > 0
                  ? detailTarget.data.photoUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
                    ))
                  : Array.from({ length: detailTarget.data.photoCount ?? 1 }).map((_, i) => <PhotoThumb key={i} />)}
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}


function RestockScreen({ restockRequests, onAttachRestockPhoto, onRemoveRestockSupplyPhoto, onCompleteRestock, onBack }) {
  const pending = restockRequests.filter((r) => r.status === "대기");
  const done = restockRequests.filter((r) => r.status === "완료");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="상비부품 보충" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-sm">보충 대기</h3>
            <span className="text-xs font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="space-y-2.5">
            {pending.map((r) => (
              <div key={r.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                <p className="text-sm font-bold text-slate-800">{r.part}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{r.engineer} 기사 · {r.siteName}에서 사용 · {r.requestedDate}</p>

                <div className="mt-2.5">
                  <MultiPhotoUpload
                    photos={(r.supplyPhotoUrls ?? (r.supplyPhotoUrl ? [r.supplyPhotoUrl] : [])).map((url) => ({ url }))}
                    uploadFolder={`restock/${r.id}/supply`}
                    onUploaded={(url) => onAttachRestockPhoto(r.id, url)}
                    onRemove={(idx) => onRemoveRestockSupplyPhoto(r.id, idx)}
                    label="보충할 부품 사진 촬영"
                    required={false}
                  />
                </div>

                <button
                  onClick={() => onCompleteRestock(r.id)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg bg-blue-700 text-white active:bg-blue-800"
                >
                  <PackageCheck size={14} /> 보충 지급 완료 체크
                </button>
              </div>
            ))}
            {pending.length === 0 && <p className="text-xs text-slate-400 text-center py-3">보충 대기 중인 상비부품이 없습니다</p>}
          </div>

          {done.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-400 mt-4 mb-2">최근 보충완료</p>
              <div className="space-y-1.5">
                {done.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs text-slate-500">
                    <span>{r.engineer} · {r.part}</span>
                    <span className="text-emerald-600 font-semibold">{r.suppliedDate} 보충완료</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


export function AdminTab({ materialRequests, billings, quoteRequests, restockRequests, todos, onSupplyComplete, onSupplyEdit, onReprocess, onAttachPhoto, onRemoveSupplyPhoto, onAdvanceQuote, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onCompleteQuoteSupply, onQuoteSupplyEdit, onAttachRestockPhoto, onRemoveRestockSupplyPhoto, onCompleteRestock }) {
  const [billingViewOpen, setBillingViewOpen] = useState(false);
  const [adminScreen, setAdminScreen] = useState(null); // null | "materials" | "quotes" | "restock"
  const pendingCount = materialRequests.filter((r) => r.status === "승인대기").length;
  const quoteActiveCount = quoteRequests.filter((q) => q.status !== "자재지급완료").length;

  if (billingViewOpen) {
    return <BillingHistoryScreen billings={billings} onBack={() => setBillingViewOpen(false)} />;
  }

  if (adminScreen === "materials") {
    return (
      <MaterialRequestsScreen
        materialRequests={materialRequests}
        todos={todos}
        onSupplyComplete={onSupplyComplete}
        onSupplyEdit={onSupplyEdit}
        onReprocess={onReprocess}
        onAttachPhoto={onAttachPhoto}
        onRemoveSupplyPhoto={onRemoveSupplyPhoto}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  if (adminScreen === "quotes") {
    return (
      <QuoteRequestsScreen
        quoteRequests={quoteRequests}
        todos={todos}
        onAdvanceQuote={onAdvanceQuote}
        onAttachQuotePhoto={onAttachQuotePhoto}
        onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
        onCompleteQuoteSupply={onCompleteQuoteSupply}
        onQuoteSupplyEdit={onQuoteSupplyEdit}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  if (adminScreen === "restock") {
    return (
      <RestockScreen
        restockRequests={restockRequests}
        onAttachRestockPhoto={onAttachRestockPhoto}
        onRemoveRestockSupplyPhoto={onRemoveRestockSupplyPhoto}
        onCompleteRestock={onCompleteRestock}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          <AdminMenuRow icon={PackageCheck} label="자재출하관리" badge={pendingCount} onClick={() => setAdminScreen("materials")} />
          <AdminMenuRow icon={Package} label="상비부품 보충" badge={restockRequests.filter((r) => r.status === "대기").length} onClick={() => setAdminScreen("restock")} />
          <AdminMenuRow icon={FileText} label="견적 요청 관리" badge={quoteActiveCount} onClick={() => setAdminScreen("quotes")} />
          <AdminMenuRow icon={Receipt} label="비용청구 내역" badge={billings.length} onClick={() => setBillingViewOpen(true)} />
        </div>
      </div>
    </div>
  );
}
