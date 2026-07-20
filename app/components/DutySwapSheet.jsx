import { useState, useContext } from "react";
import { X, Search, ArrowLeftRight, ChevronRight } from "lucide-react";
import { AuthContext } from "@/app/components/context";
import { TODAY_STR } from "@/lib/constants";

// 달력에서 칸을 찾아 누르는 방식은 "내 근무가 어디 있더라"부터 헤매게 된다.
// 여기서는 ① 내 근무 목록에서 고르고 ② 바꿀 상대 근무를 목록·검색으로 고른다.
const KIND_TONE = { 당직: "bg-emerald-50 text-emerald-700", 숙직: "bg-blue-50 text-blue-700", 정상근무: "bg-violet-50 text-violet-500" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const fmt = (d) => `${d.slice(5).replace("-", "/")} (${DOW[new Date(`${d}T00:00:00`).getDay()]})`;

export function DutySwapSheet({ schedules, swaps, onRequestSwap, onClose }) {
  const { selfId, engineers = [] } = useContext(AuthContext);
  const [mine, setMine] = useState(null);   // 고른 내 근무
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const nameOf = (pid) => engineers.find((e) => e.id === pid)?.name ?? "";
  const pending = new Set(swaps.filter((w) => w.status === "대기").flatMap((w) => [w.fromScheduleId, w.toScheduleId]));

  const upcoming = schedules.filter((s) => s.dutyDate >= TODAY_STR).sort((a, b) => a.dutyDate.localeCompare(b.dutyDate));
  const myDuties = upcoming.filter((s) => s.profileId === selfId);
  // 교환 대상: 남의 근무 중 담당자가 있는 것. 이름·날짜로 검색된다.
  const others = upcoming.filter((s) => s.profileId && s.profileId !== selfId).filter((s) => {
    if (!q.trim()) return true;
    const k = q.trim();
    return nameOf(s.profileId).includes(k) || s.dutyDate.includes(k) || s.kind.includes(k);
  });

  async function request(target) {
    if (!confirm(`내 ${fmt(mine.dutyDate)} ${mine.kind}\n↔ ${nameOf(target.profileId)}님의 ${fmt(target.dutyDate)} ${target.kind}\n\n교환을 요청할까요? 상대가 수락하면 바로 바뀝니다.`)) return;
    setBusy(true);
    await onRequestSwap(mine, target);
    setBusy(false);
    onClose();
  }

  const Row = ({ s, right, onClick, dim }) => (
    <button
      onClick={onClick}
      disabled={dim}
      className={`w-full flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-left ${dim ? "opacity-40" : "active:bg-slate-50"}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">
          {fmt(s.dutyDate)}
          <span className={`ml-1.5 text-[10px] font-bold rounded-full px-2 py-0.5 ${KIND_TONE[s.kind]}`}>{s.kind}</span>
        </p>
        {s.profileId !== selfId && <p className="text-[11px] text-slate-400 mt-0.5">{nameOf(s.profileId)}</p>}
        {dim && <p className="text-[10px] text-amber-600 font-bold mt-0.5">교환 요청 진행 중</p>}
      </div>
      {right ?? <ChevronRight size={16} className="text-slate-300 shrink-0" />}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[55] bg-slate-50 flex flex-col">
      <div className="shrink-0 bg-blue-900 text-white px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-extrabold">{mine ? "바꿀 상대 근무 고르기" : "교환할 내 근무 고르기"}</p>
        <button onClick={mine ? () => setMine(null) : onClose} className="p-1" aria-label="닫기">
          {mine ? <span className="text-xs font-bold">뒤로</span> : <X size={18} />}
        </button>
      </div>

      {mine && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
            <ArrowLeftRight size={12} /> 내 근무 — {fmt(mine.dutyDate)} {mine.kind}
          </p>
        </div>
      )}

      {mine && (
        <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2.5">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 · 날짜(08-15) · 당직/숙직 검색"
              className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder-slate-400"
            />
            {q && <button onClick={() => setQ("")} className="text-slate-400 shrink-0"><X size={14} /></button>}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {!mine ? (
          myDuties.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">예정된 내 근무가 없습니다</p>
          ) : (
            <>
              <p className="text-[11px] text-slate-400 mb-1">교환하고 싶은 내 근무를 고르세요 ({myDuties.length}건)</p>
              {myDuties.map((s) => (
                <Row key={s.id} s={s} dim={pending.has(s.id)} onClick={() => setMine(s)} />
              ))}
            </>
          )
        ) : others.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">
            {q ? `"${q}" 검색 결과가 없습니다` : "교환할 수 있는 근무가 없습니다"}
          </p>
        ) : (
          <>
            <p className="text-[11px] text-slate-400 mb-1">
              {q ? `검색 결과 ${others.length}건` : `교환 가능한 근무 ${others.length}건 — 다음 달 근무와 바꾸면 이월됩니다`}
            </p>
            {others.map((s) => (
              <Row
                key={s.id}
                s={s}
                dim={pending.has(s.id) || busy}
                onClick={() => request(s)}
                right={<span className="text-[11px] font-bold text-blue-700 shrink-0">요청</span>}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
