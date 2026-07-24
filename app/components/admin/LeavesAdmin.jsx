"use client";

// 연차관리 — 입사일 기준 자동 계산(lib/leave.js)에서 사용 내역(leaves)을 빼 잔여를 낸다.
// 부여 일수 직접 입력은 뺐다: 특별휴가·포상휴가·무급휴가처럼 성격이 다른 것을
// 연차 총량에 섞어 넣으면 무엇이 왜 늘었는지 알 수 없어진다.
// 그런 건 나중에 휴가 신청 쪽에서 유급/무급·종류로 나눠 다루는 게 맞다.
// (profiles.annual_leave_days 컬럼은 남아 있으나 현재 미사용)
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AdminTable, inputCls, StatusBadge, DateTextInput } from "@/app/components/admin/adminShared";
import { TODAY_STR } from "@/lib/constants";
import { annualLeaveDays, yearsOfService } from "@/lib/leave";
import { shortDate } from "@/lib/utils";

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

  // 잔여는 '승인'된 것만 뺀다 — 신청 중인 건을 미리 빼면 반려됐을 때 숫자가 틀어진다
  const st = (l) => l.status ?? "승인";
  const usedBy = (id) => leaves.filter((l) => l.profile_id === id && st(l) === "승인").reduce((n, l) => n + Number(l.days), 0);
  const pending = leaves.filter((l) => st(l) === "신청").sort((a, b) => a.start_date.localeCompare(b.start_date));
  const cancelPending = leaves.filter((l) => l.cancel_requested).sort((a, b) => a.start_date.localeCompare(b.start_date));

  async function decide(l, decision) {
    const reason = decision === "반려" ? prompt(`${nameOf(l.profile_id)}님의 ${shortDate(l.start_date)} ${l.kind} 신청을 반려합니다.\n사유 (선택):`) : null;
    if (decision === "반려" && reason === null) return;
    const patch = { status: decision, decided_at: new Date().toISOString(), reject_reason: reason?.trim() || null };
    const { error } = await supabase.from("leaves").update(patch).eq("id", l.id);
    if (error) { alert("처리 실패: " + error.message); return; }
    setLeaves((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...patch } : x)));
  }

  // 취소 요청 승인 = 실제 취소 확정(status: 취소). 반려 = 요청만 해제, 승인 상태 유지.
  async function decideCancel(l, decision) {
    const patch = decision === "승인"
      ? { status: "취소", cancel_requested: false, decided_at: new Date().toISOString() }
      : { cancel_requested: false, cancel_reason: null };
    const { error } = await supabase.from("leaves").update(patch).eq("id", l.id);
    if (error) { alert("처리 실패: " + error.message); return; }
    setLeaves((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...patch } : x)));
  }
  const nameOf = (id) => staff.find((p) => p.id === id)?.name ?? "(퇴사)";
  const autoDays = form.kind === "반차" ? 0.5 : Math.max(1, daysBetween(form.start, form.end));

  async function add() {
    if (!form.profileId) return;
    setBusy(true);
    const { data: rows, error } = await supabase.from("leaves").insert({
      profile_id: form.profileId, start_date: form.start, end_date: form.end,
      kind: form.kind, days: autoDays, note: form.note || null, status: "승인",
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


  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setYear(year - 1)} className="text-sm font-bold text-slate-400 px-2">‹</button>
        <p className="text-sm font-extrabold text-slate-700">{year}년</p>
        <button onClick={() => setYear(year + 1)} className="text-sm font-bold text-slate-400 px-2">›</button>
      </div>

      {/* 사용 등록 */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 grid grid-cols-1 sm:flex sm:items-end gap-2 sm:flex-wrap">
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
          <DateTextInput key={form.start} value={form.start}
            onChange={(v) => setForm({ ...form, start: v, end: v > form.end ? v : form.end })} />
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500 mb-1">종료일</p>
          <DateTextInput key={form.end} value={form.end} onChange={(v) => setForm({ ...form, end: v })} />
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

      {/* 승인 대기 — 기사가 마이페이지에서 신청한 건 */}
      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-extrabold text-amber-800 mb-2.5">승인 대기 {pending.length}건</p>
          <div className="space-y-2">
            {pending.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-600 min-w-0">
                  <b className="text-slate-800">{nameOf(l.profile_id)}</b> · {l.kind} {l.days}일
                  <br />
                  <span className="text-[11px] text-slate-400">
                    {shortDate(l.start_date)}{l.end_date !== l.start_date && ` ~ ${shortDate(l.end_date)}`}
                    {l.note && ` · ${l.note}`}
                  </span>
                </p>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => decide(l, "승인")} className="text-xs font-bold text-white bg-blue-700 rounded-lg px-3 py-1.5">승인</button>
                  <button onClick={() => decide(l, "반려")} className="text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5">반려</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 취소 요청 — 이미 승인된 연차를 기사가 취소해달라고 요청한 건 */}
      {cancelPending.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-extrabold text-red-800 mb-2.5">취소 요청 {cancelPending.length}건</p>
          <div className="space-y-2">
            {cancelPending.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-600 min-w-0">
                  <b className="text-slate-800">{nameOf(l.profile_id)}</b> · {l.kind} {l.days}일
                  <br />
                  <span className="text-[11px] text-slate-400">
                    {shortDate(l.start_date)}{l.end_date !== l.start_date && ` ~ ${shortDate(l.end_date)}`}
                    {l.cancel_reason && ` · 사유: ${l.cancel_reason}`}
                  </span>
                </p>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => decideCancel(l, "승인")} className="text-xs font-bold text-white bg-red-600 rounded-lg px-3 py-1.5">취소 승인</button>
                  <button onClick={() => decideCancel(l, "반려")} className="text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5">반려</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 사람별 잔여 */}
      <h2 className="text-sm font-extrabold text-slate-700 mb-1">{year}년 연차 현황</h2>
      <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
        연차 일수는 입사일에서 자동 계산됩니다 (1년 미만 개근 개월당 1일·최대 11일 / 1년 이상 15일 / 3년부터 2년마다 +1일·상한 25일).
      </p>
      <div className="mb-6">
        <AdminTable head={["이름", "입사일 · 근속", "연차", "사용", "잔여", ""]} minWidth="44rem">
          {staff.map((p) => {
            const used = usedBy(p.id);
            // 해당 연도 말일 기준 — 그 해에 발생하는 연차를 보여준다
            const asOf = `${year}-12-31`;
            const auto = annualLeaveDays(p.hire_date, asOf);
            const grant = auto;                       // 입사일 기준 자동값만 쓴다
            const left = grant == null ? null : grant - used;
            return (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{p.name}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 text-[11px]">
                  {p.hire_date
                    ? <>{shortDate(p.hire_date)} · <b className="text-slate-600">{Math.max(0, yearsOfService(p.hire_date, asOf))}년차</b></>
                    : <span className="text-red-400">입사일 미입력</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap font-bold text-slate-700">
                  {grant == null ? <span className="text-slate-300 font-normal">-</span> : `${grant}일`}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{used}일</td>
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
      <AdminTable head={["이름", "구분", "기간", "일수", "상태", "비고", ""]}>
        {leaves.length === 0 ? (
          <tr><td colSpan={7} className="px-5 py-8 text-center text-xs text-slate-400">{year}년 사용 내역이 없습니다</td></tr>
        ) : leaves.map((l) => (
          <tr key={l.id} className="border-b border-slate-50">
            <td className="pl-5 pr-3 py-2.5 font-bold whitespace-nowrap">{nameOf(l.profile_id)}</td>
            <td className="px-3 py-2.5">{l.kind}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">
              {shortDate(l.start_date)}{l.end_date !== l.start_date && ` ~ ${shortDate(l.end_date)}`}
            </td>
            <td className="px-3 py-2.5">{l.days}일</td>
            <td className="px-3 py-2.5">
              <StatusBadge tone={st(l) === "승인" ? "green" : st(l) === "신청" ? "amber" : "slate"}>{st(l)}</StatusBadge>
              {l.cancel_requested && <span className="ml-1.5 text-[10px] font-bold text-red-500 whitespace-nowrap">취소요청중</span>}
            </td>
            <td className="px-3 py-2.5 text-slate-500">{l.note ?? l.reject_reason ?? "-"}</td>
            <td className="px-3 py-2.5 text-right pr-4">
              <button onClick={() => remove(l)} className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">삭제</button>
            </td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
