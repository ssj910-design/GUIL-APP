import { useState, useContext, useEffect, useRef } from "react";
import { Send, Plus, X } from "lucide-react";
import { AuthContext } from "@/app/components/context";
import { uploadPhoto } from "@/lib/photos";

const isVideo = (url) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);

export function RoomTab({ feed, onSendChat, onToggleLike }) {
  const { name: CURRENT_ENGINEER, role, signOut, profiles } = useContext(AuthContext);
  const [chatInput, setChatInput] = useState("");
  const [replyTo, setReplyTo] = useState(null); // 답장 대상 글
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  function sendChat() {
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim(), { replyToId: replyTo?.id ?? null });
    setChatInput("");
    setReplyTo(null);
  }

  // + 첨부: 모바일에서 accept가 이미지/영상이면 OS가 카메라·사진첩 선택지를 띄운다
  async function pickFiles(e) {
    const files = [...(e.target.files ?? [])].slice(0, 5);
    e.target.value = "";
    if (!files.length) return;
    if (files.some((f) => f.size > 50 * 1024 * 1024)) return alert("파일당 50MB까지 보낼 수 있어요");
    setUploading(true);
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadPhoto(f, "room"));
      onSendChat(chatInput.trim(), { photoUrls: urls, replyToId: replyTo?.id ?? null });
      setChatInput("");
      setReplyTo(null);
    } catch (err) {
      alert("업로드에 실패했습니다: " + err.message);
    }
    setUploading(false);
  }

  // @멘션 피커(팀즈식) — "@"를 치는 순간 @모두 + 전체 팀원 목록이 뜨고, 이어 치면 좁혀진다
  const tagMatch = /@([가-힣a-zA-Z0-9()]*)$/.exec(chatInput);
  const memberNames = (profiles ?? []).map((p) => p.name).filter((n) => n !== CURRENT_ENGINEER);
  const tagCands = tagMatch ? ["모두", ...memberNames].filter((n) => n.includes(tagMatch[1])) : [];
  const pickTag = (n) => setChatInput(chatInput.replace(/@[가-힣a-zA-Z0-9()]*$/, "@" + n + " "));

  // 카톡식: 열릴 때·새 글 도착 시 맨 아래(최신)로 스크롤
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
        {feed.map((p) => {
          const mine = p.author === CURRENT_ENGINEER;
          const orig = p.replyToId ? feed.find((f) => f.id === p.replyToId) : null;
          const likes = p.reactions?.["👍"] ?? [];
          const liked = likes.includes(CURRENT_ENGINEER);
          return (
            <div key={p.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                {!mine && <p className="text-[11px] font-bold text-slate-500 mb-1 px-1">{p.author}</p>}
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? "bg-blue-700 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-700 rounded-bl-sm"}`}>
                  {orig && (
                    <div className={`text-[11px] rounded-lg px-2 py-1 mb-1.5 ${mine ? "bg-blue-800/70 text-blue-100" : "bg-slate-100 text-slate-500"}`}>
                      <b>{orig.author}</b> · {(orig.text || "사진").slice(0, 30)}{(orig.text ?? "").length > 30 ? "…" : ""}
                    </div>
                  )}
                  {(p.text ?? "").split(/(@[가-힣a-zA-Z0-9()]+)/g).map((s, i) =>
                    s.startsWith("@")
                      ? <b key={i} className={mine ? "text-amber-300" : "text-blue-700"}>{s}</b>
                      : s
                  )}
                  {(p.photoUrls ?? []).map((u) =>
                    isVideo(u)
                      ? <video key={u} src={u} controls playsInline className="rounded-lg max-w-full mt-1.5" />
                      : <img key={u} src={u} alt="첨부 사진" className="rounded-lg max-w-full mt-1.5" />
                  )}
                </div>
                <div className={`flex items-center gap-2.5 mt-1 px-1 ${mine ? "flex-row-reverse" : ""}`}>
                  <p className="text-[10px] text-slate-400">{p.time}</p>
                  <button onClick={() => setReplyTo(p)} className="text-[10px] font-bold text-slate-400 active:text-blue-600">답장</button>
                  <button
                    onClick={() => onToggleLike?.(p.id)}
                    className={`text-[10px] font-bold ${liked ? "text-blue-600" : "text-slate-400"}`}
                  >
                    👍{likes.length > 0 ? ` ${likes.length}` : ""}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {tagCands.length > 0 && (
        <div className="shrink-0 bg-white border-t border-slate-200 max-h-44 overflow-y-auto shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          {tagCands.map((n) => (
            <button
              key={n}
              onClick={() => pickTag(n)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-50 active:bg-blue-50 text-left"
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                n === "모두" ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"
              }`}>
                {n === "모두" ? "@" : n[0]}
              </span>
              <span className="text-sm font-bold text-slate-700">{n === "모두" ? "모두" : n}</span>
              {n === "모두" && <span className="text-[11px] text-slate-400">전체에게 알림</span>}
            </button>
          ))}
        </div>
      )}

      {replyTo && (
        <div className="shrink-0 bg-white border-t border-slate-100 px-4 py-2 flex items-center gap-2 text-xs">
          <span className="text-slate-400 shrink-0">답장:</span>
          <span className="font-bold text-slate-600 truncate flex-1">{replyTo.author} · {replyTo.text || "사진"}</span>
          <button onClick={() => setReplyTo(null)} className="p-1 text-slate-400"><X size={14} /></button>
        </div>
      )}

      <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={pickFiles} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="사진·영상 첨부"
          className="w-10 h-10 rounded-full border border-slate-300 text-slate-500 disabled:text-slate-300 flex items-center justify-center shrink-0 active:bg-slate-100"
        >
          <Plus size={18} />
        </button>
        <input
          className="flex-1 border border-slate-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={uploading ? "업로드 중..." : "메시지를 입력하세요"}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendChat()}
          disabled={uploading}
        />
        <button
          onClick={sendChat}
          disabled={!chatInput.trim() || uploading}
          className="w-10 h-10 rounded-full bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center shrink-0 active:bg-blue-800"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
