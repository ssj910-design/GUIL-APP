"use client";

// 검사기준 Q&A — 승강기 법령·안전기준을 물어보면 조항 근거와 함께 답한다.
//
// 왜 챗봇이냐: 검사기준은 [별표22]만 20만 자다. 기사가 현장에서 "승강장문 이탈방지장치
// 기준이 뭐지"를 찾으려면 PDF를 뒤져야 하는데, 그럴 시간에 그냥 감으로 하게 된다.
// 물어보면 조항을 짚어주는 게 실제로 쓰이는 형태다.
//
// ⚠️ 답변에는 **항상 근거(조항·문서·시행일)를 함께 보여준다.** 법령 답변에서 근거 없는
// 문장은 위험하다 — 기사가 잘못된 기준으로 검사하면 사고로 이어진다. 서버(app/api/law-qa)도
// 검색된 조항 밖의 내용은 답하지 않도록 막아뒀다.
import { useState, useRef, useEffect } from "react";
import { Search, ExternalLink, Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { SUGGESTIONS, EXAMPLES } from "@/lib/lawQaSuggestions";

// 추천 질문 351개는 법령 자료에서 생성했다 — lib/lawQaSuggestions.js 주석 참고.

export function LawQaPanel({ entryPoint = "tab" }) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState([]); // { role: 'user'|'bot', text, sources?, keywords? }
  const [busy, setBusy] = useState(false);
  const [openSources, setOpenSources] = useState({}); // 답변 index → 근거 펼침 여부
  const [ratings, setRatings] = useState({});         // 답변 index → 1 | -1
  const endRef = useRef(null);

  // 입력 중 추천 — 두 글자만 쳐도 후보가 뜨게 한다(현장에서 긴 문장 타이핑은 부담).
  const hints = q.trim().length >= 1
    ? SUGGESTIONS.filter((s) => s.replace(/\s/g, "").includes(q.trim().replace(/\s/g, "")))
        .sort((a, b) => a.length - b.length)   // 목록이 351개라 앞 5개만 자르면 늘 같은 것만 뜬다 — 짧고 명확한 것 우선
        .slice(0, 5)
    : [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log, busy]);

  async function ask(question) {
    const text = (question ?? q).trim();
    if (!text || busy) return;
    setQ("");
    setLog((L) => [...L, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/law-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, entryPoint }),
      });
      const data = await res.json().catch(() => ({}));
      setLog((L) => [...L, data.ok
        ? { role: "bot", text: data.answer, sources: data.sources ?? [], keywords: data.keywords ?? [], logId: data.logId ?? null }
        : { role: "bot", text: data.reason || "답변을 가져오지 못했습니다.", sources: [] }]);
    } catch (e) {
      setLog((L) => [...L, { role: "bot", text: `오류: ${e.message}`, sources: [] }]);
    }
    setBusy(false);
  }

  // 평가는 조용히 보낸다 — 실패해도 화면에는 눌린 것으로 남긴다(로그가 목적이라 재시도까지 할 일은 아니다).
  async function rate(i, logId, value) {
    setRatings((r) => ({ ...r, [i]: value }));
    if (!logId) return;
    try {
      await fetch("/api/law-qa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, rating: value }),
      });
    } catch { /* 무시 */ }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {log.length === 0 && (
          <div className="pt-6">
            <p className="text-sm font-extrabold text-slate-700 text-center">승강기 법령·검사기준을 물어보세요</p>
            <p className="text-[11px] text-slate-400 text-center mt-1.5 leading-relaxed">
              현행 법령·시행령·시행규칙과 안전기준(별표22~27),<br />검사방법 표준화 안내를 근거로 답합니다
            </p>
            <div className="mt-5 space-y-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => ask(e)}
                  className="w-full text-left text-xs text-slate-600 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 active:bg-slate-50"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {log.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end">
            <p className="max-w-[85%] bg-blue-700 text-white text-sm rounded-2xl rounded-br-sm px-3.5 py-2.5 whitespace-pre-wrap">{m.text}</p>
          </div>
        ) : (
          <div key={i} className="space-y-2">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-3">
              <AnswerText text={m.text} onCite={() => setOpenSources((o) => ({ ...o, [i]: true }))} />
              <div className="flex items-center justify-end gap-0.5 mt-2 -mb-1">
                <RateButtons value={ratings[i]} onRate={(v) => rate(i, m.logId, v)} />
                <span className="w-px h-3 bg-slate-200 mx-1.5" />
                <CopyButton text={m.text} />
              </div>
            </div>
            {m.sources?.length > 0 && (
              // <details>는 React에서 onToggle 이벤트가 불안정해(currentTarget null) 직접 상태로 여닫는다.
              <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpenSources((o) => ({ ...o, [i]: !o[i] }))}
                  className="w-full text-left text-[11px] font-bold text-slate-500 flex items-center gap-1"
                >
                  <span className={`transition-transform ${openSources[i] ? "rotate-90" : ""}`}>›</span>
                  근거 {m.sources.length}건 {openSources[i] ? "접기" : "보기"}
                </button>
                {openSources[i] && (
                  <div className="mt-2 space-y-2.5">
                    {m.sources.map((s) => (
                      <div key={s.n} className="border-l-2 border-blue-200 pl-2.5">
                        <p className="text-[11px] font-bold text-slate-700">
                          [{s.n}] {s.clause ? `${s.clause} · ` : ""}{s.title}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {s.docType}{s.effectiveDate ? ` · ${s.effectiveDate} 시행` : ""}
                          {s.url && (
                            <a href={s.url} target="_blank" rel="noreferrer" className="ml-1.5 text-blue-600 inline-flex items-center gap-0.5">
                              원문 <ExternalLink size={9} />
                            </a>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{s.excerpt}…</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {busy && <p className="text-xs text-slate-400 px-1">규정을 찾는 중…</p>}
        <div ref={endRef} />
      </div>

      {hints.length > 0 && (
        <div className="shrink-0 border-t border-slate-100 bg-white px-3 pt-2 pb-1 space-y-0.5">
          {hints.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => ask(h)}
              className="w-full text-left text-xs text-slate-600 px-2 py-1.5 rounded-lg active:bg-slate-100 flex items-center gap-1.5"
            >
              <Search size={11} className="text-slate-300 shrink-0" />
              <span className="truncate">{h}</span>
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="예: 정기검사 주기가 어떻게 되나요?"
          className="flex-1 min-w-0 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => ask()}
          disabled={busy || !q.trim()}
          className="shrink-0 bg-blue-700 disabled:bg-slate-300 text-white rounded-xl px-4 flex items-center"
          aria-label="질문하기"
        >
          <Search size={16} />
        </button>
      </div>
    </div>
  );
}

// 답변 속 [1] 인용을 눌러 근거를 펼치게 한다 — 근거를 못 찾으면 답변을 못 믿는다.
function AnswerText({ text, onCite }) {
  const parts = String(text).split(/(\[\d+\])/g);
  return (
    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
      {parts.map((p, i) =>
        /^\[\d+\]$/.test(p) ? (
          <button
            key={i}
            type="button"
            onClick={onCite}
            className="text-blue-700 font-bold align-baseline"
          >
            {p}
          </button>
        ) : (
          p
        )
      )}
    </p>
  );
}

// 답변 평가 — 법령 답변은 "근거를 몇 건 찾았나"로는 품질을 못 본다(근거 1건을 찾고도
// 엉뚱하게 답한 적이 있다). 사람이 틀렸다고 눌러주는 게 유일하게 믿을 수 있는 신호다.
// 한 번 누르면 바꾸지 못하게 둔다 — 되돌리기까지 만들 만큼 중요한 상호작용은 아니다.
function RateButtons({ value, onRate }) {
  if (value) {
    return (
      <span className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-1 ${value === 1 ? "text-blue-600" : "text-slate-400"}`}>
        {value === 1 ? <ThumbsUp size={11} /> : <ThumbsDown size={11} />}
        {value === 1 ? "도움됨" : "알려주셔서 감사합니다"}
      </span>
    );
  }
  return (
    <>
      <button type="button" onClick={() => onRate(1)} aria-label="도움이 됐어요"
        className="text-slate-300 active:text-blue-600 px-1.5 py-1">
        <ThumbsUp size={12} />
      </button>
      <button type="button" onClick={() => onRate(-1)} aria-label="정확하지 않아요"
        className="text-slate-300 active:text-slate-600 px-1.5 py-1">
        <ThumbsDown size={12} />
      </button>
    </>
  );
}

// 현장에서 답변을 게시판·카톡에 옮겨 적는 일이 잦다 → 복사 한 번으로.
function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {}
      }}
      className="text-[10px] font-bold text-slate-400 flex items-center gap-1 px-1.5 py-1"
    >
      {done ? <><Check size={11} /> 복사됨</> : <><Copy size={11} /> 복사</>}
    </button>
  );
}
