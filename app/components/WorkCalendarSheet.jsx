"use client";

// 워크캘린더 — 홈 탭 "워크캘린더" 버튼 진입점. 정기점검 탭과 같은 구조로 위에 큰 제목,
// 아래 서브탭(당직·숙직/연차)을 둔다(계획/처리/달력 서브탭과 동일한 패턴).
import { useState, useEffect, useContext } from "react";
import { ChevronLeft, ChevronRight, Plus, Plane } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/app/components/context";
import { TODAY_STR } from "@/lib/constants";
import { annualLeaveDays } from "@/lib/leave";
import { DutyRoster } from "@/app/components/DutyRoster";
import { Sheet } from "@/app/components/ui";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const ymOf = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

// 캘린더에 뜨는 연차 태그 — 종류 구분 없이 전부 동일한 진한초록.
const LEAVE_TAG_STYLE = "bg-emerald-600 text-white";
// 반차 신청 시 note 맨 앞에 "오전"/"오후"를 적어두므로(submitLeave 참고) 캘린더 태그에 다시 꺼내 보여준다.
function periodOf(note) {
  const m = (note ?? "").match(/^(오전|오후)/);
  return m ? m[1] : null;
}

// 연차·반차·병가·공가 캘린더 — 워크캘린더의 "연차" 탭. 당직·숙직 탭(DutyRoster)과 동일한
// 상단 월 이동 바 + 전체보기/신청 컨트롤 바 + 캘린더 박스 레이아웃을 그대로 맞춘다.
// 연차 신청 로직은 MyPage.jsx와 동일(반차 0.5일, 근무 겹침 시 신청 막기)하되 이 탭 전용으로 둔다.
function LeaveCalendarTab({ schedules = [] }) {
  const { selfId, profiles = [] } = useContext(AuthContext);
  const me = profiles.find((p) => p.id === selfId) ?? {};
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [leaves, setLeaves] = useState([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({ kind: "연차", period: "오전", start: TODAY_STR, end: TODAY_STR, note: "" });
  const [busy, setBusy] = useState(false);

  const { y, m } = cursor;
  const ym = ymOf(y, m);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();
  const last = `${ym}-${String(daysInMonth).padStart(2, "0")}`;

  useEffect(() => {
    supabase.from("leaves").select("*")
      .lte("start_date", last).gte("end_date", `${ym}-01`)
      .then(({ data }) => setLeaves(data ?? []));
  }, [ym, last]);

  // 잔여연차·신청내역은 캘린더가 보여주는 달과 무관하게 "올해 전체" 내 기록 — 마이페이지와 동일한 범위.
  const year = TODAY_STR.slice(0, 4);
  const [myLeaves, setMyLeaves] = useState([]);
  useEffect(() => {
    if (!selfId) return;
    supabase.from("leaves").select("*").eq("profile_id", selfId)
      .gte("start_date", `${year}-01-01`).lte("start_date", `${year}-12-31`)
      .order("start_date", { ascending: false })
      .then(({ data }) => setMyLeaves(data ?? []));
  }, [selfId, year]);

  const auto = annualLeaveDays(me.hire_date, `${year}-12-31`);
  const grant = me.annual_leave_days ?? auto;
  // 승인된 것만 차감한다 — 신청 중인 건을 미리 빼면 반려됐을 때 숫자가 틀어진다
  const approvedLeaves = myLeaves.filter((l) => (l.status ?? "승인") === "승인");
  const waitingLeaves = myLeaves.filter((l) => l.status === "신청");
  const usedDays = approvedLeaves.reduce((n, l) => n + Number(l.days), 0);
  const leftDays = grant == null ? null : grant - usedDays;

  async function cancelLeave(l) {
    if (!confirm(`${l.start_date} ${l.kind} 신청을 취소할까요?`)) return;
    await supabase.from("leaves").delete().eq("id", l.id);
    setMyLeaves((prev) => prev.filter((x) => x.id !== l.id));
    setLeaves((prev) => prev.filter((x) => x.id !== l.id));
  }

  const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? "";
  // 승인된 연차만 캘린더에 노출 — 신청/반려 상태는 아직 확정이 아니라서 남들 눈에 보이면 안 된다.
  const approvedOnCalendar = leaves.filter((l) => (l.status ?? "승인") === "승인");
  const visibleLeaves = onlyMine ? approvedOnCalendar.filter((l) => l.profile_id === selfId) : approvedOnCalendar;
  const leavesOf = (iso) => visibleLeaves.filter((l) => l.start_date <= iso && iso <= l.end_date);

  // 반차는 0.5일, 그 외는 시작~종료 일수 (주말 제외는 회사 규정이 갈려 자동 계산하지 않는다)
  const reqDays = form.kind === "반차" ? 0.5 : Math.max(1, Math.floor((new Date(form.end) - new Date(form.start)) / 86400000) + 1);
  // 신청 기간에 내 당직·숙직이 끼면 신청을 막는다 — 근무를 먼저 교환한 뒤 연차를 써야 한다.
  const dutyConflicts = schedules.filter((d) => d.profileId === selfId && d.dutyDate >= form.start && d.dutyDate <= form.end);

  async function submitLeave() {
    if (dutyConflicts.length) return;
    setBusy(true);
    const finalNote = form.kind === "반차" ? `${form.period}${form.note ? " · " + form.note : ""}` : (form.note || null);
    const { data, error } = await supabase.from("leaves").insert({
      profile_id: selfId, start_date: form.start, end_date: form.end,
      kind: form.kind, days: reqDays, note: finalNote,
      status: "신청", requested_by: selfId,
    }).select();
    setBusy(false);
    if (error) { alert("신청 실패: " + error.message); return; }
    if (data[0] && data[0].start_date <= last && data[0].end_date >= `${ym}-01`) {
      setLeaves((prev) => [data[0], ...prev]);
    }
    if (data[0] && data[0].start_date.slice(0, 4) === year) {
      setMyLeaves((prev) => [data[0], ...prev]);
    }
    setApplying(false);
    setForm({ kind: "연차", period: "오전", start: TODAY_STR, end: TODAY_STR, note: "" });
  }

  return (
    <div className="flex flex-col">
      <div className="shrink-0 bg-white border border-slate-200 rounded-t-xl px-4 py-2.5 flex items-center justify-between">
        <button onClick={() => setCursor(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })} className="p-1.5 text-slate-500" aria-label="이전 달">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-extrabold text-slate-800">{y}년 {m + 1}월</p>
        <button onClick={() => setCursor(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })} className="p-1.5 text-slate-500" aria-label="다음 달">
          <ChevronRight size={18} />
        </button>
      </div>

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
          onClick={() => setApplying(true)}
          className="ml-auto text-[11px] font-bold text-white bg-blue-700 rounded-lg px-3.5 py-1.5 flex items-center gap-1"
        >
          <Plus size={12} /> 연차 신청
        </button>
      </div>

      <div className="px-0 py-3">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {DOW.map((d, i) => (
              <p key={d} className={`text-center text-[10px] font-bold py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>{d}</p>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: startDow }, (_, i) => <div key={`p${i}`} className="border-b border-r border-slate-100 min-h-[76px]" />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const iso = `${ym}-${String(d).padStart(2, "0")}`;
              const dow = (startDow + d - 1) % 7;
              const isToday = iso === TODAY_STR;
              const dayLeaves = leavesOf(iso);
              return (
                <div key={d} className={`border-b border-r border-slate-100 min-h-[76px] p-1 ${isToday ? "bg-blue-50" : ""}`}>
                  <p className={`text-[10px] font-bold text-right pr-0.5 ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-400"}`}>{d}</p>
                  <div className="space-y-0.5">
                    {dayLeaves.slice(0, 3).map((l) => {
                      const period = l.kind === "반차" ? periodOf(l.note) : null;
                      return (
                        <p key={l.id} className={`text-[9.5px] font-semibold rounded px-0.5 truncate ${LEAVE_TAG_STYLE}`}>
                          {nameOf(l.profile_id)} {l.kind}{period ? `(${period})` : ""}
                        </p>
                      );
                    })}
                    {dayLeaves.length > 3 && <p className="text-[9px] text-slate-400 px-0.5">+{dayLeaves.length - 3}건</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 전체보기/내근무만 토글과 무관 — 캘린더는 "이번 달 전체"고, 여기부터는 항상 "나"의 정보다 */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 mt-3">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5"><Plane size={13} /> {year}년 연차</p>
            {leftDays != null && <span className="text-[11px] font-extrabold text-blue-700">잔여 {leftDays}일</span>}
          </div>
          {grant == null ? (
            <p className="text-xs text-slate-400">입사일이 등록되지 않아 연차 일수를 계산할 수 없습니다 (관리자 문의) — 신청은 가능합니다</p>
          ) : (
            <>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (usedDays / grant) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-slate-500">
                부여 {grant}일 · 사용 {usedDays}일
                {waitingLeaves.length > 0 && (
                  <span className="text-amber-600 font-bold"> · 승인대기 {waitingLeaves.reduce((n, l) => n + Number(l.days), 0)}일</span>
                )}
              </p>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 mt-3">
          <p className="text-xs font-extrabold text-slate-700 mb-2">신청내역 ({year}년)</p>
          {myLeaves.length === 0 ? (
            <p className="text-xs text-slate-400">신청·사용 내역이 없습니다</p>
          ) : (
            <div className="space-y-1.5">
              {myLeaves.map((l) => {
                const st = l.status ?? "승인";
                return (
                  <div key={l.id} className="flex items-center justify-between gap-2 text-[11px] border-t border-slate-100 pt-1.5 first:border-0 first:pt-0">
                    <span className="text-slate-600 min-w-0 truncate">
                      {l.start_date.slice(5)}{l.end_date !== l.start_date && `~${l.end_date.slice(5)}`}
                      <span className="ml-1.5 text-slate-400">{l.kind}</span>
                      <span className={`ml-1.5 font-bold ${st === "신청" ? "text-amber-600" : st === "반려" ? "text-red-500" : "text-emerald-600"}`}>{st}</span>
                      {st === "반려" && l.reject_reason && <span className="ml-1.5 text-red-400">({l.reject_reason})</span>}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="font-bold text-slate-500">{l.days}일</span>
                      {st === "신청" && (
                        <button onClick={() => cancelLeave(l)} className="text-[10px] font-bold text-slate-400 underline">취소</button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {applying && (
        <Sheet title="연차 신청" onClose={() => setApplying(false)}>
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              {["연차", "반차", "병가", "공가"].map((k) => (
                <button
                  key={k}
                  onClick={() => setForm({ ...form, kind: k, end: k === "반차" ? form.start : form.end })}
                  className={`py-2 rounded-lg text-xs font-bold border ${form.kind === k ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200"}`}
                >
                  {k}
                </button>
              ))}
            </div>
            {form.kind === "반차" && (
              <div className="grid grid-cols-2 gap-1.5">
                {["오전", "오후"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, period: p })}
                    className={`py-2 rounded-lg text-xs font-bold border ${form.period === p ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            {form.kind === "반차" ? (
              <input
                type="date"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value, end: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-800"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value, end: e.target.value > form.end ? e.target.value : form.end })}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-800"
                />
                <span className="text-[11px] text-slate-400">~</span>
                <input
                  type="date"
                  value={form.end}
                  min={form.start}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-800"
                />
              </div>
            )}
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="사유 (선택)"
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800"
            />
            {dutyConflicts.length > 0 && (
              <p className="text-[11px] font-bold text-red-500 leading-relaxed">
                {dutyConflicts.map((d) => `${d.dutyDate.slice(5).replace("-", "/")} ${d.kind}`).join(", ")} 근무가 있습니다. 먼저 근무 교환을 한 뒤 신청하세요.
              </p>
            )}
            <button
              onClick={submitLeave}
              disabled={busy || dutyConflicts.length > 0}
              className="w-full text-sm font-bold text-white bg-blue-700 py-2.5 rounded-lg disabled:bg-slate-200"
            >
              {busy ? "신청 중…" : dutyConflicts.length ? "근무일 포함" : `${reqDays}일 신청`}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// 다른 탭(고장접수 등)과 동일한 구조 — 상단 제목은 앱 셸의 공용 ScreenHeader가 맡고,
// 여기서는 서브탭 바 + 내용만 그린다. 하단 네비게이터도 그대로 보이는 일반 탭이다.
export function WorkCalendarSheet({ schedules, swaps, onGenerate, onSetPerson, onRequestSwap, onRespondSwap }) {
  const [subTab, setSubTab] = useState("당직·숙직");
  const subTabs = ["당직·숙직", "연차"];

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="flex border-b border-slate-100 shrink-0 overflow-x-auto">
        {subTabs.map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-xs font-bold shrink-0 px-1.5 whitespace-nowrap flex items-center justify-center gap-1 ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === "당직·숙직" ? (
          <DutyRoster
            schedules={schedules}
            swaps={swaps}
            onGenerate={onGenerate}
            onSetPerson={onSetPerson}
            onRequestSwap={onRequestSwap}
            onRespondSwap={onRespondSwap}
            embedded
            showControls
          />
        ) : (
          <LeaveCalendarTab schedules={schedules} />
        )}
      </div>
    </div>
  );
}
