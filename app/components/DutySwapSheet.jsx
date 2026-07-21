import { useState, useContext } from "react";
import { X, Search, ArrowLeftRight, ChevronRight } from "lucide-react";
import { AuthContext } from "@/app/components/context";
import { TODAY_STR } from "@/lib/constants";

// 근무 조정 세 가지 (달력에서 칸을 찾아 누르는 방식보다 목록이 덜 헤맨다):
//   교환   — 내 근무 ↔ 상대 근무를 맞바꾼다
//   넘기기 — 내 근무를 상대에게 넘긴다 (맞바꿀 근무 없음)
//   대신서기 — 남의 근무를 내가 대신 선다
const KIND_TONE = { 당직: "bg-emerald-50 text-emerald-700", 숙직: "bg-blue-50 text-blue-700", 정상근무: "bg-violet-50 text-violet-500" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const MODES = [
  { key: "교환", label: "교환", hint: "내 근무 ↔ 상대 근무 맞바꿈" },
  { key: "넘기기", label: "넘기기", hint: "내 근무를 넘김" },
  { key: "대신서기", label: "대신 서기", hint: "남의 근무를 내가" },
];

const fmt = (d) => `${d.slice(5).replace("-", "/")} (${DOW[new Date(`${d}T00:00:00`).getDay()]})`;

export function DutySwapSheet({ schedules, swaps, onRequestSwap, onClose }) {
  const { selfId, engineers = [] } = useContext(AuthContext);
  const [mode, setMode] = useState("교환");
  const [mine, setMine] = useState(null);   // 교환·넘기기: 고른 내 근무
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const nameOf = (pid) => engineers.find((e) => e.id === pid)?.name ?? "";
  const pending = new Set(swaps.filter((w) => w.status === "대기").flatMap((w) => [w.fromScheduleId, w.toScheduleId].filter(Boolean)));

  const upcoming = schedules.filter((s) => s.dutyDate >= TODAY_STR).sort((a, b) => a.dutyDate.localeCompare(b.dutyDate));
  const myDuties = upcoming.filter((s) => s.profileId === selfId);
  const matchQ = (s) => {
    if (!q.trim()) return true;
    const k = q.trim();
    return nameOf(s.profileId).includes(k) || s.dutyDate.includes(k) || s.kind.includes(k);
  };
  const others = upcoming.filter((s) => s.profileId && s.profileId !== selfId).filter(matchQ);

  const changeMode = (m) => { setMode(m); setMine(null); setQ(""); };

  // 교환: 상대 근무 선택 / 넘기기: 사람 선택 / 대신서기: 남의 근무 선택
  async function submit({ target, toPersonId, from }) {
    let ok;
    if (mode === "교환") ok = confirm(`내 ${fmt(mine.dutyDate)} ${mine.kind}\n↔ ${nameOf(target.profileId)}님의 ${fmt(target.dutyDate)} ${target.kind}\n\n교환을 요청할까요?`);
    else if (mode === "넘기기") ok = confirm(`내 ${fmt(mine.dutyDate)} ${mine.kind} 근무를\n${nameOf(toPersonId)}님에게 넘길까요?\n\n상대가 수락하면 그 사람 근무가 됩니다.`);
    else ok = confirm(`${nameOf(from.profileId)}님의 ${fmt(from.dutyDate)} ${from.kind} 근무를\n내가 대신 설까요?\n\n상대가 수락하면 내 근무가 됩니다.`);
    if (!ok) return;
    setBusy(true);
    if (mode === "교환") await onRequestSwap(mine, target, { kind: "교환" });
    else if (mode === "넘기기") await onRequestSwap(mine, null, { kind: "넘기기", toPersonId });
    else await onRequestSwap(from, null, { kind: "대신서기" });
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
        {dim && <p className="text-[10px] text-amber-600 font-bold mt-0.5">요청 진행 중</p>}
      </div>
      {right ?? <ChevronRight size={16} className="text-slate-300 shrink-0" />}
    </button>
  );

  // 헤더 제목 — 단계와 모드에 따라
  const title = mode === "대신서기" ? "대신 설 근무 고르기"
    : mine ? (mode === "교환" ? "바꿀 상대 근무 고르기" : "넘길 사람 고르기")
    : "내 근무 고르기";

  return (
    <div className="fixed inset-0 z-[55] bg-slate-50 flex flex-col">
      <div className="shrink-0 bg-blue-900 text-white px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-extrabold">{title}</p>
        <button onClick={mine ? () => setMine(null) : onClose} className="p-1" aria-label="닫기">
          {mine ? <span className="text-xs font-bold">뒤로</span> : <X size={18} />}
        </button>
      </div>

      {/* 모드 탭 */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2 flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => changeMode(m.key)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold border ${
              mode === m.key ? "bg-blue-700 text-white border-blue-700" : "text-slate-500 border-slate-200"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="shrink-0 bg-white px-4 pb-2 text-[11px] text-slate-400">{MODES.find((m) => m.key === mode).hint}</p>

      {mine && (
        <div className="shrink-0 bg-amber-50 border-y border-amber-200 px-4 py-2.5">
          <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
            <ArrowLeftRight size={12} /> 내 근무 — {fmt(mine.dutyDate)} {mine.kind}
          </p>
        </div>
      )}

      {/* 검색: 교환의 상대 근무 / 대신서기의 남의 근무 */}
      {((mode === "교환" && mine) || mode === "대신서기") && (
        <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2.5">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="이름 · 날짜(08-15) · 당직/숙직 검색"
              className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder-slate-400" />
            {q && <button onClick={() => setQ("")} className="text-slate-400 shrink-0"><X size={14} /></button>}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* 1단계: 내 근무 고르기 (교환·넘기기) */}
        {mode !== "대신서기" && !mine && (
          myDuties.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">예정된 내 근무가 없습니다</p>
          ) : (
            <>
              <p className="text-[11px] text-slate-400 mb-1">{mode}할 내 근무를 고르세요 ({myDuties.length}건)</p>
              {myDuties.map((s) => <Row key={s.id} s={s} dim={pending.has(s.id)} onClick={() => setMine(s)} />)}
            </>
          )
        )}

        {/* 2단계 A: 교환 — 상대 근무 목록 */}
        {mode === "교환" && mine && (
          others.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">{q ? `"${q}" 검색 결과가 없습니다` : "교환할 수 있는 근무가 없습니다"}</p>
          ) : (
            <>
              <p className="text-[11px] text-slate-400 mb-1">{q ? `검색 결과 ${others.length}건` : `교환 가능한 근무 ${others.length}건`}</p>
              {others.map((s) => (
                <Row key={s.id} s={s} dim={pending.has(s.id) || busy} onClick={() => submit({ target: s })}
                  right={<span className="text-[11px] font-bold text-blue-700 shrink-0">요청</span>} />
              ))}
            </>
          )
        )}

        {/* 2단계 B: 넘기기 — 사람 목록 */}
        {mode === "넘기기" && mine && (
          <>
            <p className="text-[11px] text-slate-400 mb-1">이 근무를 넘길 사람을 고르세요</p>
            {engineers.filter((e) => e.id !== selfId).map((e) => (
              <button key={e.id} disabled={busy} onClick={() => submit({ toPersonId: e.id })}
                className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3.5 py-3 active:bg-slate-50">
                <span className="text-sm font-bold text-slate-800">{e.name}</span>
                <span className="text-[11px] font-bold text-blue-700">넘기기</span>
              </button>
            ))}
          </>
        )}

        {/* 대신서기 — 남의 근무 목록 (바로) */}
        {mode === "대신서기" && (
          others.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">{q ? `"${q}" 검색 결과가 없습니다` : "대신 설 수 있는 근무가 없습니다"}</p>
          ) : (
            <>
              <p className="text-[11px] text-slate-400 mb-1">{q ? `검색 결과 ${others.length}건` : `대신 설 수 있는 근무 ${others.length}건`}</p>
              {others.map((s) => (
                <Row key={s.id} s={s} dim={pending.has(s.id) || busy} onClick={() => submit({ from: s })}
                  right={<span className="text-[11px] font-bold text-blue-700 shrink-0">대신</span>} />
              ))}
            </>
          )
        )}
      </div>
    </div>
  );
}
