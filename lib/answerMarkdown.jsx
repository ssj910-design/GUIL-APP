// 챗봇 답변 렌더러 — 서버 프롬프트가 내보내는 마크다운만 그린다.
//
// 라이브러리를 안 쓴 이유: 우리가 출력 형식을 프롬프트로 정하므로 나오는 문법이 정해져 있고
// (제목·볼드·불릿·번호·표), **[1] 인용을 눌러 근거를 펼치는 처리**가 본문 곳곳에 들어가야 해서
// 범용 파서에 커스텀 렌더러를 끼우는 것보다 직접 그리는 편이 짧고 확실하다.
//
// 지원: ### 제목 / **볼드** / - 불릿 / 1. 번호 / | 표 | / [1] 인용 버튼
// 그 외 문법(링크·이미지·코드)은 답변에 나올 일이 없어 처리하지 않는다 — 나오면 그냥 글자로 보인다.
import { Fragment } from "react";

// 한 줄 안의 **볼드**와 [1] 인용을 조각으로 나눈다.
function Inline({ text, onCite }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\[\d+\])/g).filter(Boolean);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={i} className="font-bold text-slate-900">{p.slice(2, -2)}</b>;
    if (/^\[\d+\]$/.test(p)) {
      return (
        <button key={i} type="button" onClick={onCite}
          className="text-blue-700 font-bold align-baseline mx-0.5">{p}</button>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function AnswerMarkdown({ text, onCite }) {
  const lines = String(text ?? "").split("\n");
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 표 — 헤더 + 구분선이 이어질 때만 표로 본다(그냥 |가 든 문장을 표로 오해하지 않게).
    if (isTableRow(line) && isDivider(lines[i + 1] ?? "")) {
      const head = cells(line);
      const body = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) body.push(cells(lines[j++]));
      out.push(
        // 표가 넓으면 화면 전체가 옆으로 밀리지 않게 자기 영역 안에서만 스크롤시킨다.
        <div key={i} className="overflow-x-auto -mx-1 my-2">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>{head.map((c, k) => (
                <th key={k} className="text-left font-bold text-slate-500 border-b border-slate-300 px-2 py-1.5 whitespace-nowrap">
                  <Inline text={c} onCite={onCite} />
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k} className="border-b border-slate-100 last:border-0">
                  {r.map((c, m) => (
                    <td key={m} className="px-2 py-1.5 text-slate-700 align-top">
                      <Inline text={c} onCite={onCite} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j - 1;
      continue;
    }

    // 제목 — #~### 를 모두 같은 크기로 그린다. 답변 안에서 단계가 깊어질 일이 없다.
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      out.push(
        <p key={i} className="text-[13px] font-extrabold text-slate-800 mt-3 first:mt-0">
          <Inline text={h[1]} onCite={onCite} />
        </p>
      );
      continue;
    }

    // 불릿 / 번호 — 들여쓰기 두 칸마다 한 단계 더 들어간 것으로 본다.
    const li = line.match(/^(\s*)([-*•]|\d+\.)\s+(.*)$/);
    if (li) {
      const depth = Math.min(2, Math.floor(li[1].length / 2));
      const ordered = /\d/.test(li[2]);
      out.push(
        <div key={i} className="flex gap-1.5 text-sm text-slate-700 leading-relaxed" style={{ paddingLeft: depth * 12 }}>
          <span className="text-slate-400 shrink-0">{ordered ? li[2] : "·"}</span>
          <span className="flex-1"><Inline text={li[3]} onCite={onCite} /></span>
        </div>
      );
      continue;
    }

    if (!line.trim()) { out.push(<div key={i} className="h-2" />); continue; }

    out.push(
      <p key={i} className="text-sm text-slate-800 leading-relaxed">
        <Inline text={line} onCite={onCite} />
      </p>
    );
  }
  return <div className="space-y-0.5">{out}</div>;
}
