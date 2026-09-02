import { useState, useContext, useRef, useEffect } from "react";
import { Send, Plus, X, Download, MessageCircle, ThumbsUp, MoreVertical, ChevronLeft, ChevronRight, Pin, Search, Pencil, FileText } from "lucide-react";
import { AuthContext } from "@/app/components/context";
import { uploadPhoto, downloadPhoto, downloadPhotosAsZip, extOf, isVideoUrl } from "@/lib/photos";
import { confirmAsync } from "@/app/components/ConfirmHost";
import { PhotoLightboxPane } from "@/app/components/ui";
import { usePhotoLightboxGestures } from "@/app/hooks/usePhotoLightboxGestures";
import { useBackHandler } from "@/app/hooks/useBackHandler";

const isVideo = isVideoUrl;
const isImageAttachment = (url) => /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg)(\?|$)/i.test(url);
// 사진·영상이 아닌 첨부(문서 등)는 미리보기 없이 아이콘+파일명 카드로 보여주고, 누르면
// 새 탭에서 열린다(다운로드) — Storage 업로드 경로가 "폴더/타임스탬프-원본파일명"이라
// 타임스탬프 접두어만 떼면 사용자가 올린 원래 파일명이 그대로 나온다.
function attachmentFileName(url) {
  try {
    return decodeURIComponent(url.split("/").pop().split("?")[0]).replace(/^\d+-/, "");
  } catch {
    return "첨부파일";
  }
}
function FileAttachmentCard({ url, className }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`${className} rounded-lg bg-slate-100 border border-slate-200 flex flex-col items-center justify-center gap-0.5 px-1 text-center`}
    >
      <FileText size={16} className="text-slate-400 shrink-0" />
      <span className="text-[8px] text-slate-500 leading-tight break-all line-clamp-2">{attachmentFileName(url)}</span>
    </a>
  );
}

