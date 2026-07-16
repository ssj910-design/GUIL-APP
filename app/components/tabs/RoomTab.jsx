import { useState, useContext } from "react";
import { Send } from "lucide-react";
import { AuthContext } from "@/app/components/context";



export function RoomTab({ feed, onSendChat }) {
  const { name: CURRENT_ENGINEER, role, signOut, profiles } = useContext(AuthContext);
  const [chatInput, setChatInput] = useState("");

  function sendChat() {
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput("");
  }

  // @태그 자동완성 — 입력 끝이 "@이름일부"면 후보 칩을 보여준다
  const tagMatch = /@([가-힣a-zA-Z0-9()]*)$/.exec(chatInput);
  const tagCands = tagMatch
    ? (profiles ?? []).map((p) => p.name).filter((n) => n !== CURRENT_ENGINEER && n.includes(tagMatch[1])).slice(0, 5)
    : [];
  const pickTag = (n) => setChatInput(chatInput.replace(/@[가-힣a-zA-Z0-9()]*$/, "@" + n + " "));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
        <p className="text-sm font-bold text-slate-800">사내 피드</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">{CURRENT_ENGINEER}{role === "admin" ? " · 관리자" : ""}</span>
          <button onClick={signOut} className="text-[11px] font-bold text-slate-400 active:text-slate-600">
            로그아웃
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
        {feed.map((p) => {
          const mine = p.author === CURRENT_ENGINEER;
          return (
            <div key={p.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                {!mine && <p className="text-[11px] font-bold text-slate-500 mb-1 px-1">{p.author}</p>}
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? "bg-blue-700 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-700 rounded-bl-sm"}`}>
                  {(p.text ?? "").split(/(@[가-힣a-zA-Z0-9()]+)/g).map((s, i) =>
                    s.startsWith("@")
                      ? <b key={i} className={mine ? "text-amber-300" : "text-blue-700"}>{s}</b>
                      : s
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 px-1">{p.time}</p>
              </div>
            </div>
          );
        })}
      </div>
      {tagCands.length > 0 && (
        <div className="shrink-0 bg-white border-t border-slate-100 px-4 py-2 flex gap-2 overflow-x-auto">
          {tagCands.map((n) => (
            <button key={n} onClick={() => pickTag(n)} className="text-xs font-bold text-blue-700 bg-blue-50 rounded-full px-3 py-1.5 whitespace-nowrap">
              @{n}
            </button>
          ))}
        </div>
      )}
      <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-2">
        <input
          className="flex-1 border border-slate-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="메시지를 입력하세요"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendChat()}
        />
        <button
          onClick={sendChat}
          disabled={!chatInput.trim()}
          className="w-10 h-10 rounded-full bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center shrink-0 active:bg-blue-800"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
