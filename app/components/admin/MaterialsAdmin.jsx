"use client";

// 자재·견적 처리 — 지급완료(자재)/견적발행·승인·자재지급완료(견적) 액션 포함.
// 입력이 필요 없는 전환(견적발행·승인)은 행에서 바로 처리하고, 사진·담당기사·금액처럼
// 입력이 필요한 전환(자재 지급완료, 견적 자재지급완료)만 모달을 쓴다 (하이브리드 설계 —
// docs/superpowers/specs/2026-07-21-materials-admin-actions-design.md).
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadPhoto } from "@/lib/photos";
import { unitIdFor, addDays } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { locOf, personOf, StatusBadge, AdminTable, FilterPills, inputCls, Modal } from "@/app/components/admin/adminShared";

const MATERIAL_TONE = { 승인대기: "blue", 지급완료: "green", 반려: "red" };
const QUOTE_TONE = { 요청접수: "blue", 견적발행: "amber", 승인: "amber", 자재지급완료: "green" };

export default function MaterialsAdmin({ data, setData }) {
  const { materialRequests: allMaterialRequests, quoteRequests: allQuoteRequests } = data;
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [payTarget, setPayTarget] = useState(null); // 지급완료 처리 중인 자재신청
  const [quoteSupplyTarget, setQuoteSupplyTarget] = useState(null); // 자재지급완료 처리 중인 견적요청

  const query = search.trim();
  const materialRequests = allMaterialRequests.filter((m) =>
    !query || locOf(data, m.unitId, m.siteName, m.elevatorNo).includes(query) || (m.part ?? "").includes(query) || personOf(data, m.requesterId, m.engineer).includes(query)
  );
  const quoteRequests = allQuoteRequests.filter((q) =>
    !query || locOf(data, q.unitId, q.siteName, q.elevatorNo).includes(query) || (q.constructionType ?? "").includes(query) || personOf(data, q.requesterId, q.engineer).includes(query)
  );

  async function handleMaterialSupplyComplete(request, { assigneeId, billingPart, billingAmount, photoUrls }) {
    const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
    const assigneeName = engineer?.name ?? request.engineer;
    const patch = {
      status: "지급완료",
      supplied_date: TODAY_STR,
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("material_requests").update(patch).eq("id", request.id);
    if (error) { alert("지급완료 처리 실패: " + error.message); return; }

    const todoId = "todo-" + request.id;
    const dueDate = addDays(TODAY_STR, 30);
    const unitId = request.unitId ?? unitIdFor(data.units, request.siteId, request.elevatorNo);
    const todoRow = {
      id: todoId,
      material_request_id: request.id,
      source: "material",
      title: `${request.siteName} ${request.part} 교체 및 확인서 제출`,
      site_name: request.siteName,
      elevator_no: request.elevatorNo,
      part: request.part,
      assignee: assigneeName,
      assigned_date: TODAY_STR,
      due_date: dueDate,
      done: false,
      unit_id: unitId,
      assignee_id: assigneeId || null,
      billing_part: billingPart,
      billing_amount: billingAmount,
    };
    const { error: todoError } = await supabase.from("todos").insert(todoRow);
    if (todoError) { alert("할 일 생성 실패: " + todoError.message); return; }

    setData((prev) => ({
      ...prev,
      materialRequests: prev.materialRequests.map((r) =>
        r.id === request.id
          ? { ...r, status: "지급완료", suppliedDate: TODAY_STR, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls }
          : r
      ),
      todos: [
        {
          id: todoId, materialRequestId: request.id, quoteRequestId: null, source: "material", title: todoRow.title,
          siteName: request.siteName, elevatorNo: request.elevatorNo, part: request.part,
          assignee: assigneeName, assignedDate: TODAY_STR, dueDate, done: false,
          unitId, assigneeId: assigneeId || null, billingPart, billingAmount,
        },
        ...prev.todos,
      ],
    }));
  }

  async function handleQuoteAdvance(quote) {
    const isIssue = quote.status === "요청접수";
    const patch = isIssue
      ? { status: "견적발행", quote_issued_date: TODAY_STR }
      : { status: "승인", approved_date: TODAY_STR };
    const { error } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (error) { alert("처리 실패: " + error.message); return; }
    setData((prev) => ({
      ...prev,
      quoteRequests: prev.quoteRequests.map((x) => {
        if (x.id !== quote.id) return x;
        return isIssue
          ? { ...x, status: "견적발행", quoteIssuedDate: TODAY_STR }
          : { ...x, status: "승인", approvedDate: TODAY_STR };
      }),
    }));
  }

  async function handleQuoteSupplyComplete(quote, { assigneeIds, photoUrls }) {
    const patch = {
      status: "자재지급완료",
      supplied_date: TODAY_STR,
      has_supply_photo: photoUrls.length > 0,
      supply_photo_urls: photoUrls.length ? photoUrls : null,
    };
    const { error } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (error) { alert("자재지급완료 처리 실패: " + error.message); return; }

    const unitId = quote.unitId ?? unitIdFor(data.units, quote.siteId, quote.elevatorNo);
    const dueDate = addDays(TODAY_STR, 30);
    const newTodos = assigneeIds.map((assigneeId, idx) => {
      const engineer = (data.profiles ?? []).find((p) => p.id === assigneeId);
      return {
        id: `todo-quote-${quote.id}-${idx}`,
        quoteRequestId: quote.id,
        materialRequestId: null,
        source: "quote",
        title: `${quote.siteName} ${quote.constructionType} 시공 확인 및 서류 제출`,
        siteName: quote.siteName,
        elevatorNo: quote.elevatorNo,
        part: quote.constructionType,
        assignee: engineer?.name ?? quote.engineer,
        assignedDate: TODAY_STR,
        dueDate,
        done: false,
        unitId,
        assigneeId,
      };
    });
    const { error: todoError } = await supabase.from("todos").insert(
      newTodos.map((t) => ({
        id: t.id, quote_request_id: t.quoteRequestId, source: t.source, title: t.title,
        site_name: t.siteName, elevator_no: t.elevatorNo, part: t.part,
        assignee: t.assignee, assigned_date: t.assignedDate, due_date: t.dueDate, done: t.done,
        unit_id: t.unitId, assignee_id: t.assigneeId,
      }))
    );
    if (todoError) { alert("할 일 생성 실패: " + todoError.message); return; }

    setData((prev) => ({
      ...prev,
      quoteRequests: prev.quoteRequests.map((x) =>
        x.id === quote.id
          ? { ...x, status: "자재지급완료", suppliedDate: TODAY_STR, hasSupplyPhoto: patch.has_supply_photo, supplyPhotoUrls: photoUrls }
          : x
      ),
      todos: [...newTodos, ...prev.todos],
    }));
  }

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
        <AdminTable head={["신청일", "현장 · 호기", "자재", "긴급도", "신청 기사", "지급사진", "상태", "처리"]}>
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
              <td className="px-3 py-2.5 whitespace-nowrap">
                {m.status === "승인대기" ? (
                  <button onClick={() => setPayTarget(m)} className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                    지급완료 처리
                  </button>
                ) : (
                  <span className="text-xs text-slate-300">-</span>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
        </>
      )}

      {(tab === "quote" || tab === "all") && (
        <>
        {tab === "all" && <h2 className="text-xs font-bold text-slate-400 mb-2 mt-6">견적요청</h2>}
        <AdminTable head={["신청일", "현장 · 호기", "공사 내용", "신청 기사", "발행/승인/지급", "상태", "처리"]}>
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
              <td className="px-3 py-2.5 whitespace-nowrap">
                {q.status === "요청접수" && (
                  <button onClick={() => handleQuoteAdvance(q)} className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                    견적발행 처리
                  </button>
                )}
                {q.status === "견적발행" && (
                  <button onClick={() => handleQuoteAdvance(q)} className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg">
                    승인 처리
                  </button>
                )}
                {q.status === "승인" && (
                  <button onClick={() => setQuoteSupplyTarget(q)} className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                    지급완료 처리
                  </button>
                )}
                {q.status === "자재지급완료" && <span className="text-xs text-slate-300">-</span>}
              </td>
            </tr>
          ))}
        </AdminTable>
        </>
      )}
      <p className="text-[10px] text-slate-400 mt-2">* 반려 처리는 기사 전용 기능으로, 모바일 관리자 모드에서 진행합니다.</p>

      {payTarget && (
        <MaterialSupplyModal
          request={payTarget}
          profiles={data.profiles ?? []}
          onClose={() => setPayTarget(null)}
          onSubmit={async (input) => { await handleMaterialSupplyComplete(payTarget, input); setPayTarget(null); }}
        />
      )}

      {quoteSupplyTarget && (
        <QuoteSupplyModal
          quote={quoteSupplyTarget}
          profiles={data.profiles ?? []}
          onClose={() => setQuoteSupplyTarget(null)}
          onSubmit={async (input) => { await handleQuoteSupplyComplete(quoteSupplyTarget, input); setQuoteSupplyTarget(null); }}
        />
      )}
    </div>
  );
}

