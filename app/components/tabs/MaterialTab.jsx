import { Fragment, useState, useContext } from "react";
import { ChevronRight, X, Plus, Search, PackageCheck, PackageX, AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { siteUnits, unitIdFor, profileIdByName, formatPhone } from "@/lib/utils";
import { TODAY_STR, QUOTE_STAGES, KIT_PARTS } from "@/lib/constants";
import { PhotoThumb, PrimaryButton, Sheet, Field, inputCls, DrillHeader } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { SiteSearchSelect, MultiPhotoUpload } from "@/app/components/formWidgets";
import { PhotoViewerSheet } from "@/app/components/tabs/SiteTab";


// 자재 신청/견적 요청/상비부품 보충 각각의 상세보기(신청 사진 포함)에 공용으로 쓰는 시트.
// target = { type: "material" | "quote" | "restock", data }
function RequestDetailSheet({ target, onClose, onPhotoClick, todos }) {
  if (!target) return null;
  const { type, data } = target;
  const title = type === "material" ? "자재 신청 상세" : type === "quote" ? "견적 요청 상세" : "상비부품 보충 상세";
  const linkedTodo = type === "material" ? todos?.find((t) => t.materialRequestId === data.id) : null;
  const photos = type === "restock"
    ? (data.supplyPhotoUrls?.length ? data.supplyPhotoUrls : data.supplyPhotoUrl ? [data.supplyPhotoUrl] : [])
    : (data.photoUrls ?? []);
  const photoLabel = type === "restock" ? "보충 지급 사진" : type === "quote" ? "견적신청사진" : "자재신청사진";
  // 자재/견적은 신청 사진과 지급 사진이 따로 있어 둘 다 보여준다 (상비부품은 지급 사진이 이미 photos).
  const supplyPhotos = type !== "restock"
    ? (data.supplyPhotoUrls?.length ? data.supplyPhotoUrls : data.supplyPhotoUrl ? [data.supplyPhotoUrl] : [])
    : [];

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-3 mb-4">
        <div className="bg-slate-100 rounded-xl p-3">
          <p className="text-[11px] text-slate-500">현장</p>
          <p className="font-bold text-slate-800">{data.siteName}</p>
        </div>
        {type !== "material" && (
          <div className="bg-slate-100 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">
              {type === "quote" ? "견적 내역 (부품명, 수량)" : "부품명"}
            </p>
            <p className="font-bold text-slate-800 whitespace-pre-wrap">
              {type === "quote" ? data.constructionType : data.part}
            </p>
          </div>
        )}
        {linkedTodo?.billingAmount != null && (
          <div className="bg-slate-100 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">청구 부품·금액</p>
            <p className="font-bold text-blue-700">
              {linkedTodo.billingPart ? `${linkedTodo.billingPart} · ` : ""}합계 ₩{Number(linkedTodo.billingAmount).toLocaleString()}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {type === "material" && (
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">긴급도</p>
              <p className="font-bold text-slate-800">{data.urgency}</p>
            </div>
          )}
          {type === "quote" && (
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">현장 담당자 연락처</p>
              <p className="font-bold text-slate-800">{data.contactPhone || "-"}</p>
            </div>
          )}
          {type === "restock" && (
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">수량</p>
              <p className="font-bold text-slate-800">{data.quantity ?? 1}개</p>
            </div>
          )}
          <div className="bg-slate-100 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">신청일</p>
            <p className="font-bold text-slate-800">{data.requestedDate}</p>
          </div>
        </div>
        {type === "restock" && (
          <div className="bg-slate-100 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">상태</p>
            <p className="font-bold text-slate-800">
              {data.status}
              {data.suppliedDate ? ` · 보충일 ${data.suppliedDate}` : ""}
              {data.receivedAt ? ` · 수령완료 ${data.receivedAt.slice(0, 10)}` : ""}
            </p>
          </div>
        )}
        {data.note && (
          <div className="bg-slate-100 rounded-xl p-3">
            <p className="text-[11px] text-slate-500">기사 의견</p>
            <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{data.note}</p>
          </div>
        )}
      </div>
      <div className={type !== "restock" ? "mb-4" : ""}>
        <p className="text-xs font-bold text-slate-500 mb-2">
          {photoLabel} ({photos.length}장)
        </p>
        <div className="grid grid-cols-3 gap-2">
          {photos.length > 0
            ? photos.map((url, i) => (
                <button key={i} type="button" onClick={() => onPhotoClick(photos, i)}>
                  <img src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
                </button>
              ))
            : <PhotoThumb caption="등록된 사진 없음" />}
        </div>
      </div>
      {type !== "restock" && (
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">
            자재지급사진 ({supplyPhotos.length}장)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {supplyPhotos.length > 0
              ? supplyPhotos.map((url, i) => (
                  <button key={i} type="button" onClick={() => onPhotoClick(supplyPhotos, i)}>
                    <img src={url} alt="" className="w-full aspect-square rounded-xl object-cover border border-slate-200" />
                  </button>
                ))
              : <PhotoThumb caption="등록된 사진 없음" />}
          </div>
        </div>
      )}
    </Sheet>
  );
}


function MaterialHistoryScreen({ requests, todos, isBilled, onBack }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("전체");
  const [detailTarget, setDetailTarget] = useState(null);
  const [photoViewer, setPhotoViewer] = useState(null);
  const stages = ["전체", "승인대기", "지급완료", "반려", "비용청구완료"];

  const withStage = requests.map((r) => ({ ...r, displayStage: isBilled(r.id) ? "비용청구완료" : r.status }));
  const filtered = withStage
    .filter((r) => stage === "전체" || r.displayStage === stage)
    .filter((r) => r.siteName.includes(query.trim()) || r.part.includes(query.trim()))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="나의 자재 신청 전체보기" onBack={onBack} onHome={onBack} />
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명 또는 부품명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold ${stage === s ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 신청 내역이 없습니다</p>
        ) : (
          filtered.map((r) => {
            const linkedTodo = todos?.find((t) => t.materialRequestId === r.id);
            const bar = r.displayStage === "비용청구완료" ? "border-l-slate-400" : r.displayStage === "지급완료" ? "border-l-emerald-500" : r.displayStage === "반려" ? "border-l-red-500" : "border-l-amber-400";
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setDetailTarget({ type: "material", data: r })}
                className={`w-full text-left bg-white rounded-xl border border-slate-200 border-l-4 ${bar} p-3.5`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-bold text-slate-800 truncate min-w-0">{r.siteName} · {r.part}</p>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                      r.displayStage === "비용청구완료" ? "bg-slate-100 text-slate-500" :
                      r.displayStage === "지급완료" ? "bg-emerald-100 text-emerald-700" :
                      r.displayStage === "반려" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {r.displayStage === "비용청구완료" ? "비용청구 완료" : r.displayStage}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{r.urgency} · 신청일 {r.requestedDate}{r.suppliedDate ? ` · 지급일 ${r.suppliedDate}` : ""}</p>
                {linkedTodo?.billingAmount != null && (
                  <p className="text-[11px] font-bold text-blue-700 mt-1">
                    교체부품·청구금액 · {linkedTodo.billingPart ? `${linkedTodo.billingPart} · ` : ""}₩{Number(linkedTodo.billingAmount).toLocaleString()}
                  </p>
                )}
                {r.status === "반려" && r.rejectReason && (
                  <p className="text-[11px] text-red-600 mt-1.5">반려 사유: {r.rejectReason}</p>
                )}
              </button>
            );
          })
        )}
      </div>

      <RequestDetailSheet
        target={detailTarget}
        todos={todos}
        onClose={() => setDetailTarget(null)}
        onPhotoClick={(urls, i) => setPhotoViewer({ urls, index: i, siteName: detailTarget?.data.siteName, date: detailTarget?.data.requestedDate })}
      />
      {photoViewer && (
        <PhotoViewerSheet
          urls={photoViewer.urls}
          index={photoViewer.index}
          siteName={photoViewer.siteName ?? "현장 사진"}
          date={photoViewer.date ?? ""}
          onClose={() => setPhotoViewer(null)}
        />
      )}
    </div>
  );
}


