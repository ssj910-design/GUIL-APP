import { useState, useContext, useRef } from "react";
import { Send, Plus, X, Download, MessageCircle, ThumbsUp } from "lucide-react";
import { AuthContext } from "@/app/components/context";
import { uploadPhoto, downloadPhoto } from "@/lib/photos";

const isVideo = (url) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);

function renderText(text) {
  return (text ?? "").split(/(@[가-힣a-zA-Z0-9()]+)/g).map((s, i) =>
    s.startsWith("@") ? <b key={i} className="text-blue-700">{s}</b> : s
  );
}

function CommentRow({ c, onLike, liked, likeCount }) {
  return (
    <div className="flex gap-2 py-1">
      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0">
        {(c.author || "?")[0]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="bg-slate-100 rounded-2xl px-3 py-1.5 inline-block max-w-full">
          <span className="text-xs font-bold text-slate-700 mr-1.5">{c.author}</span>
          <span className="text-xs text-slate-700">{renderText(c.text)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 px-1">
          <span className="text-[10px] text-slate-400">{c.time}</span>
          <button onClick={onLike} className={`text-[10px] font-bold ${liked ? "text-blue-600" : "text-slate-400"}`}>
            좋아요{likeCount > 0 ? ` ${likeCount}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoomTab({ feed, onSendChat, onToggleLike }) {
  const { name: CURRENT_ENGINEER, role, signOut, profiles } = useContext(AuthContext);
  const [composing, setComposing] = useState(false);
  const [postInput, setPostInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const fileRef = useRef(null);

  const posts = [...feed].filter((p) => !p.replyToId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const commentsOf = (postId) =>
    feed.filter((p) => p.replyToId === postId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  function submitPost() {
    if (!postInput.trim()) return;
    onSendChat(postInput.trim(), { replyToId: null });
    setPostInput("");
    setComposing(false);
  }

  async function pickFiles(e) {
    const files = [...(e.target.files ?? [])].slice(0, 5);
    e.target.value = "";
    if (!files.length) return;
    if (files.some((f) => f.size > 50 * 1024 * 1024)) return alert("파일당 50MB까지 보낼 수 있어요");
    setUploading(true);
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadPhoto(f, "room"));
      onSendChat(postInput.trim(), { photoUrls: urls, replyToId: null });
      setPostInput("");
      setComposing(false);
    } catch (err) {
      alert("업로드에 실패했습니다: " + err.message);
    }
    setUploading(false);
  }

  // @멘션 피커 — 글쓰기 입력에서만 지원 (댓글은 텍스트만)
  const tagMatch = /@([가-힣a-zA-Z0-9()]*)$/.exec(postInput);
  const memberNames = (profiles ?? []).map((p) => p.name).filter((n) => n !== CURRENT_ENGINEER);
  const tagCands = composing && tagMatch ? ["모두", ...memberNames].filter((n) => n.includes(tagMatch[1])) : [];
  const pickTag = (n) => setPostInput(postInput.replace(/@[가-힣a-zA-Z0-9()]*$/, "@" + n + " "));

  function submitComment(postId) {
    const text = (commentDrafts[postId] ?? "").trim();
    if (!text) return;
    onSendChat(text, { replyToId: postId });
    setCommentDrafts((d) => ({ ...d, [postId]: "" }));
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0 bg-white border-b border-slate-100">
        <p className="text-sm font-bold text-slate-800">사내 피드</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">{CURRENT_ENGINEER}{role === "admin" ? " · 관리자" : ""}</span>
          <button onClick={signOut} className="text-[11px] font-bold text-slate-400 active:text-slate-600">로그아웃</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* 글쓰기 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
          {!composing ? (
            <button onClick={() => setComposing(true)} className="w-full text-left text-sm text-slate-400 bg-slate-50 rounded-xl px-3.5 py-2.5">
              무슨 소식을 나눠볼까요?
            </button>
          ) : (
            <div>
              <textarea
                autoFocus
                className="w-full text-sm resize-none focus:outline-none min-h-[4.5rem]"
                placeholder="무슨 소식을 나눠볼까요? (@이름으로 태그)"
                value={postInput}
                onChange={(e) => setPostInput(e.target.value)}
              />
              {tagCands.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-2 max-h-40 overflow-y-auto">
                  {tagCands.map((n) => (
                    <button key={n} onClick={() => pickTag(n)} className="w-full flex items-center gap-2 px-3 py-2 border-b border-slate-50 last:border-0 active:bg-blue-50 text-left">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${n === "모두" ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"}`}>
                        {n === "모두" ? "@" : n[0]}
                      </span>
                      <span className="text-xs font-bold text-slate-700">{n}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={pickFiles} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="사진·영상 첨부" className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 flex items-center justify-center active:bg-slate-100">
                  <Plus size={16} />
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setComposing(false); setPostInput(""); }} className="text-xs font-bold text-slate-400 px-3 py-2">취소</button>
                  <button onClick={submitPost} disabled={!postInput.trim() || uploading} className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-full px-4 py-2">
                    {uploading ? "업로드 중..." : "게시"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 게시글 */}
        {posts.map((p) => {
          const likes = p.reactions?.["👍"] ?? [];
          const liked = likes.includes(CURRENT_ENGINEER);
          const comments = commentsOf(p.id);
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                  {(p.author || "?")[0]}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{p.author}</p>
                  <p className="text-[10px] text-slate-400">{p.time}</p>
                </div>
              </div>
              {p.text && <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mb-2">{renderText(p.text)}</p>}
              {(p.photoUrls ?? []).length > 0 && (
                <div className={`grid gap-1.5 mb-2 ${p.photoUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {p.photoUrls.map((u) =>
                    isVideo(u)
                      ? <video key={u} src={u} controls playsInline className="rounded-lg w-full" />
                      : <img key={u} src={u} alt="첨부 사진" className="rounded-lg w-full object-cover aspect-square" onClick={() => setViewerUrl(u)} />
                  )}
                </div>
              )}
              <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
                <button onClick={() => onToggleLike?.(p.id)} className={`flex items-center gap-1 text-xs font-bold ${liked ? "text-blue-600" : "text-slate-500"}`}>
                  <ThumbsUp size={14} className={liked ? "fill-blue-600" : ""} /> 좋아요{likes.length > 0 ? ` ${likes.length}` : ""}
                </button>
                <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
                  <MessageCircle size={14} /> 댓글{comments.length > 0 ? ` ${comments.length}` : ""}
                </span>
              </div>

              {comments.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                  {comments.map((c) => {
                    const cLikes = c.reactions?.["👍"] ?? [];
                    return <CommentRow key={c.id} c={c} onLike={() => onToggleLike?.(c.id)} liked={cLikes.includes(CURRENT_ENGINEER)} likeCount={cLikes.length} />;
                  })}
                </div>
              )}

              <div className="flex items-center gap-2 mt-2">
                <input
                  className="flex-1 bg-slate-100 rounded-full px-3.5 py-2 text-xs focus:outline-none"
                  placeholder="댓글을 입력하세요"
                  value={commentDrafts[p.id] ?? ""}
                  onChange={(e) => setCommentDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && submitComment(p.id)}
                />
                <button onClick={() => submitComment(p.id)} disabled={!(commentDrafts[p.id] ?? "").trim()} className="w-8 h-8 rounded-full bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center shrink-0">
                  <Send size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {posts.length === 0 && <p className="text-xs text-slate-400 text-center py-10">아직 게시글이 없습니다. 첫 소식을 올려보세요!</p>}
      </div>

      {/* 이미지 확대보기 — 저장/닫기 */}
      {viewerUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setViewerUrl(null)}>
          <div className="flex justify-end gap-2 p-4 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); downloadPhoto(viewerUrl, "우리방-사진"); }}
              className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"
              aria-label="사진 저장"
            >
              <Download size={18} />
            </button>
            <button className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label="닫기">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
            <img src={viewerUrl} alt="확대 사진" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </div>
  );
}
