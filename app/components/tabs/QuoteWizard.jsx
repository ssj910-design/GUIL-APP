"use client";

// 관리자 모드 폰앱 — 새 견적서 작성 마법사. 고장접수(FailureTab.jsx)와 같은 스텝형 UI를 쓴다.
// existingQuote가 있어도(기사 요청에서 이어감) 1단계(현장·견적명)부터 시작한다 — 요청은 현장만
// 정해져 있고 견적명은 아직 없으므로 여기서 입력받아야 한다. 새 초안을 만들지 않고 그 요청 행을
// 그대로 쓴다.
import { useState, useContext, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { SitesContext, UnitsContext } from "@/app/components/context";
import { SiteSearchSelect } from "@/app/components/formWidgets";
import { inputCls } from "@/app/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { mapQuoteRequest, mapSiteManager } from "@/lib/mappers";
import { siteUnitList } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";

const STEP_TITLES = ["현장·담당자", "품목 입력", "부대비용", "확인·작성"];
const draftKey = (id) => `guilQuoteWizardDraftV1:${id}`;

export default function QuoteWizard({ existingQuote, onClose, onDraftCreated, onDiscarded, onSaved }) {
  const sites = useContext(SitesContext);
  const allUnits = useContext(UnitsContext);
  const [step, setStep] = useState(0);
  const [siteId, setSiteId] = useState(existingQuote?.siteId ?? "");
  const [siteManagers, setSiteManagers] = useState([]);
  const [managerId, setManagerId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState(existingQuote?.recipientPhone || existingQuote?.contactPhone || "");
  const [quoteTitleInput, setQuoteTitleInput] = useState(existingQuote?.quoteTitle ?? "");
  // 새 견적(요청 없이 시작)은 1단계를 넘어갈 때 빈 초안을 만든다 — 기존 요청에서 이어가면 그
  // 요청 행을 그대로 쓰므로 draft가 필요 없다.
  const [draft, setDraft] = useState(existingQuote ?? null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // "수정하기"로 이미 작성된 견적을 다시 열면 실제 저장된 품목(quoteItems)을 그대로 불러오고,
  // 기사 요청에서 막 넘어온 경우(아직 작성 전, constructionType만 있음)엔 그 값으로 품목 1개를
  // 미리 채워둔다 — 호기는 대부분 1호기라 기본값으로 넣어두고 필요하면 바꾸게 한다.
  const [items, setItems] = useState(() => {
    if (existingQuote?.quoteItems?.length) return existingQuote.quoteItems;
    return existingQuote?.constructionType
      ? [{ category: "자재비", name: existingQuote.constructionType, spec: "", unit: "EA", qty: 1, unitPrice: 0, unitNo: "1호기" }]
      : [];
  });
  const [expandedIdx, setExpandedIdx] = useState(0);

  const [transportCost, setTransportCost] = useState(existingQuote?.transportCost || 0);
  const [safetyCost, setSafetyCost] = useState(existingQuote?.safetyCost || 0);
  const [profit, setProfit] = useState(existingQuote?.profit || 0);

  function addItem() {
    setItems((prev) => {
      const next = [...prev, { category: "자재비", name: "", spec: "", unit: "EA", qty: 1, unitPrice: 0, unitNo: "1호기" }];
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

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  function notify(msg) { setToast(msg); setTimeout(() => setToast(""), 2000); }
  const managerName = siteManagers.find((m) => m.id === managerId)?.name ?? "";

  // 품목 입력하다가 현장에서 끊기기 쉬워, 여기까지 입력한 내용(품목·부대비용·견적명)을 기기에
  // 임시저장해뒀다가 이 견적으로 돌아오면 자동으로 이어서 하게 한다. 수신 담당자 정보는 현장
  // 담당자 목록에서 항상 다시 채워지므로 여기엔 담지 않는다.
  useEffect(() => {
    if (!draft?.id) return;
    let saved = null;
    try {
      const raw = localStorage.getItem(draftKey(draft.id));
      if (raw) saved = JSON.parse(raw);
    } catch { /* 손상된 임시저장은 무시하고 그대로 진행 */ }
    if (saved) {
      setStep(saved.step ?? 1);
      setItems(saved.items ?? []);
      setTransportCost(saved.transportCost ?? 0);
      setSafetyCost(saved.safetyCost ?? 0);
      setProfit(saved.profit ?? 0);
      setQuoteTitleInput(saved.quoteTitleInput ?? "");
      notify("임시저장된 내용을 불러왔습니다");
    }
  }, [draft?.id]);

  function saveDraft() {
    if (!draft?.id) return;
    try {
      localStorage.setItem(draftKey(draft.id), JSON.stringify({
        step, items, transportCost, safetyCost, profit, quoteTitleInput,
      }));
      notify("임시저장했습니다");
    } catch {
      notify("임시저장에 실패했습니다");
    }
  }

  // 견적번호 = 오늘날짜(YYYYMMDD) + "1" + 오늘 발행 순번 — 데스크탑 QuoteItemsModal.jsx와 동일한
  // 채번 규칙. 없으면 PDF·DB에 번호가 안 남아(발행 전엔 항상 빈 문자열이라 이 훅이 필요하다).
  const [quoteNumber, setQuoteNumber] = useState(existingQuote?.quoteNumber || "");
  useEffect(() => {
    if (quoteNumber) return;
    (async () => {
      const { count } = await supabase
        .from("quote_requests")
        .select("id", { count: "exact", head: true })
        .eq("quote_issued_date", TODAY_STR);
      setQuoteNumber(`${TODAY_STR.replace(/-/g, "")}1${(count || 0) + 1}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePublish() {
    if (!draft || items.length === 0) return;
    setSaving(true);
    setError("");

    const quoteTitle = quoteTitleInput.trim() || items[0]?.name || "견적서";
    const quoteDate = TODAY_STR;

    const pdfRes = await fetch("/api/generate-quote-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRequestId: draft.id,
        siteName: site?.name ?? draft.siteName,
        quoteNumber, recipientName: managerName, quoteTitle, quoteDate,
        items, transportCost, safetyCost, profit, discountAmount: 0,
      }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, reason: e.message }));

    if (!pdfRes.ok) {
      setError("PDF 생성 실패: " + pdfRes.reason);
      setSaving(false);
      return;
    }

    const patch = {
      quote_items: items,
      transport_cost: Number(transportCost) || 0,
      safety_cost: Number(safetyCost) || 0,
      profit: Number(profit) || 0,
      quote_number: quoteNumber || null,
      recipient_name: managerName || null,
      quote_title: quoteTitle,
      quote_issued_date: quoteDate,
      recipient_email: recipientEmail || null,
      recipient_phone: recipientPhone || null,
      quote_pdf_url: pdfRes.url,
      status: "작성",
    };
    const { error: dbError } = await supabase.from("quote_requests").update(patch).eq("id", draft.id);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setSaving(false);
      return;
    }

    try { localStorage.removeItem(draftKey(draft.id)); } catch { /* 임시저장 정리 실패는 무시 */ }
    onSaved({
      id: draft.id, quoteItems: items, transportCost: Number(transportCost) || 0, safetyCost: Number(safetyCost) || 0,
      profit: Number(profit) || 0, quoteNumber, recipientName: managerName, quoteTitle, quoteIssuedDate: quoteDate,
      quotePdfUrl: pdfRes.url, status: "작성", recipientEmail: recipientEmail || null, recipientPhone: recipientPhone || null,
    });
    setSaving(false);
  }

  const site = sites.find((s) => s.id === siteId);
  const siteUnitOptions = site ? siteUnitList(site, allUnits).map((u) => u.unitNo) : [];

  useEffect(() => {
    if (!siteId) { setSiteManagers([]); return; }
    let alive = true;
    supabase.from("site_managers").select("*").eq("site_id", siteId).then(({ data }) => {
      if (!alive) return;
      const mapped = (data ?? []).map(mapSiteManager);
      setSiteManagers(mapped);
      // "수정하기"로 이미 작성된 견적을 다시 열면 예전에 고른 수신자를 그대로 유지한다
      // (없으면 지금처럼 대표 담당자로).
      const matched = existingQuote?.recipientName ? mapped.find((m) => m.name === existingQuote.recipientName) : null;
      const chosen = matched ?? mapped.find((m) => m.isPrimary) ?? mapped[0];
      if (chosen) {
        setManagerId(chosen.id);
        setRecipientEmail(existingQuote?.recipientEmail || chosen.email || "");
        setRecipientPhone(existingQuote?.recipientPhone || chosen.phone || "");
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  function selectManager(id) {
    setManagerId(id);
    const m = siteManagers.find((x) => x.id === id);
    if (m) { setRecipientEmail(m.email || ""); setRecipientPhone(m.phone || ""); }
  }

  async function handleCancel() {
    // 데스크탑(MaterialsAdmin.jsx)과 동일 조건 — 요청자 정보(requesterId/engineer)가 있으면
    // 기사가 올린 진짜 요청이니 지우지 않는다. existingQuote로 들어왔더라도 그 값이 둘 다
    // null이면(예: 마법사를 도중에 나갔다가 목록에서 다시 연 관리자 발행 빈 초안) 여전히
    // 지울 수 있어야 한다 — 안 그러면 그 초안이 영영 안 지워지는 고아 상태로 남는다.
    if (draft && draft.status === "요청접수" && !draft.requesterId && !draft.engineer) {
      await supabase.from("quote_requests").delete().eq("id", draft.id);
      try { localStorage.removeItem(draftKey(draft.id)); } catch { /* 임시저장 정리 실패는 무시 */ }
      onDiscarded?.(draft.id);
    }
    onClose();
  }

  async function handleNextFromStep0() {
    if (!site) return;
    // 이미 초안을 만든 뒤 뒤로가기로 여기 다시 왔다면 — 새로 insert하지 않는다(안 그러면
    // "다음" 누를 때마다 빈 초안이 하나씩 더 생긴다). 그 사이 현장을 바꿨으면 기존 초안의
    // 현장만 갱신한다.
    if (draft) {
      if (draft.siteId !== site.id) {
        const { error: updateError } = await supabase.from("quote_requests").update({ site_id: site.id, site_name: site.name }).eq("id", draft.id);
        if (updateError) { setError("현장 변경 실패: " + updateError.message); return; }
        setDraft((prev) => ({ ...prev, siteId: site.id, siteName: site.name }));
      }
      setStep(1);
      return;
    }
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
    // mapQuoteRequest로 전체 필드를 채운 shape을 쓴다 — 일부 필드만 채운 객체를 로컬 목록에
    // 반영하면 목록 카드가 "undefined · undefined"처럼 깨져 보인다(실사고로 발견).
    const created = mapQuoteRequest(row);
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
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">견적명</p>
              <input
                className={inputCls}
                placeholder="예: OO빌딩 승강기 도어스위치 외 3건 교체"
                value={quoteTitleInput}
                onChange={(e) => setQuoteTitleInput(e.target.value)}
              />
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
                          <p className="text-[11px] font-bold text-slate-500 mb-1">호기</p>
                          {siteUnitOptions.length > 0 ? (
                            <select className={inputCls} value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })}>
                              {!siteUnitOptions.includes(it.unitNo) && <option value={it.unitNo}>{it.unitNo || "선택"}</option>}
                              {siteUnitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          ) : (
                            <input className={inputCls} value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })} />
                          )}
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

        {step === 3 && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">견적번호</span><span className="font-semibold text-slate-800">{quoteNumber || "-"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">현장</span><span className="font-semibold text-slate-800">{site?.name ?? draft?.siteName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">수신 담당자</span><span className="font-semibold text-slate-800">{managerName || "-"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">이메일</span><span className="font-semibold text-slate-800">{recipientEmail || "-"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">전화번호</span><span className="font-semibold text-slate-800">{recipientPhone || "-"}</span></div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-1 text-sm">
              <p className="text-xs font-bold text-slate-500 mb-1">품목</p>
              {items.map((it, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-slate-600 truncate">{it.name || "(품명 없음)"}</span>
                  <span className="text-slate-500">{it.qty}{it.unit} × {Number(it.unitPrice || 0).toLocaleString()} = {(Number(it.qty || 0) * Number(it.unitPrice || 0)).toLocaleString()}원</span>
                </div>
              ))}
              {Number(transportCost) > 0 && <div className="flex justify-between text-xs"><span className="text-slate-600">운반비</span><span className="text-slate-500">{Number(transportCost).toLocaleString()}원</span></div>}
              {Number(safetyCost) > 0 && <div className="flex justify-between text-xs"><span className="text-slate-600">안전관리비 및 기타</span><span className="text-slate-500">{Number(safetyCost).toLocaleString()}원</span></div>}
              {Number(profit) > 0 && <div className="flex justify-between text-xs"><span className="text-slate-600">이윤</span><span className="text-slate-500">{Number(profit).toLocaleString()}원</span></div>}
            </div>
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
            return setStep(step - 1);
          }}
          className="px-5 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200"
        >
          {step === 0 ? "취소" : "이전"}
        </button>
        {step >= 1 && draft?.id && (
          <button type="button" onClick={saveDraft} className="px-4 py-3 rounded-xl text-sm font-bold text-blue-700 border border-blue-200 bg-blue-50">임시저장</button>
        )}
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
        {step === 3 && (
          <button
            onClick={handlePublish}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300"
          >
            {saving ? "작성 중..." : "작성 완료"}
          </button>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}
