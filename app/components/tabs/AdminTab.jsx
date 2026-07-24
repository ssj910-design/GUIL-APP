import { useState, useContext, useRef } from "react";
import { Package, Receipt, ChevronRight, ChevronLeft, ChevronDown, FileText, PackageCheck, RotateCcw, PackageX, Search, Repeat } from "lucide-react";
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

// 메뉴 줄을 눌러 아래로 펼쳐지는 아코디언. 펼친 영역엔 처리 대기 건을 한 건씩 스와이프로 넘기는 캐러셀이 들어간다.
function AccordionRow({ icon: Icon, label, badge, open, onToggle, children }) {
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5 active:bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-slate-600" />
          </div>
          <span className="text-sm font-bold text-slate-800">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {!!badge && <span className="text-[11px] font-bold text-white bg-blue-700 px-2 py-0.5 rounded-full">{badge}</span>}
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && <div className="px-3 pb-4 pt-1 bg-slate-50/60 border-t border-slate-100">{children}</div>}
    </div>
  );
}

// 처리 대기 건을 한 화면에 한 건씩 보여주고 좌우 스와이프(또는 화살표)로 넘긴다. 네이티브 가로 스크롤 스냅 사용.
function SwipeCarousel({ items, renderItem, emptyText }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  if (items.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-6">{emptyText}</p>;
  }
  const cur = Math.min(idx, items.length - 1);
  const go = (n) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
    setIdx(n);
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setIdx(Math.round(el.scrollLeft / (el.clientWidth || 1)));
  };
  return (
    <div>
      {items.length > 1 && (
        <div className="flex items-center justify-between mb-2 px-0.5">
          <button type="button" onClick={() => go(Math.max(0, cur - 1))} disabled={cur === 0} className="w-7 h-7 rounded-full border border-slate-200 bg-white flex items-center justify-center disabled:opacity-30 active:bg-slate-50">
            <ChevronLeft size={16} className="text-slate-600" />
          </button>
          <span className="text-xs font-bold text-slate-500">{cur + 1} / {items.length}</span>
          <button type="button" onClick={() => go(Math.min(items.length - 1, cur + 1))} disabled={cur === items.length - 1} className="w-7 h-7 rounded-full border border-slate-200 bg-white flex items-center justify-center disabled:opacity-30 active:bg-slate-50">
            <ChevronRight size={16} className="text-slate-600" />
          </button>
        </div>
      )}
      <div ref={ref} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: "none" }}>
        {items.map((it, i) => (
          <div key={it.id} className="snap-center shrink-0 w-full">
            {renderItem(it, i)}
          </div>
        ))}
      </div>
    </div>
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

/* ---------- 처리 대기 카드 (캐러셀 한 칸) ---------- */

