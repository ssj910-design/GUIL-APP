"use client";

// 워크 캘린더 — 한 달에 일어나는 인사 일정을 한 화면에 겹쳐 본다.
// 당직·숙직·정상근무(근무표) + 연차·반차 등(휴가). "이 날 누가 당직인데 누가 연차인가"를
// 표 두 개를 번갈아 보지 않고 확인하려는 게 목적이다.
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import holidays from "@/lib/holidays.json";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const KIND_TONE = {
  당직: "bg-emerald-50 text-emerald-700",
  숙직: "bg-blue-50 text-blue-700",
  정상근무: "bg-violet-50 text-violet-500",
};
const LEAVE_TONE = "bg-amber-50 text-amber-700";
const HOLIDAY = holidays.days; // 공휴일은 일요일과 같은 빨간 날로 취급한다

const ymOf = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

export default function WorkCalendar({ data }) {
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [duties, setDuties] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [show, setShow] = useState({ 근무: true, 휴가: true });

  const { y, m } = cursor;
  const ym = ymOf(y, m);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();
  const last = `${ym}-${String(daysInMonth).padStart(2, "0")}`;

  useEffect(() => {
    Promise.all([
      supabase.from("duty_schedules").select("*").gte("duty_date", `${ym}-01`).lte("duty_date", last),
      // 기간 휴가가 이 달에 걸치기만 해도 가져온다
      supabase.from("leaves").select("*").lte("start_date", last).gte("end_date", `${ym}-01`),
    ]).then(([d, l]) => { setDuties(d.data ?? []); setLeaves(l.data ?? []); });
  }, [ym, last]);

  const nameOf = (id) => data.profiles.find((p) => p.id === id)?.name ?? "";

  function itemsOf(iso) {
    const out = [];
    if (show.근무) {
      for (const kind of ["당직", "숙직", "정상근무"]) {
        const d = duties.find((x) => x.duty_date === iso && x.kind === kind);
        if (d?.profile_id) out.push({ key: `${kind}-${d.id}`, tone: KIND_TONE[kind], label: `${kind.slice(0, 2)} ${nameOf(d.profile_id)}` });
      }
    }
    if (show.휴가) {
      for (const l of leaves.filter((x) => x.start_date <= iso && iso <= x.end_date)) {
        out.push({ key: `leave-${l.id}`, tone: LEAVE_TONE, label: `${l.kind} ${nameOf(l.profile_id)}` });
      }
    }
    return out;
  }

  const monthLeaveDays = leaves.reduce((n, l) => n + Number(l.days), 0);
  const monthHolidays = Object.keys(HOLIDAY).filter((d) => d.startsWith(ym)).length;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })} className="p-1.5 text-slate-400"><ChevronLeft size={18} /></button>
          <p className="text-sm font-extrabold text-slate-800">{y}년 {m + 1}월</p>
          <button onClick={() => setCursor(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })} className="p-1.5 text-slate-400"><ChevronRight size={18} /></button>
        </div>
        <div className="flex gap-1.5">
          {["근무", "휴가"].map((k) => (
            <button key={k} onClick={() => setShow({ ...show, [k]: !show[k] })}
              className={`text-[11px] font-bold rounded-lg px-3 py-1.5 border ${
                show[k] ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-400 border-slate-200"
              }`}>
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {DOW.map((d, i) => (
            <p key={d} className={`text-center text-[11px] font-bold py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>{d}</p>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: startDow }, (_, i) => <div key={`p${i}`} className="border-b border-r border-slate-100 min-h-[104px] bg-slate-50/40" />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
            const iso = `${ym}-${String(d).padStart(2, "0")}`;
            const dow = (startDow + d - 1) % 7;
            const items = itemsOf(iso);
            const holiday = HOLIDAY[iso];
            return (
              <div key={d} className={`border-b border-r border-slate-100 min-h-[104px] p-1.5 ${
                iso === TODAY_STR ? "bg-blue-50" : holiday ? "bg-red-50/40" : ""
              }`}>
                <div className="flex items-baseline gap-1 mb-1">
                  <p className={`text-[11px] font-bold ${holiday || dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-400"}`}>{d}</p>
                  {holiday && <p className="text-[9.5px] font-bold text-red-400 truncate">{holiday}</p>}
                </div>
                <div className="space-y-0.5">
                  {items.map((it) => (
                    <p key={it.key} className={`text-[10px] font-semibold rounded px-1 py-0.5 truncate ${it.tone}`}>{it.label}</p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2.5 text-[11px] text-slate-400 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-400 inline-block" /> 초록 — 당직</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-400 inline-block" /> 파랑 — 숙직</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-violet-400 inline-block" /> 보라 — 정상근무</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block" /> 노랑 — 휴가</span>
        <span className="ml-auto">공휴일 {monthHolidays}일 · 휴가 {monthLeaveDays}일</span>
      </div>
    </div>
  );
}
