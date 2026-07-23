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

// 요일별 순번 그룹 — 같은 순번표 인원이라도 평일/주말(주4일은 금요일도 별도)은 서로 독립된
// 로테이션으로 돈다. 주5일: 평일(월~금)·주말. 주4일: 평일(월~목)·금요일(숙직·당직·정상근무)·주말.
function dayGroup(mode, dow) {
  if (dow === 0 || dow === 6) return "주말";
  if (mode === "주4일" && dow === 5) return "금요일";
  return "평일";
}
function groupsOf(mode) {
  return mode === "주4일" ? ["평일", "금요일", "주말"] : ["평일", "주말"];
}

export default function DutyAdmin({ data, setData }) {
  const engineers = data.profiles.filter((p) => p.role === "engineer" && p.is_active !== false);
  const [schedules, setSchedules] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [genYm, setGenYm] = useState(TODAY_STR.slice(0, 7)); // 근무표 생성 대상 월 (YYYY-MM)
  const [genMode, setGenMode] = useState("주5일");
  const [generating, setGenerating] = useState(false);
  const [retracting, setRetracting] = useState(false);

  // 실시간 반영 미리보기 — 순번표를 고치면 자동으로 다시 계산된다(버튼 없음).
  const [calRows, setCalRows] = useState(null);
  const [calLoading, setCalLoading] = useState(false);
  // 미리보기에서 특정 칸만 손으로 바꾼 것 — "iso|kind" -> profileId(수동 지정) | null(수동 비움)
  const [manualOverrides, setManualOverrides] = useState({});
  const [pickerTarget, setPickerTarget] = useState(null); // { iso, kind }

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

  // 대상 월 시작 전, 각 요일그룹이 마지막으로 배정된 날짜의 담당자를 찾아 그 다음 사람부터
  // 이어가게 한다 — 그룹별로 독립된 커서이므로 그룹별로 따로 찾는다.
  async function initCursors(ym, mode, roster) {
    const groups = groupsOf(mode);
    const cursors = {};
    if (!roster.length) { groups.forEach((g) => (cursors[g] = -1)); return cursors; }
    const { data: recent } = await supabase.from("duty_schedules").select("*")
      .lt("duty_date", `${ym}-01`).order("duty_date", { ascending: false }).limit(120);
    for (const g of groups) {
      const match = (recent ?? []).find((r) => dayGroup(mode, new Date(`${r.duty_date}T00:00:00`).getDay()) === g);
      cursors[g] = match ? roster.findIndex((e) => e.id === match.profile_id) : -1;
    }
    return cursors;
  }

  async function generate(ym, mode = "주5일") {
    const roster = engineers
      .filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode))
      .sort((a, b) => a.duty_order - b.duty_order);
    if (!roster.length) { alert(`${mode} 근무제 대상자가 없습니다. 아래 순번표에서 순번을 지정하세요.`); return; }

    const cursors = await initCursors(ym, mode, roster);
    const next = (g) => { cursors[g] = (cursors[g] + 1) % roster.length; return roster[cursors[g]].id; };

    const [y, m] = ym.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const existing = new Set(schedules.filter((d) => d.dutyDate.startsWith(ym)).map((d) => `${d.dutyDate}|${d.kind}`));
    const rows = [];
    for (let d = 1; d <= days; d++) {
      const iso = `${ym}-${String(d).padStart(2, "0")}`;
      const g = dayGroup(mode, new Date(`${iso}T00:00:00`).getDay());
      for (const kind of ["숙직", "당직"]) {
        if (existing.has(`${iso}|${kind}`)) continue;
        const auto = next(g);
        const ov = manualOverrides[`${iso}|${kind}`];
        rows.push({ duty_date: iso, kind, profile_id: ov !== undefined ? ov : auto });
      }
      if (g === "금요일" && !existing.has(`${iso}|정상근무`)) {
        const auto = next(g);
        const ov = manualOverrides[`${iso}|정상근무`];
        rows.push({ duty_date: iso, kind: "정상근무", profile_id: ov !== undefined ? ov : auto });
      }
    }
    if (!rows.length) return;
    const { data: created, error } = await supabase.from("duty_schedules")
      .upsert(rows, { onConflict: "duty_date,kind" }).select();
    if (error) { alert("배정 실패: " + error.message); return; }
    const mapped = (created ?? []).map(mapDutySchedule);
    setSchedules((p) => [...p.filter((x) => !mapped.some((n) => n.id === x.id)), ...mapped]
      .sort((a, b) => a.dutyDate.localeCompare(b.dutyDate)));
    // 방금 채운 달의 수동지정은 이제 확정 기록에 흡수됐으니 정리한다.
    setManualOverrides((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(ym)) delete next[k]; });
      return next;
    });
  }

  // 이미 배정된 근무표 회수 — 오늘 이전 기록(이미 지나간 실제 근무)은 그대로 두고,
  // 오늘 이후로 예정된 배정만 지운다. 종류(당직·숙직·정상근무) 구분 없이 그 달 전체를 되돌린다.
  async function retract(ym) {
    const from = ym === TODAY_STR.slice(0, 7) ? TODAY_STR : `${ym}-01`;
    const [y, m] = ym.split("-").map(Number);
    const to = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    if (from > to) { alert("이미 지난 달입니다 — 회수할 오늘 이후 기록이 없습니다."); return; }
    if (!confirm(`${y}년 ${m}월 근무표 중 ${from.slice(5).replace("-", "/")} 이후 배정을 전부 회수할까요?\n(그 이전 기록은 남습니다)`)) return;
    setRetracting(true);
    const { error } = await supabase.from("duty_schedules").delete().gte("duty_date", from).lte("duty_date", to);
    setRetracting(false);
    if (error) { alert("회수 실패: " + error.message); return; }
    setSchedules((prev) => prev.filter((s) => !(s.dutyDate >= from && s.dutyDate <= to)));
    setManualOverrides((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.slice(0, 10) >= from && k.slice(0, 10) <= to) delete next[k]; });
      return next;
    });
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

  // 실제로 DB에 쓰지 않고 generate()와 동일한 요일그룹 로테이션으로 "이대로 채우면 이렇게 된다"만
  // 계산해서 보여주는 미리보기 — 이미 배정된 칸은 그대로, 빈 칸만 지금 순번표(+수동지정)로 채운다.
  async function simulate(ym, mode, roster) {
    const groups = groupsOf(mode);
    const existing = new Map(schedules.filter((d) => d.dutyDate.startsWith(ym)).map((d) => [`${d.dutyDate}|${d.kind}`, d]));
    const nameOfAny = (pid) => data.profiles.find((p) => p.id === pid)?.name ?? "";
    if (!roster.length) {
      // 대상자가 없어도 이미 배정된 칸은 그대로 보여준다.
      const [y0, m0] = ym.split("-").map(Number);
      const days0 = new Date(y0, m0, 0).getDate();
      const rows0 = [];
      for (let d = 1; d <= days0; d++) {
        const iso = `${ym}-${String(d).padStart(2, "0")}`;
        for (const kind of ["당직", "숙직"]) {
          const found = existing.get(`${iso}|${kind}`);
          rows0.push(found ? { iso, kind, name: nameOfAny(found.profileId), isNew: false } : { iso, kind, name: null, isNew: false });
        }
      }
      return rows0;
    }
    const cursors = await initCursors(ym, mode, roster);
    const next = (g) => { cursors[g] = (cursors[g] + 1) % roster.length; return roster[cursors[g]]; };

    const [y, m] = ym.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const rows = [];
    for (let d = 1; d <= days; d++) {
      const iso = `${ym}-${String(d).padStart(2, "0")}`;
      const g = dayGroup(mode, new Date(`${iso}T00:00:00`).getDay());
      for (const kind of ["당직", "숙직"]) {
        const key = `${iso}|${kind}`;
        const found = existing.get(key);
        if (found) { rows.push({ iso, kind, name: nameOfAny(found.profileId), isNew: false }); continue; }
        const auto = next(g);
        const ov = manualOverrides[key];
        const person = ov !== undefined ? (ov ? { name: nameOfAny(ov) } : { name: null }) : auto;
        rows.push({ iso, kind, name: person?.name ?? null, isNew: true, isManual: ov !== undefined });
      }
      if (mode === "주4일") {
        const key = `${iso}|정상근무`;
        const found = existing.get(key);
        if (found) {
          rows.push({ iso, kind: "정상근무", name: nameOfAny(found.profileId), isNew: false });
        } else if (g === "금요일") {
          const auto = next(g);
          const ov = manualOverrides[key];
          const person = ov !== undefined ? (ov ? { name: nameOfAny(ov) } : { name: null }) : auto;
          rows.push({ iso, kind: "정상근무", name: person?.name ?? null, isNew: true, isManual: ov !== undefined });
        }
      }
    }
    return rows;
  }

  const sorted = engineers.slice().sort((a, b) => (a.duty_order ?? 999) - (b.duty_order ?? 999));
  const inMode = (mode) => sorted.filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode)).length;
  const rosterOf = (mode) => sorted.filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode));
  const count5 = inMode("주5일");
  const count4 = inMode("주4일");

  // 순번표(engineers·duty_order·duty_modes)나 수동지정이 바뀌거나 달·근무제를 옮기면 다시 계산한다.
  useEffect(() => {
    let alive = true;
    setCalLoading(true);
    simulate(genYm, genMode, rosterOf(genMode)).then((rows) => {
      if (alive) { setCalRows(rows); setCalLoading(false); }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genYm, genMode, data.profiles, schedules, manualOverrides]);

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

  // 근무표 생성 — 근무제 선택 → 그 근무제 순번표(카드를 누르면 포함/제외) → 배정 순서 →
  // 실시간 미리보기 캘린더(칸을 눌러 수동 지정 가능) → 배정 / 회수, 전부 한 화면에서 이어진다.
  const [gy, gm] = genYm.split("-").map(Number);
  const genRoster = rosterOf(genMode);
  const daysInGenMonth = new Date(gy, gm, 0).getDate();
  const genMonthStartDow = new Date(gy, gm - 1, 1).getDay();

  const engineerPickerList = data.profiles.filter((p) => p.role === "engineer" && p.is_active !== false);

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

      <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
        {genMode === "주5일"
          ? "평일(월~금)과 주말이 서로 다른 순번으로 돕니다."
          : "평일(월~목)·금요일(숙직·당직·정상근무)·주말이 각각 다른 순번으로 돕니다."}
      </p>

      {/* 순번표 — 선택된 근무제 전용. 카드를 누르면 포함/제외, 숫자칸은 순번(따로 클릭해도 카드는 안 바뀐다). */}
      <div className="border border-slate-100 rounded-lg p-3 mb-3">
        <p className="text-[11px] font-bold text-slate-500 mb-2">{genMode} 순번표</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {sorted.map((p) => {
            const included = (p.duty_modes ?? []).includes(genMode);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleMode(p, genMode, !included)}
                className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 text-left ${
                  included ? "border-blue-200 bg-blue-50/40" : "border-slate-100 bg-slate-50"
                }`}
              >
                <div className="w-11 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <input className={`${inputCls} text-center`} inputMode="numeric" placeholder="—"
                    defaultValue={p.duty_order ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); if (v !== String(p.duty_order ?? "")) saveOrder(p, v); }} />
                </div>
                <span className={`text-sm font-bold truncate flex-1 ${included ? "text-blue-800" : "text-slate-500"}`}>{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {genRoster.length === 0 && (
        <p className="text-[11px] text-red-500 mb-3">{genMode} 대상자가 없습니다. 위 순번표에서 카드를 눌러 포함시키고 순번을 지정하세요.</p>
      )}

      {/* 실시간 미리보기 캘린더 — 위 순번표를 고치면 버튼 없이 바로 다시 그려진다. 새로 채워질 칸은 눌러서 수동 지정 가능. */}
      <div className="mb-3">
        <p className="text-[11px] font-bold text-slate-500 mb-1.5">반영 미리보기 (실시간) · 칸을 누르면 수동으로 바꿀 수 있습니다</p>
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
                      r.isNew ? (
                        <button
                          key={r.kind}
                          type="button"
                          onClick={() => setPickerTarget({ iso: r.iso, kind: r.kind })}
                          className={`w-full text-left text-[9px] leading-tight rounded px-0.5 truncate font-semibold ${
                            r.name == null ? "text-slate-300" : KIND_TEXT[r.kind]
                          } ${r.isManual ? "bg-amber-100" : "bg-blue-100"}`}
                        >
                          {r.name ?? "-"}
                        </button>
                      ) : (
                        <p key={r.kind} className={`text-[9px] leading-tight rounded px-0.5 truncate font-semibold ${r.name == null ? "text-slate-300" : KIND_TEXT[r.kind]}`}>
                          {r.name ?? "-"}
                        </p>
                      )
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
          <span className="flex items-center gap-1 font-semibold"><span className="w-2.5 h-2.5 rounded bg-blue-100" /> 자동 배정</span>
          <span className="flex items-center gap-1 font-semibold ml-auto"><span className="w-2.5 h-2.5 rounded bg-amber-100" /> 수동 지정</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={generating || genRoster.length === 0}
          className="flex-1 bg-blue-700 text-white text-sm font-bold py-2.5 rounded-xl disabled:bg-slate-200"
        >
          {generating ? "배정 중…" : `${genMode} 기준으로 배정`}
        </button>
        <button
          onClick={() => retract(genYm)}
          disabled={retracting}
          className="text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 disabled:opacity-50"
        >
          {retracting ? "회수 중…" : "이 달 회수"}
        </button>
      </div>

      {pickerTarget && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-end" onClick={() => setPickerTarget(null)}>
          <div className="bg-white w-full rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-extrabold text-slate-800 mb-3">
              {pickerTarget.iso.slice(5).replace("-", "/")} {pickerTarget.kind} 수동 지정
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setManualOverrides((prev) => { const n = { ...prev }; delete n[`${pickerTarget.iso}|${pickerTarget.kind}`]; return n; });
                  setPickerTarget(null);
                }}
                className="py-3 rounded-xl text-sm font-bold border border-slate-200 text-slate-500 bg-white"
              >
                자동으로
              </button>
              {engineerPickerList.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setManualOverrides((prev) => ({ ...prev, [`${pickerTarget.iso}|${pickerTarget.kind}`]: e.id }));
                    setPickerTarget(null);
                  }}
                  className="py-3 rounded-xl text-sm font-bold border text-slate-600 border-slate-200 bg-white active:bg-slate-50"
                >
                  {e.name}
                </button>
              ))}
              <button
                onClick={() => {
                  setManualOverrides((prev) => ({ ...prev, [`${pickerTarget.iso}|${pickerTarget.kind}`]: null }));
                  setPickerTarget(null);
                }}
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

  return (
    <AuthContext.Provider value={{ name: "관리자", role: "admin", selfId: null, engineers, engineerNames: engineers.map((e) => e.name), profiles: data.profiles }}>
      <div className="max-w-3xl">
        <DutyRoster
          embedded
          schedules={schedules}
          swaps={swaps}
          onSetPerson={setPerson}
          onRequestSwap={() => {}}
          onRespondSwap={() => {}}
          belowCalendar={generateWidget}
        />
      </div>
    </AuthContext.Provider>
  );
}
