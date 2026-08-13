# 부품현황 사진 앨범형식 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부품현황 리프 상세의 사진 표시를 캐러셀(1장+화살표)에서 그리드(앨범)로
바꾸고, 클릭 시 전체화면으로 넘어가며, 삭제는 전체화면에서만 하도록 만든다.

**Architecture:** `FileCarousel`(`app/components/admin/adminShared.jsx`)에 옵트인
`layout="grid"` 모드를 추가하고, 같은 파일의 `PhotoLightbox`에 선택적 `onDelete`
prop을 추가한다. 부품현황의 두 호출부(모바일 `PartLeafRow`, 관리자웹
`PartsStatusTab`의 `LeafDetail`)만 `layout="grid"`로 전환한다 — 다른 모든
`FileCarousel` 호출부(계약서 등)는 `layout`을 안 넘기므로 기존 캐러셀 동작 그대로.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4.

## Global Constraints

- 새 npm 의존성 추가 금지.
- `layout` 기본값은 `"carousel"` — 기존 모든 호출부(계약서·사업자등록증·인사관리
  첨부파일)는 코드 변경 없이 지금 동작 그대로 유지되어야 한다.
- `PhotoLightbox`의 `onDelete`는 선택적 prop — 안 넘기면(캐러셀 모드 호출부)
  휴지통 아이콘이 안 보이고 지금과 완전히 동일하게 동작해야 한다.
- 삭제 확인 문구는 기존과 동일하게 `confirmAsync("이 파일을 삭제할까요?")`.
- 그리드 열 수는 고정 숫자가 아니라 `grid-template-columns: repeat(auto-fill,
  minmax(76px, 1fr))`로 컨테이너 폭에 자동 반응하게 한다(관리자웹·모바일에
  각각 다른 열 수를 하드코딩하지 않는다).
- 사진 추가/삭제 판별 로직(`lib/partLeafPhotos.js`)은 이번 변경과 무관 — 손대지 않는다.
- 빌드 확인 명령: `npm run build`. 이 코드베이스는 React 컴포넌트에 대한 자동
  테스트 프레임워크가 없다(기존 관례) — 새로 만들지 않는다.

---

### Task 1: `FileCarousel`에 grid 레이아웃 추가, `PhotoLightbox`에 삭제 추가

**Files:**
- Modify: `app/components/admin/adminShared.jsx`

**Interfaces:**
- Produces:
  - `FileCarousel`에 새 prop `layout = "carousel" | "grid"` (기본값
    `"carousel"`, 기존 시그니처의 다른 모든 prop은 변경 없음).
  - `PhotoLightbox`에 새 prop `onDelete` (선택적, `() => void | Promise<void>`).
- Consumes: 없음(같은 파일 내부 기존 헬퍼 — `confirmAsync`, `openPicker`,
  `pickerInputs`, `chooserSheet`, `viewerIndex` state — 전부 이미 존재).

이 태스크는 컴포넌트 API만 확장한다 — 아직 아무도 `layout="grid"`나
`onDelete`를 안 넘기므로, 이 태스크만으로는 화면에 아무 변화가 없다(Task 2에서
실제로 켠다). 그래서 이 파일 안에서 완결되는 순수 리팩터/확장이다.

- [ ] **Step 1: import에 `Trash2` 아이콘 추가**

`app/components/admin/adminShared.jsx:6` 현재:
```js
import { X, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Pencil, Paperclip, Camera, Image as ImageIcon, Download } from "lucide-react";
```

교체:
```js
import { X, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Pencil, Paperclip, Camera, Image as ImageIcon, Download, Trash2 } from "lucide-react";
```

- [ ] **Step 2: `FileCarousel` 함수 시그니처에 `layout` prop 추가**

`app/components/admin/adminShared.jsx:187` 현재:
```js
export function FileCarousel({ urls, accept = "image/*,.pdf", uploadLabel = "파일 첨부 (사진/PDF)", height = "h-[60vh]", onUpload, onSave, chooser = true }) {
```

교체:
```js
export function FileCarousel({ urls, accept = "image/*,.pdf", uploadLabel = "파일 첨부 (사진/PDF)", height = "h-[60vh]", onUpload, onSave, chooser = true, layout = "carousel" }) {
```

