"use client";

// 출근부 — 과거 출퇴근을 날짜별/월별로 조회한다. (지각 판정 없음: 출근 시각 그대로 기록)
// 홈탭 '오늘 출근 명단'은 당일 빠른 확인용, 여기는 과거 조회·월별 집계용으로 역할을 나눈다.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const hhmm = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : null);
const isoDay = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function AttendanceAdmin({ data }) {
  const engineers = data.profiles.filter((p) => p.role === "engineer" && p.is_active !== false);
  const [view, setView] = useState("일별"); // 일별 | 월별
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const [day, setDay] = useState(TODAY_STR);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [rows, setRows] = useState([]);

  // 조회 범위: 일별=그날 하루, 월별=그 달 전체
  const range = view === "일별"
    ? { from: day, to: day }
    : { from: isoDay(cursor.y, cursor.m, 1), to: isoDay(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate()) };

  useEffect(() => {
    supabase.from("attendances").select("*").gte("work_date", range.from).lte("work_date", range.to)
      .then(({ data: d }) => setRows(d ?? []));
  }, [range.from, range.to]);

  const nameOf = (id) => engineers.find((e) => e.id === id)?.name ?? "";

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-extrabold mb-3">출근부</h1>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1">
          {["일별", "월별"].map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-xs font-bold rounded-lg px-3 py-1.5 border ${
                view === v ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-400 border-slate-200"
              }`}>{v}</button>
          ))}
        </div>
        {view === "일별" ? (
          <div className="flex items-center gap-2">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" />
            {day !== TODAY_STR && <button onClick={() => setDay(TODAY_STR)} className="text-[11px] font-bold text-blue-700">오늘</button>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(cursor.m === 0 ? { y: cursor.y - 1, m: 11 } : { y: cursor.y, m: cursor.m - 1 })} className="text-slate-400 px-1.5">‹</button>
            <span className="text-sm font-extrabold text-slate-700">{cursor.y}년 {cursor.m + 1}월</span>
            <button onClick={() => setCursor(cursor.m === 11 ? { y: cursor.y + 1, m: 0 } : { y: cursor.y, m: cursor.m + 1 })} className="text-slate-400 px-1.5">›</button>
          </div>
        )}
      </div>

      {view === "일별" ? <DailyView engineers={engineers} rows={rows} day={day} /> : <MonthlyView engineers={engineers} rows={rows} cursor={cursor} />}
    </div>
  );
}

// 일별 — 그날 전 직원의 출퇴근 한 줄씩
function DailyView({ engineers, rows, day }) {
  const byPid = new Map(rows.filter((r) => r.work_date === day).map((r) => [r.profile_id, r]));
  const inCount = engineers.filter((e) => byPid.get(e.id)?.checked_in_at).length;
  const isToday = day === TODAY_STR;
  // 마지막 접속 표시 — 오늘 조회일 때만 의미(단일 최신값이라 과거 날짜엔 안 맞음).
  // 근무 중인데 2시간 넘게 앱을 안 봤으면(stale) 주황으로 강조 — '확인해볼 사람'.
  const seenText = (iso, working) => {
    if (!iso) return { t: working ? "접속 기록 없음" : "-", tone: working ? "text-red-500 font-bold" : "text-slate-300" };
    const d = iso.slice(0, 10);
    if (d !== TODAY_STR) return { t: d.slice(5).replace("-", "/"), tone: "text-slate-400" };
    const h = (Date.now() - new Date(iso)) / 3600000;
    if (working && h >= 2) return { t: `${hhmm(iso)} · ${Math.floor(h)}시간째 미확인`, tone: "text-amber-600 font-bold" };
    return { t: `오늘 ${hhmm(iso)}`, tone: "text-emerald-600 font-bold" };
  };

  return (
    <>
      <p className="text-xs text-slate-500 mb-3">
        {DOW[new Date(`${day}T00:00:00`).getDay()]}요일 · 출근 {inCount} / {engineers.length}명
      </p>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "48rem" }}>
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              {["이름", "출근", "마감", "퇴근 위치", "마지막 위치", ...(isToday ? ["마지막 접속"] : [])].map((h, i) => (
                <th key={h} className={`px-3 py-2.5 font-semibold ${i === 0 ? "pl-5 text-left" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {engineers.map((e) => {
              const a = byPid.get(e.id);
              const seen = seenText(e.last_seen_at, a?.checked_in_at && !a.checked_out_at);
              return (
                <tr key={e.id} className="border-b border-slate-50">
                  <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{e.name}</td>
                  <td className="px-3 py-2.5">
                    {a?.checked_in_at ? <span className="font-bold text-slate-700">{hhmm(a.checked_in_at)}</span> : <span className="text-slate-300">미출근</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {a?.checked_out_at ? `${a.status} ${hhmm(a.checked_out_at)}` : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {a?.out_lat != null
                      ? <a href={`https://map.kakao.com/link/map/퇴근위치,${a.out_lat},${a.out_lng}`} target="_blank" rel="noreferrer"
                          className="text-[11px] font-bold text-blue-700">📍 지도</a>
                      : <span className="text-slate-300 text-[11px]">-</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 text-[11px] whitespace-nowrap">{e.last_loc_label ?? "-"}</td>
                  {isToday && <td className={`px-3 py-2.5 text-[11px] whitespace-nowrap ${seen.tone}`}>{seen.t}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isToday && <p className="text-[11px] text-slate-400 mt-2">‘마지막 접속’은 기사가 앱(홈)을 마지막으로 연 시각입니다. 오늘 조회에서만 표시됩니다.</p>}
    </>
  );
}

// 월별 — 직원 × 날짜 매트릭스. 출근 ●(초록) / 당직 ◆(주황) / 미출근 빈칸
function MonthlyView({ engineers, rows, cursor }) {
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const dayNums = Array.from({ length: days }, (_, i) => i + 1);
  // profileId|day → attendance
  const map = new Map();
  for (const r of rows) map.set(`${r.profile_id}|${r.work_date}`, r);

  const cell = (e, d) => {
    const iso = isoDay(cursor.y, cursor.m, d);
    const a = map.get(`${e.id}|${iso}`);
    if (!a?.checked_in_at) return <span className="text-slate-200">·</span>;
    if (a.status === "당직") return <span className="text-amber-600 font-bold" title={`당직 · 출근 ${hhmm(a.checked_in_at)}`}>◆</span>;
    return <span className="text-emerald-600 font-bold" title={`출근 ${hhmm(a.checked_in_at)}`}>●</span>;
  };
  const countIn = (e) => dayNums.filter((d) => map.get(`${e.id}|${isoDay(cursor.y, cursor.m, d)}`)?.checked_in_at).length;

  return (
    <>
      <p className="text-xs text-slate-500 mb-3">● 출근 · <span className="text-amber-600">◆</span> 당직 마감 · 빈칸 미출근 (지각 판정 없음)</p>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="text-xs" style={{ minWidth: `${20 + days * 1.6}rem` }}>
          <thead>
            <tr className="text-slate-400 border-b border-slate-100">
              <th className="pl-4 pr-2 py-2 text-left sticky left-0 bg-white font-semibold">이름</th>
              {dayNums.map((d) => {
                const dow = new Date(`${isoDay(cursor.y, cursor.m, d)}T00:00:00`).getDay();
                return <th key={d} className={`px-0 py-2 w-6 text-center font-semibold ${dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : ""}`}>{d}</th>;
              })}
              <th className="px-2 py-2 text-center font-semibold">합</th>
            </tr>
          </thead>
          <tbody>
            {engineers.map((e) => (
              <tr key={e.id} className="border-b border-slate-50">
                <td className="pl-4 pr-2 py-2 font-bold whitespace-nowrap sticky left-0 bg-white">{e.name}</td>
                {dayNums.map((d) => <td key={d} className="text-center py-2">{cell(e, d)}</td>)}
                <td className="px-2 py-2 text-center font-bold text-slate-600">{countIn(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
