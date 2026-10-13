"use client";

// 할 일 "작업 내역" — todo_history(마이그 150: todos 트리거가 쌓는 변경 이력)를 시간순으로 보여준다.
// 앱 할일 상세와 관리자웹 할일 상세 공용. 담당자 여러 명이 한 건으로 묶인 할일은 ids에 묶음 전체를
// 넘긴다 — 그룹 일괄 수정은 행 수만큼 같은 문구가 남으므로 (action, 문구, 시각)이 같으면 한 줄로 합친다.
// refreshKey가 바뀌면(저장·완료 직후) 다시 읽는다.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function fmt(iso) {
  return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// "신석주님이 …" → 이름만 굵게.
function Summary({ text }) {
  const m = text.match(/^(.+?)님(.*)$/s);
  if (!m) return <>{text}</>;
  return <><b className="font-bold text-slate-800">{m[1]}</b>님{m[2]}</>;
}

export function TodoHistory({ ids, refreshKey = "" }) {
  const [rows, setRows] = useState(null);
  const idsKey = ids.join(",");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("todo_history")
        .select("id,action,summary,created_at")
        .in("todo_id", idsKey.split(","))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (!alive) return;
      if (error) { setRows([]); return; }
      const seen = new Set();
      setRows((data ?? []).filter((r) => {
        const k = `${r.action}|${r.summary}|${r.created_at}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }));
    })();
    return () => { alive = false; };
  }, [idsKey, refreshKey]);

  return (
    <div>
      <p className="text-sm font-extrabold text-slate-800 mb-3">
        작업 내역{rows?.length ? <span className="text-blue-600 ml-1">{rows.length}</span> : null}
      </p>
      {rows === null ? (
        <p className="text-xs text-slate-400">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">작업 내역이 없습니다</p>
      ) : (
        <div>
          {rows.map((r, i) => (
            <div
              key={r.id}
              className={`relative pl-4 ml-1 ${i < rows.length - 1 ? "pb-4 border-l-2 border-slate-100" : "border-l-2 border-transparent"}`}
            >
              <span className="absolute -left-[6px] top-[3px] w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white" />
              <p className="text-[11px] text-slate-400 tabular-nums">{fmt(r.created_at)}</p>
              <p className="text-[13px] text-slate-600 leading-relaxed break-keep mt-0.5"><Summary text={r.summary} /></p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