// 자재 지급 대기 한 건 — 관리자 주 입력은 금액이라 그것만 앞에 두고, 담당기사·기한·내용은 "추가 설정"으로 접는다.
function MaterialPendingCard({ r, engineerNames, onSupplyComplete, onAttachPhoto, onRemoveSupplyPhoto, onOpenDetail }) {
  const parts = (r.part ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const [amounts, setAmounts] = useState({});
  const [assignee, setAssignee] = useState(r.engineer);
  const [dueDate, setDueDate] = useState(addDays(TODAY_STR, 30));
  const [description, setDescription] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const total = parts.reduce((sum, _, i) => sum + (Number(amounts[i]) || 0), 0);
  const allAmountsFilled = parts.every((_, i) => Number(amounts[i]) > 0);
  const billingPartText = parts
    .map((part, i) => (amounts[i] ? `${part}(₩${Number(amounts[i]).toLocaleString()})` : part))
    .join(", ");
  return (
    <div className="bg-white rounded-xl border border-amber-200 p-3.5 mx-0.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-slate-800">{r.siteName} · {r.part}</p>
        <button onClick={() => onOpenDetail(r)} className="text-[11px] font-bold text-blue-600 shrink-0 flex items-center gap-0.5">상세 <ChevronRight size={12} /></button>
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

      <div className="mt-3">
        <label className="text-[11px] font-extrabold text-slate-600 block mb-1.5">부품별 금액</label>
        <div className="space-y-1.5">
          {parts.map((part, i) => {
            const { name, qty } = parsePartQty(part);
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-700 truncate flex-1">{name || part}{qty ? ` ×${qty}` : ""}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className={`${inputCls} w-28`}
                  placeholder="금액"
                  value={amounts[i] ?? ""}
                  onChange={(e) => setAmounts((m) => ({ ...m, [i]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
        {parts.length > 1 && <p className="text-[11px] text-slate-500 text-right mt-1">합계 ₩{total.toLocaleString()}</p>}
      </div>

      <button type="button" onClick={() => setAdvanced((v) => !v)} className="mt-2.5 flex items-center gap-0.5 text-[11px] font-bold text-slate-400">
        담당기사 · 기한 · 내용 <ChevronDown size={13} className={advanced ? "rotate-180" : ""} />
      </button>
      {advanced && (
        <div className="mt-2 space-y-2.5">
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1">담당 기사 (기본값 신청자)</label>
            <AssigneeSelect value={assignee} options={engineerNames} onChange={setAssignee} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1">할 일 기한</label>
            <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1">내용</label>
            <textarea className={inputCls} rows={2} placeholder="담당 기사에게 전달할 내용" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
      )}

      {!allAmountsFilled && <p className="text-[10px] text-red-500 mt-2">모든 부품의 금액을 입력해주세요</p>}
      <button
        onClick={() => allAmountsFilled && onSupplyComplete(r.id, assignee, billingPartText || null, total || null, dueDate, description)}
        disabled={!allAmountsFilled}
        className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg bg-blue-700 disabled:bg-slate-300 text-white active:bg-blue-800"
      >
        <PackageCheck size={14} /> 자재 지급 완료 체크
      </button>
    </div>
  );
}

// 견적 요청 한 건 — 상태(요청접수→견적발행→승인)에 따라 처리 버튼이 달라진다. 승인 단계에서 지급 폼 노출.
function QuotePendingCard({ q, engineerNames, onAdvanceQuote, onCompleteQuoteSupply, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onOpenDetail }) {
  const [assignees, setAssignees] = useState([q.engineer]);
  const [dueDate, setDueDate] = useState(addDays(TODAY_STR, 30));
  const [description, setDescription] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const canComplete = assignees.length > 0;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5 mx-0.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-800 min-w-0 truncate">{q.siteName} · {q.constructionType}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
          q.status === "승인" ? "bg-indigo-100 text-indigo-700" : q.status === "견적발행" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
        }`}>{q.status}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-0.5">{q.engineer} 기사 · {q.requestedDate} · 현장담당 {q.contactPhone}</p>
      <button onClick={() => onOpenDetail(q)} className="mt-1 text-[11px] font-bold text-blue-600 flex items-center gap-0.5">상세 <ChevronRight size={12} /></button>

      {q.status === "요청접수" && (
        <button onClick={() => onAdvanceQuote(q.id)} className="w-full mt-2.5 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800">견적발행 처리</button>
      )}
      {q.status === "견적발행" && (
        <button onClick={() => onAdvanceQuote(q.id)} className="w-full mt-2.5 bg-indigo-600 text-white text-xs font-bold py-2.5 rounded-lg active:bg-indigo-700">승인 처리</button>
      )}
      {q.status === "승인" && (
        <div className="mt-2.5">
          <MultiPhotoUpload
            photos={(q.supplyPhotoUrls ?? (q.supplyPhotoUrl ? [q.supplyPhotoUrl] : [])).map((url) => ({ url }))}
            uploadFolder={`quotes/${q.id}/supply`}
            onUploaded={(url) => onAttachQuotePhoto(q.id, url)}
            onRemove={(idx) => onRemoveQuoteSupplyPhoto(q.id, idx)}
            label="지급할 자재 사진 촬영"
            required={false}
          />
          <button type="button" onClick={() => setAdvanced((v) => !v)} className="mt-2.5 flex items-center gap-0.5 text-[11px] font-bold text-slate-400">
            담당기사 · 기한 · 내용 <ChevronDown size={13} className={advanced ? "rotate-180" : ""} />
          </button>
          {advanced && (
            <div className="mt-2 space-y-2.5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">담당 기사 (2명 이상 가능 · 기본 신청자)</label>
                <MultiAssigneeSelect values={assignees} options={engineerNames} onChange={setAssignees} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">할 일 기한</label>
                <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">내용</label>
                <textarea className={inputCls} rows={2} placeholder="담당 기사에게 전달할 내용" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
          )}
          {!canComplete && <p className="text-[10px] text-slate-400 mt-2">담당 기사를 1명 이상 선택해주세요</p>}
          <button
            onClick={() => canComplete && onCompleteQuoteSupply(q.id, assignees, dueDate, description)}
            disabled={!canComplete}
            className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg bg-blue-700 disabled:bg-slate-300 text-white active:bg-blue-800"
          >
            <PackageCheck size={14} /> 자재 지급 완료 체크
          </button>
        </div>
      )}
    </div>
  );
}

// 상비부품 보충 대기 한 건.
function RestockPendingCard({ r, onCompleteRestock, onAttachRestockPhoto, onRemoveRestockSupplyPhoto }) {
  return (
    <div className="bg-white rounded-xl border border-amber-200 p-3.5 mx-0.5">
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
      <button onClick={() => onCompleteRestock(r.id)} className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg bg-blue-700 text-white active:bg-blue-800">
        <PackageCheck size={14} /> 보충 지급 완료 체크
      </button>
    </div>
  );
}

// 재배정 요청 한 건 — 기사가 넘겨달라고 요청한 할 일. 새 담당자로 재배정하거나 요청 반려.
function ReassignCard({ t, engineerNames, onReassignTodo, onClearReassignRequest }) {
  const [pick, setPick] = useState(t.reassignTo || engineerNames.find((n) => n !== t.assignee) || t.assignee);
  return (
    <div className="bg-white rounded-xl border border-amber-200 p-3.5 mx-0.5">
      <p className="text-sm font-bold text-slate-800">{t.siteName ? `${t.siteName} · ` : ""}{t.title}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">현재 담당 {t.assignee} · 마감 {t.dueDate || "미정"}</p>
      {t.reassignReason && <p className="text-[11px] text-amber-700 mt-1.5 bg-amber-50 rounded-lg px-2.5 py-1.5">사유: {t.reassignReason}</p>}
      <div className="mt-2.5">
        <label className="text-[10px] font-bold text-slate-400 block mb-1">새 담당 기사{t.reassignTo ? ` (희망: ${t.reassignTo})` : ""}</label>
        <AssigneeSelect value={pick} options={engineerNames} onChange={setPick} />
      </div>
      <div className="flex gap-2 mt-2.5">
        <button onClick={() => onReassignTodo(t.id, pick)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg bg-blue-700 text-white active:bg-blue-800">
          <Repeat size={13} /> 이 기사로 재배정
        </button>
        <button onClick={() => onClearReassignRequest(t.id)} className="px-4 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg active:bg-slate-50">반려</button>
      </div>
    </div>
  );
}

/* ---------- 아코디언 패널 ---------- */

function MaterialsPanel({ pending, rejected, suppliedCount, engineerNames, onSupplyComplete, onAttachPhoto, onRemoveSupplyPhoto, onReprocess, onOpenHistory }) {
  const [detail, setDetail] = useState(null);
  return (
    <div>
      {rejected.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 mx-0.5">
          <div className="flex items-center gap-1.5 mb-2">
            <PackageX size={14} className="text-red-600" />
            <h4 className="font-extrabold text-red-700 text-xs">기사 반려 · 재지급 필요 ({rejected.length})</h4>
          </div>
          <div className="space-y-2">
            {rejected.map((r) => (
              <div key={r.id} className="bg-white rounded-lg p-2.5 border border-red-100">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-800 text-xs">{r.siteName} · {r.part}</p>
                  <span className="text-[10px] text-slate-400">{r.engineer}</span>
                </div>
                <p className="text-[11px] text-red-600 my-1">사유: {r.rejectReason}</p>
                <button onClick={() => onReprocess(r.id)} className="w-full flex items-center justify-center gap-1.5 bg-blue-700 text-white text-[11px] font-bold py-2 rounded-lg active:bg-blue-800">
                  <RotateCcw size={12} /> 재지급 대상으로 되돌리기
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <SwipeCarousel
        items={pending}
        emptyText="지급 대기 중인 자재 신청이 없습니다"
        renderItem={(r) => (
          <MaterialPendingCard
            r={r}
            engineerNames={engineerNames}
            onSupplyComplete={onSupplyComplete}
            onAttachPhoto={onAttachPhoto}
            onRemoveSupplyPhoto={onRemoveSupplyPhoto}
            onOpenDetail={setDetail}
          />
        )}
      />

      {suppliedCount > 0 && (
        <button onClick={onOpenHistory} className="w-full mt-3 flex items-center justify-center gap-1 text-xs font-bold text-blue-600 py-2">
          지급완료 내역 전체보기 ({suppliedCount}) <ChevronRight size={13} />
        </button>
      )}

      {detail && (
        <Sheet title="자재 신청 상세" onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">현장</p>
              <p className="font-bold text-slate-800">{detail.siteName}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">부품 내역 (부품명, 수량)</p>
              <p className="font-bold text-slate-800 whitespace-pre-wrap">{detail.part}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">긴급도</p>
                <p className="font-bold text-slate-800">{detail.urgency}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">신청 기사</p>
                <p className="font-bold text-slate-800">{detail.engineer}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3 col-span-2">
                <p className="text-[11px] text-slate-500">신청일</p>
                <p className="font-bold text-slate-800">{detail.requestedDate}</p>
              </div>
            </div>
            {detail.note && (
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">기사 의견 (교체 사유 및 특이사항)</p>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{detail.note}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">기사가 첨부한 부품 규격 사진 ({detail.photoCount ?? 1}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {detail.photoUrls?.length > 0
                  ? detail.photoUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
                    ))
                  : Array.from({ length: detail.photoCount ?? 1 }).map((_, i) => <PhotoThumb key={i} />)}
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function QuotesPanel({ active, completedCount, engineerNames, onAdvanceQuote, onCompleteQuoteSupply, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onOpenHistory }) {
  const [detail, setDetail] = useState(null);
  return (
    <div>
      <SwipeCarousel
        items={active}
        emptyText="진행 중인 견적 요청이 없습니다"
        renderItem={(q) => (
          <QuotePendingCard
            q={q}
            engineerNames={engineerNames}
            onAdvanceQuote={onAdvanceQuote}
            onCompleteQuoteSupply={onCompleteQuoteSupply}
            onAttachQuotePhoto={onAttachQuotePhoto}
            onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
            onOpenDetail={setDetail}
          />
        )}
      />

      {completedCount > 0 && (
        <button onClick={onOpenHistory} className="w-full mt-3 flex items-center justify-center gap-1 text-xs font-bold text-blue-600 py-2">
          자재지급완료 내역 전체보기 ({completedCount}) <ChevronRight size={13} />
        </button>
      )}

      {detail && (
        <Sheet title="견적 요청 상세" onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">현장</p>
              <p className="font-bold text-slate-800">{detail.siteName}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">견적 내역 (부품명, 수량)</p>
              <p className="font-bold text-slate-800 whitespace-pre-wrap">{detail.constructionType}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">현장 견적 담당자 연락처</p>
                <p className="font-bold text-slate-800">{detail.contactPhone}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">신청 기사</p>
                <p className="font-bold text-slate-800">{detail.engineer}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3 col-span-2">
                <p className="text-[11px] text-slate-500">신청일</p>
                <p className="font-bold text-slate-800">{detail.requestedDate}</p>
              </div>
            </div>
            {detail.note && (
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">기사 의견 (견적 사유 및 특이사항)</p>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{detail.note}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">기사가 첨부한 현장 상태 사진 ({detail.photoCount ?? 1}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {detail.photoUrls?.length > 0
                  ? detail.photoUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
                    ))
                  : Array.from({ length: detail.photoCount ?? 1 }).map((_, i) => <PhotoThumb key={i} />)}
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function RestockPanel({ pending, done, onCompleteRestock, onAttachRestockPhoto, onRemoveRestockSupplyPhoto }) {
  return (
    <div>
      <SwipeCarousel
        items={pending}
        emptyText="보충 대기 중인 상비부품이 없습니다"
        renderItem={(r) => (
          <RestockPendingCard
            r={r}
            onCompleteRestock={onCompleteRestock}
            onAttachRestockPhoto={onAttachRestockPhoto}
            onRemoveRestockSupplyPhoto={onRemoveRestockSupplyPhoto}
          />
        )}
      />
      {done.length > 0 && (
        <div className="mt-3 px-0.5">
          <p className="text-xs font-bold text-slate-400 mb-1.5">최근 보충완료</p>
          <div className="space-y-1.5">
            {done.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs text-slate-500">
                <span>{r.engineer} · {r.part}</span>
                <span className="text-emerald-600 font-semibold">{r.suppliedDate} 보충완료</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReassignPanel({ todos, engineerNames, onReassignTodo, onClearReassignRequest }) {
  return (
    <SwipeCarousel
      items={todos}
      emptyText="처리할 재배정 요청이 없습니다"
      renderItem={(t) => (
        <ReassignCard
          t={t}
          engineerNames={engineerNames}
          onReassignTodo={onReassignTodo}
          onClearReassignRequest={onClearReassignRequest}
        />
      )}
    />
  );
}

/* ---------- 지급완료 내역 (전체보기 페이지) ---------- */

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

// 지급완료 내역 전체보기 — DrillHeader 전체화면 + 검색창 + 카드 목록. 카드 클릭 시 지급 내역 수정 폼이 열린다.
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

// 처리 대기 요약 대시보드 — 관리자가 열자마자 지금 처리할 것이 몇 건인지 한눈에.
function DashStat({ label, n, tone }) {
  const tones = { amber: "text-amber-600", red: "text-red-600", indigo: "text-indigo-600" };
  return (
    <div className="text-center">
      <p className={`text-xl font-extrabold ${n > 0 ? tones[tone] : "text-slate-300"}`}>{n}</p>
      <p className="text-[10px] font-bold text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}


export function AdminTab({ materialRequests, billings, quoteRequests, restockRequests, todos, onSupplyComplete, onSupplyEdit, onReprocess, onAttachPhoto, onRemoveSupplyPhoto, onAdvanceQuote, onAttachQuotePhoto, onRemoveQuoteSupplyPhoto, onCompleteQuoteSupply, onQuoteSupplyEdit, onAttachRestockPhoto, onRemoveRestockSupplyPhoto, onCompleteRestock, onReassignTodo, onClearReassignRequest }) {
  const { engineerNames } = useContext(AuthContext);
  const [page, setPage] = useState(null); // null | "billing" | "materialHistory" | "quoteHistory"
  const [expanded, setExpanded] = useState(null); // "materials" | "restock" | "quotes" | "reassign" | null

  const materialPending = materialRequests.filter((r) => r.status === "승인대기");
  const materialRejected = materialRequests.filter((r) => r.status === "반려");
  const supplied = materialRequests.filter((r) => r.status === "지급완료");
  const quoteActive = quoteRequests.filter((q) => q.status !== "자재지급완료");
  const completed = quoteRequests.filter((q) => q.status === "자재지급완료");
  const restockPending = restockRequests.filter((r) => r.status === "대기");
  const restockDone = restockRequests.filter((r) => r.status === "완료");
  const reassignTodos = todos.filter((t) => t.reassignRequested && !t.done);

  const toggle = (k) => setExpanded((cur) => (cur === k ? null : k));

  if (page === "billing") {
    return <BillingHistoryScreen billings={billings} onBack={() => setPage(null)} />;
  }
  if (page === "materialHistory") {
    return (
      <SupplyHistoryScreen
        supplied={supplied}
        todos={todos}
        engineerNames={engineerNames}
        onSupplyEdit={onSupplyEdit}
        onAttachPhoto={onAttachPhoto}
        onRemoveSupplyPhoto={onRemoveSupplyPhoto}
        onBack={() => setPage(null)}
      />
    );
  }
  if (page === "quoteHistory") {
    return (
      <QuoteSupplyHistoryScreen
        completed={completed}
        todos={todos}
        engineerNames={engineerNames}
        onQuoteSupplyEdit={onQuoteSupplyEdit}
        onAttachQuotePhoto={onAttachQuotePhoto}
        onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
        onBack={() => setPage(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
          <p className="text-xs font-bold text-slate-500 mb-2.5">지금 처리할 것</p>
          <div className="grid grid-cols-4 gap-2">
            <DashStat label="자재" n={materialPending.length} tone="amber" />
            <DashStat label="반려" n={materialRejected.length} tone="red" />
            <DashStat label="견적" n={quoteActive.length} tone="indigo" />
            <DashStat label="재배정" n={reassignTodos.length} tone="amber" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          <AccordionRow icon={PackageCheck} label="자재출하관리" badge={materialPending.length} open={expanded === "materials"} onToggle={() => toggle("materials")}>
            <MaterialsPanel
              pending={materialPending}
              rejected={materialRejected}
              suppliedCount={supplied.length}
              engineerNames={engineerNames}
              onSupplyComplete={onSupplyComplete}
              onAttachPhoto={onAttachPhoto}
              onRemoveSupplyPhoto={onRemoveSupplyPhoto}
              onReprocess={onReprocess}
              onOpenHistory={() => setPage("materialHistory")}
            />
          </AccordionRow>

          <AccordionRow icon={Package} label="상비부품 보충" badge={restockPending.length} open={expanded === "restock"} onToggle={() => toggle("restock")}>
            <RestockPanel
              pending={restockPending}
              done={restockDone}
              onCompleteRestock={onCompleteRestock}
              onAttachRestockPhoto={onAttachRestockPhoto}
              onRemoveRestockSupplyPhoto={onRemoveRestockSupplyPhoto}
            />
          </AccordionRow>

          <AccordionRow icon={FileText} label="견적 요청 관리" badge={quoteActive.length} open={expanded === "quotes"} onToggle={() => toggle("quotes")}>
            <QuotesPanel
              active={quoteActive}
              completedCount={completed.length}
              engineerNames={engineerNames}
              onAdvanceQuote={onAdvanceQuote}
              onCompleteQuoteSupply={onCompleteQuoteSupply}
              onAttachQuotePhoto={onAttachQuotePhoto}
              onRemoveQuoteSupplyPhoto={onRemoveQuoteSupplyPhoto}
              onOpenHistory={() => setPage("quoteHistory")}
            />
          </AccordionRow>

          <AccordionRow icon={Repeat} label="재배정 요청 처리" badge={reassignTodos.length} open={expanded === "reassign"} onToggle={() => toggle("reassign")}>
            <ReassignPanel
              todos={reassignTodos}
              engineerNames={engineerNames}
              onReassignTodo={onReassignTodo}
              onClearReassignRequest={onClearReassignRequest}
            />
          </AccordionRow>

          <AdminMenuRow icon={Receipt} label="비용청구 내역" badge={billings.length} onClick={() => setPage("billing")} />
        </div>
      </div>
    </div>
  );
}
