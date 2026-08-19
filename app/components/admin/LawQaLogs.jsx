"use client";

// 검사기준 Q&A 로그 — 챗봇이 실제로 무엇을 묻고 어떻게 답했는지 본다.
//
// 이 화면의 목적은 통계가 아니라 **고칠 거리를 찾는 것**이다. 그래서 숫자보다 목록이 중심이고,
// 실패한 질문을 눌러 답변·근거·검색어까지 펼쳐볼 수 있게 했다.
//
// 진단은 두 갈래로 갈린다 — 고치는 곳이 다르기 때문에 화면에서도 구분한다:
//   근거 0건        → 검색어를 잘못 뽑았거나 자료에 없다   (검색어 규칙 / 문서 추가)
//   근거는 있는데 싫어요 → 조항은 찾았는데 답을 잘못 만들었다 (답변 프롬프트)
//
// ⚠️ 누가 물었는지는 저장하지 않는다(마이그 123). 질문 내용만으로 판단한다 —
//    개인별 사용량을 보는 순간 개선 도구가 아니라 감시 도구가 된다.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ThumbsUp, ThumbsDown, Search, AlertCircle } from "lucide-react";

const DAYS = [7, 14, 30, 90];

// OpenAI 단가 (2026-08 기준, USD/1M토큰) — 바뀌면 여기만 고친다.
// 토큰은 DB에 그대로 쌓고 곱셈은 화면에서 한다(마이그 120) — 단가가 바뀌어도 과거를 다시 계산할 수 있다.
const PRICE = { in: 0.40, out: 1.60, embed: 0.02 };   // gpt-4.1-mini + text-embedding-3-small
const USD_KRW = 1450;

function costOf(rows) {
  const t = rows.reduce((a, r) => {
    const k = r.tokens ?? {};
    return { in: a.in + (k.in ?? 0), out: a.out + (k.out ?? 0), embed: a.embed + (k.embed ?? 0) };
  }, { in: 0, out: 0, embed: 0 });
  const usd = (t.in * PRICE.in + t.out * PRICE.out + t.embed * PRICE.embed) / 1_000_000;
  return { ...t, usd, krw: usd * USD_KRW, measured: rows.filter((r) => r.tokens).length };
}

// 목록을 좁히는 기준. "왜 못 찾았나 / 뭐가 좋았나"를 바로 보려는 것이라 이 4개면 충분하다.
const FILTERS = [
  { id: "all", label: "전체" },
  { id: "notfound", label: "답 못 찾음", hint: "검색어가 빗나갔거나 자료에 없다" },
  { id: "bad", label: "부정확", hint: "근거는 찾았는데 답이 틀렸다" },
  { id: "good", label: "좋은 사례", hint: "도움됐다고 평가된 질문" },
];