function MaterialSupplyModal({ request, profiles, onClose, onSubmit }) {
  const engineers = profiles.filter((p) => p.role === "engineer");
  const defaultAssigneeId = request.requesterId || engineers.find((p) => p.name === request.engineer)?.id || "";
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
  const [photos, setPhotos] = useState(request.supplyPhotoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amounts, setAmounts] = useState({});

  const parts = (request.part ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const total = parts.reduce((sum, _, i) => sum + (Number(amounts[i]) || 0), 0);
  const billingPartText = parts
    .map((part, i) => (amounts[i] ? `${part}(₩${Number(amounts[i]).toLocaleString()})` : part))
    .join(", ");

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, `materials/${request.id}/supply`)));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    setSaving(true);
    await onSubmit({ assigneeId, billingPart: billingPartText || null, billingAmount: total || null, photoUrls: photos });
    setSaving(false);
  }

  return (
    <Modal title={`${request.siteName ?? "-"} · ${request.part} — 지급완료 처리`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">지급 사진 (선택)</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {photos.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                <button
                  onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
            사진 추가
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">담당 기사</label>
          <select className={inputCls} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">담당자 선택 (기본 {request.engineer})</option>
            {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">부품별 금액</label>
          <div className="space-y-1.5">
            {parts.map((part, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs text-slate-700 flex-1 truncate">{part}</span>
                <input
                  type="number"
                  className={`${inputCls} w-28`}
                  placeholder="금액"
                  value={amounts[i] ?? ""}
                  onChange={(e) => setAmounts((m) => ({ ...m, [i]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {parts.length > 1 && <p className="text-[10px] text-slate-400 text-right mt-1">합계 ₩{total.toLocaleString()}</p>}
        </div>

        <button
          onClick={submit}
          disabled={saving || uploading}
          className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
        >
          {saving ? "처리 중..." : "지급완료 처리"}
        </button>
      </div>
    </Modal>
  );
}

function QuoteSupplyModal({ quote, profiles, onClose, onSubmit }) {
  const engineers = profiles.filter((p) => p.role === "engineer");
  const defaultId = engineers.find((p) => p.name === quote.engineer)?.id;
  const [assigneeIds, setAssigneeIds] = useState(defaultId ? [defaultId] : []);
  const [photos, setPhotos] = useState(quote.supplyPhotoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggle(id) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, `quotes/${quote.id}/supply`)));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit() {
    if (assigneeIds.length === 0) return;
    setSaving(true);
    await onSubmit({ assigneeIds, photoUrls: photos });
    setSaving(false);
  }

  return (
    <Modal title={`${quote.siteName ?? "-"} · ${quote.constructionType} — 자재지급완료 처리`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">지급 사진 (선택)</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {photos.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                <button
                  onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
            사진 추가
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 block mb-1">담당 기사 (2명 이상 가능)</label>
          <div className="space-y-1">
            {engineers.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={assigneeIds.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
          {assigneeIds.length === 0 && <p className="text-[10px] text-red-500 mt-1">담당 기사를 1명 이상 선택해주세요</p>}
        </div>

        <button
          onClick={submit}
          disabled={saving || uploading || assigneeIds.length === 0}
          className="w-full bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg"
        >
          {saving ? "처리 중..." : "자재 지급 완료 체크"}
        </button>
      </div>
    </Modal>
  );
}
