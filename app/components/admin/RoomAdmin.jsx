"use client";

// 게시판(우리방) — 관리자 콘솔용 데스크톱 화면.
// 모바일 앱 RoomTab과 데이터(feed_posts)를 공유하지만 화면은 완전히 새로 짠다:
// 하단시트/채팅형 UI 대신 가운데 정렬된 카드 목록 + 작성창 상단 고정 + 상세는
// 중앙 모달(adminShared의 Modal)로 — PC 게시판에 맞는 레이아웃.
// 관리자 콘솔은 아직 로그인이 없어 작성자는 "관리자"로 고정(=프로필 "관리자(신석주)").
import { useState } from "react";
import { Image as ImageIcon, Pin, ThumbsUp, MessageCircle, Trash2, X, Send, Search, MoreVertical } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadPhoto } from "@/lib/photos";
import { profileIdByName } from "@/lib/utils";
import { Modal, inputCls } from "@/app/components/admin/adminShared";

const ADMIN_NAME = "관리자";

// 작성자 이름 첫 글자로 아바타 원을 만든다 — 네이버밴드처럼 글마다 시각적 기준점을 준다.
function Avatar({ name, small }) {
  return (
    <span
      className={`${small ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm"} rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0`}
    >
      {(name || "?")[0]}
    </span>
  );
}

function timeOf(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function PhotoGrid({ urls, onOpen, compact }) {
  if (!urls?.length) return null;
  // compact: 목록 카드용 — 모바일 앱과 동일하게 썸네일 1장 + 매수 배지만 보여줘서
  // 사진 여러 장인 글도 카드 세로 길이가 늘어나지 않게 한다.
  if (compact) {
    return (
      <button onClick={(e) => { e.stopPropagation(); onOpen(urls, 0); }} className="relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[0]} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
        {urls.length > 1 && (
          <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[10px] font-bold rounded px-1">{urls.length}</span>
        )}
      </button>
    );
  }
  return (
    <div className="mt-2 grid grid-cols-4 gap-1.5 max-w-md">
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={url}
          alt=""
          onClick={() => onOpen(urls, i)}
          className="w-full aspect-square object-cover rounded-lg border border-slate-200 cursor-pointer"
        />
      ))}
    </div>
  );
}

