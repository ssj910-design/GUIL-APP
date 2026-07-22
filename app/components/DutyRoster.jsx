import { useState, useContext } from "react";
import { ChevronLeft, ChevronRight, X, ArrowLeftRight } from "lucide-react";
import { DutySwapSheet } from "@/app/components/DutySwapSheet";
import { AuthContext } from "@/app/components/context";
import { TODAY_STR } from "@/lib/constants";
import { useHolidays } from "@/app/hooks/useHolidays";

// 칸에 그리는 순서 — 당직 → 숙직 → 정상근무.
// 정상근무는 주4일제 표에서 금요일에만 쓰이는 자리라 값이 있을 때(또는 관리자)만 칸을 보여준다.
const KINDS = ["당직", "숙직", "정상근무"];
const KIND_TEXT = { 당직: "text-emerald-700", 숙직: "text-blue-700", 정상근무: "text-violet-500" };
const KIND_DOT = { 당직: "bg-emerald-500", 숙직: "bg-blue-500", 정상근무: "bg-violet-400" };

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const ymOf = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
const isoOf = (y, m, d) => `${ymOf(y, m)}-${String(d).padStart(2, "0")}`;

/**
 * 월별 당직·숙직 근무표.
 * - 관리자: 자동 순번 배정 → 칸을 눌러 담당자 교체
 * - 기사: 내 근무 칸을 눌러 교환 요청 → 상대 칸 선택(다음 달도 가능 = 이월) → 상대가 수락하면 확정
 */

/**
 * 근무 교환 알림 팝업 — 당사자 둘에게만 뜬다.
 * 교환 내용은 우리방(피드)에 올리지 않는다: 전 직원이 볼 필요가 없는 개인 일정이라서.
 */
export function DutySwapNotice({ swaps, schedules, onSeen }) {
  const { selfId, engineers } = useContext(AuthContext);
  const schedById = new Map(schedules.map((s) => [s.id, s]));
  const labelOf = (id) => {
    const s = schedById.get(id);
    return s ? `${s.dutyDate.slice(5).replace("-", "/")} ${s.kind}` : "?";
  };
  const nameOf = (pid) => engineers.find((e) => e.id === pid)?.name ?? "";

  // 1) 나에게 온 새 요청  2) 내가 보낸 요청의 응답
  const asTarget = swaps.find((w) => w.status === "대기" && w.targetId === selfId && !w.targetSeen);
  const asRequester = swaps.find((w) => w.status !== "대기" && w.requesterId === selfId && !w.requesterSeen);
  const notice = asTarget ?? asRequester;
  if (!notice) return null;
  const isTarget = notice === asTarget;
  const accepted = notice.status === "수락";
  const kind = notice.kind ?? "교환";
  // 요청 받은 사람에게 보이는 제목·설명 (교환/넘기기/대신서기별로 다르다)
  const reqTitle = kind === "넘기기" ? "근무 넘김 요청" : kind === "대신서기" ? "대신 서기 요청" : "근무 교환 요청";
  const reqBody =
    kind === "넘기기" ? <><b>{nameOf(notice.requesterId)}</b>님이 {labelOf(notice.fromScheduleId)} 근무를 나에게 넘기려 합니다</>
    : kind === "대신서기" ? <><b>{nameOf(notice.requesterId)}</b>님이 내 {labelOf(notice.fromScheduleId)} 근무를 대신 서겠다고 합니다</>
    : <><b>{nameOf(notice.requesterId)}</b>님이 근무 교환을 요청했습니다.<br />{labelOf(notice.fromScheduleId)} ↔ 내 {labelOf(notice.toScheduleId)}</>;

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-8">
      <div className="bg-white rounded-2xl w-full max-w-xs p-5 text-center">
        <p className="text-base font-extrabold text-slate-800">
          {isTarget ? reqTitle : accepted ? "요청이 수락됐습니다" : "요청이 거절됐습니다"}
        </p>
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          {isTarget ? reqBody : (
            <><b>{nameOf(notice.targetId)}</b>님이 요청을 {accepted ? "수락" : "거절"}했습니다.</>
          )}
        </p>
        <button
          onClick={() => onSeen(notice, isTarget ? "target" : "requester")}
          className="w-full mt-4 bg-blue-700 text-white text-sm font-bold py-3 rounded-xl active:bg-blue-800"
        >
          {isTarget ? "근무표에서 확인" : "확인"}
        </button>
      </div>
    </div>
  );
}

