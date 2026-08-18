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
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setRows(null); setErr("");
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const ev = await supabase.from("ui_events").select("screen,role").gte("created_at", since).limit(20000);
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

      <p className="text-[11px] text-slate-400">
        검사기준 Q&A의 질문·답변·평가는 <b>검사기준 Q&A</b> 탭에서 봅니다.
      </p>

    </div>
  );
}
