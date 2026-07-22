"use client";

// 대시보드용 근무 요약 — 월 달력 전체를 대시보드에 올리면 화면을 다 잡아먹는다.
// 요일 주 단위가 아니라 "오늘"을 가운데(고정) 두고 앞뒤 3일씩 총 7칸만 보여주고,
// 자세히는 워크 캘린더로 넘긴다. 화살표는 하루씩 이동.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { useHolidays } from "@/app/hooks/useHolidays";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const KIND_TONE = {
  당직: "bg-emerald-50 text-emerald-700",
  숙직: "bg-blue-50 text-blue-700",
  정상근무: "bg-violet-50 text-violet-500",
};

// toISOString()은 UTC로 변환하는데 서버 타임존(KST, UTC+9)에서는 자정이 전날 오후로
// 밀려서 하루가 어긋난다 — 로컬 날짜 그대로 문자열로 만든다.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function WeekStrip({ data, onOpenCalendar }) {
  const [dayOffset, setDayOffset] = useState(0); // 0 = 오늘이 가운데
  const [duties, setDuties] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const { days: HOLIDAY } = useHolidays();

  // 오늘(고정) + dayOffset을 가운데 두고 앞뒤 3일씩 총 7칸
  const center = new Date(`${TODAY_STR}T00:00:00`);
  center.setDate(center.getDate() + dayOffset);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(center);
    d.setDate(center.getDate() + (i - 3));
    return iso(d);
  });
  const from = week[0], to = week[6];

  useEffect(() => {
    Promise.all([
      supabase.from("duty_schedules").select("*").gte("duty_date", from).lte("duty_date", to),
      supabase.from("leaves").select("*").lte("start_date", to).gte("end_date", from),
    ]).then(([d, l]) => { setDuties(d.data ?? []); setLeaves(l.data ?? []); });
  }, [from, to]);

  const nameOf = (id) => data.profiles.find((p) => p.id === id)?.name ?? "";

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-extrabold text-slate-700">
          워크 캘린더
          <span className="ml-1.5 text-[11px] font-semibold text-slate-400">{from.slice(5)} ~ {to.slice(5)}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setDayOffset(dayOffset - 1)} className="text-xs font-bold text-slate-400 px-2 py-1">‹</button>
          {dayOffset !== 0 && <button onClick={() => setDayOffset(0)} className="text-[11px] font-bold text-slate-500 px-2">오늘</button>}
          <button onClick={() => setDayOffset(dayOffset + 1)} className="text-xs font-bold text-slate-400 px-2 py-1">›</button>
          {onOpenCalendar && (
            <button onClick={onOpenCalendar} className="ml-1.5 text-[11px] font-bold text-blue-700">
              워크 캘린더 →
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {week.map((d) => {
          const holiday = HOLIDAY[d];
          const dayLeaves = leaves.filter((l) => l.start_date <= d && d <= l.end_date);
          // 가운데(오늘)만 고정이고 창이 요일 경계에 맞춰 시작하지 않으므로, 배열 순서가 아니라
          // 실제 날짜의 요일로 일/토 판단해야 한다 (i===0/6 기준은 요일 정렬 창에서만 맞다).
          const dow = new Date(`${d}T00:00:00`).getDay();
          return (
            <div key={d} className={`rounded-lg border p-2 min-h-[92px] ${
              d === TODAY_STR ? "border-blue-300 bg-blue-50" : holiday ? "border-red-100 bg-red-50/40" : "border-slate-100"
            }`}>
              <p className={`text-[10px] font-bold ${holiday || dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-400"}`}>
                {DOW[dow]} {Number(d.slice(8))}
              </p>
              {holiday && <p className="text-[9px] font-bold text-red-400 truncate mb-0.5">{holiday}</p>}
              <div className="space-y-0.5 mt-1">
                {["당직", "숙직", "정상근무"].map((kind) => {
                  const row = duties.find((x) => x.duty_date === d && x.kind === kind);
                  if (!row?.profile_id) return null;
                  return (
                    <p key={kind} className={`text-[9.5px] font-semibold rounded px-1 py-0.5 truncate ${KIND_TONE[kind]}`}>
                      {kind.slice(0, 2)} {nameOf(row.profile_id)}
                    </p>
                  );
                })}
                {dayLeaves.map((l) => (
                  <p key={l.id} className="text-[9.5px] font-semibold rounded px-1 py-0.5 truncate bg-amber-50 text-amber-700">
                    {l.kind} {nameOf(l.profile_id)}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {duties.length === 0 && leaves.length === 0 && (
        <p className="text-[11px] text-slate-400 mt-2.5">
          이 주에 등록된 근무·휴가가 없습니다. 인사관리 → 당직 근무표에서 근무표를 생성하세요.
        </p>
      )}
    </section>
  );
}
