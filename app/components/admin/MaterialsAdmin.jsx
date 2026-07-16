"use client";

// 자재·견적 모니터 — 진행 상태를 표로 관제한다.
// 지급완료·반려 처리는 사진 등록이 필수인 업무 규칙이 있어 모바일 관리자 모드에서
// 진행하고, 여기서는 현황 파악(누가·무엇을·얼마나 기다리는지)에 집중한다.
import { useState } from "react";
import { Search } from "lucide-react";
import { locOf, personOf, StatusBadge, AdminTable, FilterPills, inputCls } from "@/app/components/admin/adminShared";

const MATERIAL_TONE = { 승인대기: "blue", 지급완료: "green", 반려: "red" };
const QUOTE_TONE = { 요청접수: "blue", 견적발행: "amber", 승인: "amber", 자재지급완료: "green" };

export default function MaterialsAdmin({ data }) {
  const { materialRequests: allMaterialRequests, quoteRequests: allQuoteRequests } = data;
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");

  const query = search.trim();
  const materialRequests = allMaterialRequests.filter((m) =>
    !query || locOf(data, m.unitId, m.siteName, m.elevatorNo).includes(query) || (m.part ?? "").includes(query) || personOf(data, m.requesterId, m.engineer).includes(query)
  );
  const quoteRequests = allQuoteRequests.filter((q) =>
    !query || locOf(data, q.unitId, q.siteName, q.elevatorNo).includes(query) || (q.constructionType ?? "").includes(query) || personOf(data, q.requesterId, q.engineer).includes(query)
  );

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold mb-4">자재·견적 신청내역</h1>
      <div className="flex items-center justify-between gap-3 mb-3">
        <FilterPills
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: "전체", count: allMaterialRequests.length + allQuoteRequests.length },
            { value: "material", label: "자재신청", count: allMaterialRequests.length },
            { value: "quote", label: "견적요청", count: allQuoteRequests.length },
          ]}
        />
        <div className="relative max-w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-8`} placeholder="현장·부품·기사명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {(tab === "material" || tab === "all") && (
        <>
        {tab === "all" && <h2 className="text-xs font-bold text-slate-400 mb-2">자재신청</h2>}
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
        </>
      )}

      {(tab === "quote" || tab === "all") && (
        <>
        {tab === "all" && <h2 className="text-xs font-bold text-slate-400 mb-2 mt-6">견적요청</h2>}
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
        </>
      )}
      <p className="text-[10px] text-slate-400 mt-2">* 지급완료·반려 처리는 지급 사진 등록이 필요해 모바일 관리자 모드에서 진행합니다.</p>
    </div>
  );
}