- [ ] **Step 3: grid 모드 전용 삭제 함수 추가**

`app/components/admin/adminShared.jsx`의 `removeCurrent` 함수(현재 아래 코드) 바로
다음에 새 함수를 추가한다:
```js
  async function removeCurrent() {
    if (!(await confirmAsync("이 파일을 삭제할까요?"))) return;
    const next = urls.filter((_, i) => i !== idx);
    await onSave(next);
    setIdx((i) => Math.max(0, Math.min(i, next.length - 1)));
  }
```

바로 다음에 추가(grid 모드는 자기 인덱스가 아니라 라이트박스가 보여주고 있는
인덱스를 지운다 — 확인 대화상자는 `PhotoLightbox`가 이미 담당하므로 여기서는
안 물어본다):
```js

  // grid 모드 전용 — 라이트박스에서 삭제를 확정했을 때 호출된다. 확인 대화상자는
  // PhotoLightbox의 onDelete 핸들러가 이미 띄우고 난 뒤라 여기서는 바로 지운다.
  async function deleteAt(i) {
    const next = urls.filter((_, idx2) => idx2 !== i);
    await onSave(next);
    if (next.length === 0) setViewerIndex(null);
    else setViewerIndex((v) => Math.min(v, next.length - 1));
  }
```

- [ ] **Step 4: grid 모드 렌더 분기 추가**

`app/components/admin/adminShared.jsx`에서 `chooserSheet` 정의(현재 아래 코드)
바로 다음, `if (urls.length === 0) {` 분기 바로 앞에 새 분기를 추가한다.

`chooserSheet` 정의(그대로 둔다, 위치 확인용):
```js
  const chooserSheet = chooser && choosing && (
    <Sheet title="사진 추가" onClose={() => setChoosing(false)}>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => { setChoosing(false); cameraInputRef.current?.click(); }}
          className="w-full flex items-center gap-2.5 text-sm font-bold text-slate-800 bg-slate-100 rounded-xl px-4 py-3.5 active:bg-slate-200"
        >
          <Camera size={18} /> 카메라로 촬영
        </button>
        <button
          type="button"
          onClick={() => { setChoosing(false); galleryInputRef.current?.click(); }}
          className="w-full flex items-center gap-2.5 text-sm font-bold text-slate-800 bg-slate-100 rounded-xl px-4 py-3.5 active:bg-slate-200"
        >
          <ImageIcon size={18} /> 사진첩에서 선택
        </button>
      </div>
    </Sheet>
  );

  if (urls.length === 0) {
```

그 사이(주석 위치)에 아래를 삽입 — `if (urls.length === 0) {`보다 먼저 와야 한다
(grid 모드는 사진이 0장이어도 "추가" 칸 하나만 있는 그리드로 자체 처리하므로,
기존 empty-state 분기를 안 거친다):
```js

  if (layout === "grid") {
    return (
      <div className="space-y-2">
        {pickerInputs}
        <div
          {...dragProps}
          className={`relative grid gap-2 rounded-xl ${dragOver ? "ring-2 ring-blue-300 bg-blue-50/40" : ""}`}
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))" }}
        >
          {dragOver && (
            <div className="absolute inset-0 z-20 rounded-xl bg-blue-50/90 flex items-center justify-center text-xs font-bold text-blue-600 pointer-events-none">
              여기에 놓기
            </div>
          )}
          {urls.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => setViewerIndex(i)}
              className="aspect-square rounded-xl overflow-hidden border border-slate-200"
            >
              <img src={url} alt="사진" className="w-full h-full object-cover" />
            </button>
          ))}
          <button
            type="button"
            onClick={openPicker}
            disabled={uploading}
            className="aspect-square rounded-xl border-2 border-dashed border-slate-300 text-slate-400 flex flex-col items-center justify-center gap-1 disabled:opacity-50 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50"
          >
            <Paperclip size={16} />
            <span className="text-[10px] font-semibold">{uploading ? "업로드 중..." : "추가"}</span>
          </button>
        </div>
        {chooserSheet}
        {viewerIndex != null && (
          <PhotoLightbox
            urls={urls}
            index={viewerIndex}
            onIndexChange={setViewerIndex}
            onClose={() => setViewerIndex(null)}
            onDelete={() => deleteAt(viewerIndex)}
          />
        )}
      </div>
    );
  }
```