export function DutyRoster({ schedules, swaps, onGenerate, onSetPerson, onRequestSwap, onRespondSwap, onClose, embedded = false, showControls = !embedded, belowCalendar = null }) {
  const { role, selfId, engineers } = useContext(AuthContext);
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [picking, setPicking] = useState(null); // 관리자: 담당자 지정할 칸
  const [swapFrom, setSwapFrom] = useState(null); // 기사: 교환 요청 출발 칸
  const [busy, setBusy] = useState(false);
  const [genMode, setGenMode] = useState(null); // 근무제 선택 시트 (주5일 | 주4일)
  const { days: HOLIDAY } = useHolidays();
  const [swapOpen, setSwapOpen] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false); // 기사: 내 근무만 보기

  // 이름 조회용은 전원, 담당자 선택은 당직 대상자 우선 정렬
  const roster = engineers.slice().sort((a, b) => (a.duty_order ?? 999) - (b.duty_order ?? 999));
  const dutyRoster = roster.filter((e) => e.duty_order != null);
  // 근무제별 대상자 — 인사관리에서 지정한 duty_modes로 거른다
  const rosterOf = (mode) => dutyRoster.filter((e) => (e.duty_modes ?? []).includes(mode));
  const nameOf = (pid) => roster.find((e) => e.id === pid)?.name ?? "";
  const orderOf = (pid) => roster.find((e) => e.id === pid)?.duty_order ?? null;

  const { y, m } = cursor;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();
  const monthKey = ymOf(y, m);
  const inMonth = schedules.filter((s) => s.dutyDate.startsWith(monthKey));
  const cellOf = (iso, kind) => inMonth.find((s) => s.dutyDate === iso && s.kind === kind);
  // 정상근무(보라)는 관리자가 이 달을 주4일제로 생성했을 때만 칸이 생긴다 — 주5일제 달엔
  // 애초에 정상근무 레코드가 없으니 그걸로 판단해 범례·칸을 통째로 숨긴다.
  const monthHasNormalWork = inMonth.some((s) => s.kind === "정상근무");
  const visibleKinds = monthHasNormalWork ? KINDS : KINDS.filter((k) => k !== "정상근무");

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
    <div className={embedded ? "flex flex-col" : "fixed inset-0 z-50 bg-slate-50 flex flex-col"}>
      {!embedded && (
        <div className="shrink-0 bg-blue-900 text-white px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-extrabold">당직·숙직 근무표</p>
          <button onClick={onClose} className="p-1" aria-label="닫기"><X size={18} /></button>
        </div>
      )}

      <div className="shrink-0 bg-white border border-slate-200 rounded-t-xl px-4 py-2.5 flex items-center justify-between">
        <button onClick={() => setCursor(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })} className="p-1.5 text-slate-500" aria-label="이전 달">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-extrabold text-slate-800">{y}년 {m + 1}월</p>
        <button onClick={() => setCursor(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })} className="p-1.5 text-slate-500" aria-label="다음 달">
          <ChevronRight size={18} />
        </button>
      </div>

      {role !== "admin" && showControls && (
        <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
          <button
            onClick={() => setOnlyMine((v) => !v)}
            className={`text-[11px] font-bold rounded-lg px-3 py-1.5 border ${
              onlyMine ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-500 border-slate-200"
            }`}
          >
            {onlyMine ? "내 근무만" : "전체 보기"}
          </button>
          <button
            onClick={() => setSwapOpen(true)}
            className="ml-auto text-[11px] font-bold text-white bg-blue-700 rounded-lg px-3.5 py-1.5 flex items-center gap-1"
          >
            <ArrowLeftRight size={12} /> 근무 조정
          </button>
        </div>
      )}

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

      <div className={embedded ? "px-0 py-3" : "flex-1 overflow-y-auto px-3 py-3"}>
        {incoming.length > 0 && (
          <div className="mb-3 bg-white rounded-xl border border-blue-200 p-3">
            <p className="text-xs font-extrabold text-blue-800 mb-2">받은 근무 요청 {incoming.length}건</p>
            <div className="space-y-2">
              {incoming.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    <span className="font-bold text-slate-800">{nameOf(w.requesterId)}</span>
                    {(w.kind ?? "교환") === "넘기기" ? <> — {labelOf(w.fromScheduleId)} 근무를 나에게 넘김</>
                      : (w.kind ?? "교환") === "대신서기" ? <> — 내 {labelOf(w.fromScheduleId)} 근무를 대신</>
                      : <>님의 {labelOf(w.fromScheduleId)}<br />↔ 내 {labelOf(w.toScheduleId)}</>}
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
                onClick={() => setGenMode("주5일")}
                className="mt-3 bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl active:bg-blue-800"
              >
                근무표 생성
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
              {Array.from({ length: startDow }, (_, i) => <div key={`pad${i}`} className="border-b border-r border-slate-100 min-h-[76px]" />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                const iso = isoOf(y, m, d);
                const dow = (startDow + d - 1) % 7;
                const isToday = iso === TODAY_STR;
                const isHoliday = !!HOLIDAY[iso];
                return (
                  <div key={d} className={`border-b border-r border-slate-100 min-h-[76px] p-1 ${isToday ? "bg-blue-50" : isHoliday ? "bg-red-50/40" : ""}`}>
                    <p className={`text-[10px] font-bold text-right pr-0.5 truncate ${
                      HOLIDAY[iso] || dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-400"
                    }`} title={HOLIDAY[iso] ?? ""}>
                      {HOLIDAY[iso] && <span className="float-left text-[8.5px] text-red-400 font-bold max-w-[70%] truncate">{HOLIDAY[iso]}</span>}
                      {d}
                    </p>
                    {visibleKinds.map((kind) => {
                      const cell = cellOf(iso, kind);
                      // 정상근무는 배치가 없으면 기사 화면에서 숨긴다 (해당 요일에 아직 미배정인 칸)
                      if (kind === "정상근무" && !cell?.profileId && role !== "admin") return null;
                      // '내 근무만' 켜면 남의 근무는 회색 점으로 축약해 내 일정이 눈에 띄게 한다
                      if (onlyMine && cell?.profileId && cell.profileId !== selfId) {
                        return <p key={kind} className="text-[9.5px] text-slate-200 px-0.5">·</p>;
                      }
                      const mine = !!cell?.profileId && cell.profileId === selfId;
                      const isFrom = !!swapFrom && !!cell && swapFrom.id === cell.id;
                      return (
                        <button
                          key={kind}
                          onClick={() => handleCellTap(iso, kind)}
                          className={`w-full text-left text-[9.5px] leading-tight rounded px-0.5 py-[1px] truncate ${
                            isFrom ? "bg-amber-400 text-white font-extrabold"
                              : mine ? "bg-blue-100 text-blue-800 font-extrabold"
                              : `${KIND_TEXT[kind]} font-semibold`
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

        {/* 범례 — 무슨 색이 무슨 근무인지 (달력 아래 배치) */}
        {inMonth.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap mt-2.5 px-1">
            {visibleKinds.map((k) => (
              <span key={k} className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                <span className={`w-2 h-2 rounded-full ${KIND_DOT[k]}`} />
                {k === "당직" ? "초록 — 당직" : k === "숙직" ? "파랑 — 숙직" : "보라 — 정상근무"}
              </span>
            ))}
          </div>
        )}

        <p className="text-[10px] text-slate-400 mt-2.5 px-1 leading-relaxed">
          이름 옆 숫자는 기사 순번입니다.
          {role === "admin" && " 칸을 누르면 담당자를 바꿀 수 있습니다."}
        </p>

        {role === "admin" && belowCalendar && <div className="mt-3">{belowCalendar}</div>}

        {role === "admin" && inMonth.length > 0 && (
          <button
            onClick={() => setGenMode("주5일")}
            className="w-full mt-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl"
          >
            빈 칸 채우기 (근무제 선택)
          </button>
        )}
      </div>

      {genMode && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end" onClick={() => setGenMode(null)}>
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-extrabold text-slate-800">{y}년 {m + 1}월 근무표 생성</p>
            <p className="text-[11px] text-slate-400 mt-1 mb-3">이미 배정된 칸은 그대로 두고 빈 칸만 채웁니다.</p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {["주5일", "주4일"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGenMode(mode)}
                  className={`py-3 rounded-xl text-sm font-bold border ${
                    genMode === mode ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200 bg-white"
                  }`}
                >
                  {mode} 근무제
                  <span className="block text-[10px] font-semibold opacity-70">{rosterOf(mode).length}명</span>
                </button>
              ))}
            </div>

            {genMode === "주4일" && (
              <p className="text-[11px] text-indigo-500 font-semibold bg-indigo-50 rounded-lg px-3 py-2 mb-3">
                금요일마다 정상근무 칸이 함께 만들어집니다 (담당자는 달력에서 직접 지정).
              </p>
            )}

            <div className="border border-slate-100 rounded-lg p-3 mb-4">
              <p className="text-[11px] font-bold text-slate-500 mb-1.5">배정 순서</p>
              {rosterOf(genMode).length === 0 ? (
                <p className="text-[11px] text-red-500">
                  {genMode} 대상자가 없습니다. 관리자 콘솔 → 인사관리에서 순번과 근무제를 지정하세요.
                </p>
              ) : (
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {rosterOf(genMode).map((e) => `${e.name}(${e.duty_order})`).join(" → ")}
                </p>
              )}
            </div>

            <button
              onClick={async () => { setBusy(true); await onGenerate(monthKey, genMode); setBusy(false); setGenMode(null); }}
              disabled={busy || rosterOf(genMode).length === 0}
              className="w-full bg-blue-700 text-white text-sm font-bold py-3 rounded-xl active:bg-blue-800 disabled:bg-slate-200"
            >
              {busy ? "배정 중…" : `${genMode} 기준으로 배정`}
            </button>
          </div>
        </div>
      )}

      {swapOpen && (
        <DutySwapSheet
          schedules={schedules}
          swaps={swaps}
          onRequestSwap={onRequestSwap}
          onClose={() => setSwapOpen(false)}
        />
      )}

      {picking && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end" onClick={() => setPicking(null)}>
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-extrabold text-slate-800 mb-3">
              {picking.iso.slice(5).replace("-", "/")} {picking.kind} 담당자
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(picking.kind === "정상근무" || !dutyRoster.length ? roster : dutyRoster).map((e) => (
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
