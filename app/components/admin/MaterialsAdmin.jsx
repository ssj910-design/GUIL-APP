"use client";

// 자재·견적 모니터 — 진행 상태를 표로 관제한다.
// 지급완료·반려 처리는 사진 등록이 필수인 업무 규칙이 있어 모바일 관리자 모드에서
// 진행하고, 여기서는 현황 파악(누가·무엇을·얼마나 기다리는지)에 집중한다.
import { useState } from "react";
import { locOf, personOf, StatusBadge, AdminTable, FilterPills } from "@/app/components/admin/adminShared";

const MATERIAL_TONE = { 승인대기: "blue", 지급완료: "green", 반려: "red" };
const QUOTE_TONE = { 요청접수: "blue", 견적발행: "amber", 승인: "amber", 자재지급완료: "green" };

export default function MaterialsAdmin({ data }) {
  const { materialRequests, quoteRequests } = data;
  const [tab, setTab] = useState("material");

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-4">자재·견적</h1>
      <div className="mb-3">
        <FilterPills
          value={tab}
          onChange={setTab}
          options={[
            { value: "material", label: "자재신청", count: materialRequests.length },
            { value: "quote", label: "견적요청", count: quoteRequests.length },
          ]}
        />
      </div>

      {tab === "material" ? (
        <AdminTable head={["신청일", "현장 · 호기", "자재", "긴급도", "신청 기사", "지급사진", "상태"]}>
          {materialRequests.map((m) => (
            <tr key={m.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{m.requestedDate}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, m.unitId, m.siteName, m.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{m.part}</td>
              <td className="px-3 py-2.5">
                {m.urgency === "긴급" ? <StatusBadge tone="red">긴급</StatusBadge> : <span className="text-slate-500 text-xs">{m.urgency}</span>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, m.requesterId, m.engineer)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{m.supplyPhotoUrls?.length ? `${m.supplyPhotoUrls.length}장` : "-"}</td>
              <td className="px-3 py-2.5">
                <StatusBadge tone={MATERIAL_TONE[m.status] ?? "slate"}>{m.status}</StatusBadge>
                {m.status === "반려" && m.rejectReason && <p className="text-[10px] text-red-500 mt-1">{m.rejectReason}</p>}
              </td>
            </tr>
          ))}
        </AdminTable>
      ) : (
        <AdminTable head={["신청일", "현장 · 호기", "공사 내용", "신청 기사", "발행/승인/지급", "상태"]}>
          {quoteRequests.map((q) => (
            <tr key={q.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{q.requestedDate}</td>
              <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, q.unitId, q.siteName, q.elevatorNo)}</td>
              <td className="px-3 py-2.5 text-slate-600">{q.constructionType}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, q.requesterId, q.engineer)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {q.quoteIssuedDate ?? "-"} / {q.approvedDate ?? "-"} / {q.suppliedDate ?? "-"}
              </td>
              <td className="px-3 py-2.5"><StatusBadge tone={QUOTE_TONE[q.status] ?? "slate"}>{q.status}</StatusBadge></td>
            </tr>
          ))}
        </AdminTable>
      )}
      <p className="text-[10px] text-slate-400 mt-2">* 지급완료·반려 처리는 지급 사진 등록이 필요해 모바일 관리자 모드에서 진행합니다.</p>
    </div>
  );
}