// 게시글 사진 확대보기 — 여러 장이면 좌우 스와이프/화살표로 넘기고, 더블탭·핀치·휠로 확대.
function PhotoViewerOverlay({ urls, index, onIndexChange, onClose }) {
  const { containerRef, idx, showPrev, showNext, trackStyle, zoom, pan, isGesturing, handlers } =
    usePhotoLightboxGestures(urls.length, index, onIndexChange);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  // 다운로드는 앱에서 안드로이드 다운로드 매니저로 넘기고 나면 끝 — 눌러도 화면이 그대로라
  // "됐나?" 싶은 게 당연하다. 카톡처럼 하단에 진행 토스트를 잠깐 띄운다.
  const [toast, setToast] = useState(null);
  // 안드로이드 뒤로가기 — 다운로드 메뉴가 떠 있으면 그것부터, 아니면 뷰어 자체를 닫는다.
  useBackHandler(downloadMenuOpen, () => setDownloadMenuOpen(false));
  useBackHandler(!downloadMenuOpen, onClose);

  async function downloadOne() {
    setDownloadMenuOpen(false);
    setToast("다운로드중...");
    try {
      await Promise.all([downloadPhoto(urls[index], `게시판-사진_${index + 1}.${extOf(urls[index])}`), new Promise((r) => setTimeout(r, 400))]);
      setToast("저장했습니다.");
      setTimeout(() => setToast(null), 1500);
    } catch (err) {
      setToast(null);
      alert("다운로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
  }
  async function downloadAll() {
    setDownloadMenuOpen(false);
    setToast("다운로드중...");
    try {
      await Promise.all([downloadPhotosAsZip(urls, "게시판-사진.zip", "게시판-사진"), new Promise((r) => setTimeout(r, 400))]);
      setToast("저장했습니다.");
      setTimeout(() => setToast(null), 1500);
    } catch (err) {
      setToast(null);
      alert("전체 다운로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-white text-xs font-semibold">{urls.length > 1 ? `${index + 1} / ${urls.length}` : ""}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setDownloadMenuOpen(true)} className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label="다운로드">
            <Download size={18} />
          </button>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label="닫기">
            <X size={18} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 relative min-h-0 touch-none overflow-hidden" onClick={(e) => e.stopPropagation()} {...handlers}>
        {urls.length > 1 && (
          <button onClick={() => onIndexChange(Math.max(0, index - 1))} className="absolute left-2 z-20 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full p-2">
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="flex h-full" style={trackStyle}>
          {showPrev && <PhotoLightboxPane key={idx - 1} url={urls[idx - 1]} />}
          <PhotoLightboxPane key={idx} url={urls[idx]} active zoom={zoom} pan={pan} isGesturing={isGesturing} />
          {showNext && <PhotoLightboxPane key={idx + 1} url={urls[idx + 1]} />}
        </div>
        {urls.length > 1 && (
          <button onClick={() => onIndexChange(Math.min(urls.length - 1, index + 1))} className="absolute right-2 z-20 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full p-2">
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {downloadMenuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40" onClick={() => setDownloadMenuOpen(false)}>
          <div className="bg-white rounded-t-2xl p-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            {urls.length > 1 && (
              <button onClick={downloadAll} className="w-full text-center text-sm font-bold text-slate-800 py-3.5 rounded-xl active:bg-slate-100">
                {urls.length}장 모두 저장
              </button>
            )}
            <button onClick={downloadOne} className="w-full text-center text-sm font-bold text-slate-800 py-3.5 rounded-xl active:bg-slate-100">
              이 사진만 저장
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[60] bg-slate-800/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function renderText(text) {
  return (text ?? "").split(/(@[가-힣a-zA-Z0-9()]+)/g).map((s, i) =>
    s.startsWith("@") ? <b key={i} className="text-blue-700">{s}</b> : s
  );
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 첨부파일 "⋮" 메뉴 — 공지로 등록(누구나), 수정·삭제(관리자 또는 본인 글만)
function PostMenu({ post, canManage, canNotice, onClose, onNotice, onEdit, onDelete }) {
  return (
    <div className="absolute right-0 top-6 z-10 bg-white rounded-xl border border-slate-200 shadow-lg py-1 w-36" onClick={(e) => e.stopPropagation()}>
      {canNotice && (
        <button onClick={() => { onNotice(); onClose(); }} className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 active:bg-slate-50">
          {post.isNotice ? "공지 해제" : "공지로 등록"}
        </button>
      )}
      {canManage && (
        <button onClick={() => { onEdit(); onClose(); }} className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 active:bg-slate-50">
          수정하기
        </button>
      )}
      {canManage && (
        <button onClick={() => { onDelete(); onClose(); }} className="w-full text-left px-3.5 py-2 text-xs font-bold text-red-600 active:bg-red-50">
          삭제하기
        </button>
      )}
    </div>
  );
}

function CommentRow({ c, onLike, liked, likeCount, canManage, editingId, editText, setEditText, saveEdit, setEditingId, onStartEdit, onDelete, onOpenPhoto }) {
  if (editingId === c.id) {
    return (
      <div className="flex gap-2 py-2">
        <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0">
          {(c.author || "?")[0]}
        </span>
        <div className="flex-1 min-w-0">
          <textarea
            autoFocus
            className="w-full text-xs border border-slate-200 rounded-lg p-2 resize-none focus:outline-none"
            rows={2}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-1">
            <button onClick={saveEdit} className="text-[10px] font-bold text-white bg-blue-700 rounded-full px-3 py-1">저장</button>
            <button onClick={() => setEditingId(null)} className="text-[10px] font-bold text-slate-400 px-2 py-1">취소</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2 py-2">
      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0">
        {(c.author || "?")[0]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-700 leading-relaxed">
          <span className="font-bold text-slate-800 mr-1.5">{c.author}</span>
          {renderText(c.text)}
        </p>
        {(c.photoUrls ?? []).length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-1">
            {c.photoUrls.map((u, i) =>
              isVideo(u)
                ? <video key={u} src={u} className="w-16 h-16 rounded-lg object-cover" onClick={() => onOpenPhoto(c.photoUrls, i)} />
                : isImageAttachment(u)
                  ? <img key={u} src={u} alt="첨부" className="w-16 h-16 rounded-lg object-cover" onClick={() => onOpenPhoto(c.photoUrls, i)} />
                  : <FileAttachmentCard key={u} url={u} className="w-16 h-16" />
            )}
          </div>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-slate-400">{formatDateTime(c.createdAt)}</span>
          <button onClick={onLike} className={`text-[10px] font-bold ${liked ? "text-blue-600" : "text-slate-400"}`}>
            좋아요{likeCount > 0 ? ` ${likeCount}` : ""}
          </button>
          {canManage && (
            <>
              <button onClick={onStartEdit} className="text-[10px] font-bold text-slate-400">수정</button>
              <button onClick={onDelete} className="text-[10px] font-bold text-red-500">삭제</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 게시글 헤더(작성자·게시일시·⋮메뉴) — 목록 카드/상세화면 공용
function PostHeader({ p, canManage, canNotice, menuOpen, onToggleMenu, onCloseMenu, onNotice, onEdit, onDelete }) {
  const showMenuBtn = canNotice || canManage;
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
        <p className="text-[10px] text-slate-400">{formatDateTime(p.createdAt)}</p>
      </div>
      {showMenuBtn && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          className="p-1 text-slate-400 active:text-slate-600 shrink-0"
          aria-label="더보기"
        >
          <MoreVertical size={16} />
        </button>
      )}
      {menuOpen && (
        <PostMenu post={p} canManage={canManage} canNotice={canNotice} onClose={onCloseMenu} onNotice={onNotice} onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}

// 게시글 본문(텍스트 수정폼 포함) — 목록 카드/상세화면 공용.
// ★ 반드시 모듈 최상위에 둘 것: RoomTab 렌더 함수 안에 정의하면 매 렌더마다 새 컴포넌트 타입이 되어
// 서브트리가 통째로 리마운트된다(수정 textarea가 키 입력마다 포커스를 잃고, 사진·영상이 깜빡임). (P1-3)
function PostBody({ p, full, editingId, editText, setEditText, saveEdit, setEditingId, onOpenPhoto }) {
  if (editingId === p.id) {
    return (
      <div className="mb-2">
        <textarea className="w-full text-sm border border-slate-200 rounded-xl p-2.5 resize-none focus:outline-none" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
        <div className="flex justify-end gap-2 mt-1.5">
          <button onClick={saveEdit} className="text-xs font-bold text-white bg-blue-700 rounded-full px-3.5 py-1.5">저장</button>
          <button onClick={() => setEditingId(null)} className="text-xs font-bold text-slate-400 px-2.5 py-1.5">취소</button>
        </div>
      </div>
    );
  }
  return (
    <div className={full ? "mb-2" : "flex items-start justify-between gap-2 mb-2"}>
      <div className={full ? "" : "flex-1 min-w-0"}>
        {p.title && <p className="text-sm font-extrabold text-slate-800 mb-1">{p.title}</p>}
        {p.text && <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{renderText(p.text)}</p>}
      </div>
      {(p.photoUrls ?? []).length > 0 && (
        full ? (
          <div className="space-y-1.5 mt-2">
            {p.photoUrls.map((u, i) =>
              isVideo(u)
                ? <video key={u} src={u} controls playsInline className="rounded-lg w-full" />
                : isImageAttachment(u)
                  ? <img key={u} src={u} alt="첨부 사진" className="rounded-lg w-full object-cover" onClick={() => onOpenPhoto(p.photoUrls, i)} />
                  : <FileAttachmentCard key={u} url={u} className="w-full h-16" />
            )}
          </div>
        ) : isImageAttachment(p.photoUrls[0]) || isVideo(p.photoUrls[0]) ? (
          <button onClick={(e) => { e.stopPropagation(); onOpenPhoto(p.photoUrls, 0); }} className="relative shrink-0">
            {isVideo(p.photoUrls[0])
              ? <video src={p.photoUrls[0]} className="w-16 h-16 rounded-lg object-cover" />
              : <img src={p.photoUrls[0]} alt="첨부 사진" className="w-16 h-16 rounded-lg object-cover" />}
            {p.photoUrls.length > 1 && (
              <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[10px] font-bold rounded px-1">{p.photoUrls.length}</span>
            )}
          </button>
        ) : (
          <div className="relative shrink-0">
            <FileAttachmentCard url={p.photoUrls[0]} className="w-16 h-16" />
            {p.photoUrls.length > 1 && (
              <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[10px] font-bold rounded px-1">{p.photoUrls.length}</span>
            )}
          </div>
        )
      )}
    </div>
  );
}

export function RoomTab({ feed, onSendChat, onToggleLike, onUpdatePost, onDeletePost, onSetNotice, onDismissNotif, focusPostId, onFocusHandled }) {
  const { name: CURRENT_ENGINEER, role, profiles, selfId } = useContext(AuthContext);
  const [composing, setComposing] = useState(false);
  const [postInput, setPostInput] = useState("");
  const [postIsNotice, setPostIsNotice] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState(null); // { urls, index } | null
  const openPhoto = (urls, index) => setViewer({ urls, index });
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentPhotos, setCommentPhotos] = useState({}); // { [postId]: string[] } — 상세화면 하나에서만 쓰므로 postId별 배열이면 충분
  const [commentUploading, setCommentUploading] = useState(false);
  const commentFileRef = useRef(null);
  const commentTextareaRef = useRef(null);
  // 기본 높이(1줄)일 땐 placeholder·버튼이 가운데 정렬돼 보이게, 여러 줄 입력하면 늘어나게.
  function autoGrowComment(e) {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
  }
  const [menuFor, setMenuFor] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [openPostId, setOpenPostId] = useState(null);
  const [search, setSearch] = useState("");
  const [showNoticeList, setShowNoticeList] = useState(false);
  // 기존 글을 공지로 등록할 때 제목을 받는 대상 — { id, ... } | null
  const [noticeTarget, setNoticeTarget] = useState(null);
  const [noticeTitleInput, setNoticeTitleInput] = useState("");
  // 화면 전환 방향 — 목록으로 "돌아갈" 때만 참조한다(상세·글쓰기·공지사항은 늘 목록에서
  // 들어가는 진입점이라 항상 오른쪽에서 슬라이드 인, 방향을 따질 필요가 없다).
  const [navDir, setNavDir] = useState("forward");
  const fileRef = useRef(null);
  const composeTextareaRef = useRef(null);
  // 목록 스크롤 위치 — 상세·글쓰기·공지사항으로 나갔다 돌아오면 목록 DOM이 통째로 다시
  // 마운트돼(위 room-slide-in 분기) 스크롤이 맨 위로 리셋된다. 나가기 직전 위치를 저장해뒀다가
  // 목록으로 돌아온 직후 되돌린다.
  const listScrollRef = useRef(null);
  const savedScrollTop = useRef(0);
  function saveListScroll() {
    if (listScrollRef.current) savedScrollTop.current = listScrollRef.current.scrollTop;
  }
  // 글쓰기 화면 진입 직후 바로 포커스를 주면 키보드가 슬라이드 애니메이션 도중에 튀어
  // 올라오면서 화면이 같이 눌려 전환이 뚝뚝 끊겨 보인다 — 슬라이드가 끝난 뒤에 포커스한다.
  useEffect(() => {
    if (!composing) return;
    const t = setTimeout(() => composeTextareaRef.current?.focus(), 430);
    return () => clearTimeout(t);
  }, [composing]);
  const isAdmin = role === "admin";
  // 안드로이드 뒤로가기 — 글쓰기 중이면 취소(작성 중이던 내용도 함께 비움, 취소 버튼과 동일 동작).
  useBackHandler(composing, () => { setNavDir("back"); setComposing(false); setPostInput(""); setPendingPhotos([]); setPostIsNotice(false); setPostTitle(""); });
  useBackHandler(showNoticeList, () => { setNavDir("back"); setShowNoticeList(false); });

  function goToPost(id) {
    saveListScroll();
    setMenuFor(null);
    setOpenPostId(id);
    onDismissNotif?.("post:" + id);
  }

  // 공지는 일반 피드에서 빼서 상단 핀 영역·공지사항 전체목록에서만 보여준다(중복 노출 방지).
  const allNotices = [...feed]
    .filter((p) => p.isNotice && !p.replyToId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const pinnedNotices = allNotices.slice(0, 3);
  const posts = [...feed]
    .filter((p) => !p.replyToId && !p.isNotice)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const commentsOf = (postId) =>
    feed.filter((p) => p.replyToId === postId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // 검색 — 게시자, 글내용, 댓글내용까지 모두 대상
  const searchQuery = search.trim().toLowerCase();
  const visiblePosts = posts.filter((p) => {
    if (!searchQuery) return true;
    if ((p.author ?? "").toLowerCase().includes(searchQuery)) return true;
    if ((p.text ?? "").toLowerCase().includes(searchQuery)) return true;
    return commentsOf(p.id).some((c) => (c.text ?? "").toLowerCase().includes(searchQuery));
  });

  async function submitPost() {
    if (!postInput.trim() && pendingPhotos.length === 0) return;
    if (postIsNotice && !postTitle.trim()) return; // 버튼도 막지만 한 번 더 방어
    // 저장 성공을 확인한 뒤에만 입력창을 비운다 — 실패했는데 먼저 비우면 이미 올린 사진은
    // 어디에도 안 붙은 채 남고, 사용자는 글을 처음부터 다시 써야 한다.
    const ok = await onSendChat(postInput.trim(), { photoUrls: pendingPhotos, replyToId: null, isNotice: postIsNotice, title: postIsNotice ? postTitle.trim() : null });
    if (!ok) return;
    setPostInput("");
    setPendingPhotos([]);
    setPostIsNotice(false);
    setPostTitle("");
    setNavDir("back");
    setComposing(false);
  }

  // 사진·영상은 바로 게시하지 않고 미리보기로 모아뒀다가 "게시" 버튼을 눌러야 올라간다.
  // + 버튼을 여러 번 눌러 계속 추가할 수 있다.
  async function pickFiles(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    if (files.some((f) => f.size > 50 * 1024 * 1024)) return alert("파일당 50MB까지 보낼 수 있어요");
    setUploading(true);
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadPhoto(f, "room"));
      setPendingPhotos((prev) => [...prev, ...urls]);
    } catch (err) {
      alert("업로드에 실패했습니다: " + err.message);
    }
    setUploading(false);
  }

  // @멘션 피커 — 글쓰기 입력에서만 지원 (댓글은 텍스트만)
  const tagMatch = /@([가-힣a-zA-Z0-9()]*)$/.exec(postInput);
  const memberNames = (profiles ?? []).map((p) => p.name).filter((n) => n !== CURRENT_ENGINEER);
  const tagCands = composing && tagMatch ? ["모두", ...memberNames].filter((n) => n.toLowerCase().includes(tagMatch[1].toLowerCase())) : [];
  const pickTag = (n) => setPostInput(postInput.replace(/@[가-힣a-zA-Z0-9()]*$/, "@" + n + " "));

  function submitComment(postId) {
    const text = (commentDrafts[postId] ?? "").trim();
    const photos = commentPhotos[postId] ?? [];
    if (!text && photos.length === 0) return;
    onSendChat(text, { replyToId: postId, photoUrls: photos });
    setCommentDrafts((d) => ({ ...d, [postId]: "" }));
    setCommentPhotos((p) => ({ ...p, [postId]: [] }));
    if (commentTextareaRef.current) commentTextareaRef.current.style.height = "auto";
  }

  async function pickCommentFiles(postId, e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setCommentUploading(true);
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadPhoto(f, "room"));
      setCommentPhotos((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), ...urls] }));
    } catch (err) {
      alert("업로드에 실패했습니다: " + err.message);
    }
    setCommentUploading(false);
  }

  async function deleteComment(c) {
    if (!(await confirmAsync("이 댓글을 삭제할까요?"))) return;
    onDeletePost?.(c.id);
  }

  // 공지 등록 — 켤 때는 제목이 필요해 모달을 띄우고, 끌 때는 바로 해제한다.
  function handleNoticeToggleClick(p) {
    if (p.isNotice) {
      onSetNotice?.(p.id, false);
    } else {
      setNoticeTarget(p);
      setNoticeTitleInput("");
    }
  }
  function confirmNoticeTitle() {
    if (!noticeTitleInput.trim()) return;
    onSetNotice?.(noticeTarget.id, true, noticeTitleInput.trim());
    setNoticeTarget(null);
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
  // 알림/푸시로 특정 글이 지정되면(focusPostId) 게시판 탭 안에서 바로 그 글 화면으로 들어간다 —
  // materialFocusId/quoteFocusId와 동일한 방식(effect 없이 렌더 시점에 반영, 로컬 openPostId가 우선).
  const shownPostId = openPostId ?? focusPostId;
  function closePost() {
    setNavDir("back");
    setMenuFor(null);
    setOpenPostId(null);
    if (focusPostId) onFocusHandled?.();
  }
  async function deletePost(p) {
    if (!(await confirmAsync("이 글을 삭제할까요? 댓글도 함께 삭제됩니다."))) return;
    onDeletePost?.(p.id);
    if (shownPostId === p.id) closePost();
  }

  // 모듈 최상위 PostBody에 넘길 편집·뷰어 상태 묶음 (P1-3)
  const bodyProps = { editingId, editText, setEditText, saveEdit, setEditingId, onOpenPhoto: openPhoto };

  const openPost = shownPostId ? feed.find((p) => p.id === shownPostId) : null;
  useBackHandler(!!openPost, closePost); // 안드로이드 뒤로가기 — 게시글 상세화면에서 목록으로

  // 목록으로 돌아온 직후(방금 새로 마운트된 시점) 저장해둔 스크롤 위치로 되돌린다.
  const showingList = !openPost && !composing && !showNoticeList;
  useEffect(() => {
    if (showingList && listScrollRef.current) {
      listScrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, [showingList]);

  // 공지 등록 시 제목을 받는 모달 — 목록·상세 어느 쪽에서 열어도 공용으로 쓴다.
  const noticeTitleModal = noticeTarget && (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setNoticeTarget(null)}>
      <div className="w-full bg-white rounded-t-2xl p-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-extrabold text-slate-800 mb-1">공지로 등록</p>
        <p className="text-[11px] text-slate-500 mb-3">게시판 상단에 고정될 제목을 입력하세요.</p>
        <input
          autoFocus
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none"
          placeholder="공지 제목"
          value={noticeTitleInput}
          onChange={(e) => setNoticeTitleInput(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button onClick={() => setNoticeTarget(null)} className="text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-3.5 py-2">취소</button>
          <button onClick={confirmNoticeTitle} disabled={!noticeTitleInput.trim()} className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-lg px-3.5 py-2">
            등록
          </button>
        </div>
      </div>
    </div>
  );

  // ---- 공지사항 전체 목록 ----
  if (showNoticeList) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white room-slide-in-right">
        <div className="px-4 pt-4 pb-2.5 flex items-center gap-2 shrink-0 border-b border-slate-100">
          <button onClick={() => { setNavDir("back"); setShowNoticeList(false); }} className="p-1 text-slate-500 active:text-slate-800" aria-label="뒤로">
            <ChevronLeft size={20} />
          </button>
          <p className="text-sm font-bold text-slate-800">공지사항</p>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {allNotices.map((p) => (
            <button key={p.id} onClick={() => { setShowNoticeList(false); goToPost(p.id); }} className="w-full text-left px-4 py-3.5 active:bg-slate-50">
              <p className="text-sm font-bold text-slate-800 mb-0.5 truncate">{p.title || p.text}</p>
              <p className="text-[11px] text-slate-400">{p.author} · {formatDateTime(p.createdAt)}</p>
            </button>
          ))}
          {allNotices.length === 0 && <p className="text-xs text-slate-400 text-center py-10">등록된 공지가 없습니다</p>}
        </div>
      </div>
    );
  }

  // ---- 글쓰기 (첨부파일처럼 전용 화면으로 넘어가서 작성) ----
  if (composing) {
    const closeCompose = () => { setNavDir("back"); setComposing(false); setPostInput(""); setPendingPhotos([]); setPostIsNotice(false); setPostTitle(""); };
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white room-slide-in-right">
        <div className="px-4 pt-4 pb-2.5 flex items-center justify-between shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button onClick={closeCompose} className="p-1 text-slate-500 active:text-slate-800" aria-label="뒤로">
              <ChevronLeft size={20} />
            </button>
            <p className="text-sm font-bold text-slate-800">글쓰기</p>
          </div>
          <button
            onClick={submitPost}
            disabled={(!postInput.trim() && pendingPhotos.length === 0) || uploading || (postIsNotice && !postTitle.trim())}
            className="text-sm font-bold text-blue-700 disabled:text-slate-300"
          >
            {uploading ? "업로드 중..." : "게시"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!!onSetNotice && (
            <>
              <label className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={postIsNotice} onChange={(e) => setPostIsNotice(e.target.checked)} />
                공지로 등록
              </label>
              {postIsNotice && (
                <input
                  className="w-full text-sm font-bold border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 mb-2 focus:outline-none"
                  placeholder="공지 제목을 입력하세요 (필수)"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                />
              )}
            </>
          )}
          <div className="relative">
            <textarea
              ref={composeTextareaRef}
              className="w-full text-sm resize-none focus:outline-none min-h-[50vh]"
              placeholder="무슨 소식을 나눠볼까요? (@이름으로 태그)"
              value={postInput}
              onChange={(e) => setPostInput(e.target.value)}
            />
            {/* 텍스트란이 화면 대부분을 차지해서(min-h-50vh) 아래에 붙이면 스크롤해야 보인다 —
                입력 위치와 무관하게 항상 바로 보이도록 텍스트란 위에 겹쳐서 띄운다. */}
            {tagCands.length > 0 && (
              <div className="absolute top-1 left-0 right-0 z-10 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto">
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
          </div>
          {pendingPhotos.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {pendingPhotos.map((u, i) => (
                <div key={u} className="relative">
                  {isVideo(u)
                    ? <video src={u} className="w-14 h-14 rounded-lg object-cover" />
                    : isImageAttachment(u)
                      ? <img src={u} alt="첨부" className="w-14 h-14 rounded-lg object-cover" />
                      : <FileAttachmentCard url={u} className="w-14 h-14" />}
                  <button
                    onClick={() => setPendingPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center"
                    aria-label="첨부 제거"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-100 px-4 py-3">
          <input ref={fileRef} type="file" multiple hidden onChange={pickFiles} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="사진·영상·파일 첨부" className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 flex items-center justify-center active:bg-slate-100">
            <Plus size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ---- 게시글 상세화면 (첨부파일처럼 게시글을 누르면 진입) ----
  if (openPost) {
    const likes = openPost.reactions?.["👍"] ?? [];
    const liked = likes.includes(CURRENT_ENGINEER);
    const comments = commentsOf(openPost.id);
    const canManage = isAdmin || (openPost.authorId != null ? openPost.authorId === selfId : openPost.author === CURRENT_ENGINEER);
    // 댓글 @태그 자동완성 — 글쓰기와 같은 방식, 이 화면엔 댓글창이 하나뿐이라 postId 구분 없이 openPost 기준.
    const commentDraft = commentDrafts[openPost.id] ?? "";
    const commentTagMatch = /@([가-힣a-zA-Z0-9()]*)$/.exec(commentDraft);
    const commentTagCands = commentTagMatch ? ["모두", ...memberNames].filter((n) => n.toLowerCase().includes(commentTagMatch[1].toLowerCase())) : [];
    const pickCommentTag = (n) => setCommentDrafts((d) => ({ ...d, [openPost.id]: (d[openPost.id] ?? "").replace(/@[가-힣a-zA-Z0-9()]*$/, "@" + n + " ") }));
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white room-slide-in-right">
        <div className="px-4 pt-4 pb-2.5 flex items-center gap-2 shrink-0 border-b border-slate-100">
          <button onClick={closePost} className="p-1 text-slate-500 active:text-slate-800" aria-label="뒤로">
            <ChevronLeft size={20} />
          </button>
          <p className="text-sm font-bold text-slate-800">게시글</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <PostHeader
            p={openPost} canManage={canManage} canNotice={!!onSetNotice}
            menuOpen={menuFor === openPost.id}
            onToggleMenu={() => setMenuFor(menuFor === openPost.id ? null : openPost.id)}
            onCloseMenu={() => setMenuFor(null)}
            onNotice={() => handleNoticeToggleClick(openPost)}
            onEdit={() => startEdit(openPost)}
            onDelete={() => deletePost(openPost)}
          />
          <PostBody p={openPost} full {...bodyProps} />
          <div className="flex items-center gap-4 py-2.5 border-t border-b border-slate-100">
            <button onClick={() => onToggleLike?.(openPost.id)} className={`flex items-center gap-1 text-xs font-bold ${liked ? "text-blue-600" : "text-slate-500"}`}>
              <ThumbsUp size={14} className={liked ? "fill-blue-600" : ""} /> 좋아요{likes.length > 0 ? ` ${likes.length}` : ""}
            </button>
            <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
              <MessageCircle size={14} /> 댓글 {comments.length}
            </span>
          </div>
          <div className="pt-1 divide-y divide-slate-100">
            {comments.length === 0
              ? <p className="text-xs text-slate-400 text-center py-6">첫 댓글을 남겨보세요</p>
              : comments.map((c) => {
                  const cLikes = c.reactions?.["👍"] ?? [];
                  const cCanManage = isAdmin || (c.authorId != null ? c.authorId === selfId : c.author === CURRENT_ENGINEER);
                  return (
                    <CommentRow
                      key={c.id} c={c}
                      onLike={() => onToggleLike?.(c.id)}
                      liked={cLikes.includes(CURRENT_ENGINEER)}
                      likeCount={cLikes.length}
                      canManage={cCanManage}
                      editingId={editingId} editText={editText} setEditText={setEditText} saveEdit={saveEdit} setEditingId={setEditingId}
                      onStartEdit={() => startEdit(c)}
                      onDelete={() => deleteComment(c)}
                      onOpenPhoto={openPhoto}
                    />
                  );
                })}
          </div>
        </div>
        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
          {(commentPhotos[openPost.id] ?? []).length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {(commentPhotos[openPost.id] ?? []).map((u, i) => (
                <div key={u} className="relative">
                  {isVideo(u)
                    ? <video src={u} className="w-12 h-12 rounded-lg object-cover" />
                    : isImageAttachment(u)
                      ? <img src={u} alt="첨부" className="w-12 h-12 rounded-lg object-cover" />
                      : <FileAttachmentCard url={u} className="w-12 h-12" />}
                  <button
                    onClick={() => setCommentPhotos((p) => ({ ...p, [openPost.id]: (p[openPost.id] ?? []).filter((_, idx) => idx !== i) }))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center"
                    aria-label="첨부 제거"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {commentTagCands.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden mb-2 max-h-40 overflow-y-auto">
              {commentTagCands.map((n) => (
                <button key={n} onClick={() => pickCommentTag(n)} className="w-full flex items-center gap-2 px-3 py-2 border-b border-slate-50 last:border-0 active:bg-blue-50 text-left">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${n === "모두" ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"}`}>
                    {n === "모두" ? "@" : n[0]}
                  </span>
                  <span className="text-xs font-bold text-slate-700">{n}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input ref={commentFileRef} type="file" multiple hidden onChange={(e) => pickCommentFiles(openPost.id, e)} />
            <button
              onClick={() => commentFileRef.current?.click()}
              disabled={commentUploading}
              aria-label="사진·영상·파일 첨부"
              className="w-9 h-9 rounded-full border border-slate-300 text-slate-500 flex items-center justify-center active:bg-slate-100 shrink-0"
            >
              <Plus size={16} />
            </button>
            <textarea
              ref={commentTextareaRef}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm leading-5 resize-none focus:outline-none max-h-32 overflow-y-auto"
              rows={1}
              placeholder="댓글을 입력하세요"
              value={commentDrafts[openPost.id] ?? ""}
              onChange={(e) => { setCommentDrafts((d) => ({ ...d, [openPost.id]: e.target.value })); autoGrowComment(e); }}
            />
            <button
              onClick={() => submitComment(openPost.id)}
              disabled={commentUploading || (!(commentDrafts[openPost.id] ?? "").trim() && (commentPhotos[openPost.id] ?? []).length === 0)}
              className="w-9 h-9 rounded-full bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
        {viewer && (
          <PhotoViewerOverlay
            urls={viewer.urls}
            index={viewer.index}
            onIndexChange={(i) => setViewer((v) => ({ ...v, index: i }))}
            onClose={() => setViewer(null)}
          />
        )}
        {noticeTitleModal}
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden bg-white relative ${navDir === "back" ? "room-slide-in-left" : ""}`}>
      <div className="px-4 pt-3 pb-2 shrink-0 border-b border-slate-100">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            placeholder="게시자·글내용·댓글로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div ref={listScrollRef} className="flex-1 overflow-y-auto">
        {/* 공지 핀 — 제목만, 최대 3개. 전체는 우측 "전체보기"로 */}
        {pinnedNotices.length > 0 && (
          <div className="mx-4 mt-3 mb-1 border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
            <div className="px-3.5 py-2 border-b border-amber-100 flex items-center justify-between">
              <p className="text-[11px] font-extrabold text-amber-700">📌 공지</p>
              <button onClick={() => { saveListScroll(); setShowNoticeList(true); }} className="text-[10px] font-bold text-amber-600 underline underline-offset-2">전체보기</button>
            </div>
            {pinnedNotices.map((p, i) => (
              <button
                key={p.id}
                onClick={() => goToPost(p.id)}
                className={`w-full text-left px-3.5 py-2.5 flex items-center gap-2 active:bg-amber-100 ${i < pinnedNotices.length - 1 ? "border-b border-amber-100" : ""}`}
              >
                <span className="text-[10px] font-bold text-white bg-amber-600 rounded px-1.5 py-0.5 shrink-0">공지</span>
                <span className="text-xs font-bold text-slate-800 truncate">{p.title || p.text}</span>
              </button>
            ))}
          </div>
        )}

        {/* 게시글 목록 — 누르면 상세화면(첨부파일처럼)으로 진입 */}
        <div className="px-4 divide-y divide-slate-100">
          {visiblePosts.map((p) => {
            const likes = p.reactions?.["👍"] ?? [];
            const liked = likes.includes(CURRENT_ENGINEER);
            const commentCount = commentsOf(p.id).length;
            const canManage = isAdmin || (p.authorId != null ? p.authorId === selfId : p.author === CURRENT_ENGINEER);
            return (
              <div key={p.id} onClick={() => editingId !== p.id && goToPost(p.id)} className="py-5 cursor-pointer">
                <PostHeader
                  p={p} canManage={canManage} canNotice={!!onSetNotice}
                  menuOpen={menuFor === p.id}
                  onToggleMenu={() => setMenuFor(menuFor === p.id ? null : p.id)}
                  onCloseMenu={() => setMenuFor(null)}
                  onNotice={() => handleNoticeToggleClick(p)}
                  onEdit={() => startEdit(p)}
                  onDelete={() => deletePost(p)}
                />
                <PostBody p={p} {...bodyProps} />
                <div className="flex items-center gap-4 pt-2" onClick={(e) => e.stopPropagation()}>
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
        </div>
        {posts.length === 0 && <p className="text-xs text-slate-400 text-center py-10">아직 게시글이 없습니다. 첫 소식을 올려보세요!</p>}
        {posts.length > 0 && visiblePosts.length === 0 && <p className="text-xs text-slate-400 text-center py-10">검색 결과가 없습니다</p>}
      </div>

      {/* 새 글 쓰기 플로팅 — 누르면 전용 글쓰기 화면(위 if (composing) 분기)으로 이동 */}
      <button
        onClick={() => { saveListScroll(); setComposing(true); }}
        aria-label="새 글 쓰기"
        className="absolute right-4 bottom-4 z-20 w-12 h-12 rounded-full bg-blue-700 text-white shadow-lg flex items-center justify-center active:scale-95"
      >
        <Pencil size={19} />
      </button>

      {/* 이미지 확대보기 — 저장/닫기 */}
      {viewer && (
        <PhotoViewerOverlay
          urls={viewer.urls}
          index={viewer.index}
          onIndexChange={(i) => setViewer((v) => ({ ...v, index: i }))}
          onClose={() => setViewer(null)}
        />
      )}
      {noticeTitleModal}
    </div>
  );
}
