"use client";

// 콘솔 당직·숙직 근무표 — 모바일 홈탭과 같은 달력을 그대로 쓴다.
// DutyRoster는 AuthContext(role·selfId·engineers)를 보므로 여기서 관리자용 값을 넣어준다.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/app/components/context";
import { DutyRoster } from "@/app/components/DutyRoster";
import { mapDutySchedule, mapDutySwap } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";

export default function DutyAdmin({ data }) {
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
        />
      </div>
    </AuthContext.Provider>
  );
}
