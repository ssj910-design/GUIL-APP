import { useState, useContext, useRef } from "react";
import { Send, Plus, X, Download, MessageCircle, ThumbsUp, MoreVertical, ChevronLeft, Pin } from "lucide-react";
import { AuthContext } from "@/app/components/context";
import { uploadPhoto, downloadPhoto } from "@/lib/photos";

const isVideo = (url) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);

function renderText(text) {
  return (text ?? "").split(/(@[가-힣a-zA-Z0-9()]+)/g).map((s, i) =>
    s.startsWith("@") ? <b key={i} className="text-blue-700">{s}</b> : s
  );
}

// 첨부파일 "⋮" 메뉴 — 공지로 등록, 삭제, (본인 글이면) 수정
function PostMenu({ post, mine, canNotice, onClose, onNotice, onEdit, onDelete }) {
  return (
    <div className="absolute right-0 top-6 z-10 bg-white rounded-xl border border-slate-200 shadow-lg py-1 w-36" onClick={(e) => e.stopPropagation()}>
      {canNotice && (
        <button onClick={() => { onNotice(); onClose(); }} className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 active:bg-slate-50">
          {post.isNotice ? "공지 해제" : "공지로 등록"}
        </button>
      )}
      {mine && (
        <button onClick={() => { onEdit(); onClose(); }} className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 active:bg-slate-50">
          수정하기
        </button>
      )}
      <button onClick={() => { onDelete(); onClose(); }} className="w-full text-left px-3.5 py-2 text-xs font-bold text-red-600 active:bg-red-50">
        삭제하기
      </button>
    </div>
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

// 게시글 헤더(작성자·시간·⋮메뉴) — 목록 카드/상세화면 공용
function PostHeader({ p, mine, canNotice, menuOpen, onToggleMenu, onCloseMenu, onNotice, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-2 mb-2 relative">
      <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
        {(p.author || "?")[0]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800 truncate flex items-center gap-1">
          {p.author}
          {p.isNotice && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5">
              <Pin size={9} /> 공지
            </span>
          )}
        </p>
        <p className="text-[10px] text-slate-400">{p.time}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
        className="p-1 text-slate-400 active:text-slate-600 shrink-0"
        aria-label="더보기"
      >
        <MoreVertical size={16} />
      </button>
      {menuOpen && (
        <PostMenu post={p} mine={mine} canNotice={canNotice} onClose={onCloseMenu} onNotice={onNotice} onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}

export function RoomTab({ feed, onSendChat, onToggleLike, onUpdatePost, onDeletePost, onSetNotice }) {
  const { name: CURRENT_ENGINEER, role, signOut, profiles } = useContext(AuthContext);
  const [composing, setComposing] = useState(false);
  const [postInput, setPostInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [menuFor, setMenuFor] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [openPostId, setOpenPostId] = useState(null);
  const fileRef = useRef(null);

  function goToPost(id) {
    setMenuFor(null);
    setOpenPostId(id);
  }

  const posts = [...feed]
    .filter((p) => !p.replyToId)
    .sort((a, b) => (b.isNotice ? 1 : 0) - (a.isNotice ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
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

  function startEdit(p) {
    setEditingId(p.id);
    setEditText(p.text ?? "");
  }
  function saveEdit() {
    if (!editText.trim()) return;
    onUpdatePost?.(editingId, editText.trim());
    setEditingId(null);
  }
  function deletePost(p) {
    if (!confirm("이 글을 삭제할까요? 댓글도 함께 삭제됩니다.")) return;
    onDeletePost?.(p.id);
    if (openPostId === p.id) setOpenPostId(null);
  }

  // 게시글 본문(텍스트 수정폼 포함) — 목록 카드/상세화면 공용
  function PostBody({ p, full }) {
    if (editingId === p.id) {
      return (
        <div className="mb-2">
          <textarea className="w-full text-sm border border-slate-200 rounded-xl p-2.5 resize-none focus:outline-none" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
          <div className="flex justify-end gap-2 mt-1.5">
            <button onClick={() => setEditingId(null)} className="text-xs font-bold text-slate-400 px-2.5 py-1.5">취소</button>
            <button onClick={saveEdit} className="text-xs font-bold text-white bg-blue-700 rounded-full px-3.5 py-1.5">저장</button>
          </div>
        </div>
      );
    }
    return (
      <div className={full ? "mb-2" : "flex items-start justify-between gap-2 mb-2"}>
        {p.text && <p className={`${full ? "" : "flex-1 min-w-0"} text-sm text-slate-700 leading-relaxed whitespace-pre-wrap`}>{renderText(p.text)}</p>}
        {(p.photoUrls ?? []).length > 0 && (
          full ? (
            <div className="space-y-1.5 mt-2">
              {p.photoUrls.map((u) =>
                isVideo(u)
                  ? <video key={u} src={u} controls playsInline className="rounded-lg w-full" />
                  : <img key={u} src={u} alt="첨부 사진" className="rounded-lg w-full object-cover" onClick={() => setViewerUrl(u)} />
              )}
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setViewerUrl(p.photoUrls[0]); }} className="relative shrink-0">
              {isVideo(p.photoUrls[0])
                ? <video src={p.photoUrls[0]} className="w-16 h-16 rounded-lg object-cover" />
                : <img src={p.photoUrls[0]} alt="첨부 사진" className="w-16 h-16 rounded-lg object-cover" />}
              {p.photoUrls.length > 1 && (
                <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[10px] font-bold rounded px-1">{p.photoUrls.length}</span>
              )}
            </button>
          )
        )}
      </div>
    );
  }

  const openPost = openPostId ? feed.find((p) => p.id === openPostId) : null;

  // ---- 게시글 상세화면 (첨부파일처럼 게시글을 누르면 진입) ----
  if (openPost) {
    const likes = openPost.reactions?.["👍"] ?? [];
    const liked = likes.includes(CURRENT_ENGINEER);
    const comments = commentsOf(openPost.id);
    const mine = openPost.author === CURRENT_ENGINEER;
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="px-4 pt-4 pb-2.5 flex items-center gap-2 shrink-0 border-b border-slate-100">
          <button onClick={() => { setMenuFor(null); setOpenPostId(null); }} className="p-1 text-slate-500 active:text-slate-800" aria-label="뒤로">
            <ChevronLeft size={20} />
          </button>
          <p className="text-sm font-bold text-slate-800">게시글</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <PostHeader
            p={openPost} mine={mine} canNotice={!!onSetNotice}
            menuOpen={menuFor === openPost.id}
            onToggleMenu={() => setMenuFor(menuFor === openPost.id ? null : openPost.id)}
            onCloseMenu={() => setMenuFor(null)}
            onNotice={() => onSetNotice?.(openPost.id, !openPost.isNotice)}
            onEdit={() => startEdit(openPost)}
            onDelete={() => deletePost(openPost)}
          />
          <PostBody p={openPost} full />
          <div className="flex items-center gap-4 py-2.5 border-t border-b border-slate-100">
            <button onClick={() => onToggleLike?.(openPost.id)} className={`flex items-center gap-1 text-xs font-bold ${liked ? "text-blue-600" : "text-slate-500"}`}>
              <ThumbsUp size={14} className={liked ? "fill-blue-600" : ""} /> 좋아요{likes.length > 0 ? ` ${likes.length}` : ""}
            </button>
            <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
              <MessageCircle size={14} /> 댓글 {comments.length}
            </span>
          </div>
          <div className="pt-2 space-y-0.5">
            {comments.length === 0
              ? <p className="text-xs text-slate-400 text-center py-6">첫 댓글을 남겨보세요</p>
              : comments.map((c) => {
                  const cLikes = c.reactions?.["👍"] ?? [];
                  return <CommentRow key={c.id} c={c} onLike={() => onToggleLike?.(c.id)} liked={cLikes.includes(CURRENT_ENGINEER)} likeCount={cLikes.length} />;
                })}
          </div>
        </div>
        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-2">
          <input
            className="flex-1 bg-slate-100 rounded-full px-3.5 py-2.5 text-sm focus:outline-none"
            placeholder="댓글을 입력하세요"
            value={commentDrafts[openPost.id] ?? ""}
            onChange={(e) => setCommentDrafts((d) => ({ ...d, [openPost.id]: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && submitComment(openPost.id)}
          />
          <button onClick={() => submitComment(openPost.id)} disabled={!(commentDrafts[openPost.id] ?? "").trim()} className="w-9 h-9 rounded-full bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center shrink-0">
            <Send size={14} />
          </button>
        </div>
        {viewerUrl && (
          <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setViewerUrl(null)}>
            <div className="flex justify-end gap-2 p-4 shrink-0">
              <button onClick={(e) => { e.stopPropagation(); downloadPhoto(viewerUrl, "우리방-사진"); }} className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label="사진 저장">
                <Download size={18} />
              </button>
              <button className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label="닫기"><X size={18} /></button>
            </div>
            <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
              <img src={viewerUrl} alt="확대 사진" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
            </div>
          </div>
        )}
      </div>
    );
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

        {/* 게시글 목록 — 카드를 누르면 상세화면(첨부파일처럼)으로 진입 */}
        {posts.map((p) => {
          const likes = p.reactions?.["👍"] ?? [];
          const liked = likes.includes(CURRENT_ENGINEER);
          const commentCount = commentsOf(p.id).length;
          const mine = p.author === CURRENT_ENGINEER;
          return (
            <div
              key={p.id}
              onClick={() => editingId !== p.id && goToPost(p.id)}
              className={`bg-white rounded-2xl border p-3.5 cursor-pointer ${p.isNotice ? "border-amber-300" : "border-slate-200"}`}
            >
              <PostHeader
                p={p} mine={mine} canNotice={!!onSetNotice}
                menuOpen={menuFor === p.id}
                onToggleMenu={() => setMenuFor(menuFor === p.id ? null : p.id)}
                onCloseMenu={() => setMenuFor(null)}
                onNotice={() => onSetNotice?.(p.id, !p.isNotice)}
                onEdit={() => startEdit(p)}
                onDelete={() => deletePost(p)}
              />
              <PostBody p={p} />
              <div className="flex items-center gap-4 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onToggleLike?.(p.id)} className={`flex items-center gap-1 text-xs font-bold ${liked ? "text-blue-600" : "text-slate-500"}`}>
                  <ThumbsUp size={14} className={liked ? "fill-blue-600" : ""} /> 좋아요{likes.length > 0 ? ` ${likes.length}` : ""}
                </button>
                <button onClick={() => goToPost(p.id)} className="flex items-center gap-1 text-xs font-bold text-slate-500">
                  <MessageCircle size={14} /> 댓글{commentCount > 0 ? ` ${commentCount}` : ""}
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
