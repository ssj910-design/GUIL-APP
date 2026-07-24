import { useState, useContext } from "react";
import { X, ArrowLeftRight, ChevronLeft, ChevronRight } from "lucide-react";
import { AuthContext } from "@/app/components/context";
import { TODAY_STR } from "@/lib/constants";
import { useHolidays } from "@/app/hooks/useHolidays";
import { confirmAsync } from "@/app/components/ConfirmHost";

// 근무 조정 세 가지 — 당직·숙직 근무표와 동일한 달력에서 칸(이름)을 눌러 고른다.
//   교환   — 내 칸을 먼저 누르고, 바꿀 상대 칸을 누른다
//   넘기기 — 내 칸을 누른 뒤, 넘길 사람을 고른다 (근무 슬롯이 아니라 사람이라 목록으로 고른다)
//   대신서기 — 남의 칸을 바로 누른다 (내가 대신 선다)
const KIND_TEXT = { 당직: "text-emerald-700", 숙직: "text-blue-700", 정상근무: "text-violet-500" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const MODES = [
  { key: "교환", label: "교환", hint: "내 칸을 먼저 누르고, 바꿀 상대 칸을 누르세요" },
  { key: "넘기기", label: "넘기기", hint: "내 칸을 누른 뒤, 넘길 사람을 고르세요" },
  { key: "대신서기", label: "대신 서기", hint: "대신 설 상대의 칸을 누르세요" },
];

const fmt = (d) => `${d.slice(5).replace("-", "/")} (${DOW[new Date(`${d}T00:00:00`).getDay()]})`;
const ymOf = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
const isoOf = (y, m, d) => `${ymOf(y, m)}-${String(d).padStart(2, "0")}`;

export function DutySwapSheet({ schedules, swaps, onRequestSwap, onClose }) {
  const { selfId, engineers = [] } = useContext(AuthContext);
  const [mode, setMode] = useState("교환");
  const [mine, setMine] = useState(null); // 교환·넘기기: 고른 내 근무
  const [busy, setBusy] = useState(false);
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const { days: HOLIDAY } = useHolidays();

  const nameOf = (pid) => engineers.find((e) => e.id === pid)?.name ?? "";
  const pending = new Set(swaps.filter((w) => w.status === "대기").flatMap((w) => [w.fromScheduleId, w.toScheduleId].filter(Boolean)));

  const { y, m } = cursor;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();
  const monthKey = ymOf(y, m);
  const inMonth = schedules.filter((s) => s.dutyDate.startsWith(monthKey));
  const cellOf = (iso, kind) => inMonth.find((s) => s.dutyDate === iso && s.kind === kind);
  const visibleKinds = inMonth.some((s) => s.kind === "정상근무") ? ["당직", "숙직", "정상근무"] : ["당직", "숙직"];

  const changeMode = (mkey) => { setMode(mkey); setMine(null); };

  async function submit({ target, toPersonId, from }) {
    let ok;
    if (mode === "교환") ok = await confirmAsync(`내 ${fmt(mine.dutyDate)} ${mine.kind}\n↔ ${nameOf(target.profileId)}님의 ${fmt(target.dutyDate)} ${target.kind}\n\n교환을 요청할까요?`);
    else if (mode === "넘기기") ok = await confirmAsync(`내 ${fmt(mine.dutyDate)} ${mine.kind} 근무를\n${nameOf(toPersonId)}님에게 넘길까요?\n\n상대가 수락하면 그 사람 근무가 됩니다.`);
    else ok = await confirmAsync(`${nameOf(from.profileId)}님의 ${fmt(from.dutyDate)} ${from.kind} 근무를\n내가 대신 설까요?\n\n상대가 수락하면 내 근무가 됩니다.`);
    if (!ok) return;
    setBusy(true);
    if (mode === "교환") await onRequestSwap(mine, target, { kind: "교환" });
    else if (mode === "넘기기") await onRequestSwap(mine, null, { kind: "넘기기", toPersonId });
    else await onRequestSwap(from, null, { kind: "대신서기" });
    setBusy(false);
    onClose();
  }

  function handleCellTap(cell) {
    if (!cell?.profileId || busy) return;
    if (cell.dutyDate < TODAY_STR || pending.has(cell.id)) return;

    if (mode === "대신서기") {
      if (cell.profileId === selfId) return; // 내 근무는 대신 설 수 없다
      submit({ from: cell });
      return;
    }
    // 교환·넘기기 — 먼저 내 근무를 고른다
    if (!mine) {
      if (cell.profileId === selfId) setMine(cell);
      return;
    }
    if (cell.id === mine.id) { setMine(null); return; }
    if (cell.profileId === selfId) { setMine(cell); return; } // 다른 내 근무로 다시 선택
    if (mode === "교환") submit({ target: cell });
    // 넘기기는 상대 칸이 아니라 아래 사람 목록에서 진행한다
  }

  return (
    <div className="fixed inset-0 z-[55] bg-slate-50 flex flex-col">
      <div className="shrink-0 bg-blue-900 text-white px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-extrabold">근무 조정</p>
        <button onClick={onClose} className="p-1" aria-label="닫기"><X size={18} /></button>
      </div>

      <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2 flex gap-1">
        {MODES.map((mo) => (
          <button
            key={mo.key}
            onClick={() => changeMode(mo.key)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold border ${
              mode === mo.key ? "bg-blue-700 text-white border-blue-700" : "text-slate-500 border-slate-200"
            }`}
          >
            {mo.label}
          </button>
        ))}
      </div>
      <p className="shrink-0 bg-white px-4 pb-2 text-[11px] text-slate-400">{MODES.find((mo) => mo.key === mode).hint}</p>

      {mine && (
        <div className="shrink-0 bg-amber-50 border-y border-amber-200 px-4 py-2.5 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
            <ArrowLeftRight size={12} /> 내 근무 — {fmt(mine.dutyDate)} {mine.kind}
          </p>
          <button onClick={() => setMine(null)} className="shrink-0 text-[11px] font-bold text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">취소</button>
        </div>
      )}

      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
        <button onClick={() => setCursor(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })} className="p-1.5 text-slate-500" aria-label="이전 달">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-extrabold text-slate-800">{y}년 {m + 1}월</p>
        <button onClick={() => setCursor(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })} className="p-1.5 text-slate-500" aria-label="다음 달">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {mode === "넘기기" && mine ? (
          <>
            <p className="text-[11px] text-slate-400 mb-2 px-1">이 근무를 넘길 사람을 고르세요</p>
            <div className="space-y-2">
              {engineers.filter((e) => e.id !== selfId).map((e) => (
                <button key={e.id} disabled={busy} onClick={() => submit({ toPersonId: e.id })}
                  className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3.5 py-3 active:bg-slate-50">
                  <span className="text-sm font-bold text-slate-800">{e.name}</span>
                  <span className="text-[11px] font-bold text-blue-700">넘기기</span>
                </button>
              ))}
            </div>
          </>
        ) : inMonth.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">{y}년 {m + 1}월 근무표가 없습니다</p>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {DOW.map((d, i) => (
                <p key={d} className={`text-center text-[10px] font-bold py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>{d}</p>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: startDow }, (_, i) => <div key={`p${i}`} className="border-b border-r border-slate-100 min-h-[72px]" />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                const iso = isoOf(y, m, d);
                const dow = (startDow + d - 1) % 7;
                const isToday = iso === TODAY_STR;
                const isPast = iso < TODAY_STR;
                const isHoliday = !!HOLIDAY[iso];
                return (
                  <div key={d} className={`border-b border-r border-slate-100 min-h-[72px] p-1 ${isToday ? "bg-blue-50" : isHoliday ? "bg-red-50/40" : ""} ${isPast ? "opacity-40" : ""}`}>
                    <p className={`text-[10px] font-bold text-right pr-0.5 ${HOLIDAY[iso] || dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-400"}`}>{d}</p>
                    {visibleKinds.map((kind) => {
                      const cell = cellOf(iso, kind);
                      if (!cell?.profileId) return <p key={kind} className="text-[9.5px] text-slate-200 px-0.5">-</p>;
                      const isMine = cell.profileId === selfId;
                      const isSelected = mine?.id === cell.id;
                      const isPending = pending.has(cell.id);
                      const disabled = isPast || isPending || busy || (mode === "대신서기" && isMine);
                      return (
                        <button
                          key={kind}
                          disabled={disabled}
                          onClick={() => handleCellTap(cell)}
                          className={`w-full text-left text-[9.5px] leading-tight rounded px-0.5 py-[1px] truncate ${
                            isSelected ? "bg-amber-400 text-white font-extrabold"
                              : isMine ? "bg-blue-100 text-blue-800 font-extrabold"
                              : `${KIND_TEXT[kind]} font-semibold`
                          } ${isPending ? "opacity-40" : ""}`}
                        >
                          {nameOf(cell.profileId)}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
