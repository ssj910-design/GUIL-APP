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
import { ChevronRight } from "lucide-react";

export default function DutyAdmin({ data, setData }) {
  const engineers = data.profiles.filter((p) => p.role === "engineer" && p.is_active !== false);
  const [schedules, setSchedules] = useState([]);
  const [swaps, setSwaps] = useState([]);

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

  const sorted = engineers.slice().sort((a, b) => (a.duty_order ?? 999) - (b.duty_order ?? 999));
  const inMode = (mode) => sorted.filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode)).length;
  const count5 = inMode("주5일");
  const count4 = inMode("주4일");
  const noOrder = sorted.filter((e) => e.duty_order == null).length;

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
      </div>
    </details>
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
          belowCalendar={orderAndMode}
        />
      </div>
    </AuthContext.Provider>
  );
}
