"use client";

// 비용청구 내역 — 청구 건 조회 + 합계. 자재 지급건 연결(materialRequestId) 여부 표시.
import { locOf, personOf, StatusBadge, AdminTable } from "@/app/components/admin/adminShared";

export default function BillingsAdmin({ data }) {
  const { billings } = data;
  const total = billings.reduce((sum, b) => sum + (Number(b.cost) || 0), 0);

  return (
    <div className="max-w-6xl">
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-xl font-extrabold">비용청구 내역</h1>
        <p className="text-sm text-slate-500">
          총 {billings.length}건 · <span className="font-extrabold text-slate-900">{total.toLocaleString()}원</span>
        </p>
      </div>
      <AdminTable head={["제출", "현장 · 호기", "교체내역", "교체일", "금액", "기사", "근거", "사진"]}>
        {billings.map((b) => (
          <tr key={b.id} className="border-b border-slate-50">
            <td className="pl-5 pr-3 py-2.5 text-slate-500 whitespace-nowrap">{b.submittedAt}</td>
            <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, b.unitId, b.siteName, b.elevatorNo)}</td>
            <td className="px-3 py-2.5 text-slate-600">{b.part}</td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{b.replaceDate ?? "-"}</td>
            <td className="px-3 py-2.5 font-bold whitespace-nowrap">{b.cost ? Number(b.cost).toLocaleString() + "원" : "-"}</td>
            <td className="px-3 py-2.5 whitespace-nowrap">{personOf(data, b.engineerId, b.engineer)}</td>
            <td className="px-3 py-2.5">
              {b.materialRequestId || b.type === "material"
                ? <StatusBadge tone="blue">자재 지급건</StatusBadge>
                : <StatusBadge tone="slate">직접 입력</StatusBadge>}
            </td>
            <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
              전 {b.beforePhotoUrls?.length ?? 0} · 후 {b.afterPhotoUrls?.length ?? 0} · 확인서 {b.confirmPhotoUrl ? 1 : 0}
            </td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
