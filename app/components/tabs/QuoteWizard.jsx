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

        {/* step 1(품목 입력)은 Task 3, step 2(부대비용)는 Task 4, step 3(확인·발행)은 Task 5에서 추가 */}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="shrink-0 px-5 py-3 bg-white border-t border-slate-100 flex gap-2">
        <button onClick={handleCancel} className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">
          {step === 0 ? "취소" : "그만두기"}
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
      </div>
    </div>
  );
}
