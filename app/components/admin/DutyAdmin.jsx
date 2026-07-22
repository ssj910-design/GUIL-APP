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

export default function DutyAdmin({ data, setData }) {
  const engineers = data.profiles.filter((p) => p.role === "engineer" && p.is_active !== false);
  const [schedules, setSchedules] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [genYm, setGenYm] = useState(TODAY_STR.slice(0, 7)); // 근무표 생성 대상 월 (YYYY-MM)
  const [genMode, setGenMode] = useState("주5일");
  const [generating, setGenerating] = useState(false);

  // 순번·근무제 수정 — 바로 저장하지 않고 임시로만 들고 있다가, 미리보기 팝업에서
  // "반영"을 눌러야 실제로 저장된다(오터치로 순번이 바로 바뀌는 걸 막기 위함).
  const [draftOrders, setDraftOrders] = useState({}); // profileId -> "" | 숫자문자열
  const [draftModes, setDraftModes] = useState({}); // profileId -> 근무제 배열
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);

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

  async function generate(ym, mode = "주5일", rosterOverride = null) {
    const roster = rosterOverride ?? engineers
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

  // 실제로 DB에 쓰지 않고 generate()와 동일한 순번 로직으로 "적용하면 이렇게 된다"만 계산한다.
  // 이미 배정된 칸은 그대로, 빈 칸만 새 순번으로 채워서 보여준다(실제 생성과 동일한 규칙).
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

  async function openPreview() {
    setPreviewOpen(true);
    setPreviewLoading(true);
    const roster = rosterOf(genMode);
    const rows = await simulate(genYm, genMode, roster);
    setPreviewRows(rows);
    setPreviewLoading(false);
  }

  // 미리보기 팝업의 "반영" — 순번·근무제 변경사항을 먼저 저장한 뒤, 그 순번으로 빈 칸을 채운다.
  async function applyChanges() {
    if (!confirm("반영하시겠습니까?")) return;
    setApplying(true);
    await Promise.all([
      ...Object.entries(draftOrders).map(([pid, v]) =>
        supabase.from("profiles").update({ duty_order: v === "" ? null : Number(v) }).eq("id", pid)),
      ...Object.entries(draftModes).map(([pid, modes]) =>
        supabase.from("profiles").update({ duty_modes: modes }).eq("id", pid)),
    ]);
    setData((prev) => ({
      ...prev,
      profiles: prev.profiles.map((x) => {
        let next = x;
        if (draftOrders[x.id] !== undefined) next = { ...next, duty_order: draftOrders[x.id] === "" ? null : Number(draftOrders[x.id]) };
        if (draftModes[x.id] !== undefined) next = { ...next, duty_modes: draftModes[x.id] };
        return next;
      }),
    }));
    await generate(genYm, genMode, rosterOf(genMode));
    setDraftOrders({});
    setDraftModes({});
    setApplying(false);
    setPreviewOpen(false);
    setPreviewRows(null);
  }

  // 순번·근무제는 draft에 먼저 담고, 화면 표시는 draft 우선(없으면 실제값)으로 본다.
  const orderOf = (p) => (draftOrders[p.id] !== undefined ? draftOrders[p.id] : String(p.duty_order ?? ""));
  const orderNumOf = (p) => { const v = orderOf(p); return v === "" ? null : Number(v); };
  const modesOf = (p) => (draftModes[p.id] !== undefined ? draftModes[p.id] : (p.duty_modes ?? []));
  const isDirty = Object.keys(draftOrders).length > 0 || Object.keys(draftModes).length > 0;

  const sorted = engineers.slice().sort((a, b) => (orderNumOf(a) ?? 999) - (orderNumOf(b) ?? 999));
  const inMode = (mode) => sorted.filter((e) => orderNumOf(e) != null && modesOf(e).includes(mode)).length;
  const rosterOf = (mode) => sorted.filter((e) => orderNumOf(e) != null && modesOf(e).includes(mode));
  const count5 = inMode("주5일");
  const count4 = inMode("주4일");
  const noOrder = sorted.filter((e) => orderNumOf(e) == null).length;

  function shiftGenMonth(delta) {
    const [gy, gm] = genYm.split("-").map(Number);
    const d = new Date(gy, gm - 1 + delta, 1);
    setGenYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  async function handleGenerate() {
    setGenerating(true);
    await generate(genYm, genMode, rosterOf(genMode));
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
        수정 후 「미리보기」에서 확인하고 반영해야 실제로 저장됩니다.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {sorted.map((p) => (
          <div key={p.id} className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 ${
            orderNumOf(p) != null ? "border-slate-200" : "border-slate-100 bg-slate-50"
          }`}>
            <div className="w-11 shrink-0">
              <input className={`${inputCls} text-center`} inputMode="numeric" placeholder="—"
                value={orderOf(p)}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setDraftOrders((d) => ({ ...d, [p.id]: v })); }} />
            </div>
            <span className="text-sm font-bold text-slate-700 truncate flex-1">{p.name}</span>
            {["주5일", "주4일"].map((mode) => (
              <label key={mode} className={`text-[10px] font-bold rounded px-1.5 py-1 cursor-pointer border shrink-0 ${
                modesOf(p).includes(mode) ? "bg-blue-50 text-blue-700 border-blue-200" : "text-slate-300 border-slate-100"
              }`}>
                <input type="checkbox" className="hidden" checked={modesOf(p).includes(mode)}
                  onChange={(e) => {
                    const cur = new Set(modesOf(p));
                    e.target.checked ? cur.add(mode) : cur.delete(mode);
                    setDraftModes((d) => ({ ...d, [p.id]: [...cur] }));
                  }} />
                {mode.replace("주", "").replace("일", "")}일
              </label>
            ))}
          </div>
        ))}
      </div>
      <button
        onClick={openPreview}
        className={`w-full mt-3 text-sm font-bold py-2.5 rounded-xl ${
          isDirty ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"
        }`}
      >
        반영된 캘린더 미리보기{isDirty ? " (변경사항 있음)" : ""}
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
      {isDirty && (
        <p className="text-[11px] font-bold text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">
          순번·근무제에 아직 저장하지 않은 변경사항이 있습니다 — 위 「미리보기」에서 반영해야 순번이 실제로 저장됩니다.
        </p>
      )}

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
            {genRoster.map((e) => `${e.name}(${orderOf(e)})`).join(" → ")}
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
        <div className="bg-white w-full max-w-lg max-h-[80vh] rounded-2xl p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-extrabold text-slate-800">{gy}년 {gm}월 · {genMode} 반영 미리보기</p>
              <p className="text-[11px] text-slate-400 mt-0.5">이미 배정된 칸(회색)은 그대로, 새로 채워질 칸(파란 배지)만 새 순번으로 계산했습니다.</p>
            </div>
            <button onClick={() => setPreviewOpen(false)} className="p-1 text-slate-400 shrink-0" aria-label="닫기"><X size={16} /></button>
          </div>

          {previewLoading ? (
            <p className="text-xs text-slate-400 text-center py-10">계산 중…</p>
          ) : (
            <div className="space-y-1.5 mb-4">
              {Object.entries(
                (previewRows ?? []).reduce((acc, r) => {
                  (acc[r.iso] ??= []).push(r);
                  return acc;
                }, {})
              ).map(([iso, rows]) => (
                <div key={iso} className="flex items-center justify-between gap-2 border-b border-slate-50 pb-1.5 last:border-0">
                  <span className="text-[11px] font-bold text-slate-500 w-14 shrink-0">{iso.slice(5).replace("-", "/")}</span>
                  <div className="flex flex-wrap gap-1.5 justify-end flex-1">
                    {rows.map((r) => (
                      <span
                        key={r.kind}
                        className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                          r.name == null ? "bg-slate-50 text-slate-300"
                            : r.isNew ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {r.kind} {r.name ?? "미지정"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 text-[11px] text-slate-400 mb-4">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-100 border border-blue-300" /> 새로 채워짐</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200" /> 기존 배정 유지</span>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setPreviewOpen(false)} className="flex-1 text-sm font-bold text-slate-500 bg-slate-100 rounded-xl py-2.5">
              닫기
            </button>
            <button
              onClick={applyChanges}
              disabled={applying || previewLoading}
              className="flex-1 text-sm font-bold text-white bg-blue-700 rounded-xl py-2.5 disabled:bg-slate-200"
            >
              {applying ? "반영 중…" : "반영"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