- [ ] **Step 5: `PhotoLightbox` 시그니처에 `onDelete` 추가, 삭제 확인 함수 추가**

`app/components/admin/adminShared.jsx:550` 현재:
```js
function PhotoLightbox({ urls, index, onIndexChange, onClose }) {
```

교체:
```js
function PhotoLightbox({ urls, index, onIndexChange, onClose, onDelete }) {
```

같은 함수 안, `downloadAll` 함수(아래 코드) 바로 다음에 추가:
```js
  async function downloadAll() {
    setDownloadMenuOpen(false);
    setToast("다운로드중...");
    try {
      await Promise.all([downloadPhotosAsZip(urls, "사진.zip", "사진"), new Promise((r) => setTimeout(r, 400))]);
      setToast("저장했습니다.");
      setTimeout(() => setToast(null), 1500);
    } catch (err) {
      setToast(null);
      alert("전체 다운로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
  }
```

바로 다음에 추가:
```js

  async function handleDelete() {
    if (!(await confirmAsync("이 파일을 삭제할까요?"))) return;
    await onDelete();
  }
```

- [ ] **Step 6: 헤더에 삭제 아이콘 추가 (`onDelete`가 있을 때만)**

`app/components/admin/adminShared.jsx`의 `PhotoLightbox` 헤더 부분, 현재:
```jsx
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-semibold">{index + 1} / {urls.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setDownloadMenuOpen(true)} className="p-1.5 text-white\80 hover:text-white" aria-label="다운로드">
            <Download size={20} />
          </button>
          <button onClick={onClose} className="p-1.5 text-white\80 hover:text-white"><X size={20} /></button>
        </div>
      </div>
```

교체:
```jsx
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-semibold">{index + 1} / {urls.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setDownloadMenuOpen(true)} className="p-1.5 text-white\80 hover:text-white" aria-label="다운로드">
            <Download size={20} />
          </button>
          {onDelete && (
            <button onClick={handleDelete} className="p-1.5 text-white\80 hover:text-red-400" aria-label="삭제">
              <Trash2 size={20} />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-white\80 hover:text-white"><X size={20} /></button>
        </div>
      </div>
```

(`text-white\80`은 기존 코드에 이미 있던 표기 그대로 — 이 태스크에서 고치지
않는다, 관련 없는 기존 코드 정리는 범위 밖.)

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공. (이 시점엔 아직 아무도 `layout="grid"`나
`onDelete`를 안 넘기므로 화면 동작에 변화는 없다 — 순수 API 확장.)

- [ ] **Step 8: 다른 `FileCarousel`/`PhotoLightbox` 호출부가 영향받지 않는지 확인**

Run: `grep -rn "FileCarousel\|PhotoLightbox" app/components --include="*.jsx" -l`

이 태스크에서 수정한 `adminShared.jsx` 자신을 빼고, 나머지 호출부들이
`layout`이나 `onDelete`를 넘기지 않는지(=넘기지 않아도 그만이라 안전한지)
눈으로 확인한다 — `layout` 기본값이 `"carousel"`이고 `onDelete` 기본값이
`undefined`이므로, 안 넘기는 호출부는 전부 지금과 동일하게 동작해야 한다.

- [ ] **Step 9: 커밋**

```bash
git add app/components/admin/adminShared.jsx
git commit -m "feat: FileCarousel에 grid 레이아웃, PhotoLightbox에 삭제 기능 추가"
```

---

### Task 2: 부품현황 두 호출부를 grid 모드로 전환

**Files:**
- Modify: `app/components/tabs/PartPhotosPanel.jsx` (모바일 `PartLeafRow`)
- Modify: `app/components/admin/PartsStatusTab.jsx` (관리자웹 `LeafDetail`)

**Interfaces:**
- Consumes: `FileCarousel`의 `layout="grid"` prop (Task 1에서 추가됨). 두 파일 다
  이미 `FileCarousel`을 import하고 있어 새 import는 필요 없다.
