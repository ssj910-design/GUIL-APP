"use client";

// 자체점검 출석부 (v2 신설) — 법정 월 1회 점검을 "출석부" 방식으로 관리.
// 매월 1일 generate_self_checks(ym) 호출로 활성 호기 전체에 줄이 생기고,
// 기사가 완료 처리하면 남은 줄이 곧 누락 후보다. (DESIGN-v2 §7-3)
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { mapSelfCheck } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";
import { locOf, personOf, StatusBadge, AdminTable } from "@/app/components/admin/adminShared";

export default function SelfChecksAdmin({ data, setData }) {
  const { selfChecks } = data;
  const [ym, setYm] = useState(TODAY_STR.slice(0, 7));
  const [busy, setBusy] = useState(false);

  const rows = selfChecks
    .filter((c) => c.ym === ym)
    .map((c) => ({ ...c, loc: locOf(data, c.unitId) }))
    .sort((a, b) => a.loc.localeCompare(b.loc, "ko"));
  const done = rows.filter((c) => c.status === "완료");

  async function generate() {
    setBusy(true);
    const { error } = await supabase.rpc("generate_self_checks", { p_ym: ym });
    if (error) { alert("생성 실패: " + error.message); setBusy(false); return; }
    const { data: fresh } = await supabase.from("self_checks").select("*");
    setData((prev) => ({ ...prev, selfChecks: (fresh ?? []).map(mapSelfCheck) }));
    setBusy(false);
  }

  async function complete(c) {
    await supabase.from("self_checks").update({ status: "완료", done_date: TODAY_STR }).eq("id", c.id);
    setData((prev) => ({
      ...prev,
      selfChecks: prev.selfChecks.map((x) => (x.id === c.id ? { ...x, status: "완료", doneDate: TODAY_STR } : x)),
    }));
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-xl font-extrabold">자체점검 출석부</h1>
          <p className="text-xs text-slate-500 mt-0.5">법정 월 1회 · 호기 단위 · 출석부에 남은 줄 = 누락 후보</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white" value={ym} onChange={(e) => setYm(e.target.value)} />
          {rows.length === 0 && (
            <button onClick={generate} disabled={busy} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2">
              {busy ? "생성 중..." : `${ym} 출석부 생성`}
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-bold">{ym} 진행률</span>
            <span className="text-slate-500">완료 {done.length} / {rows.length} · 공단 제출 {rows.filter((c) => c.govResultCode === "000").length}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${rows.length ? (done.length / rows.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center text-sm text-slate-400">
          {ym} 출석부가 아직 없습니다 — 위 버튼으로 생성하세요 (활성 호기 전체에 1줄씩)
        </div>
      ) : (
        <AdminTable head={["현장 · 호기", "담당 기사", "예정일", "완료일", "상태", "공단 제출", ""]}>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{c.loc}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, c.assigneeId)}</td>
              <td className="px-3 py-2.5 text-slate-500">{c.plannedDate ?? "-"}</td>
              <td className="px-3 py-2.5 text-slate-500">{c.doneDate ?? "-"}</td>
              <td className="px-3 py-2.5">
                <StatusBadge tone={c.status === "완료" ? "green" : c.status === "누락" ? "red" : "amber"}>{c.status}</StatusBadge>
              </td>
              <td className="px-3 py-2.5" title={c.govResultMsg ?? ""}>
                {/* 모바일 정기점검 탭에서 제출 — 여기선 결과만 모니터링 (000=성공, CheckupTab과 동일 규약) */}
                {c.govResultCode === "000" ? (
                  <StatusBadge tone="green">제출완료</StatusBadge>
                ) : c.govResultCode ? (
                  <StatusBadge tone="red">실패 {c.govResultCode}</StatusBadge>
                ) : (
                  <StatusBadge tone="slate">미제출</StatusBadge>
                )}
              </td>
              <td className="px-3 py-2.5 text-right pr-4">
                {c.status !== "완료" && (
                  <button onClick={() => complete(c)} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5">
                    완료 처리
                  </button>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      <p className="text-[10px] text-slate-400 mt-2">
        * 기사용 모바일 점검 화면(사진·특이사항 입력)은 다음 단계. 매월 1일 자동 생성은 pg_cron 설정으로 가능 (supabase/migrations/004 참고).
      </p>
    </div>
  );
}
