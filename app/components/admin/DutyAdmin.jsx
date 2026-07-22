"use client";

// 콘솔 당직·숙직 근무표 — 모바일 홈탭과 같은 달력을 그대로 쓴다.
// DutyRoster는 AuthContext(role·selfId·engineers)를 보므로 여기서 관리자용 값을 넣어준다.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/app/components/context";
import { DutyRoster } from "@/app/components/DutyRoster";
import { mapDutySchedule, mapDutySwap } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";
import { inputCls } from "@/app/components/admin/adminShared";
import { ChevronRight, ChevronLeft } from "lucide-react";

// DutyRoster.jsx 달력과 동일한 색상 규칙 — 미리보기 달력도 같은 톤으로 맞춘다.
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const KIND_TEXT = { 당직: "text-emerald-700", 숙직: "text-blue-700", 정상근무: "text-violet-500" };

export default function DutyAdmin({ data, setData }) {
  const engineers = data.profiles.filter((p) => p.role === "engineer" && p.is_active !== false);
  const [schedules, setSchedules] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [genYm, setGenYm] = useState(TODAY_STR.slice(0, 7)); // 근무표 생성 대상 월 (YYYY-MM)
  const [genMode, setGenMode] = useState("주5일");
  const [generating, setGenerating] = useState(false);

  // 실시간 반영 미리보기 — 순번표를 고치면 자동으로 다시 계산된다(버튼 없음).
  const [calRows, setCalRows] = useState(null);
  const [calLoading, setCalLoading] = useState(false);

  useEffect(() => {
    // 지난달치까지 함께 불러온다 — 자동배정이 직전 순번을 이어받는지 눈으로 확인할 수 있게
    const from = TODAY_STR.slice(0, 8) + "01";
    Promise.all([
      supabase.from("duty_schedules").select("*").gte("duty_date", from).order("duty_date"),
      supabase.from("duty_swaps").select("*"),
    ]).then(([s, w]) => {
      setSchedules((s.data ?? []).map(mapDutySchedule));
      setSwaps((w.data ?? []).map(mapDutySwap));
    });
  }, []);

  async function generate(ym, mode = "주5일") {
    const roster = engineers
      .filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode))
      .sort((a, b) => a.duty_order - b.duty_order);
    if (!roster.length) { alert(`${mode} 근무제 대상자가 없습니다. 아래 순번표에서 순번을 지정하세요.`); return; }

    const [y, m] = ym.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const { data: prev } = await supabase.from("duty_schedules").select("*")
      .lt("duty_date", `${ym}-01`).order("duty_date", { ascending: false }).order("kind").limit(1);
    let cursor = prev?.[0]?.profile_id ? roster.findIndex((e) => e.id === prev[0].profile_id) : -1;
    const next = () => { cursor = (cursor + 1) % roster.length; return roster[cursor].id; };

    const existing = new Set(schedules.filter((d) => d.dutyDate.startsWith(ym)).map((d) => `${d.dutyDate}|${d.kind}`));
    const rows = [];
    for (let d = 1; d <= days; d++) {
      const iso = `${ym}-${String(d).padStart(2, "0")}`;
      for (const kind of ["숙직", "당직"]) {
        const pid = next();
        if (existing.has(`${iso}|${kind}`)) continue;
        rows.push({ duty_date: iso, kind, profile_id: pid });
      }
      if (mode === "주4일" && new Date(`${iso}T00:00:00`).getDay() === 5 && !existing.has(`${iso}|정상근무`)) {
        rows.push({ duty_date: iso, kind: "정상근무", profile_id: null });
      }
    }
    if (!rows.length) return;
    const { data: created, error } = await supabase.from("duty_schedules")
      .upsert(rows, { onConflict: "duty_date,kind" }).select();
    if (error) { alert("배정 실패: " + error.message); return; }
    const mapped = (created ?? []).map(mapDutySchedule);
    setSchedules((p) => [...p.filter((x) => !mapped.some((n) => n.id === x.id)), ...mapped]
      .sort((a, b) => a.dutyDate.localeCompare(b.dutyDate)));
  }

  async function setPerson(iso, kind, profileId) {
    const { data: rows } = await supabase.from("duty_schedules")
      .upsert({ duty_date: iso, kind, profile_id: profileId }, { onConflict: "duty_date,kind" }).select();
    const row = rows?.[0];
    if (row) setSchedules((p) => [...p.filter((x) => x.id !== row.id), mapDutySchedule(row)]
      .sort((a, b) => a.dutyDate.localeCompare(b.dutyDate)));
  }

  async function saveOrder(p, value) {
    const duty_order = value === "" ? null : Number(value);
    await supabase.from("profiles").update({ duty_order }).eq("id", p.id);
    setData((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, duty_order } : x)) }));
  }

  async function toggleMode(p, mode, on) {
    const modes = new Set(p.duty_modes ?? []);
    on ? modes.add(mode) : modes.delete(mode);
    const duty_modes = [...modes];
    await supabase.from("profiles").update({ duty_modes }).eq("id", p.id);
    setData((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, duty_modes } : x)) }));
  }

  // 실제로 DB에 쓰지 않고 generate()와 동일한 순번 로직으로 "이대로 채우면 이렇게 된다"만 계산한다.
  // 이미 배정된 칸은 그대로, 빈 칸만 지금 순번표로 채워서 보여준다(실제 생성과 동일한 규칙).
  async function simulate(ym, mode, roster) {
    if (!roster.length) return [];
    const [y, m] = ym.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const { data: prev } = await supabase.from("duty_schedules").select("*")
      .lt("duty_date", `${ym}-01`).order("duty_date", { ascending: false }).order("kind").limit(1);
    let cursor = prev?.[0]?.profile_id ? roster.findIndex((e) => e.id === prev[0].profile_id) : -1;
    const next = () => { cursor = (cursor + 1) % roster.length; return roster[cursor]; };

    const existing = new Map(schedules.filter((d) => d.dutyDate.startsWith(ym)).map((d) => [`${d.dutyDate}|${d.kind}`, d]));
    const nameOfAny = (pid) => data.profiles.find((p) => p.id === pid)?.name ?? "";
    const rows = [];
    for (let d = 1; d <= days; d++) {
      const iso = `${ym}-${String(d).padStart(2, "0")}`;
      for (const kind of ["당직", "숙직"]) {
        const key = `${iso}|${kind}`;
        const found = existing.get(key);
        rows.push(found
          ? { iso, kind, name: nameOfAny(found.profileId), isNew: false }
          : { iso, kind, name: next().name, isNew: true });
      }
      if (mode === "주4일" && new Date(`${iso}T00:00:00`).getDay() === 5) {
        const found = existing.get(`${iso}|정상근무`);
        rows.push(found
          ? { iso, kind: "정상근무", name: nameOfAny(found.profileId), isNew: false }
          : { iso, kind: "정상근무", name: null, isNew: true });
      }
    }
    return rows;
  }

  const sorted = engineers.slice().sort((a, b) => (a.duty_order ?? 999) - (b.duty_order ?? 999));
  const inMode = (mode) => sorted.filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode)).length;
  const rosterOf = (mode) => sorted.filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode));
  const count5 = inMode("주5일");
  const count4 = inMode("주4일");

  // 순번표(engineers·duty_order·duty_modes)가 바뀌거나 달·근무제를 옮기면 자동으로 다시 계산한다.
  useEffect(() => {
    let alive = true;
    setCalLoading(true);
    simulate(genYm, genMode, rosterOf(genMode)).then((rows) => {
      if (alive) { setCalRows(rows); setCalLoading(false); }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genYm, genMode, data.profiles, schedules]);

  function shiftGenMonth(delta) {
    const [gy, gm] = genYm.split("-").map(Number);
    const d = new Date(gy, gm - 1 + delta, 1);
    setGenYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  async function handleGenerate() {
    setGenerating(true);
    await generate(genYm, genMode);
    setGenerating(false);
  }

  // 근무표 생성 — 근무제 선택 → 그 근무제 순번표 → 배정 순서 → 실시간 미리보기 캘린더 → 배정,
  // 전부 한 화면에서 이어지게 합쳤다(예전엔 "당직 순번·근무제"가 따로 접혀 있었다).
  const [gy, gm] = genYm.split("-").map(Number);
  const genRoster = rosterOf(genMode);
  const daysInGenMonth = new Date(gy, gm, 0).getDate();
  const genMonthStartDow = new Date(gy, gm - 1, 1).getDay();
  const generateWidget = (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-extrabold text-slate-700">근무표 생성 (근무제 선택)</p>
        <div className="flex items-center gap-1">
          <button onClick={() => shiftGenMonth(-1)} className="p-1 text-slate-400" aria-label="이전 달"><ChevronLeft size={16} /></button>
          <span className="text-xs font-bold text-slate-600 w-16 text-center">{gy}년 {gm}월</span>
          <button onClick={() => shiftGenMonth(1)} className="p-1 text-slate-400" aria-label="다음 달"><ChevronRight size={16} /></button>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mb-3">이미 배정된 칸은 그대로 두고 빈 칸만 채웁니다.</p>

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
            <span className="block text-[10px] font-semibold opacity-70">{mode === "주5일" ? count5 : count4}명</span>
          </button>
        ))}
      </div>

      {genMode === "주4일" && (
        <p className="text-[11px] text-indigo-500 font-semibold bg-indigo-50 rounded-lg px-3 py-2 mb-3">
          금요일마다 정상근무 칸이 함께 만들어집니다 (담당자는 달력에서 직접 지정).
        </p>
      )}

      {/* 순번표 — 선택된 근무제 전용. 체크하면 이 근무제 대상에 포함되고, 순번을 넣으면 로테이션 순서가 된다. */}
      <div className="border border-slate-100 rounded-lg p-3 mb-3">
        <p className="text-[11px] font-bold text-slate-500 mb-2">{genMode} 순번표</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {sorted.map((p) => {
            const included = (p.duty_modes ?? []).includes(genMode);
            return (
              <div key={p.id} className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 ${
                included ? "border-slate-200" : "border-slate-100 bg-slate-50"
              }`}>
                <label className={`shrink-0 text-[10px] font-bold rounded px-1.5 py-1 cursor-pointer border ${
                  included ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-300 border-slate-100"
                }`}>
                  <input type="checkbox" className="hidden" checked={included}
                    onChange={(e) => toggleMode(p, genMode, e.target.checked)} />
                  포함
                </label>
                <div className="w-11 shrink-0">
                  <input className={`${inputCls} text-center`} inputMode="numeric" placeholder="—"
                    defaultValue={p.duty_order ?? ""}
                    onBlur={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); if (v !== String(p.duty_order ?? "")) saveOrder(p, v); }} />
                </div>
                <span className="text-sm font-bold text-slate-700 truncate flex-1">{p.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border border-slate-100 rounded-lg p-3 mb-3">
        <p className="text-[11px] font-bold text-slate-500 mb-1.5">배정 순서</p>
        {genRoster.length === 0 ? (
          <p className="text-[11px] text-red-500">{genMode} 대상자가 없습니다. 위 순번표에서 포함시키고 순번을 지정하세요.</p>
        ) : (
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {genRoster.map((e) => `${e.name}(${e.duty_order})`).join(" → ")}
          </p>
        )}
      </div>

      {/* 실시간 미리보기 캘린더 — 위 순번표를 고치면 버튼 없이 바로 다시 그려진다 */}
      <div className="mb-3">
        <p className="text-[11px] font-bold text-slate-500 mb-1.5">반영 미리보기 (실시간)</p>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {DOW.map((d, i) => (
              <p key={d} className={`text-center text-[10px] font-bold py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>{d}</p>
            ))}
          </div>
          {calLoading ? (
            <p className="text-xs text-slate-400 text-center py-8">계산 중…</p>
          ) : (
            <div className="grid grid-cols-7">
              {Array.from({ length: genMonthStartDow }, (_, i) => (
                <div key={`pad${i}`} className="border-b border-r border-slate-100 min-h-[60px]" />
              ))}
              {Array.from({ length: daysInGenMonth }, (_, i) => i + 1).map((d) => {
                const iso = `${genYm}-${String(d).padStart(2, "0")}`;
                const dow = (genMonthStartDow + d - 1) % 7;
                const rows = (calRows ?? []).filter((r) => r.iso === iso);
                const hasNew = rows.some((r) => r.isNew && r.name != null);
                return (
                  <div key={d} className={`border-b border-r border-slate-100 min-h-[60px] p-1 ${hasNew ? "bg-blue-50/40" : ""}`}>
                    <p className={`text-[10px] font-bold text-right pr-0.5 ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-400"}`}>{d}</p>
                    {rows.map((r) => (
                      <p
                        key={r.kind}
                        className={`text-[9px] leading-tight rounded px-0.5 truncate font-semibold ${
                          r.name == null ? "text-slate-300" : KIND_TEXT[r.kind]
                        } ${r.isNew && r.name != null ? "bg-blue-100" : ""}`}
                      >
                        {r.name ?? "-"}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500 mt-2">
          {["당직", "숙직", "정상근무"].map((k) => (
            <span key={k} className="flex items-center gap-1 font-semibold">
              <span className={`w-2 h-2 rounded-full ${k === "당직" ? "bg-emerald-500" : k === "숙직" ? "bg-blue-500" : "bg-violet-400"}`} />
              {k}
            </span>
          ))}
          <span className="flex items-center gap-1 font-semibold ml-auto">
            <span className="w-2.5 h-2.5 rounded bg-blue-100" /> 새로 채워질 칸
          </span>
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating || genRoster.length === 0}
        className="w-full bg-blue-700 text-white text-sm font-bold py-2.5 rounded-xl disabled:bg-slate-200"
      >
        {generating ? "배정 중…" : `${genMode} 기준으로 배정`}
      </button>
    </div>
  );

  return (
    <AuthContext.Provider value={{ name: "관리자", role: "admin", selfId: null, engineers, engineerNames: engineers.map((e) => e.name), profiles: data.profiles }}>
      <div className="max-w-3xl">
        <DutyRoster
          embedded
          schedules={schedules}
          swaps={swaps}
          onGenerate={generate}
          onSetPerson={setPerson}
          onRequestSwap={() => {}}
          onRespondSwap={() => {}}
          belowCalendar={generateWidget}
          showFillButton={false}
        />
      </div>
    </AuthContext.Provider>
  );
}
