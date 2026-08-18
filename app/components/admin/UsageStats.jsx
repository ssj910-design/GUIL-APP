"use client";

// 사용 현황 — "어느 화면을 실제로 쓰나"를 보고 UI를 정리하기 위한 개발용 지표.
//
// ⚠️ 여기 나오는 건 전부 **익명 집계**다. 누가 눌렀는지는 애초에 저장하지 않는다(마이그 124).
// 개인별 사용량을 보여주는 순간 UI 개선 도구가 아니라 감시 도구가 되므로, 그 방향으로는
// 확장하지 않는다 — 위치정보 수집을 중단한 것과 같은 기준.
//
// 지금 이 화면으로 답하려는 질문:
//  1) 하단 탭이 11개까지 늘었다 — 실제로 안 쓰는 화면은 뭔가? (줄일 근거)
//  2) 검사기준 Q&A를 헤더·플로팅·하단탭 3곳에 뒀는데 어디로 들어오나? (1곳만 남기려고)
//  3) 챗봇이 답 못 한 질문은 뭔가? (문서·예시질문 보강 재료)
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const DAYS = [7, 14, 30];

// 탭 id → 사람이 읽는 이름 (기록은 id로 남기고 표시할 때만 바꾼다)
const SCREEN_LABEL = {
  home: "홈", sites: "현장정보", failure: "고장접수", checkup: "자체점검", inspection: "검사관리",
  material: "자재·견적", inventory: "재고관리", billing: "청구", todo: "할일관리",
  workcalendar: "워크캘린더", lawqa: "검사기준 Q&A", room: "게시판", admin: "관리자 모드",
};
const labelOf = (s) =>
  s?.startsWith("admin:") ? `콘솔 · ${s.slice(6)}` : SCREEN_LABEL[s] ?? s;

const ENTRY_LABEL = { header: "헤더 아이콘", fab: "플로팅 버튼", tab: "하단 탭" };

export default function UsageStats() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState(null);
  const [entries, setEntries] = useState([]);
  const [unanswered, setUnanswered] = useState([]);
  const [bad, setBad] = useState([]);                       // 답은 했는데 "정확하지 않다"고 평가된 것
  const [rating, setRating] = useState({ up: 0, down: 0 });
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setRows(null); setErr("");
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const [ev, qa] = await Promise.all([
        supabase.from("ui_events").select("screen,role").gte("created_at", since).limit(20000),
        supabase.from("law_qa_logs").select("entry_point,question,source_count,rating").gte("created_at", since).limit(2000),
      ]);
      if (!alive) return;
      // 테이블이 아직 없으면(마이그 미실행) 그렇게 안내한다 — 빈 화면보다 낫다.
      if (ev.error) { setErr(ev.error.message); setRows([]); return; }

      const byScreen = new Map();
      for (const e of ev.data ?? []) {
        const cur = byScreen.get(e.screen) ?? { screen: e.screen, total: 0, engineer: 0, admin: 0 };
        cur.total += 1;
        if (e.role === "admin") cur.admin += 1; else if (e.role === "engineer") cur.engineer += 1;
        byScreen.set(e.screen, cur);
      }
      setRows([...byScreen.values()].sort((a, b) => b.total - a.total));

      const byEntry = new Map();
      for (const q of qa.data ?? []) byEntry.set(q.entry_point ?? "(미상)", (byEntry.get(q.entry_point ?? "(미상)") ?? 0) + 1);
      setEntries([...byEntry.entries()].sort((a, b) => b[1] - a[1]));
      // "답을 못 찾음"과 "답은 했는데 틀림"은 다른 문제다 — 전자는 문서 보강, 후자는 검색·프롬프트 개선.
      setUnanswered((qa.data ?? []).filter((q) => q.source_count === 0).map((q) => q.question).slice(0, 30));
      setBad((qa.data ?? []).filter((q) => q.rating === -1 && q.source_count > 0).map((q) => q.question).slice(0, 30));
      const rated = (qa.data ?? []).filter((q) => q.rating);
      setRating({ up: rated.filter((q) => q.rating === 1).length, down: rated.filter((q) => q.rating === -1).length });
    })();
    return () => { alive = false; };
  }, [days]);

  const max = Math.max(1, ...(rows ?? []).map((r) => r.total));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-extrabold text-slate-800">사용 현황</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            어느 화면을 실제로 쓰는지 — <b>익명 집계</b>입니다(누가 눌렀는지는 저장하지 않습니다)
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
          아직 기록 테이블이 없습니다 — 마이그레이션 124(ui_events)·123(law_qa_logs)을 실행해주세요. ({err})
        </p>
      )}

      {rows === null ? (
        <p className="text-xs text-slate-400">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">아직 기록이 없습니다. 앱을 쓰기 시작하면 여기에 쌓입니다.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-500 mb-3">화면별 열람 수</p>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.screen} className="flex items-center gap-3">
                <p className="text-xs text-slate-700 w-32 shrink-0 truncate">{labelOf(r.screen)}</p>
                <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${(r.total / max) * 100}%` }} />
                </div>
                <p className="text-xs font-bold text-slate-700 w-24 text-right tabular-nums">
                  {r.total.toLocaleString()}
                  <span className="ml-1 text-[10px] font-medium text-slate-400">기{r.engineer}·관{r.admin}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-500 mb-1">검사기준 Q&A — 어디로 들어오나</p>
          <p className="text-[10px] text-slate-400 mb-3">3곳에 둔 진입점 중 실제 질문까지 이어진 것만 셉니다 → 많이 쓰는 1곳만 남길 예정</p>
          {entries.length === 0 ? (
            <p className="text-xs text-slate-400">아직 질문 기록이 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {entries.map(([k, n]) => (
                <div key={k} className="flex items-center justify-between">
                  <p className="text-xs text-slate-700">{ENTRY_LABEL[k] ?? k}</p>
                  <p className="text-xs font-bold text-slate-800 tabular-nums">{n}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-500 mb-1">답변 만족도</p>
          <p className="text-[10px] text-slate-400 mb-3">
            근거 건수로는 품질을 못 본다(근거를 찾고도 엉뚱하게 답할 수 있다) — 사람이 눌러준 게 유일한 신호다
          </p>
          {rating.up + rating.down === 0 ? (
            <p className="text-xs text-slate-400">아직 평가가 없습니다.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-extrabold text-slate-800 tabular-nums">
                  {Math.round((rating.up / (rating.up + rating.down)) * 100)}%
                </p>
                <p className="text-[11px] text-slate-500">
                  도움됨 {rating.up} · 부정확 {rating.down}
                </p>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mt-2">
                <div className="bg-blue-500" style={{ width: `${(rating.up / (rating.up + rating.down)) * 100}%` }} />
                <div className="bg-rose-400 flex-1" />
              </div>
            </>
          )}
          {bad.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[11px] font-bold text-rose-500 mb-1.5">정확하지 않다고 평가된 질문</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {bad.map((q, i) => (
                  <li key={i} className="text-xs text-slate-600 border-l-2 border-rose-200 pl-2">{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-500 mb-1">답을 못 찾은 질문</p>
          <p className="text-[10px] text-slate-400 mb-3">문서를 더 넣거나 예시 질문을 고칠 재료입니다</p>
          {unanswered.length === 0 ? (
            <p className="text-xs text-slate-400">없습니다.</p>
          ) : (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {unanswered.map((q, i) => (
                <li key={i} className="text-xs text-slate-600 border-l-2 border-slate-200 pl-2">{q}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
