"use client";

// 워크캘린더 — 홈 탭 "워크캘린더" 버튼 진입점. 정기점검 탭과 같은 구조로 위에 큰 제목,
// 아래 서브탭(당직·숙직/연차)을 둔다(계획/처리/달력 서브탭과 동일한 패턴).
import { useState, useEffect, useContext } from "react";
import { X, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/app/components/context";
import { TODAY_STR } from "@/lib/constants";
import { DutyRoster } from "@/app/components/DutyRoster";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const ymOf = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

// 연차·반차·병가 캘린더 — 워크캘린더의 "연차" 탭. 전체직원/내 연차 구분 보기 + 신청까지 여기서.
// 연차 신청 로직은 MyPage.jsx와 동일(반차 0.5일, 근무 겹침 시 신청 막기)하되 이 탭 전용으로 둔다.
function LeaveCalendarTab({ schedules = [] }) {
  const { selfId, profiles = [] } = useContext(AuthContext);
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [leaves, setLeaves] = useState([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({ kind: "연차", start: TODAY_STR, end: TODAY_STR, note: "" });
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

  const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? "";
  const visibleLeaves = onlyMine ? leaves.filter((l) => l.profile_id === selfId) : leaves;
  const leavesOf = (iso) => visibleLeaves.filter((l) => l.start_date <= iso && iso <= l.end_date);

  // 반차는 0.5일, 그 외는 시작~종료 일수 (주말 제외는 회사 규정이 갈려 자동 계산하지 않는다)
  const reqDays = form.kind === "반차" ? 0.5 : Math.max(1, Math.floor((new Date(form.end) - new Date(form.start)) / 86400000) + 1);
  // 신청 기간에 내 당직·숙직이 끼면 신청을 막는다 — 근무를 먼저 교환한 뒤 연차를 써야 한다.
  const dutyConflicts = schedules.filter((d) => d.profileId === selfId && d.dutyDate >= form.start && d.dutyDate <= form.end);

  async function submitLeave() {
    if (dutyConflicts.length) return;
    setBusy(true);
    const { data, error } = await supabase.from("leaves").insert({
      profile_id: selfId, start_date: form.start, end_date: form.end,
      kind: form.kind, days: reqDays, note: form.note || null,
      status: "신청", requested_by: selfId,
    }).select();
    setBusy(false);
    if (error) { alert("신청 실패: " + error.message); return; }
    if (data[0] && data[0].start_date <= last && data[0].end_date >= `${ym}-01`) {
      setLeaves((prev) => [data[0], ...prev]);
    }
    setApplying(false);
    setForm({ kind: "연차", start: TODAY_STR, end: TODAY_STR, note: "" });
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })} className="p-1.5 text-slate-500" aria-label="이전 달">
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-extrabold text-slate-800">{y}년 {m + 1}월</p>
          <button onClick={() => setCursor(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })} className="p-1.5 text-slate-500" aria-label="다음 달">
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          onClick={() => setOnlyMine((v) => !v)}
          className={`text-[11px] font-bold rounded-lg px-3 py-1.5 border ${
            onlyMine ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-500 border-slate-200"
          }`}
        >
          {onlyMine ? "내 연차" : "전체직원 연차"}
        </button>
      </div>

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
                  {dayLeaves.slice(0, 3).map((l) => (
                    <p key={l.id} className="text-[9.5px] font-semibold rounded px-0.5 truncate bg-amber-50 text-amber-700">
                      {nameOf(l.profile_id)} {l.kind}
                    </p>
                  ))}
                  {dayLeaves.length > 3 && <p className="text-[9px] text-slate-400 px-0.5">+{dayLeaves.length - 3}건</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2.5 mb-3 px-1 text-[11px] font-semibold text-slate-500">
        <span className="w-2 h-2 rounded-full bg-amber-400" /> 노랑 — 휴가
      </div>

      {!applying ? (
        <button
          onClick={() => setApplying(true)}
          className="w-full bg-blue-50 text-blue-700 text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-1"
        >
          <Plus size={13} /> 연차 신청
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            {["연차", "반차", "병가"].map((k) => (
              <button
                key={k}
                onClick={() => setForm({ ...form, kind: k })}
                className={`py-2 rounded-lg text-xs font-bold border ${form.kind === k ? "bg-blue-700 text-white border-blue-700" : "text-slate-600 border-slate-200"}`}
              >
                {k}
              </button>
            ))}
          </div>
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
              disabled={form.kind === "반차"}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
              className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-800 disabled:bg-slate-50"
            />
          </div>
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
          <div className="flex gap-1.5">
            <button onClick={() => setApplying(false)} className="flex-1 text-xs font-bold text-slate-500 bg-slate-100 py-2.5 rounded-lg">취소</button>
            <button
              onClick={submitLeave}
              disabled={busy || dutyConflicts.length > 0}
              className="flex-1 text-xs font-bold text-white bg-blue-700 py-2.5 rounded-lg disabled:bg-slate-200"
            >
              {busy ? "신청 중…" : dutyConflicts.length ? "근무일 포함" : `${reqDays}일 신청`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkCalendarSheet({ schedules, swaps, onGenerate, onSetPerson, onRequestSwap, onRespondSwap, onClose }) {
  const [subTab, setSubTab] = useState("당직·숙직");

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
      <div className="shrink-0 bg-blue-900 text-white px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-extrabold">워크캘린더</p>
        <button onClick={onClose} className="p-1" aria-label="닫기"><X size={18} /></button>
      </div>

      <div className="flex border-b border-slate-100 shrink-0 bg-white">
        {["당직·숙직", "연차"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-sm font-bold ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
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
