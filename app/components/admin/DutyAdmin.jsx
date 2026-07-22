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
import { ChevronRight, ChevronLeft, X } from "lucide-react";

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

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
    if (!roster.length) { alert(`${mode} 근무제 대상자가 없습니다. 직원 탭에서 순번과 근무제를 지정하세요.`); return; }

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

  // 실제로 DB에 쓰지 않고 generate()와 동일한 순번 로직으로 "이대로 채우면 이렇게 된다"만 계산해서
  // 보여주는 단순 미리보기 — 클릭해도 아무것도 저장되지 않는다.
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

  // 팝업이 열려 있는 동안 연월(genYm)이 바뀌면(팝업 안 화살표) 다시 계산해서 보여준다.
  useEffect(() => {
    if (!previewOpen) return;
    let alive = true;
    setPreviewLoading(true);
    simulate(genYm, genMode, rosterOf(genMode)).then((rows) => {
      if (alive) { setPreviewRows(rows); setPreviewLoading(false); }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen, genYm, genMode]);

  const sorted = engineers.slice().sort((a, b) => (a.duty_order ?? 999) - (b.duty_order ?? 999));
  const inMode = (mode) => sorted.filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode)).length;
  const rosterOf = (mode) => sorted.filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode));
  const count5 = inMode("주5일");
  const count4 = inMode("주4일");
  const noOrder = sorted.filter((e) => e.duty_order == null).length;

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

  // 배정 순번 — 순번을 넣으면 당직 대상, 비우면 제외. 근무제(5일·4일)별로 대상을 나눈다.
  // 거의 안 바뀌는 설정이라 접어둔다. summary에 flex를 주면 브라우저 기본 삼각형이
  // 사라져 눌러지는 줄 모르므로 화살표를 직접 그린다.
  // 달력 아래, "빈 칸 채우기" 버튼 바로 위에 배치한다(DutyRoster의 belowCalendar 슬롯).
  const orderAndMode = (
    <details className="group bg-white border border-slate-200 rounded-xl overflow-hidden">
      <summary className="text-xs font-extrabold text-slate-700 cursor-pointer flex items-center gap-2 p-4 hover:bg-slate-50 list-none">
        <ChevronRight size={14} className="text-slate-400 transition-transform group-open:rotate-90 shrink-0" />
        <span>당직 순번 · 근무제</span>
        <span className="ml-auto text-[11px] font-bold text-slate-400">
          주5일 <span className="text-blue-700">{count5}명</span> · 주4일 <span className="text-blue-700">{count4}명</span>
          {noOrder > 0 && <span className="text-slate-300"> · 미지정 {noOrder}명</span>}
        </span>
        <span className="text-[11px] font-bold text-blue-700 shrink-0 group-open:hidden">수정</span>
        <span className="text-[11px] font-bold text-slate-400 shrink-0 hidden group-open:inline">접기</span>
      </summary>
      <div className="px-4 pb-4">
      <p className="text-[11px] text-slate-400 mt-2 mb-3">
        순번이 있는 사람만 자동 배정 대상입니다. 근무제(5일·4일)를 눌러 편성별 대상을 나눌 수 있습니다.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {sorted.map((p) => (
          <div key={p.id} className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 ${
            p.duty_order != null ? "border-slate-200" : "border-slate-100 bg-slate-50"
          }`}>
            <div className="w-11 shrink-0">
              <input className={`${inputCls} text-center`} inputMode="numeric" placeholder="—"
                defaultValue={p.duty_order ?? ""}
                onBlur={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); if (v !== String(p.duty_order ?? "")) saveOrder(p, v); }} />
            </div>
            <span className="text-sm font-bold text-slate-700 truncate flex-1">{p.name}</span>
            {["주5일", "주4일"].map((mode) => (
              <label key={mode} className={`text-[10px] font-bold rounded px-1.5 py-1 cursor-pointer border shrink-0 ${
                (p.duty_modes ?? []).includes(mode) ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-300 border-slate-100"
              }`}>
                <input type="checkbox" className="hidden" checked={(p.duty_modes ?? []).includes(mode)}
                  onChange={(e) => toggleMode(p, mode, e.target.checked)} />
                {mode.replace("주", "").replace("일", "")}일
              </label>
            ))}
          </div>
        ))}
      </div>
      <button
        onClick={() => setPreviewOpen(true)}
        className="w-full mt-3 text-sm font-bold py-2.5 rounded-xl bg-slate-100 text-slate-600"
      >
        반영된 캘린더 미리보기
      </button>
      </div>
    </details>
  );

  // 근무표 생성(빈 칸 채우기) — 예전엔 달력 아래 별도 버튼이 열던 시트였는데, 순번·근무제
  // 바로 아래로 옮겨 한 곳에서 순번 지정 → 근무제 선택 → 생성까지 이어지게 한다.
  const [gy, gm] = genYm.split("-").map(Number);
  const genRoster = rosterOf(genMode);
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
            <span className="block text-[10px] font-semibold opacity-70">{rosterOf(mode).length}명</span>
          </button>
        ))}
      </div>

      {genMode === "주4일" && (
        <p className="text-[11px] text-indigo-500 font-semibold bg-indigo-50 rounded-lg px-3 py-2 mb-3">
          금요일마다 정상근무 칸이 함께 만들어집니다 (담당자는 달력에서 직접 지정).
        </p>
      )}

      <div className="border border-slate-100 rounded-lg p-3 mb-3">
        <p className="text-[11px] font-bold text-slate-500 mb-1.5">배정 순서</p>
        {genRoster.length === 0 ? (
          <p className="text-[11px] text-red-500">{genMode} 대상자가 없습니다. 위 「당직 순번 · 근무제」에서 순번과 근무제를 지정하세요.</p>
        ) : (
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {genRoster.map((e) => `${e.name}(${e.duty_order})`).join(" → ")}
          </p>
        )}
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
    <>
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
          belowCalendar={<>{orderAndMode}{generateWidget}</>}
          showFillButton={false}
        />
      </div>
    </AuthContext.Provider>

    {previewOpen && (
      <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-6" onClick={() => setPreviewOpen(false)}>
        <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-2xl p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-extrabold text-slate-800">{genMode} 캘린더 미리보기</p>
              <p className="text-[11px] text-slate-400 mt-0.5">현재 순번대로 빈 칸을 채우면 어떤 모습이 되는지 보여주는 미리보기입니다(저장되지 않음).</p>
            </div>
            <button onClick={() => setPreviewOpen(false)} className="p-1 text-slate-400 shrink-0" aria-label="닫기"><X size={16} /></button>
          </div>

          <div className="flex items-center justify-center gap-2 mb-3">
            <button onClick={() => shiftGenMonth(-1)} className="p-1 text-slate-400" aria-label="이전 달"><ChevronLeft size={18} /></button>
            <span className="text-sm font-extrabold text-slate-700 w-24 text-center">{gy}년 {gm}월</span>
            <button onClick={() => shiftGenMonth(1)} className="p-1 text-slate-400" aria-label="다음 달"><ChevronRight size={18} /></button>
          </div>

          {previewLoading ? (
            <p className="text-xs text-slate-400 text-center py-10">계산 중…</p>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-3">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {DOW.map((d, i) => (
                  <p key={d} className={`text-center text-[10px] font-bold py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>{d}</p>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: new Date(gy, gm - 1, 1).getDay() }, (_, i) => (
                  <div key={`pad${i}`} className="border-b border-r border-slate-100 min-h-[64px]" />
                ))}
                {Array.from({ length: new Date(gy, gm, 0).getDate() }, (_, i) => i + 1).map((d) => {
                  const iso = `${genYm}-${String(d).padStart(2, "0")}`;
                  const dow = (new Date(gy, gm - 1, 1).getDay() + d - 1) % 7;
                  const rows = (previewRows ?? []).filter((r) => r.iso === iso);
                  const hasNew = rows.some((r) => r.isNew && r.name != null);
                  return (
                    <div key={d} className={`border-b border-r border-slate-100 min-h-[64px] p-1 ${hasNew ? "bg-blue-50/40" : ""}`}>
                      <p className={`text-[10px] font-bold text-right pr-0.5 ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-400"}`}>{d}</p>
                      {rows.map((r) => (
                        <p
                          key={r.kind}
                          className={`text-[9.5px] leading-tight rounded px-0.5 truncate font-semibold ${
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
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500 mb-4">
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

          <button onClick={() => setPreviewOpen(false)} className="w-full text-sm font-bold text-slate-500 bg-slate-100 rounded-xl py-2.5">
            닫기
          </button>
        </div>
      </div>
    )}
    </>
  );
}
