"use client";

import { isQuoteRefInput } from "@/lib/todoEdit";

// "비용청구 후 완료" 설정 입력 — 관리자가 기사의 자재·견적 신청 없이 직접 배정하는 부품 교체 할일을
// 자재지급건처럼 기사가 비용청구를 제출해야 완료되게 만든다. 할일 배정(앱·관리자웹)과 수정 모드 공용.
// 자재 지급 확정 화면과 같은 구성: 청구 부품(이름·수량)별 예정(사전승인) 금액 — 기사 청구 화면에
// "관리자 사전승인 금액 참고"로 미리 채워진다. 여러 호기를 고르면 청구는 1건(호기 목록은 elevator_nos).
// 폼 값 → DB 컬럼 변환은 lib/todoEdit.js billingPatchOf.
// 한 줄에 여러 칸을 둘 때 공용 입력 클래스(w-full)는 폭이 깨져 칸 전용 클래스를 쓴다.
const cellCls = "min-w-0 border border-slate-300 rounded-lg px-2.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

export function emptyBillingRow() {
  return { name: "", qty: "", amount: "" };
}

// alwaysOn: 토글 없이 항상 펼쳐 보여준다(관리자 직접 자재지급 — 청구 필수가 전제).
export function BillingSetupFields({ form, setForm, siteUnits, siteSelected, alwaysOn = false }) {
  const rows = form.billingRows?.length ? form.billingRows : [emptyBillingRow()];
  const unitIds = form.unitIds ?? [];
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const refCount = rows.filter((r) => r.name?.trim() && isQuoteRefInput(r.amount)).length;

  function setRow(i, patch) {
    setForm((f) => {
      const cur = f.billingRows?.length ? f.billingRows : [emptyBillingRow()];
      return { ...f, billingRows: cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) };
    });
  }
  function toggleUnit(id) {
    setForm((f) => {
      const cur = f.unitIds ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...f, unitIds: next, unitId: next[0] ?? "" };
    });
  }

  return (
    <div className={alwaysOn ? "" : "rounded-xl border border-slate-200 bg-slate-50/60 p-3"}>
      {!alwaysOn && (<label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 w-4 h-4 accent-blue-700 shrink-0"
          checked={!!form.billingRequired}
          onChange={(e) => setForm((f) => ({
            ...f,
            billingRequired: e.target.checked,
            unitIds: e.target.checked && !(f.unitIds?.length) && f.unitId ? [f.unitId] : f.unitIds ?? [],
            billingRows: f.billingRows?.length ? f.billingRows : [emptyBillingRow()],
          }))}
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-800">비용청구 후 완료</span>
          <span className="block text-[11px] text-slate-500 leading-relaxed mt-0.5">
            자재지급건처럼 기사가 비용청구를 제출해야 완료됩니다. 체크로는 완료할 수 없고, 청구가 접수되면 담당자 전원이 자동 완료됩니다.
          </span>
        </span>
      </label>)}

      {(alwaysOn || form.billingRequired) && (
        <div className={alwaysOn ? "space-y-3" : "mt-3 space-y-3"}>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">호기 (여러 개 선택하면 청구 1건으로 접수)</p>
            {!siteSelected ? (
              <p className="text-[11px] text-red-500">현장을 먼저 선택해주세요</p>
            ) : siteUnits.length === 0 ? (
              <p className="text-[11px] text-slate-400">이 현장에 등록된 호기가 없습니다</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {siteUnits.map((u) => {
                  const on = unitIds.includes(u.id);
                  return (
                    <button
                      type="button" key={u.id} onClick={() => toggleUnit(u.id)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border ${on ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-600 border-slate-200"}`}
                    >
                      {u.unitNo}
                    </button>
                  );
                })}
              </div>
            )}
            {siteSelected && siteUnits.length > 0 && unitIds.length === 0 && <p className="text-[11px] text-red-500 mt-1">호기를 1개 이상 선택해주세요</p>}
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 mb-1.5">교체 부품 · 예정금액 (필수)</p>
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className={`${cellCls} flex-1`} placeholder="부품명" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                  <input className={`${cellCls} w-14 shrink-0 text-center`} inputMode="numeric" placeholder="수량" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value.replace(/\D/g, "") })} />
                  <input className={`${cellCls} w-24 shrink-0`} placeholder="금액 (-)" value={r.amount} onChange={(e) => setRow(i, { amount: isQuoteRefInput(e.target.value) ? "-" : e.target.value.replace(/\D/g, "") })} />
                  {rows.length > 1 && (
                    <button
                      type="button" aria-label="부품 삭제"
                      onClick={() => setForm((f) => ({ ...f, billingRows: rows.filter((_, idx) => idx !== i) }))}
                      className="shrink-0 w-6 h-6 rounded-full bg-slate-200 text-slate-500 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <button type="button" onClick={() => setForm((f) => ({ ...f, billingRows: [...rows, emptyBillingRow()] }))} className="text-xs font-bold text-blue-700">+ 부품 추가</button>
              <span className="text-[11px] font-bold text-slate-500">{refCount > 0 ? `견적서 참조 ${refCount}건 · 확정 금액 합 ` : "합계 "}₩{total.toLocaleString("ko-KR")}</span>
            </div>
            {!billingRowsValid(form) && <p className="text-[11px] text-red-500 mt-1">부품명과 금액(무상이면 0, 금액 미정이면 -)을 모두 입력해주세요</p>}
            <p className="text-[10px] text-slate-400 mt-1">금액 칸에 <b>-</b>를 입력하면 견적서 참조(금액 미정)로 표시되고, 관리자가 나중에 금액을 입력해 청구합니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// 켜져 있으면: 호기 1개 이상 + 부품 행이 1개 이상이고 이름 있는 행은 모두 금액이 채워져 있어야 한다(0은 허용).
export function billingRowsValid(form) {
  if (!form.billingRequired) return true;
  const named = (form.billingRows ?? []).filter((r) => r.name?.trim());
  return named.length > 0 && named.every((r) => r.amount !== "" && r.amount != null);
}
export function billingSetupValid(form, siteUnits = []) {
  if (!form.billingRequired) return true;
  return (siteUnits.length === 0 || (form.unitIds?.length ?? 0) > 0) && billingRowsValid(form);
}
