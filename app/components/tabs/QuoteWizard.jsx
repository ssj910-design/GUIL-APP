"use client";

// 관리자 모드 폰앱 — 새 견적서 작성 마법사. 고장접수(FailureTab.jsx)와 같은 스텝형 UI를 쓴다.
// existingQuote가 있으면(기사 요청에서 이어감) 1단계(현장 선택)를 건너뛰고 2단계(품목 입력)부터
// 시작한다 — 새 초안을 만들지 않고 그 요청 행을 그대로 쓴다.
import { useState, useContext, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { SitesContext } from "@/app/components/context";
import { SiteSearchSelect } from "@/app/components/formWidgets";
import { inputCls } from "@/app/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { mapSiteManager } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";

const STEP_TITLES = ["현장·담당자", "품목 입력", "부대비용", "확인·발행"];

export default function QuoteWizard({ existingQuote, onClose, onDraftCreated, onDiscarded, onSaved }) {
  const sites = useContext(SitesContext);
  const [step, setStep] = useState(existingQuote ? 1 : 0);
  const [siteId, setSiteId] = useState(existingQuote?.siteId ?? "");
  const [siteManagers, setSiteManagers] = useState([]);
  const [managerId, setManagerId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState(existingQuote?.contactPhone ?? "");
  // 새 견적(요청 없이 시작)은 1단계를 넘어갈 때 빈 초안을 만든다 — 기존 요청에서 이어가면 그
  // 요청 행을 그대로 쓰므로 draft가 필요 없다.
  const [draft, setDraft] = useState(existingQuote ?? null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [items, setItems] = useState(() =>
    existingQuote?.constructionType ? [{ category: "자재비", name: existingQuote.constructionType, spec: "", unit: "EA", qty: 1, unitPrice: 0, unitNo: "" }] : []
  );
  const [expandedIdx, setExpandedIdx] = useState(0);

  const [transportCost, setTransportCost] = useState(existingQuote?.transportCost || 0);
  const [safetyCost, setSafetyCost] = useState(existingQuote?.safetyCost || 0);
  const [profit, setProfit] = useState(existingQuote?.profit || 0);

  function addItem() {
    setItems((prev) => {
      const next = [...prev, { category: "자재비", name: "", spec: "", unit: "EA", qty: 1, unitPrice: 0, unitNo: "" }];
      setExpandedIdx(next.length - 1);
      return next;
    });
  }
  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx(-1);
  }
  const itemsSubtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  const grandTotal = itemsSubtotal + Number(transportCost || 0) + Number(safetyCost || 0) + Number(profit || 0);

  const site = sites.find((s) => s.id === siteId);

  useEffect(() => {
    if (!siteId) { setSiteManagers([]); return; }
    let alive = true;
    supabase.from("site_managers").select("*").eq("site_id", siteId).then(({ data }) => {
      if (!alive) return;
      const mapped = (data ?? []).map(mapSiteManager);
      setSiteManagers(mapped);
      const primary = mapped.find((m) => m.isPrimary) ?? mapped[0];
      if (primary) {
        setManagerId(primary.id);
        setRecipientEmail(primary.email || "");
        setRecipientPhone(primary.phone || "");
      }
    });
    return () => { alive = false; };
  }, [siteId]);

  function selectManager(id) {
    setManagerId(id);
    const m = siteManagers.find((x) => x.id === id);
    if (m) { setRecipientEmail(m.email || ""); setRecipientPhone(m.phone || ""); }
  }

  async function handleCancel() {
    // 새 초안을 실제로 만든 뒤(2단계 이상 진행)에만 정리 대상 — 기존 요청에서 이어간 경우
    // (existingQuote 있음)는 그 행을 지우면 안 된다(요청자 정보가 있어 애초에 조건도 안 맞음).
    if (draft && !existingQuote && draft.status === "요청접수" && !draft.requesterId && !draft.engineer) {
      await supabase.from("quote_requests").delete().eq("id", draft.id);
      onDiscarded?.(draft.id);
    }
    onClose();
  }

  async function handleNextFromStep0() {
    if (!site) return;
    setCreating(true);
    setError("");
    const row = {
      id: "q" + Date.now(),
      site_id: site.id,
      site_name: site.name,
      elevator_no: null,
      unit_id: null,
      construction_type: "관리자 발행",
      contact_phone: null,
      note: null,
      engineer: null,
      requester_id: null,
      requested_date: TODAY_STR,
      status: "요청접수",
    };
    const { error: insertError } = await supabase.from("quote_requests").insert(row);
    setCreating(false);
    if (insertError) { setError("초안 생성 실패: " + insertError.message); return; }
    const created = { id: row.id, siteId: site.id, siteName: site.name, status: "요청접수", requesterId: null, engineer: null };
    setDraft(created);
    onDraftCreated?.(created);
    setStep(1);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="shrink-0 px-5 pt-4 pb-3 bg-white border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          {STEP_TITLES.map((t, i) => (
            <div key={t} className={`flex-1 h-1 rounded-full ${i <= step ? "bg-blue-600" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-sm font-extrabold text-slate-800 mt-2.5">{step + 1}. {STEP_TITLES[step]}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24 space-y-4">
        {step === 0 && (
          <>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">현장명 *</p>
              <SiteSearchSelect value={siteId} onChange={setSiteId} placeholder="현장명 검색" />
            </div>
            {site && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1.5">수신 담당자</p>
                {siteManagers.length === 0 ? (
                  <p className="text-xs text-slate-400">등록된 담당자가 없습니다 — 이메일·전화번호를 직접 입력하세요.</p>
                ) : (
                  <select className={inputCls} value={managerId} onChange={(e) => selectManager(e.target.value)}>
                    {siteManagers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}{m.isPrimary ? " (대표)" : ""}</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input className={inputCls} placeholder="이메일" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
                  <input className={inputCls} placeholder="전화번호" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
                </div>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            {items.map((it, idx) => {
              const expanded = idx === expandedIdx;
              const lineTotal = Number(it.qty || 0) * Number(it.unitPrice || 0);
              return (
                <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {!expanded ? (
                    <button onClick={() => setExpandedIdx(idx)} className="w-full flex items-center justify-between px-3.5 py-3 text-left">
                      <span className="text-sm font-semibold text-slate-700 truncate">
                        {it.name || "(품명 없음)"} · {it.qty}{it.unit} × {Number(it.unitPrice || 0).toLocaleString()}원 = {lineTotal.toLocaleString()}원
                      </span>
                      <ChevronRight size={15} className="text-slate-300 shrink-0 ml-2" />
                    </button>
                  ) : (
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex gap-2">
                        {["자재비", "인건비"].map((c) => (
                          <button
                            key={c}
                            onClick={() => updateItem(idx, { category: c })}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold ${it.category === c ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">품명</p>
                        <input className={inputCls} value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">규격</p>
                          <input className={inputCls} value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">호기 (선택)</p>
                          <input className={inputCls} value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">단위</p>
                          <select className={inputCls} value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })}>
                            <option value="EA">EA</option>
                            <option value="SET">SET</option>
                            <option value="식">식</option>
                          </select>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">수량</p>
                          <input type="number" className={inputCls} value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1">단가</p>
                          <input type="number" className={inputCls} value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: e.target.value })} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-bold text-slate-500">소계 {lineTotal.toLocaleString()}원</span>
                        <button onClick={() => removeItem(idx)} className="text-xs font-bold text-red-500">이 품목 삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={addItem} className="w-full py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-700 text-sm font-bold">
              + 품목 추가
            </button>
            {items.length === 0 && <p className="text-xs text-slate-400 text-center py-2">품목을 1개 이상 추가해주세요</p>}
          </>
        )}

        {step === 2 && (
          <>
            {[
              { label: "운반비", value: transportCost, setValue: setTransportCost },
              { label: "안전관리비 및 기타", value: safetyCost, setValue: setSafetyCost },
              { label: "이윤", value: profit, setValue: setProfit },
            ].map(({ label, value, setValue }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-3.5">
                <p className="text-xs font-bold text-slate-500 mb-1.5">{label}</p>
                <input type="number" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
              </div>
            ))}
            <div className="bg-slate-100 rounded-xl p-3.5 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600">합계(VAT별도)</span>
              <span className="text-base font-extrabold text-slate-900">{grandTotal.toLocaleString()}원</span>
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="shrink-0 px-5 py-3 bg-white border-t border-slate-100 flex gap-2">
        <button
          onClick={() => {
            if (step === 0) return handleCancel();
            if (step === 1 && existingQuote) return handleCancel();
            return setStep(step - 1);
          }}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200"
        >
          {step === 0 || (step === 1 && existingQuote) ? "취소" : "이전"}
        </button>
        {step === 0 && (
          <button
            onClick={handleNextFromStep0}
            disabled={!site || creating}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 flex items-center justify-center gap-1"
          >
            {creating ? "만드는 중..." : <>다음 <ChevronRight size={14} /></>}
          </button>
        )}
        {step === 1 && (
          <button
            onClick={() => setStep(2)}
            disabled={items.length === 0}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 flex items-center justify-center gap-1"
          >
            다음 <ChevronRight size={14} />
          </button>
        )}
        {step === 2 && (
          <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 flex items-center justify-center gap-1">
            다음 <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
