"use client";

// 연차관리 — 사람별 부여 일수(profiles.annual_leave_days)에서 사용 내역(leaves)을 빼 잔여를 계산한다.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AdminTable, inputCls, StatusBadge } from "@/app/components/admin/adminShared";
import { TODAY_STR } from "@/lib/constants";
import { annualLeaveDays, yearsOfService } from "@/lib/leave";

const KINDS = ["연차", "반차", "병가", "공가", "기타"];
// 반차는 0.5일. 그 외는 시작~종료 일수 그대로 (주말 제외는 회사 규정이 갈려 자동 계산하지 않는다)
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000) + 1;

export default function LeavesAdmin({ data, setData }) {
  const { profiles } = data;
  const staff = profiles.filter((p) => p.is_active !== false && p.role !== "system");
  const [leaves, setLeaves] = useState([]);
  const [year, setYear] = useState(Number(TODAY_STR.slice(0, 4)));
  const [form, setForm] = useState({ profileId: "", start: TODAY_STR, end: TODAY_STR, kind: "연차", note: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("leaves").select("*").gte("start_date", `${year}-01-01`).lte("start_date", `${year}-12-31`)
      .order("start_date", { ascending: false })
      .then(({ data: rows }) => setLeaves(rows ?? []));
  }, [year]);

  const usedBy = (id) => leaves.filter((l) => l.profile_id === id).reduce((n, l) => n + Number(l.days), 0);
  const nameOf = (id) => staff.find((p) => p.id === id)?.name ?? "(퇴사)";
  const autoDays = form.kind === "반차" ? 0.5 : Math.max(1, daysBetween(form.start, form.end));

  async function add() {
    if (!form.profileId) return;
    setBusy(true);
    const { data: rows, error } = await supabase.from("leaves").insert({
      profile_id: form.profileId, start_date: form.start, end_date: form.end,
      kind: form.kind, days: autoDays, note: form.note || null,
    }).select();
    setBusy(false);
    if (error) { alert("등록 실패: " + error.message); return; }
    setLeaves((prev) => [rows[0], ...prev]);
    setForm({ ...form, note: "" });
  }

  async function remove(l) {
    if (!confirm(`${nameOf(l.profile_id)} · ${l.start_date} ${l.kind} 기록을 삭제할까요?`)) return;
    await supabase.from("leaves").delete().eq("id", l.id);
    setLeaves((prev) => prev.filter((x) => x.id !== l.id));
  }

  async function saveGrant(p, value) {
    const days = value === "" ? null : Number(value);
    await supabase.from("profiles").update({ annual_leave_days: days }).eq("id", p.id);
    setData((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === p.id ? { ...x, annual_leave_days: days } : x)) }));
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setYear(year - 1)} className="text-sm font-bold text-slate-400 px-2">‹</button>
        <p className="text-sm font-extrabold text-slate-700">{year}년</p>
        <button onClick={() => setYear(year + 1)} className="text-sm font-bold text-slate-400 px-2">›</button>
      </div>

      {/* 사용 등록 */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 flex items-end gap-2 flex-wrap">
        <div>
          <p className="text-[11px] font-bold text-slate-500 mb-1">직원</p>
          <select className={inputCls} value={form.profileId} onChange={(e) => setForm({ ...form, profileId: e.target.value })}>
            <option value="">선택</option>
            {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500 mb-1">구분</p>
          <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500 mb-1">시작일</p>
          <input type="date" className={inputCls} value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value, end: e.target.value > form.end ? e.target.value : form.end })} />
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500 mb-1">종료일</p>
          <input type="date" className={inputCls} value={form.end} min={form.start}
            disabled={form.kind === "반차"}
            onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <div className="w-56">
          <p className="text-[11px] font-bold text-slate-500 mb-1">비고</p>
          <input className={inputCls} placeholder="사유 등" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <button onClick={add} disabled={!form.profileId || busy}
          className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-200 rounded-lg px-4 py-2">
          {busy ? "등록 중…" : `${autoDays}일 등록`}
        </button>
      </div>

      {/* 사람별 잔여 */}
      <h2 className="text-sm font-extrabold text-slate-700 mb-1">{year}년 연차 현황</h2>
      <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
        입사일 기준 자동 계산 (1년 미만 = 개근 개월당 1일·최대 11일 / 1년 이상 15일 / 3년부터 2년마다 +1일·상한 25일).
        출근율 미달이나 특별휴가처럼 자동으로 알 수 없는 경우만 <b>가산·조정</b>에 값을 넣어 덮어씁니다.
      </p>
      <div className="mb-6">
        <AdminTable head={["이름", "입사일", "근속", "자동 계산", "가산·조정", "부여", "사용", "잔여", ""]} minWidth="60rem">
          {staff.map((p) => {
            const used = usedBy(p.id);
            // 해당 연도 말일 기준으로 계산 — 그 해에 발생하는 연차를 보여준다
            const asOf = `${year}-12-31`;
            const auto = annualLeaveDays(p.hire_date, asOf);
            const manual = p.annual_leave_days;
            const grant = manual ?? auto;               // 수동값이 있으면 그것이 최종 부여 일수
            const left = grant == null ? null : grant - used;
            return (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{p.name}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{p.hire_date ?? <span className="text-red-400">미입력</span>}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">
                  {p.hire_date ? `${Math.max(0, yearsOfService(p.hire_date, asOf))}년` : "-"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {auto == null ? <span className="text-slate-300">-</span> : <span className="font-bold text-slate-600">{auto}일</span>}
                </td>
                <td className="px-3 py-2.5 w-28">
                  <input className={inputCls} inputMode="decimal" placeholder="자동값 사용"
                    defaultValue={manual ?? ""}
                    onBlur={(e) => { if (e.target.value !== String(manual ?? "")) saveGrant(p, e.target.value.replace(/[^0-9.]/g, "")); }} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap font-bold">
                  {grant == null ? <span className="text-slate-300">-</span> : `${grant}일`}
                  {manual != null && <span className="ml-1 text-[10px] font-bold text-amber-600">수동</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{used}일</td>
                <td className="px-3 py-2.5">
                  {left == null ? <span className="text-slate-300">-</span>
                    : <StatusBadge tone={left <= 0 ? "slate" : left <= 3 ? "amber" : "green"}>{left}일</StatusBadge>}
                </td>
                <td />
              </tr>
            );
          })}
        </AdminTable>
      </div>

      {/* 사용 내역 */}
      <h2 className="text-sm font-extrabold text-slate-700 mb-2">사용 내역 {leaves.length}건</h2>
      <AdminTable head={["이름", "구분", "기간", "일수", "비고", ""]}>
        {leaves.length === 0 ? (
          <tr><td colSpan={6} className="px-5 py-8 text-center text-xs text-slate-400">{year}년 사용 내역이 없습니다</td></tr>
        ) : leaves.map((l) => (
          <tr key={l.id} className="border-b border-slate-50">
            <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{nameOf(l.profile_id)}</td>
            <td className="px-3 py-2.5">{l.kind}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">
              {l.start_date}{l.end_date !== l.start_date && ` ~ ${l.end_date}`}
            </td>
            <td className="px-3 py-2.5">{l.days}일</td>
            <td className="px-3 py-2.5 text-slate-500">{l.note ?? "-"}</td>
            <td className="px-3 py-2.5 text-right pr-4">
              <button onClick={() => remove(l)} className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">삭제</button>
            </td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