export default function LawQaLogs() {
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);   // 펼친 행 id
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setRows(null); setErr("");
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from("law_qa_logs")
        .select("id,question,keywords,source_count,rating,entry_point,answer,sources,tokens,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (!alive) return;
      if (error) { setErr(error.message); setRows([]); return; }
      setRows(data ?? []);
    })();
    return () => { alive = false; };
  }, [days]);

  const all = rows ?? [];
  const shown = all.filter((r) =>
    filter === "notfound" ? r.source_count === 0
    : filter === "bad" ? r.rating === -1
    : filter === "good" ? r.rating === 1
    : true
  );

  const cost = costOf(all);
  // 하루 평균으로 한 달을 어림한다 — "지금 페이스면 월 얼마"가 실제로 궁금한 숫자다.
  const perDay = cost.krw / days;
  const answered = all.filter((r) => r.source_count > 0).length;
  const rated = all.filter((r) => r.rating);
  const up = rated.filter((r) => r.rating === 1).length;


  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-extrabold text-slate-800">검사기준 Q&A 로그</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            무엇을 묻고 어떻게 답했는지 — 질문을 눌러 답변·근거·검색어를 펼쳐볼 수 있습니다 (<b>익명</b>)
          </p>
        </div>
        <div className="flex gap-1">
          {DAYS.map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border ${days === d ? "bg-blue-700 text-white border-blue-700" : "text-slate-500 border-slate-200"}`}>
              {d}일
            </button>
          ))}
        </div>
      </div>

      {err && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          로그를 불러오지 못했습니다 — 마이그레이션 123·118이 실행됐는지 확인해주세요. ({err})
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="질문" value={all.length.toLocaleString()} sub={`최근 ${days}일`} />
        <Kpi label="근거를 찾은 비율" value={all.length ? `${Math.round((answered / all.length) * 100)}%` : "—"}
             sub={`${answered} / ${all.length}건`}
             tone={all.length && answered / all.length < 0.7 ? "text-amber-600" : "text-slate-800"} />
        <Kpi label="도움됐다는 평가" value={rated.length ? `${Math.round((up / rated.length) * 100)}%` : "—"}
             sub={rated.length ? `${up}↑ ${rated.length - up}↓` : "아직 평가 없음"}
             tone={rated.length && up / rated.length < 0.6 ? "text-rose-600" : "text-slate-800"} />
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-[11px] font-bold text-slate-400">GPT 비용</p>
          <p className="text-xl font-extrabold tabular-nums text-slate-800">
            {cost.krw < 1 && cost.krw > 0 ? "1원 미만" : `${Math.round(cost.krw).toLocaleString()}원`}
          </p>
          <p className="text-[10px] text-slate-400">
            질문당 {all.length ? (cost.krw / all.length).toFixed(1) : "0"}원 · 월 약 {Math.round(perDay * 30).toLocaleString()}원 예상
          </p>
          {cost.measured < all.length && (
            <p className="text-[10px] text-amber-600 mt-0.5">
              {all.length - cost.measured}건은 기록 전 질문(실제 비용은 조금 더 큼)
            </p>
          )}
        </div>

      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const n = f.id === "all" ? all.length
            : f.id === "notfound" ? all.filter((r) => r.source_count === 0).length
            : f.id === "bad" ? all.filter((r) => r.rating === -1).length
            : all.filter((r) => r.rating === 1).length;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} title={f.hint}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                filter === f.id ? "bg-slate-800 text-white border-slate-800" : "text-slate-500 border-slate-200 bg-white"
              }`}>
              {f.label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {FILTERS.find((f) => f.id === filter)?.hint && (
        <p className="text-[11px] text-slate-400 -mt-1">{FILTERS.find((f) => f.id === filter).hint}</p>
      )}

      {rows === null ? (
        <p className="text-xs text-slate-400">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-slate-400 bg-white border border-slate-200 rounded-xl px-4 py-6 text-center">
          {all.length === 0 ? "아직 질문 기록이 없습니다." : "해당하는 질문이 없습니다."}
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {shown.map((r) => (
            <LogRow key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone = "text-slate-800" }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-[11px] font-bold text-slate-400">{label}</p>
      <p className={`text-xl font-extrabold tabular-nums ${tone}`}>{value}</p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  );
}

function LogRow({ r, open, onToggle }) {
  const notFound = r.source_count === 0;
  const when = new Date(r.created_at).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div>
      <button type="button" onClick={onToggle} className="w-full text-left px-4 py-2.5 active:bg-slate-50 hover:bg-slate-50/60">
        <div className="flex items-center gap-2">
          {notFound
            ? <AlertCircle size={13} className="text-amber-500 shrink-0" />
            : <Search size={13} className="text-slate-300 shrink-0" />}
          <p className="text-xs text-slate-700 flex-1 truncate">{r.question}</p>
          {r.rating === 1 && <ThumbsUp size={12} className="text-blue-600 shrink-0" />}
          {r.rating === -1 && <ThumbsDown size={12} className="text-rose-500 shrink-0" />}
          <p className={`text-[10px] font-bold tabular-nums shrink-0 ${notFound ? "text-amber-600" : "text-slate-400"}`}>
            근거 {r.source_count ?? 0}
          </p>
          <p className="text-[10px] text-slate-300 shrink-0 w-20 text-right">{when}</p>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3.5 pt-1 space-y-2.5 bg-slate-50/60">
          {r.tokens && (
            <p className="text-[10px] text-slate-400">
              토큰 입력 {r.tokens.in ?? 0} · 출력 {r.tokens.out ?? 0} · 임베딩 {r.tokens.embed ?? 0}
              {" · "}
              {(((r.tokens.in ?? 0) * PRICE.in + (r.tokens.out ?? 0) * PRICE.out + (r.tokens.embed ?? 0) * PRICE.embed) / 1_000_000 * USD_KRW).toFixed(2)}원
            </p>
          )}
          <Field label="검색어">
            {r.keywords?.length ? (
              <span className="flex flex-wrap gap-1">
                {r.keywords.map((k, i) => (
                  <span key={i} className="text-[11px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{k}</span>
                ))}
              </span>
            ) : <span className="text-[11px] text-slate-400">없음</span>}
          </Field>

          {notFound ? (
            // 왜 못 찾았는지 판단하려면 검색어를 봐야 한다 — 대개 둘 중 하나다.
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
              근거를 찾지 못했습니다. 위 검색어가 <b>법령 원문에 실제로 쓰이는 말인지</b> 보세요 —
              현장 용어·합성어면 검색어 규칙(app/api/law-qa)을 고치고, 원문에 있는 말인데도 없다면
              해당 법령 문서가 자료에 안 들어간 것입니다.
            </p>
          ) : (
            <>
              <Field label="근거로 삼은 조항">
                {r.sources?.length ? (
                  <ul className="space-y-0.5">
                    {r.sources.slice(0, 8).map((s, i) => (
                      <li key={i} className="text-[11px] text-slate-500">
                        <span className="text-slate-400">[{i + 1}]</span> {s.clause ? `${s.clause} · ` : ""}{s.title}
                      </li>
                    ))}
                  </ul>
                ) : <span className="text-[11px] text-slate-400">기록 없음 (마이그 118 이전 질문)</span>}
              </Field>
              <Field label="답변">
                {r.answer
                  ? <p className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">{r.answer}</p>
                  : <span className="text-[11px] text-slate-400">기록 없음 (마이그 118 이전 질문)</span>}
              </Field>
            </>
          )}

          {r.rating === -1 && !notFound && (
            <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 leading-relaxed">
              조항은 찾았는데 <b>부정확하다고 평가된 답변</b>입니다. 위 조항이 질문과 맞다면 답변 프롬프트를,
              조항 자체가 엉뚱하다면 검색을 고쳐야 합니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 mb-1">{label}</p>
      {children}
    </div>
  );
}
