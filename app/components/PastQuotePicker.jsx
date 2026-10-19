"use client";

// 이전 견적에서 불러오기 — 관리자 콘솔(QuoteItemsModal.jsx, Modal)과 폰앱 견적 마법사
// (QuoteWizard.jsx, Sheet)가 같이 쓴다. 겉 틀(Shell)과 입력칸 스타일(inputCls)만 호출한 쪽에서
// 넘겨받는다.
import { useState, useMemo } from "react";
import { rankPastQuotes, shortDateLabel, quoteDate, normName, copyHistoryItem } from "@/lib/quoteHistory";

// 이전 견적 불러오기 — 현재 현장·호기와 요청문구를 기준으로 비슷한 과거 견적을 위로 정렬해 보여주고,
// 고르면 품목별로 체크해 가져온다. 인건비와 운반비·안전관리비는 매번 판단이 달라지는 값이라
// 기본은 해제 상태(필요하면 사람이 체크). 할인·특이사항은 가져오지 않는다.
export default function PastQuotePicker({ Shell, inputCls, quotes, site, quote, onClose, onApply }) {
  const [scope, setScope] = useState("site"); // site | all
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(null); // 선택한 과거 견적
  const [checked, setChecked] = useState({}); // idx -> bool
  const [withTransport, setWithTransport] = useState(false);
  const [withSafety, setWithSafety] = useState(false);

  const ranked = useMemo(
    () => rankPastQuotes(quotes, { siteId: quote.siteId ?? site?.id, unitId: quote.unitId, text: `${search} ${quote.part ?? ""} ${quote.constructionType ?? ""}` }),
    [quotes, quote, site, search]
  );
  const siteCount = ranked.filter((r) => r.sameSite).length;
  const q = normName(search);
  const rows = ranked
    .filter((r) => scope === "all" || r.sameSite || siteCount === 0)
    .filter((r) => !q || normName(`${r.q.quoteTitle ?? ""} ${(r.q.quoteItems ?? []).map((it) => it.name).join(" ")} ${r.q.siteName ?? ""}`).includes(q))
    .slice(0, 40);

  function pick(pq) {
    const init = {};
    (pq.quoteItems ?? []).forEach((it, i) => { init[i] = !!it.name?.trim() && (it.category ?? "자재비") === "자재비"; });
    setChecked(init);
    setWithTransport(false);
    setWithSafety(false);
    setPicked(pq);
  }

  if (picked) {
    const items = (picked.quoteItems ?? []).map((it, i) => ({ it, i })).filter(({ it }) => it.name?.trim());
    const label = shortDateLabel(quoteDate(picked));
    const count = items.filter(({ i }) => checked[i]).length;
    return (
      <Shell title="이전 견적에서 가져올 항목 선택" onClose={onClose}>
        <button onClick={() => setPicked(null)} className="text-xs font-bold text-slate-500 mb-2">← 목록으로</button>
        <p className="text-sm font-bold text-slate-800">{picked.quoteTitle || picked.constructionType || "-"}</p>
        <p className="text-[11px] text-slate-400 mb-3">{label} · {picked.siteName}{picked.elevatorNo ? ` ${picked.elevatorNo}` : ""}</p>
        <div className="space-y-1.5 mb-3">
          {items.map(({ it, i }) => (
            <label key={i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 text-sm cursor-pointer">
              <input type="checkbox" checked={!!checked[i]} onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))} />
              <span className="flex-1 min-w-0 truncate">
                <span className="font-semibold text-slate-800">{it.name}</span>
                {it.spec && <span className="ml-1.5 text-xs text-slate-500">{it.spec}</span>}
              </span>
              <span className="text-[11px] text-slate-400 shrink-0">{it.category ?? "자재비"}</span>
              <span className="text-xs text-slate-600 shrink-0">{it.qty ?? 1}{it.unit || ""} × {Number(it.unitPrice || 0).toLocaleString()}원</span>
            </label>
          ))}
        </div>
        {(Number(picked.transportCost) > 0 || Number(picked.safetyCost) > 0) && (
          <div className="flex flex-wrap gap-4 mb-3 text-xs text-slate-600">
            {Number(picked.transportCost) > 0 && (
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={withTransport} onChange={(e) => setWithTransport(e.target.checked)} />운반비 {Number(picked.transportCost).toLocaleString()}원</label>
            )}
            {Number(picked.safetyCost) > 0 && (
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={withSafety} onChange={(e) => setWithSafety(e.target.checked)} />안전관리비 {Number(picked.safetyCost).toLocaleString()}원</label>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mb-3">단가는 그때 견적 값 그대로 가져옵니다 — 가져온 뒤 현재 단가에 맞게 고쳐주세요. 인건비·운반비·안전관리비는 기본 해제입니다.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">취소</button>
          <button
            disabled={count === 0 && !withTransport && !withSafety}
            onClick={() => onApply({
              items: items.filter(({ i }) => checked[i]).map(({ it }) => copyHistoryItem(it, label)),
              transportCost: withTransport ? Number(picked.transportCost) : null,
              safetyCost: withSafety ? Number(picked.safetyCost) : null,
            })}
            className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
          >
            선택 항목 추가{count > 0 ? ` (${count})` : ""}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="이전 견적에서 불러오기" onClose={onClose}>
      <input className={inputCls + " mb-2"} placeholder="견적명·품목·현장 검색" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      <div className="flex items-center gap-3 mb-3 text-xs font-semibold text-slate-600">
        <label className="flex items-center gap-1"><input type="radio" checked={scope === "site"} onChange={() => setScope("site")} />같은 현장{siteCount > 0 ? ` (${siteCount})` : ""}</label>
        <label className="flex items-center gap-1"><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />전체</label>
        {scope === "site" && siteCount === 0 && <span className="text-[11px] text-slate-400">이 현장 이력이 없어 전체를 보여줍니다</span>}
      </div>
      <div className="space-y-1.5 max-h-[26rem] overflow-y-auto">
        {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-8">불러올 이전 견적이 없습니다</p>}
        {rows.map(({ q: pq, matched }) => {
          const named = (pq.quoteItems ?? []).filter((it) => it.name?.trim());
          const total = named.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
          return (
            <button
              key={pq.id}
              type="button"
              onClick={() => pick(pq)}
              className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 active:bg-blue-50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-400">{shortDateLabel(quoteDate(pq))} · {pq.siteName}{pq.elevatorNo ? ` ${pq.elevatorNo}` : ""}</p>
                <span className="flex items-center gap-1 shrink-0">
                  {matched > 0 && <span className="text-[10px] font-bold text-blue-700 bg-blue-50 rounded-full px-1.5 py-0.5">요청과 유사</span>}
                  {(pq.status === "승인" || pq.status === "자재지급완료") && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5">승인됨</span>}
                </span>
              </div>
              <p className="text-sm font-bold text-slate-800 truncate">{pq.quoteTitle || pq.constructionType || "-"}</p>
              <p className="text-[11px] text-slate-500 truncate">{named[0]?.name}{named.length > 1 ? ` 외 ${named.length - 1}건` : ""} · 품목합계 {total.toLocaleString()}원</p>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}