function QuoteHistoryScreen({ quoteRequests, isQuoteBilled, onBack }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("전체");
  const [detailTarget, setDetailTarget] = useState(null);
  const [photoViewer, setPhotoViewer] = useState(null);
  const stages = ["전체", "요청접수", "견적발행", "승인", "자재지급완료", "비용청구완료"];

  const withStage = quoteRequests.map((q) => ({ ...q, displayStage: isQuoteBilled(q.id) ? "비용청구완료" : q.status }));
  const filtered = withStage
    .filter((q) => stage === "전체" || q.displayStage === stage)
    .filter((q) => q.siteName.includes(query.trim()) || q.constructionType.includes(query.trim()))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="나의 견적 요청 전체보기" onBack={onBack} onHome={onBack} />
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명 또는 부품명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold ${stage === s ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 견적 요청 내역이 없습니다</p>
        ) : (
          filtered.map((q) => {
            const bar = q.displayStage === "비용청구완료" ? "border-l-slate-400" : q.displayStage === "자재지급완료" ? "border-l-emerald-500" : q.displayStage === "승인" ? "border-l-indigo-500" : q.displayStage === "견적발행" ? "border-l-blue-500" : "border-l-amber-400";
            return (
            <button
              key={q.id}
              type="button"
              onClick={() => setDetailTarget({ type: "quote", data: q })}
              className={`w-full text-left bg-white rounded-xl border border-slate-200 border-l-4 ${bar} p-3.5`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {q.photoUrls?.length > 0 ? (
                    <img src={q.photoUrls[0]} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-slate-800 truncate">{q.siteName} · {q.constructionType}</p>
                    <p className="text-[11px] text-slate-400">신청일 {q.requestedDate} · 사진 {q.photoCount}장</p>
                  </div>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                    q.displayStage === "비용청구완료" ? "bg-slate-100 text-slate-500" :
                    q.displayStage === "자재지급완료" ? "bg-emerald-100 text-emerald-700" :
                    q.displayStage === "승인" ? "bg-indigo-100 text-indigo-700" :
                    q.displayStage === "견적발행" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {q.displayStage === "비용청구완료" ? "비용청구 완료" : q.displayStage}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2.5">
                {QUOTE_STAGES.map((s, idx) => (
                  <Fragment key={s}>
                    {idx > 0 && <div className={`h-0.5 flex-1 ${QUOTE_STAGES.indexOf(q.status) >= idx ? "bg-blue-600" : "bg-slate-200"}`} />}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${QUOTE_STAGES.indexOf(q.status) >= idx ? "bg-blue-600" : "bg-slate-200"}`} />
                  </Fragment>
                ))}
              </div>
              <div className="flex items-start mt-1">
                {QUOTE_STAGES.map((s) => {
                  const dateMap = { 요청접수: q.requestedDate, 견적발행: q.quoteIssuedDate, 승인: q.approvedDate, 자재지급완료: q.suppliedDate };
                  const d = dateMap[s];
                  return (
                    <div key={s} className="flex-1 flex flex-col items-center gap-0.5 px-0.5 min-w-0">
                      <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap leading-none">{s}</span>
                      <span className="text-[9px] text-slate-300 whitespace-nowrap leading-none">{d ? d.slice(5).replace("-", "/") : "-"}</span>
                    </div>
                  );
                })}
              </div>
            </button>
            );
          })
        )}
      </div>

      <RequestDetailSheet
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onPhotoClick={(urls, i) => setPhotoViewer({ urls, index: i, siteName: detailTarget ? `${detailTarget.data.siteName} · ${detailTarget.data.constructionType}` : "", date: detailTarget?.data.requestedDate })}
      />
      {photoViewer && (
        <PhotoViewerSheet
          urls={photoViewer.urls}
          index={photoViewer.index}
          siteName={photoViewer.siteName ?? "현장 사진"}
          date={photoViewer.date ?? ""}
          onClose={() => setPhotoViewer(null)}
        />
      )}
    </div>
  );
}


function RestockHistoryScreen({ restockRequests, kitStock, onBack, onReceiveRestock }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("전체");
  const [photoViewTarget, setPhotoViewTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [photoViewer, setPhotoViewer] = useState(null);
  const stages = ["전체", "대기", "완료"];

  const filtered = restockRequests
    .filter((r) => stage === "전체" || r.status === stage)
    .filter((r) => r.part.includes(query.trim()) || r.siteName.includes(query.trim()))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="나의 상비부품 현황" onBack={onBack} onHome={onBack} />
      <div className="px-5 pt-3 pb-1 shrink-0">
        <p className="text-xs font-bold text-slate-800 mb-2">등록된 상비부품 현황</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {KIT_PARTS.filter((p) => p !== "기타").map((part) => {
            const qty = kitStock.find((k) => k.part === part)?.qty ?? 0;
            return (
              <div key={part} className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[11px] text-slate-500">{part}</p>
                <p className="text-sm font-bold text-slate-800">{qty}개</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="부품명 또는 현장명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold ${stage === s ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 보충 내역이 없습니다</p>
        ) : (
          filtered.map((r) => {
            const bar = r.status === "완료" ? "border-l-emerald-500" : "border-l-amber-400";
            return (
            <button
              key={r.id}
              type="button"
              onClick={() => setDetailTarget({ type: "restock", data: r })}
              className={`w-full text-left bg-white rounded-xl border border-slate-200 border-l-4 ${bar} p-3.5`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-bold text-slate-800">{r.part}</p>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                    r.status === "완료" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {r.siteName}에서 사용 · 요청일 {r.requestedDate}{r.suppliedDate ? ` · 보충일 ${r.suppliedDate}` : ""}
              </p>
              {r.status === "완료" && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoViewTarget({ title: r.part, subtitle: `${r.suppliedDate} 보충 · 자재 담당자 등록`, url: r.supplyPhotoUrl });
                  }}
                  className="w-full mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 active:bg-emerald-100"
                >
                  <span className="text-[11px] text-emerald-600 font-semibold">지급완료 사진 확인하기</span>
                  <ChevronRight size={13} className="text-emerald-600" />
                </span>
              )}
              {r.status === "완료" && !r.receivedAt && onReceiveRestock && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReceiveRestock(r.id);
                  }}
                  className="w-full mt-2 block text-center bg-blue-700 text-white rounded-lg px-3 py-2 text-[11px] font-bold active:bg-blue-800"
                >
                  수령하기 (재고 {r.quantity ?? 1}개 반영)
                </span>
              )}
              {r.status === "완료" && r.receivedAt && (
                <p className="text-[10px] text-slate-400 mt-1.5 text-center">수령 완료 · {r.receivedAt.slice(0, 10)}</p>
              )}
            </button>
            );
          })
        )}
      </div>

      {photoViewTarget && (
        <Sheet title="지급 자재 사진" onClose={() => setPhotoViewTarget(null)}>
          <div className="bg-slate-100 rounded-xl p-3 mb-4">
            <p className="text-sm font-bold text-slate-800">{photoViewTarget.title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{photoViewTarget.subtitle}</p>
          </div>
          {photoViewTarget.url ? (
            <img src={photoViewTarget.url} alt="" className="w-full rounded-xl object-cover mb-3" />
          ) : (
            <PhotoThumb caption="자재 담당자가 등록한 지급 자재 사진" />
          )}
        </Sheet>
      )}

      <RequestDetailSheet
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onPhotoClick={(urls, i) => setPhotoViewer({ urls, index: i, siteName: detailTarget?.data.part, date: detailTarget?.data.suppliedDate ?? detailTarget?.data.requestedDate })}
      />
      {photoViewer && (
        <PhotoViewerSheet
          urls={photoViewer.urls}
          index={photoViewer.index}
          siteName={photoViewer.siteName ?? "보충 지급 사진"}
          date={photoViewer.date ?? ""}
          onClose={() => setPhotoViewer(null)}
        />
      )}
    </div>
  );
}


export function emptyPartRow() {
  return { id: Date.now() + Math.random(), name: "", qty: "" };
}


export function formatPartRows(rows) {
  return rows
    .filter((r) => r.name.trim() && r.qty)
    .map((r) => `${r.name.trim()} ${r.qty}개`)
    .join(", ");
}


// nameOptions를 넘기면 부품명 칸이 드롭다운으로 바뀝니다 (예: 상비부품 목록에서 선택).
export function PartsRowsInput({ rows, setRows, nameOptions, namePlaceholder = "예: 인버터", nameLabel = "부품명" }) {
  function updateRow(id, field, value) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows([...rows, emptyPartRow()]);
  }
  function removeRow(id) {
    if (rows.length === 1) return;
    setRows(rows.filter((r) => r.id !== id));
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-1.5 px-0.5">
        <span className="text-[10px] font-bold text-slate-400" style={{ flex: 2 }}>{nameLabel}</span>
        <span className="text-[10px] font-bold text-slate-400" style={{ flex: 1 }}>수량</span>
        <span className="w-5 shrink-0" />
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex gap-1.5 items-center">
            {nameOptions ? (
              <select
                className={inputCls}
                style={{ flex: 2 }}
                value={row.name}
                onChange={(e) => updateRow(row.id, "name", e.target.value)}
              >
                <option value="">{namePlaceholder}</option>
                {nameOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input
                className={inputCls}
                style={{ flex: 2 }}
                placeholder={namePlaceholder}
                value={row.name}
                onChange={(e) => updateRow(row.id, "name", e.target.value)}
              />
            )}
            <input
              type="number"
              min={1}
              className={inputCls}
              style={{ flex: 1 }}
              placeholder="수량"
              value={row.qty}
              onChange={(e) => updateRow(row.id, "qty", e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 disabled:opacity-0"
              disabled={rows.length === 1}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="w-full mt-2 border-2 border-dashed border-slate-300 rounded-lg py-2 text-xs font-bold text-slate-500 flex items-center justify-center gap-1 active:bg-slate-50"
      >
        <Plus size={13} /> 추가하기
      </button>
    </div>
  );
}


// 현장의 호기를 그리드로 고르는 공용 위젯 (고장접수와 동일 — 1대면 자동선택, 여러 대 멀티선택).
export function UnitPickGrid({ site, selected, onToggle }) {
  const us = site ? siteUnits(site) : [];
  return (
    <div className="mb-4">
      <p className="text-xs font-bold text-slate-500 mb-1.5">
        호기{us.length === 1 ? <span className="text-blue-600 font-semibold"> — 1대 현장, 자동 선택됨</span> : <span className="text-slate-400 font-semibold"> (여러 대면 모두 선택)</span>}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {us.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onToggle(u)}
            className={`py-3 rounded-xl text-sm font-bold border ${selected.includes(u) ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200 bg-white"}`}
          >
            {u}
          </button>
        ))}
      </div>
      {selected.length > 1 && (
        <p className="text-[11px] text-blue-600 font-semibold mt-1.5">선택 {selected.length}대 — 호기별로 {selected.length}건이 각각 생성됩니다</p>
      )}
    </div>
  );
}

const MAT_STEP_TITLES = ["현장·호기·긴급도", "부품·사진·의견"];
const QUOTE_STEP_TITLES = ["현장·호기·담당자", "견적·사진·의견"];

export function MaterialTab({ requests, setRequests, todos, onReject, quoteRequests, setQuoteRequests, restockRequests, kitStock = [], onReceiveRestock }) {
  const sites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER, selfId } = useContext(AuthContext);
  const units = useContext(UnitsContext);
  const v2Ready = units.length > 0;
  const [uploadSession] = useState(() => Date.now());
  const [sub, setSub] = useState("material");
  const [form, setForm] = useState({ siteId: "", units: [], parts: [emptyPartRow()], urgency: "일반", photos: [], note: "" });
  const [quoteForm, setQuoteForm] = useState({ siteId: "", units: [], parts: [emptyPartRow(), emptyPartRow(), emptyPartRow()], contactPhone: "", photos: [], note: "" });
  const [matStep, setMatStep] = useState(0);
  const [quoteStep, setQuoteStep] = useState(0);
  const [formToast, setFormToast] = useState(null); // { msg, ok } — 경고(기본)/성공(ok)
  function toastForm(msg, ok = false) { setFormToast({ msg, ok }); setTimeout(() => setFormToast(null), 2500); }
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [photoViewer, setPhotoViewer] = useState(null);
  const [reqDetailTarget, setReqDetailTarget] = useState(null);
  const [showMaterialHistory, setShowMaterialHistory] = useState(false);
  const [showQuoteHistory, setShowQuoteHistory] = useState(false);
  const [showRestockHistory, setShowRestockHistory] = useState(false);

  const formPartText = formatPartRows(form.parts);

  async function addRequest() {
    if (!form.siteId || !formPartText || form.photos.length === 0) return;
    const site = sites.find((s) => s.id === form.siteId);
    if (!site) return;
    // 선택한 호기마다 신청 1건씩 생성 (지급·비용청구가 호기 단위라 데이터도 호기별로 쪼갠다)
    const targets = form.units.length ? form.units : [null];
    const stamp = Date.now();
    const newRequests = targets.map((u, i) => ({
      id: "m" + (stamp + i),
      siteId: form.siteId,
      siteName: site.name,
      elevatorNo: u,
      part: formPartText,
      urgency: form.urgency,
      note: form.note,
      photoCount: form.photos.length,
      photoUrls: form.photos.map((p) => p.url),
      engineer: CURRENT_ENGINEER,
      requestedDate: TODAY_STR,
      status: "승인대기",
      suppliedDate: null,
      rejectReason: null,
    }));
    await supabase.from("material_requests").insert(newRequests.map((r) => ({
      id: r.id,
      site_id: r.siteId,
      site_name: r.siteName,
      elevator_no: r.elevatorNo,
      part: r.part,
      urgency: r.urgency,
      note: r.note,
      photo_count: r.photoCount,
      photo_urls: r.photoUrls,
      engineer: r.engineer,
      requested_date: r.requestedDate,
      status: r.status,
      ...(v2Ready ? {
        unit_id: unitIdFor(units, r.siteId, r.elevatorNo),
        requester_id: selfId,
      } : {}),
    })));
    setRequests((prev) => [...newRequests, ...prev]);
    setForm({ siteId: "", units: [], parts: [emptyPartRow()], urgency: "일반", photos: [], note: "" });
    setMatStep(0);
    toastForm(newRequests.length > 1 ? `자재 신청 ${newRequests.length}건이 접수되었습니다` : "자재 신청이 접수되었습니다", true);
  }

  function submitReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    onReject(rejectTarget.id, rejectReason.trim());
    setRejectTarget(null);
    setRejectReason("");
  }

  // 이미 비용청구까지 끝난 건은 반려 불가 (연결된 할일이 완료 상태인 경우)
  function isBilled(requestId) {
    const t = todos.find((x) => x.materialRequestId === requestId);
    return t?.done === true;
  }

  function isQuoteBilled(quoteId) {
    const t = todos.find((x) => x.quoteRequestId === quoteId);
    return t?.done === true;
  }

  const myRequests = requests.filter((r) => r.engineer === CURRENT_ENGINEER && !isBilled(r.id));
  const quoteFormText = formatPartRows(quoteForm.parts);
  const quoteValid = quoteForm.siteId && quoteFormText && quoteForm.contactPhone && quoteForm.photos.length > 0;

  // 스텝별 필수 검증 — 미입력이면 안내 문구 반환(다음/제출 막힘), 없으면 null.
  function matStepError(step) {
    if (step === 0) {
      if (!form.siteId) return "현장을 선택해주세요";
      if (form.units.length === 0) return "호기를 선택해주세요";
    }
    if (step === 1) {
      if (!formPartText) return "부품 내역을 1개 이상 입력해주세요";
      if (form.photos.length === 0) return "부품 규격 사진을 최소 1장 등록해주세요";
    }
    return null;
  }
  function quoteStepError(step) {
    if (step === 0) {
      if (!quoteForm.siteId) return "현장을 선택해주세요";
      if (quoteForm.units.length === 0) return "호기를 선택해주세요";
      if (!quoteForm.contactPhone.trim()) return "현장 견적 담당자 전화번호를 입력해주세요";
    }
    if (step === 1) {
      if (!quoteFormText) return "견적 내역을 1개 이상 입력해주세요";
      if (quoteForm.photos.length === 0) return "현장 상태 사진을 최소 1장 등록해주세요";
    }
    return null;
  }

  async function submitQuote() {
    if (!quoteValid) return;
    const site = sites.find((s) => s.id === quoteForm.siteId);
    if (!site) return;
    const targets = quoteForm.units.length ? quoteForm.units : [null];
    const stamp = Date.now();
    const newQuotes = targets.map((u, i) => ({
      id: "q" + (stamp + i),
      siteId: quoteForm.siteId,
      siteName: site.name,
      elevatorNo: u,
      constructionType: quoteFormText,
      contactPhone: quoteForm.contactPhone,
      note: quoteForm.note,
      photoCount: quoteForm.photos.length,
      photoUrls: quoteForm.photos.map((p) => p.url),
      engineer: CURRENT_ENGINEER,
      requestedDate: TODAY_STR,
      status: "요청접수",
      quoteIssuedDate: null,
      approvedDate: null,
      suppliedDate: null,
      hasSupplyPhoto: false,
    }));
    await supabase.from("quote_requests").insert(newQuotes.map((q) => ({
      id: q.id,
      site_id: q.siteId,
      site_name: q.siteName,
      elevator_no: q.elevatorNo,
      construction_type: q.constructionType,
      contact_phone: q.contactPhone,
      note: q.note,
      photo_count: q.photoCount,
      photo_urls: q.photoUrls,
      engineer: q.engineer,
      requested_date: q.requestedDate,
      status: q.status,
      ...(v2Ready ? {
        unit_id: unitIdFor(units, q.siteId, q.elevatorNo),
        requester_id: selfId,
      } : {}),
    })));
    setQuoteRequests((prev) => [...newQuotes, ...prev]);
    setQuoteForm({ siteId: "", units: [], parts: [emptyPartRow(), emptyPartRow(), emptyPartRow()], contactPhone: "", photos: [], note: "" });
    setQuoteStep(0);
    toastForm(newQuotes.length > 1 ? `견적 요청 ${newQuotes.length}건이 접수되었습니다` : "견적 요청이 접수되었습니다", true);
  }

  if (showMaterialHistory) {
    return (
      <MaterialHistoryScreen
        requests={requests.filter((r) => r.engineer === CURRENT_ENGINEER)}
        todos={todos}
        isBilled={isBilled}
        onBack={() => setShowMaterialHistory(false)}
      />
    );
  }

  if (showQuoteHistory) {
    return (
      <QuoteHistoryScreen
        quoteRequests={quoteRequests.filter((q) => q.engineer === CURRENT_ENGINEER)}
        isQuoteBilled={isQuoteBilled}
        onBack={() => setShowQuoteHistory(false)}
      />
    );
  }

  if (showRestockHistory) {
    return (
      <RestockHistoryScreen
        restockRequests={restockRequests.filter((r) => r.engineer === CURRENT_ENGINEER)}
        kitStock={kitStock.filter((k) => k.engineerId === selfId)}
        onBack={() => setShowRestockHistory(false)}
        onReceiveRestock={onReceiveRestock}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="flex border-b border-slate-100 shrink-0">
        <button onClick={() => setSub("material")} className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1.5 ${sub === "material" ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}>
          자재 신청
        </button>
        <button onClick={() => setSub("quote")} className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1.5 ${sub === "quote" ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}>
          견적 요청
        </button>
      </div>

      {sub === "material" ? (
        <>
          <div className="px-5 pt-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 overflow-visible">
              {/* 진행바 + 스텝 제목 (고장접수·자체점검과 동일 패턴) */}
              <div className="flex gap-1 mb-2">
                {MAT_STEP_TITLES.map((t, i) => <div key={t} className={`flex-1 h-1 rounded-full ${i <= matStep ? "bg-blue-600" : "bg-slate-200"}`} />)}
              </div>
              <p className="text-sm font-extrabold text-slate-800 mb-3">{matStep + 1}. {MAT_STEP_TITLES[matStep]}</p>

              {matStep === 0 && (
                <>
                  <Field label="현장 선택">
                    <SiteSearchSelect value={form.siteId} onChange={(id) => {
                      const s = sites.find((x) => x.id === id);
                      const us = s ? siteUnits(s) : [];
                      setForm({ ...form, siteId: id, units: us.length === 1 ? [us[0]] : [] });
                    }} />
                  </Field>
                  {form.siteId && (
                    <UnitPickGrid
                      site={sites.find((s) => s.id === form.siteId)}
                      selected={form.units}
                      onToggle={(u) => setForm({ ...form, units: form.units.includes(u) ? form.units.filter((x) => x !== u) : [...form.units, u] })}
                    />
                  )}
                  <Field label="긴급도">
                    <div className="flex gap-2">
                      {["일반", "긴급"].map((u) => (
                        <button key={u} type="button" onClick={() => setForm({ ...form, urgency: u })} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${form.urgency === u ? "bg-blue-700 text-white border-blue-700" : "bg-white border-slate-300 text-slate-500"}`}>
                          {u}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}

              {matStep === 1 && (
                <>
                  <Field label="부품 내역">
                    <PartsRowsInput
                      rows={form.parts}
                      setRows={(rows) => setForm({ ...form, parts: rows })}
                      namePlaceholder="예: 1층 승장도어 스위치"
                      nameLabel="부품명 (해당 층까지 기재)"
                    />
                  </Field>
                  <Field label="부품 규격 사진">
                    <MultiPhotoUpload
                      photos={form.photos}
                      uploadFolder={`materials/${uploadSession}`}
                      onUploaded={(url) => setForm((f) => ({ ...f, photos: [...f.photos, { url }] }))}
                      onRemove={(idx) => setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }))}
                      label="교체할 부품 규격/모델명이 보이도록 촬영"
                    />
                  </Field>
                  <Field label="기사 의견 (교체 사유 및 특이사항)">
                    <textarea
                      className={inputCls}
                      rows={3}
                      placeholder="예: 도어 롤러 마모로 소음 발생, 조속 교체 필요"
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                    />
                  </Field>
                </>
              )}

              {/* 하단 이전/다음/신청 — 다음·신청은 필수 미입력이면 막고 토스트 */}
              <div className="flex gap-2 mt-2">
                {matStep > 0 && (
                  <button type="button" onClick={() => setMatStep(0)} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">이전</button>
                )}
                {matStep < 1 ? (
                  <button type="button" onClick={() => { const err = matStepError(0); if (err) { toastForm(err); return; } setMatStep(1); }} className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 active:bg-blue-800">다음</button>
                ) : (
                  <div className="flex-1"><PrimaryButton onClick={() => { const err = matStepError(1); if (err) { toastForm(err); return; } addRequest(); }}>신청하기{form.units.length > 1 ? ` (${form.units.length}건)` : ""}</PrimaryButton></div>
                )}
              </div>
              <p className="text-[11px] text-slate-400 text-center mt-2">신청 후 자재 담당자의 지급 완료 처리 시 할 일이 자동 생성됩니다</p>
            </div>
          </div>
          <div className="px-5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 text-sm">나의 신청 현황</h3>
              <button onClick={() => setShowMaterialHistory(true)} className="text-xs font-bold text-blue-600 flex items-center gap-0.5">
                전체보기 <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {myRequests.map((r) => {
                // 우리 리스트 디자인 — 상태별 왼쪽 색바(지급완료=초록/반려=빨강/승인대기=주황)
                const bar = r.status === "지급완료" ? "border-l-emerald-500" : r.status === "반려" ? "border-l-red-500" : "border-l-amber-400";
                return (
                <div key={r.id} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${bar} p-3.5`}>
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setReqDetailTarget({ type: "material", data: r })} className="flex items-center gap-2.5 min-w-0 text-left">
                      {r.photoUrls?.length > 0 ? (
                        <img src={r.photoUrls[0]} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-slate-800 truncate">{r.siteName} · {r.part}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{r.urgency} · 신청일 {r.requestedDate} · 사진 {r.photoCount ?? 1}장</p>
                      </div>
                    </button>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                        r.status === "지급완료" ? "bg-emerald-100 text-emerald-700" : r.status === "반려" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  {r.note && <p className="text-[11px] text-slate-500 mt-1.5">기사 의견: {r.note}</p>}

                  {r.status === "지급완료" && (
                    <>
                      {r.hasSupplyPhoto && (
                        <div className="mt-2">
                          {r.supplyPhotoUrls?.length > 0 ? (
                            <div className="flex gap-2">
                              {r.supplyPhotoUrls.map((url, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setPhotoViewer({ urls: r.supplyPhotoUrls, index: i })}
                                  className="shrink-0"
                                >
                                  <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <PhotoThumb caption="자재 담당자가 등록한 사진" />
                          )}
                        </div>
                      )}
                      <p className="text-[11px] text-emerald-600 font-semibold mt-1.5 flex items-center gap-1">
                        <PackageCheck size={12} /> {r.suppliedDate} 지급완료 · 할 일이 자동 생성되었습니다
                      </p>
                      {isBilled(r.id) ? (
                        <p className="text-[11px] text-slate-400 mt-1.5">비용청구 완료 · 반려 불가</p>
                      ) : (
                        <button
                          onClick={() => { setRejectTarget(r); setRejectReason(""); }}
                          className="w-full mt-2 flex items-center justify-center gap-1.5 border border-red-300 text-red-600 text-xs font-bold py-2 rounded-lg active:bg-red-50"
                        >
                          <PackageX size={13} /> 자재가 잘못 나왔어요 · 반려하기
                        </button>
                      )}
                    </>
                  )}

                  {r.status === "반려" && (
                    <div className="mt-1.5 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
                      <p className="text-[11px] text-red-600 font-semibold">반려 사유: {r.rejectReason}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">자재 담당자가 재확인 후 다시 지급할 예정입니다</p>
                    </div>
                  )}
                </div>
                );
              })}
              {myRequests.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">신청 내역이 없습니다</p>
              )}
            </div>
          </div>

          <div className="px-5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 text-sm">나의 상비부품 현황</h3>
              <button onClick={() => setShowRestockHistory(true)} className="text-xs font-bold text-blue-600 flex items-center gap-0.5">
                전체보기 <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {(() => {
                const mine = restockRequests.filter((r) => r.engineer === CURRENT_ENGINEER);
                const pending = mine.filter((r) => r.status === "대기");
                const recentDone = mine
                  .filter((r) => r.status === "완료")
                  .sort((a, b) => new Date(b.suppliedDate) - new Date(a.suppliedDate))
                  .slice(0, 3);
                const preview = [...pending, ...recentDone];
                if (preview.length === 0) {
                  return <p className="text-xs text-slate-400 text-center py-4">보충 요청 내역이 없습니다</p>;
                }
                return preview.map((r) => {
                  const bar = r.status === "완료" ? "border-l-emerald-500" : "border-l-amber-400";
                  return (
                  <div key={r.id} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${bar} p-3.5`}>
                    <div className="flex items-center justify-between">
                      <p className="text-[15px] font-bold text-slate-800">{r.part}</p>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                          r.status === "완료" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {r.siteName}에서 사용 · 요청일 {r.requestedDate}{r.suppliedDate ? ` · 보충일 ${r.suppliedDate}` : ""}
                    </p>
                    {r.status === "완료" && (
                      <button
                        onClick={() => {
                          const urls = r.supplyPhotoUrls?.length ? r.supplyPhotoUrls : r.supplyPhotoUrl ? [r.supplyPhotoUrl] : [];
                          if (urls.length) setPhotoViewer({ urls, index: 0, siteName: r.part, date: r.suppliedDate });
                        }}
                        className="w-full mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 active:bg-emerald-100"
                      >
                        <span className="text-[11px] text-emerald-600 font-semibold">지급완료 사진 확인하기</span>
                        <ChevronRight size={13} className="text-emerald-600" />
                      </button>
                    )}
                    {r.status === "완료" && !r.receivedAt && onReceiveRestock && (
                      <button
                        onClick={() => onReceiveRestock(r.id)}
                        className="w-full mt-2 bg-blue-700 text-white rounded-lg px-3 py-2 text-[11px] font-bold active:bg-blue-800"
                      >
                        수령하기 (재고 {r.quantity ?? 1}개 반영)
                      </button>
                    )}
                  </div>
                  );
                });
              })()}
            </div>
          </div>
        </>
      ) : (
        <div className="px-5 pt-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 overflow-visible">
            <div className="flex gap-1 mb-2">
              {QUOTE_STEP_TITLES.map((t, i) => <div key={t} className={`flex-1 h-1 rounded-full ${i <= quoteStep ? "bg-blue-600" : "bg-slate-200"}`} />)}
            </div>
            <p className="text-sm font-extrabold text-slate-800 mb-3">{quoteStep + 1}. {QUOTE_STEP_TITLES[quoteStep]}</p>

            {quoteStep === 0 && (
              <>
                <Field label="현장 선택">
                  <SiteSearchSelect value={quoteForm.siteId} onChange={(id) => {
                    const s = sites.find((x) => x.id === id);
                    const us = s ? siteUnits(s) : [];
                    setQuoteForm({ ...quoteForm, siteId: id, units: us.length === 1 ? [us[0]] : [] });
                  }} />
                </Field>
                {quoteForm.siteId && (
                  <UnitPickGrid
                    site={sites.find((s) => s.id === quoteForm.siteId)}
                    selected={quoteForm.units}
                    onToggle={(u) => setQuoteForm({ ...quoteForm, units: quoteForm.units.includes(u) ? quoteForm.units.filter((x) => x !== u) : [...quoteForm.units, u] })}
                  />
                )}
                <Field label="현장 견적 담당자 전화번호">
                  <input
                    className={inputCls}
                    placeholder="예: 010-1234-5678"
                    value={quoteForm.contactPhone}
                    onChange={(e) => setQuoteForm({ ...quoteForm, contactPhone: formatPhone(e.target.value) })}
                  />
                </Field>
              </>
            )}

            {quoteStep === 1 && (
              <>
                <Field label="견적 내역">
                  <PartsRowsInput
                    rows={quoteForm.parts}
                    setRows={(rows) => setQuoteForm({ ...quoteForm, parts: rows })}
                    namePlaceholder="예: 1층 승장도어 스위치"
                    nameLabel="부품명 (해당 층까지 기재)"
                  />
                </Field>
                <Field label="현장 상태 사진">
                  <MultiPhotoUpload
                    photos={quoteForm.photos}
                    uploadFolder={`quotes/${uploadSession}`}
                    onUploaded={(url) => setQuoteForm((f) => ({ ...f, photos: [...f.photos, { url }] }))}
                    onRemove={(idx) => setQuoteForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }))}
                    label="견적이 필요한 현장 상태 촬영"
                  />
                </Field>
                <Field label="기사 의견 (견적 사유 및 특이사항)">
                  <textarea
                    className={inputCls}
                    rows={3}
                    placeholder="현장 상태 및 견적 필요 사유를 적어주세요"
                    value={quoteForm.note}
                    onChange={(e) => setQuoteForm({ ...quoteForm, note: e.target.value })}
                  />
                </Field>
              </>
            )}

            <div className="flex gap-2 mt-2">
              {quoteStep > 0 && (
                <button type="button" onClick={() => setQuoteStep(0)} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">이전</button>
              )}
              {quoteStep < 1 ? (
                <button type="button" onClick={() => { const err = quoteStepError(0); if (err) { toastForm(err); return; } setQuoteStep(1); }} className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 active:bg-blue-800">다음</button>
              ) : (
                <div className="flex-1"><PrimaryButton onClick={() => { const err = quoteStepError(1); if (err) { toastForm(err); return; } submitQuote(); }}>견적 요청하기{quoteForm.units.length > 1 ? ` (${quoteForm.units.length}건)` : ""}</PrimaryButton></div>
              )}
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={() => setShowQuoteHistory(true)}
              className="w-full flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3"
            >
              <h3 className="font-bold text-slate-800 text-sm">나의 견적 요청 현황 전체보기</h3>
              <ChevronRight size={16} className="text-blue-600" />
            </button>
          </div>
        </div>
      )}

      {rejectTarget && (
        <Sheet title="자재 반려하기" onClose={() => setRejectTarget(null)}>
          <div className="bg-slate-100 rounded-xl p-3 mb-4">
            <p className="text-sm font-bold text-slate-800">{rejectTarget.siteName} · {rejectTarget.part}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{rejectTarget.suppliedDate} 지급</p>
          </div>
          <Field label="반려 사유">
            <textarea
              className={inputCls}
              rows={3}
              placeholder="예: 인버터 규격이 달라요 / 수량이 부족해요 등"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </Field>
          <p className="text-[11px] text-slate-400 mb-4">반려하면 이 건에 연결된 할 일이 취소되고, 자재 담당자에게 재지급 요청이 전달됩니다.</p>
          <PrimaryButton disabled={!rejectReason.trim()} onClick={submitReject} tone="red">
            반려 제출
          </PrimaryButton>
        </Sheet>
      )}

      <RequestDetailSheet
        target={reqDetailTarget}
        todos={todos}
        onClose={() => setReqDetailTarget(null)}
        onPhotoClick={(urls, i) => setPhotoViewer({ urls, index: i, siteName: reqDetailTarget?.data.siteName, date: reqDetailTarget?.data.requestedDate })}
      />

      {photoViewer && (
        <PhotoViewerSheet
          urls={photoViewer.urls}
          index={photoViewer.index}
          siteName={photoViewer.siteName ?? "자재 지급 사진"}
          date={photoViewer.date ?? ""}
          onClose={() => setPhotoViewer(null)}
        />
      )}

      {/* 자재·견적 공용 토스트 — 성공(초록)/필수 미입력 경고(어두움) */}
      {formToast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 max-w-[85%] ${formToast.ok ? "bg-emerald-600" : "bg-slate-900"}`}>
          {formToast.ok ? <Check size={14} className="shrink-0" /> : <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
          {formToast.msg}
        </div>
      )}
    </div>
  );
}
