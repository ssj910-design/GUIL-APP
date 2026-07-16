"use client";

// 고장 관제 — 전체 고장 테이블 + 기사 배정(듀얼라이트).
// 출동/도착/처리결과 입력은 현장 기사의 모바일 앱 몫이므로 여기서는 하지 않는다.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { locOf, personOf, StatusBadge, AdminTable, FilterPills, Modal, inputCls } from "@/app/components/admin/adminShared";
import { FailureDetailContent } from "@/app/components/admin/Dashboard";

export default function FailuresAdmin({ data, setData }) {
  const { failures, profiles, units, sites } = data;
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const engineers = profiles.filter((p) => p.role === "engineer");

  const rows = failures.filter((f) =>
    (status === "all" || f.status === status) &&
    (!search || (f.siteName ?? "").includes(search) || (f.errorCode ?? "").includes(search))
  );

  async function assign(f, name) {
    const p = profiles.find((x) => x.name === name);
    await supabase.from("failures")
      .update({ assignee: name || null, assignee_id: p?.id ?? null })
      .eq("id", f.id);
    setData((prev) => ({
      ...prev,
      failures: prev.failures.map((x) => (x.id === f.id ? { ...x, assignee: name || null, assigneeId: p?.id ?? null } : x)),
    }));
  }

  const count = (s) => failures.filter((f) => f.status === s).length;

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-4">고장 관제</h1>
      <div className="flex items-center justify-between gap-3 mb-3">
        <FilterPills
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "전체", count: failures.length },
            { value: "미처리", label: "미처리", count: count("미처리") },
            { value: "진행중", label: "진행중", count: count("진행중") },
            { value: "완료", label: "완료", count: count("완료") },
          ]}
        />
        <input className={`${inputCls} max-w-56`} placeholder="현장·증상 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <AdminTable head={["접수", "현장 · 호기", "증상", "처리내용", "신고자", "담당 기사", "출동/도착", "상태"]}>
        {rows.map((f) => {
          const tone = f.status === "완료" ? "green" : f.status === "진행중" ? "amber" : "red";
          return (
            <tr key={f.id} className="border-b border-slate-50 align-middle cursor-pointer hover:bg-slate-50" onClick={() => setDetail(f)}>
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{f.reportedAt}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, f.unitId, f.siteName, f.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{f.errorCode}{f.notFault ? " (고장아님)" : ""}</td>
              <td className="px-3 py-2.5 text-slate-600">{f.processContent || "-"}</td>
              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{f.reporterPhone ?? "-"}</td>
              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                <select
                  className={`${inputCls} min-w-28`}
                  value={personOf(data, f.assigneeId, f.assignee) === "-" ? "" : personOf(data, f.assigneeId, f.assignee)}
                  onChange={(e) => assign(f, e.target.value)}
                  disabled={f.status === "완료"}
                >
                  <option value="">미배정</option>
                  {engineers.map((p) => <option key={p.id}>{p.name}</option>)}
                </select>
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {f.dispatchedAt ? `출동 ${f.dispatchedAt}` : "-"}{f.arrivalTime ? ` · 도착 ${f.arrivalTime}` : ""}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge tone={tone}>{f.escalation ? `${f.status}·${f.escalation}` : f.status}</StatusBadge>
              </td>
            </tr>
          );
        })}
      </AdminTable>
      <p className="text-[10px] text-slate-400 mt-2">* 출동·도착·처리결과 입력은 기사 모바일 앱에서 진행됩니다. 여기서는 배정만 변경할 수 있습니다.</p>

      {detail && (
        <Modal title="고장상세보기" onClose={() => setDetail(null)}>
          <FailureDetailContent f={detail} units={units} sites={sites} />
        </Modal>
      )}
    </div>
  );
}