- Produces: 없음 — 이 태스크가 끝나면 기능이 실제로 화면에 나타난다(최종 배선).

- [ ] **Step 1: 모바일 `PartLeafRow`를 grid 모드로 전환**

`app/components/tabs/PartPhotosPanel.jsx`에서 `FileCarousel` 호출부, 현재:
```jsx
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-50 bg-slate-50/40">
          <FileCarousel
            urls={urls}
            accept="image/*"
            uploadLabel="사진 촬영/선택"
            height="h-40"
            onUpload={(file) => uploadPhoto(file, `unit-parts/${unitId}`)}
            onSave={handleSave}
          />
        </div>
      )}
```

교체:
```jsx
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-50 bg-slate-50/40">
          <FileCarousel
            urls={urls}
            accept="image/*"
            layout="grid"
            uploadLabel="사진 촬영/선택"
            onUpload={(file) => uploadPhoto(file, `unit-parts/${unitId}`)}
            onSave={handleSave}
          />
        </div>
      )}
```

(`height="h-40"` 제거 — grid 모드는 이 prop을 안 쓴다, 사진 수만큼 세로로
늘어나야 하므로.)

- [ ] **Step 2: 관리자웹 `LeafDetail`을 grid 모드로 전환**

`app/components/admin/PartsStatusTab.jsx`에서 `FileCarousel` 호출부, 현재:
```jsx
      <FileCarousel
        key={`${selected.category}|${selected.subcategory}|${selected.part}`}
        urls={urls}
        accept="image/*"
        chooser={false}
        uploadLabel="사진 촬영/선택"
        height="h-64"
        onUpload={(file) => uploadPhoto(file, `unit-parts/${unitId}`)}
        onSave={handleSave}
      />
```

교체:
```jsx
      <FileCarousel
        key={`${selected.category}|${selected.subcategory}|${selected.part}`}
        urls={urls}
        accept="image/*"
        layout="grid"
        chooser={false}
        uploadLabel="사진 촬영/선택"
        onUpload={(file) => uploadPhoto(file, `unit-parts/${unitId}`)}
        onSave={handleSave}
      />
```

(`height="h-64"` 제거, `chooser={false}`는 그대로 유지 — 관리자웹은 카메라/사진첩
선택 시트 없이 바로 갤러리 피커가 뜨는 기존 동작을 grid 모드에서도 유지한다.)

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공.

- [ ] **Step 4: 수동 확인 (가능하면 브라우저, 아니면 코드로 흐름 재확인)**

이 환경의 미리보기 폴더는 무관한 파일 누락으로 dev 서버가 뜨지 않는 상태일 수
있다(이전 플랜에서 확인된 환경 제약) — 가능하면 `npm run dev`로 실제 클릭까지
확인하고, 안 되면 아래를 소스 레벨로 재확인한다:
1. `unitId`가 있고 `photos`가 몇 장 있는 리프를 열었을 때 정사각형 썸네일들이
   그리드로 뜨는지(캐러셀 화살표가 안 보이는지)
2. 썸네일 클릭 → `PhotoLightbox`가 뜨는지, 헤더에 다운로드 아이콘과 휴지통
   아이콘이 나란히 있는지
3. 휴지통 클릭 → 확인창 → 확인하면 그 사진이 그리드에서 사라지는지, DB에서도
   삭제되는지(새로고침해도 안 돌아오는지)
4. "추가" 칸 클릭 → 업로드 흐름(관리자웹은 바로 갤러리 피커, 모바일은
   카메라/사진첩 선택 시트)이 그대로 동작하는지
5. 계약서·사업자등록증 등 다른 `FileCarousel` 사용처가 이전과 동일하게(캐러셀
   방식, 삭제 버튼 아래쪽) 동작하는지 — 회귀 확인

- [ ] **Step 5: 커밋**

```bash
git add app/components/tabs/PartPhotosPanel.jsx app/components/admin/PartsStatusTab.jsx
git commit -m "feat: 부품현황 사진을 그리드(앨범)형식으로, 삭제는 전체화면에서"
```
