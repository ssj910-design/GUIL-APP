import { useState, useContext } from "react";
import { ChevronLeft, ChevronRight, X, ArrowLeftRight } from "lucide-react";
import { AuthContext } from "@/app/components/context";
import { TODAY_STR } from "@/lib/constants";

const KINDS = ["숙직", "당직"]; // 실제 근무표와 같은 순서(숙직 위, 당직 아래)
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const ymOf = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
const isoOf = (y, m, d) => `${ymOf(y, m)}-${String(d).padStart(2, "0")}`;

/**
 * 월별 당직·숙직 근무표.
 * - 관리자: 자동 순번 배정 → 칸을 눌러 담당자 교체
 * - 기사: 내 근무 칸을 눌러 교환 요청 → 상대 칸 선택(다음 달도 가능 = 이월) → 상대가 수락하면 확정
 */
export function DutyRoster({ schedules, swaps, onGenerate, onSetPerson, onRequestSwap, onRespondSwap, onClose }) {
  const { role, selfId, engineers } = useContext(AuthContext);
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [picking, setPicking] = useState(null); // 관리자: 담당자 지정할 칸
  const [swapFrom, setSwapFrom] = useState(null); // 기사: 교환 요청 출발 칸
  const [busy, setBusy] = useState(false);

  // 이름 조회용은 전원, 담당자 선택은 당직 대상자 우선 정렬
  const roster = engineers.slice().sort((a, b) => (a.duty_order ?? 999) - (b.duty_order ?? 999));
  const dutyRoster = roster.filter((e) => e.duty_enabled !== false && e.duty_order != null);
  const nameOf = (pid) => roster.find((e) => e.id === pid)?.name ?? "";
  const orderOf = (pid) => roster.find((e) => e.id === pid)?.duty_order ?? null;

  const { y, m } = cursor;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();
  const monthKey = ymOf(y, m);
  const inMonth = schedules.filter((s) => s.dutyDate.startsWith(monthKey));
  const cellOf = (iso, kind) => inMonth.find((s) => s.dutyDate === iso && s.kind === kind);

  // 나에게 온 교환 요청 (대기 중)
  const incoming = swaps.filter((w) => w.status === "대기" && w.targetId === selfId);
  const schedById = new Map(schedules.map((s) => [s.id, s]));
  const labelOf = (id) => {
    const s = schedById.get(id);
    return s ? `${s.dutyDate.slice(5).replace("-", "/")} ${s.kind}` : "?";
  };

  async function handleCellTap(iso, kind) {
    const cell = cellOf(iso, kind);
    if (role === "admin") {
      setPicking({ iso, kind, id: cell?.id ?? null });
      return;
    }
    if (!cell?.profileId) return;
    // 1) 내 근무를 누르면 교환 출발점, 2) 그다음 남의 근무를 누르면 교환 요청
    if (!swapFrom) {
      if (cell.profileId === selfId) setSwapFrom(cell);
      return;
    }
    if (cell.id === swapFrom.id) { setSwapFrom(null); return; }
    if (cell.profileId === selfId) { setSwapFrom(cell); return; }
    if (!confirm(`${labelOf(swapFrom.id)} (내 근무)\n↔ ${labelOf(cell.id)} (${nameOf(cell.profileId)})\n\n교환을 요청할까요? 상대가 수락하면 바로 바뀝니다.`)) return;
    setBusy(true);
    await onRequestSwap(swapFrom, cell);
    setBusy(false);
    setSwapFrom(null);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
      <div className="shrink-0 bg-blue-900 text-white px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-extrabold">당직·숙직 근무표</p>
        <button onClick={onClose} className="p-1" aria-label="닫기"><X size={18} /></button>
      </div>

      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
        <button onClick={() => setCursor(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })} className="p-1.5 text-slate-500" aria-label="이전 달">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-extrabold text-slate-800">{y}년 {m + 1}월</p>
        <button onClick={() => setCursor(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })} className="p-1.5 text-slate-500" aria-label="다음 달">
          <ChevronRight size={18} />
        </button>
      </div>

      {swapFrom && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
            <ArrowLeftRight size={12} className="inline mb-0.5" /> {labelOf(swapFrom.id)} 교환 — 바꿀 상대 근무를 누르세요
            <br />
            <span className="font-semibold text-amber-600">달을 넘겨 다음 달 근무와도 교환(이월)할 수 있습니다</span>
          </p>
          <button onClick={() => setSwapFrom(null)} className="shrink-0 text-[11px] font-bold text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">취소</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {incoming.length > 0 && (
          <div className="mb-3 bg-white rounded-xl border border-blue-200 p-3">
            <p className="text-xs font-extrabold text-blue-800 mb-2">받은 교환 요청 {incoming.length}건</p>
            <div className="space-y-2">
              {incoming.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    <span className="font-bold text-slate-800">{nameOf(w.requesterId)}</span>님의 {labelOf(w.fromScheduleId)}
                    <br />↔ 내 {labelOf(w.toScheduleId)}
                  </p>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => onRespondSwap(w, "수락")} className="text-[11px] font-bold text-white bg-blue-700 rounded-lg px-2.5 py-1.5">수락</button>
                    <button onClick={() => onRespondSwap(w, "거절")} className="text-[11px] font-bold text-slate-600 bg-slate-100 rounded-lg px-2.5 py-1.5">거절</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {inMonth.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-8 px-5 text-center">
            <p className="text-xs text-slate-400">{y}년 {m + 1}월 근무표가 없습니다</p>
            {role === "admin" && (
              <button
                onClick={async () => { setBusy(true); await onGenerate(monthKey); setBusy(false); }}
                disabled={busy}
                className="mt-3 bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl active:bg-blue-800 disabled:opacity-50"
              >
                {busy ? "배정 중…" : "순번대로 자동 배정"}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {DOW.map((d, i) => (
                <p key={d} className={`text-center text-[10px] font-bold py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>{d}</p>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: startDow }, (_, i) => <div key={`pad${i}`} className="border-b border-r border-slate-100 min-h-[64px]" />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                const iso = isoOf(y, m, d);
                const dow = (startDow + d - 1) % 7;
                const isToday = iso === TODAY_STR;
                return (
                  <div key={d} className={`border-b border-r border-slate-100 min-h-[64px] p-1 ${isToday ? "bg-blue-50" : ""}`}>
                    <p className={`text-[10px] font-bold text-right pr-0.5 ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-400"}`}>{d}</p>
                    {KINDS.map((kind) => {
                      const cell = cellOf(iso, kind);
                      const mine = cell?.profileId === selfId;
                      const isFrom = swapFrom?.id === cell?.id;
                      return (
                        <button
                          key={kind}
                          onClick={() => handleCellTap(iso, kind)}
                          className={`w-full text-left text-[9.5px] leading-tight rounded px-0.5 py-[1px] truncate ${
                            isFrom ? "bg-amber-400 text-white font-extrabold"
                              : mine ? "bg-blue-100 text-blue-800 font-extrabold"
                              : kind === "숙직" ? "text-slate-700 font-semibold" : "text-emerald-700 font-semibold"
                          }`}
                        >
                          {cell?.profileId ? `${nameOf(cell.profileId)}${orderOf(cell.profileId) ? `(${orderOf(cell.profileId)})` : ""}` : "-"}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-[10px] text-slate-400 mt-2.5 px-1 leading-relaxed">
          위 = 숙직(회색), 아래 = 당직(초록). 이름 옆 숫자는 기사 순번입니다.
          {role === "admin" ? " 칸을 누르면 담당자를 바꿀 수 있습니다." : " 내 근무(파란색)를 누른 뒤 바꿀 상대 근무를 누르면 교환을 요청합니다."}
        </p>
        {role === "admin" && inMonth.length > 0 && (
          <button
            onClick={async () => {
              if (!confirm(`${y}년 ${m + 1}월을 순번대로 다시 배정할까요? 비어 있는 칸만 채웁니다.`)) return;
              setBusy(true); await onGenerate(monthKey); setBusy(false);
            }}
            disabled={busy}
            className="w-full mt-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl disabled:opacity-50"
          >
            {busy ? "배정 중…" : "빈 칸 순번대로 채우기"}
          </button>
        )}
      </div>

      {picking && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end" onClick={() => setPicking(null)}>
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-extrabold text-slate-800 mb-3">
              {picking.iso.slice(5).replace("-", "/")} {picking.kind} 담당자
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(dutyRoster.length ? dutyRoster : roster).map((e) => (
                <button
                  key={e.id}
                  onClick={async () => { await onSetPerson(picking.iso, picking.kind, e.id); setPicking(null); }}
                  className="py-3 rounded-xl text-sm font-bold border text-slate-600 border-slate-200 bg-white active:bg-slate-50"
                >
                  {e.name}{e.duty_order ? `(${e.duty_order})` : ""}
                </button>
              ))}
              <button
                onClick={async () => { await onSetPerson(picking.iso, picking.kind, null); setPicking(null); }}
                className="py-3 rounded-xl text-sm font-bold border border-slate-200 text-slate-400 bg-white"
              >
                비우기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