function ComposeBox({ onSubmit, placeholder, compact }) {
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]);
  const [notice, setNotice] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPhoto(f, "room")));
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
    setUploading(false);
  }

  function submit() {
    if (!text.trim() && photos.length === 0) return;
    onSubmit(text.trim(), { photoUrls: photos, isNotice: notice });
    setText("");
    setPhotos([]);
    setNotice(false);
  }

  return (
    <div className={compact ? "" : "bg-white rounded-2xl border border-slate-200 p-4"}>
      <textarea
        className={`${inputCls} resize-none`}
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {photos.map((url, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
              <button
                onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer">
            <ImageIcon size={16} />
            사진
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          </label>
          {!compact && (
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} />
              공지로 등록
            </label>
          )}
        </div>
        <button
          onClick={submit}
          disabled={uploading || (!text.trim() && photos.length === 0)}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-700 disabled:bg-slate-300 px-4 py-2 rounded-lg"
        >
          <Send size={13} /> {uploading ? "업로드 중..." : "등록"}
        </button>
      </div>
    </div>
  );
}

export default function RoomAdmin({ data, setData }) {
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [photoViewer, setPhotoViewer] = useState(null); // { urls, index }
  const [menuFor, setMenuFor] = useState(null);

  const feed = data.feed ?? [];
  const commentsOf = (id) =>
    feed.filter((p) => p.replyToId === id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const q = search.trim();
  const roots = feed
    .filter((p) => !p.replyToId)
    .filter((p) => {
      if (!q) return true;
      if ((p.text ?? "").includes(q) || (p.author ?? "").includes(q)) return true;
      return commentsOf(p.id).some((c) => (c.text ?? "").includes(q) || (c.author ?? "").includes(q));
    })
    .sort((a, b) => {
      if (!!a.isNotice !== !!b.isNotice) return a.isNotice ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  async function sendPost(text, extra = {}) {
    const newPost = {
      id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
      author: ADMIN_NAME,
      time: new Date().toTimeString().slice(0, 5),
      createdAt: new Date().toISOString(),
      text,
      photoUrls: extra.photoUrls ?? [],
      replyToId: extra.replyToId ?? null,
      reactions: {},
      isNotice: extra.isNotice ?? false,
    };
    await supabase.from("feed_posts").insert({
      id: newPost.id,
      author: newPost.author,
      body: newPost.text,
      photo_urls: newPost.photoUrls.length ? newPost.photoUrls : null,
      reply_to_id: newPost.replyToId,
      author_id: profileIdByName(data.profiles, ADMIN_NAME),
      is_notice: newPost.isNotice,
    });
    setData((prev) => ({ ...prev, feed: [...(prev.feed ?? []), newPost] }));
  }

  async function toggleLike(postId) {
    const post = feed.find((p) => p.id === postId);
    if (!post) return;
    const cur = post.reactions?.["👍"] ?? [];
    const next = cur.includes(ADMIN_NAME) ? cur.filter((n) => n !== ADMIN_NAME) : [...cur, ADMIN_NAME];
    const reactions = { ...(post.reactions ?? {}), "👍": next };
    setData((prev) => ({ ...prev, feed: prev.feed.map((p) => (p.id === postId ? { ...p, reactions } : p)) }));
    await supabase.from("feed_posts").update({ reactions }).eq("id", postId);
  }

  async function deletePost(postId) {
    if (!confirm("이 글을 삭제할까요? 댓글도 함께 삭제됩니다.")) return;
    setData((prev) => ({ ...prev, feed: prev.feed.filter((p) => p.id !== postId && p.replyToId !== postId) }));
    await supabase.from("feed_posts").delete().eq("reply_to_id", postId);
    await supabase.from("feed_posts").delete().eq("id", postId);
    if (detailId === postId) setDetailId(null);
  }

  async function setNotice(postId, isNotice) {
    setData((prev) => ({ ...prev, feed: prev.feed.map((p) => (p.id === postId ? { ...p, isNotice } : p)) }));
    await supabase.from("feed_posts").update({ is_notice: isNotice }).eq("id", postId);
  }

  const detailPost = detailId ? feed.find((p) => p.id === detailId) : null;

  return (
    <div className="max-w-[100rem] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">게시판</h1>
        <div className="relative w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="글 검색"
            className={`${inputCls} pl-9`}
          />
        </div>
      </div>

      <ComposeBox onSubmit={sendPost} placeholder="팀에 공지하거나 이야기를 나눠보세요" />

      <div className="space-y-3">
        {roots.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">등록된 글이 없습니다</p>
        ) : (
          roots.map((p) => {
            const comments = commentsOf(p.id);
            const likes = p.reactions?.["👍"] ?? [];
            const liked = likes.includes(ADMIN_NAME);
            return (
              <div key={p.id} className={`bg-white rounded-2xl border p-4 ${p.isNotice ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                <div className="flex items-start gap-3">
                  <Avatar name={p.author} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-slate-800 text-sm truncate">{p.author}</span>
                        {p.isNotice && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                            <Pin size={10} /> 공지
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 shrink-0">{timeOf(p.createdAt)}</span>
                      </div>
                      <div className="relative shrink-0">
                        <button onClick={() => setMenuFor(menuFor === p.id ? null : p.id)} className="p-1 text-slate-300 hover:text-slate-500" aria-label="더보기">
                          <MoreVertical size={16} />
                        </button>
                        {menuFor === p.id && (
                          <div className="absolute right-0 top-7 z-10 bg-white rounded-xl border border-slate-200 shadow-lg py-1 w-36" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => { setNotice(p.id, !p.isNotice); setMenuFor(null); }} className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                              {p.isNotice ? "공지 해제" : "공지로 등록"}
                            </button>
                            <button onClick={() => { setMenuFor(null); deletePost(p.id); }} className="w-full text-left px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50">
                              삭제하기
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <p onClick={() => setDetailId(p.id)} className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mt-1.5 cursor-pointer">
                      {p.text}
                    </p>
                    {p.photoUrls?.length > 0 && (
                      <div className="mt-2">
                        <PhotoGrid urls={p.photoUrls} onOpen={(urls, index) => setPhotoViewer({ urls, index })} compact />
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-slate-50">
                      <button onClick={() => toggleLike(p.id)} className={`flex items-center gap-1.5 text-xs font-bold ${liked ? "text-blue-600" : "text-slate-500"}`}>
                        <ThumbsUp size={15} fill={liked ? "currentColor" : "none"} /> {likes.length > 0 ? likes.length : "좋아요"}
                      </button>
                      <button onClick={() => setDetailId(p.id)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <MessageCircle size={15} /> {comments.length > 0 ? `댓글 ${comments.length}` : "댓글"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {detailPost && (
        <Modal title={`${detailPost.author}님의 글`} onClose={() => setDetailId(null)} wide>
          <div className="pb-3 mb-3 border-b border-slate-100">
            <div className="flex items-start gap-3">
              <Avatar name={detailPost.author} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm">{detailPost.author}</p>
                <p className="text-[11px] text-slate-400 mb-1">{timeOf(detailPost.createdAt)}</p>
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{detailPost.text}</p>
                <PhotoGrid urls={detailPost.photoUrls} onOpen={(urls, index) => setPhotoViewer({ urls, index })} />
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100 mb-4">
            {commentsOf(detailPost.id).map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 py-2.5">
                <Avatar name={c.author} small />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700">{c.author} <span className="font-normal text-slate-400">{timeOf(c.createdAt)}</span></p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mt-0.5">{c.text}</p>
                  <PhotoGrid urls={c.photoUrls} onOpen={(urls, index) => setPhotoViewer({ urls, index })} />
                </div>
                <button onClick={() => deletePost(c.id)} className="text-slate-300 hover:text-red-500 shrink-0" aria-label="댓글 삭제">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {commentsOf(detailPost.id).length === 0 && <p className="text-xs text-slate-400 text-center py-4">댓글이 없습니다</p>}
          </div>
          <ComposeBox compact placeholder="댓글 달기" onSubmit={(text, extra) => sendPost(text, { ...extra, replyToId: detailPost.id })} />
        </Modal>
      )}

      {photoViewer && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6" onClick={() => setPhotoViewer(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoViewer.urls[photoViewer.index]} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
