"use client";

// 재고관리 — 모바일. PC 관리자웹(admin/InventoryAdmin.jsx)과 같은 테이블·매퍼·순수함수를
// 그대로 쓰고, 화면만 모바일 관례(리스트→상세 드릴다운, Sheet, 스테퍼 수량입력)로 새로 짠다.
// 기사(role=engineer)는 조회만 — 구매가·구매처는 어디서도 안 보여주고, 등록/수정/입출고/조정
// 버튼 자체를 안 그린다(RLS 아니라 화면 분리 — 이 앱 전체 관례와 동일, CLAUDE.md 참고).
import { useContext, useRef, useState } from "react";
import { Camera, ChevronDown, ChevronUp, Minus, Plus, RefreshCw, Search } from "lucide-react";
import { AuthContext } from "@/app/components/context";
import { DrillHeader, PhotoLightbox, Sheet, inputCls } from "@/app/components/ui";
import { SinglePhotoUpload } from "@/app/components/formWidgets";
import { currentStock, stockHistory } from "@/lib/inventoryStock";
import { confirmAsync } from "@/app/components/ConfirmHost";

const MOVEMENT_LABEL = { in: "입고", out: "출고", adjust: "조정" };

// 자재번호 자동생성 — PC(admin/InventoryAdmin.jsx)의 nextMaterialNo와 동일한 규칙
// (6자리 순번). 같은 테이블을 공유하므로 두 화면에서 번호가 안 겹치게 로직도 맞춘다.
function nextMaterialNo(existing) {
  const max = existing
    .filter((no) => /^\d{6}$/.test(no))
    .reduce((m, no) => Math.max(m, Number(no)), -1);
  return String(max + 1).padStart(6, "0");
}

function ProductListRow({ p, stock, isAdmin, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 active:bg-slate-50 text-left">
      {p.photoUrls?.[0] ? (
        <img src={p.photoUrls[0]} alt="" loading="lazy" className="w-11 h-11 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-lg bg-slate-100 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
          {isAdmin && `₩${Number(p.purchasePrice ?? 0).toLocaleString()} · `}
          ₩{Number(p.salePrice ?? 0).toLocaleString()}{p.location ? ` · ${p.location}` : ""}
        </p>
      </div>
      <p className={`text-base font-extrabold ${stock > 0 ? "text-blue-700" : "text-slate-300"}`}>{stock}</p>
    </button>
  );
}

// 등록/수정 공용 폼 — PC ProductFormFields와 같은 필드 셋, 모바일은 세로 한 줄씩.
// 사진은 한 장만(PC는 이후 여러 장으로 확장했지만 모바일 1차는 목업대로 단순하게).
function ProductFormSheet({ title, initial, existingNos, onClose, onSubmit }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const valid = form.materialNo.trim() && form.name.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    const ok = await onSubmit(form);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Sheet title={title} onClose={onClose} full>
      <div className="p-4 space-y-4">
        <SinglePhotoUpload
          label="사진 추가"
          url={form.photoUrl}
          uploadFolder="inventory"
          onUploaded={(url) => setForm({ ...form, photoUrl: url })}
          onRemove={() => setForm({ ...form, photoUrl: "" })}
        />
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">자재번호 *</p>
          <div className="flex gap-1.5">
            <input className={inputCls} value={form.materialNo} onChange={(e) => setForm({ ...form, materialNo: e.target.value })} />
            <button type="button" onClick={() => setForm({ ...form, materialNo: nextMaterialNo(existingNos) })} className="text-xs font-bold text-white bg-emerald-600 rounded-lg px-3 whitespace-nowrap">자동 생성</button>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">제품명 *</p>
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <p className="text-xs font-extrabold text-slate-700 border-t border-slate-100 pt-3">제품 속성</p>
        <div><p className="text-xs font-bold text-slate-500 mb-1">규격</p><input className={inputCls} value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">비고</p><input className={inputCls} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">위치</p><input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">구매처</p><input className={inputCls} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">단가 기준일자</p><input type="date" className={inputCls} value={form.priceDate} onChange={(e) => setForm({ ...form, priceDate: e.target.value })} /></div>

        <p className="text-xs font-extrabold text-slate-700 border-t border-slate-100 pt-3">가격 정보</p>
        <div><p className="text-xs font-bold text-slate-500 mb-1">구매가</p><input type="number" className={inputCls} value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">판매가</p><input type="number" className={inputCls} value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} /></div>

        {"initialQty" in form && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">초기 수량</p>
            <input type="number" step="1" className={inputCls} placeholder="0" value={form.initialQty} onChange={(e) => setForm({ ...form, initialQty: e.target.value })} />
          </div>
        )}

        <button disabled={!valid || saving} onClick={submit} className="w-full text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl py-3 mt-2">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </Sheet>
  );
}

// 입고/출고/조정 수량 입력 — 첨부 목업 그대로 +/− 스테퍼. 조정은 0 밑으로도 내려갈 수 있게
// (창고 실사에서 마이너스로 맞추는 경우가 실제로 있음), 입고·출고는 0 이상만.
function StockStepperSheet({ type, product, currentQty, onClose, onSubmit }) {
  const [delta, setDelta] = useState(0);
  const [saving, setSaving] = useState(false);
  const label = MOVEMENT_LABEL[type];
  const nextQty = type === "adjust" ? currentQty + delta : type === "out" ? currentQty - delta : currentQty + delta;
  const valid = delta !== 0 && (type === "adjust" || delta > 0) && nextQty >= 0;

  function step(dir) {
    setDelta((d) => (type === "adjust" ? d + dir : Math.max(0, d + dir)));
  }

  async function submit() {
    if (!valid) return;
    setSaving(true);
    const qtyDelta = type === "out" ? -delta : delta;
    const ok = await onSubmit({ qtyDelta, note: null });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Sheet title={`${label} 수량을 입력하세요`} onClose={onClose}>
      <div className="p-4 text-center">
        <p className="text-xs text-slate-400 mb-4">{product.name}</p>
        <div className="flex items-center justify-center gap-8 mb-3">
          <button onClick={() => step(-1)} className="w-11 h-11 rounded-full bg-blue-50 text-blue-700 text-2xl flex items-center justify-center"><Minus size={20} /></button>
          <p className="text-sm text-slate-400">{currentQty} → <span className="text-blue-700 font-extrabold text-lg">{Math.max(0, nextQty)}</span></p>
          <button onClick={() => step(1)} className="w-11 h-11 rounded-full bg-blue-50 text-blue-700 text-2xl flex items-center justify-center"><Plus size={20} /></button>
        </div>
        <input
          type="number" step="1" className={`${inputCls} text-center mb-4`}
          value={delta === 0 ? "" : delta} placeholder="0"
          onChange={(e) => setDelta(Number(e.target.value) || 0)}
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl py-3">취소</button>
          <button disabled={!valid || saving} onClick={submit} className="flex-1 text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl py-3">
            {saving ? "저장 중..." : "적용"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function emptyForm(existingNos) {
  return {
    materialNo: nextMaterialNo(existingNos), name: "", photoUrl: "", spec: "", location: "",
    vendor: "", priceDate: "", memo: "", purchasePrice: "", salePrice: "", initialQty: "",
  };
}

function editForm(product) {
  return {
    materialNo: product.materialNo, name: product.name, photoUrl: product.photoUrls?.[0] ?? "",
    spec: product.spec ?? "", location: product.location ?? "", vendor: product.vendor ?? "",
    priceDate: product.priceDate ?? "", memo: product.memo ?? "",
    purchasePrice: product.purchasePrice ?? "", salePrice: product.salePrice ?? "",
  };
}

function ProductDetail({ product, movements, isAdmin, existingNos, onBack, onHome, onSave, onDelete, onMovement }) {
  const [editing, setEditing] = useState(false);
  const [movementType, setMovementType] = useState(null);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const stock = currentStock(movements, product.id);
  const history = stockHistory(movements, product.id);

  async function remove() {
    if (!(await confirmAsync(`"${product.name}"을(를) 삭제할까요?`))) return;
    await onDelete(product);
    onBack();
  }

  return (
    <div className="h-full flex flex-col">
      <DrillHeader title="제품 정보" onBack={onBack} onHome={onHome} />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex gap-3 mb-3">
          {product.photoUrls?.[0] ? (
            <img src={product.photoUrls[0]} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 cursor-zoom-in" onClick={() => setViewingPhoto(true)} />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-slate-100 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400">자재번호</p>
            <p className="text-sm font-bold mb-1 truncate">{product.materialNo}</p>
            <p className="text-base font-extrabold truncate">{product.name}</p>
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl p-3 text-center mb-3">
          <p className="text-[11px] font-bold text-blue-600">현재 재고</p>
          <p className="text-2xl font-extrabold text-blue-700">{stock}</p>
        </div>

        {isAdmin && (
          <div className="flex gap-1.5 mb-4">
            <button onClick={() => setMovementType("in")} className="flex-1 text-xs font-bold text-white bg-blue-700 rounded-lg py-2.5">입고</button>
            <button onClick={() => setMovementType("out")} className="flex-1 text-xs font-bold text-white bg-red-600 rounded-lg py-2.5">출고</button>
            <button onClick={() => setMovementType("adjust")} className="flex-1 text-xs font-bold text-white bg-slate-500 rounded-lg py-2.5">조정</button>
          </div>
        )}

        <div className="border-t border-slate-100 pt-3 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">규격</span><span>{product.spec || "-"}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">비고</span><span>{product.memo || "-"}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">위치</span><span>{product.location || "-"}</span></div>
          {isAdmin && (
            <div className="flex justify-between"><span className="text-slate-400">구매처</span><span>{product.vendor || "-"}</span></div>
          )}
          <div className="flex justify-between"><span className="text-slate-400">단가 기준일자</span><span>{product.priceDate || "-"}</span></div>
          {isAdmin && (
            <div className="flex justify-between"><span className="text-slate-400">구매가</span><span>₩{Number(product.purchasePrice ?? 0).toLocaleString()}</span></div>
          )}
          <div className="flex justify-between"><span className="text-slate-400">판매가</span><span>₩{Number(product.salePrice ?? 0).toLocaleString()}</span></div>
        </div>

        {isAdmin && (
          <div className="flex gap-2 mt-5">
            <button onClick={() => setEditing(true)} className="flex-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl py-2.5">수정</button>
            <button onClick={remove} className="flex-1 text-sm font-bold text-red-600 bg-red-50 rounded-xl py-2.5">삭제</button>
          </div>
        )}

        {isAdmin && (
          <>
            <p className="text-xs font-extrabold text-slate-700 mt-6 mb-2">재고 변동 내역</p>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">내역이 없습니다</p>
            ) : (
              history.map((m) => (
                <div key={m.id} className="flex justify-between py-2 border-b border-slate-50">
                  <div>
                    <p className="text-sm font-bold">{MOVEMENT_LABEL[m.type]}</p>
                    <p className="text-[11px] text-slate-400">{m.createdAt.slice(0, 10)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${m.qtyDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>{m.qtyDelta >= 0 ? "+" : ""}{m.qtyDelta}</p>
                    <p className="text-[11px] text-slate-400">{m.balance}</p>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {movementType && (
        <StockStepperSheet
          type={movementType}
          product={product}
          currentQty={stock}
          onClose={() => setMovementType(null)}
          onSubmit={(payload) => onMovement(product, movementType, payload)}
        />
      )}
      {editing && (
        <ProductFormSheet
          title="제품 수정"
          initial={editForm(product)}
          existingNos={existingNos}
          onClose={() => setEditing(false)}
          onSubmit={(form) => onSave(product, form)}
        />
      )}
      {viewingPhoto && product.photoUrls?.[0] && (
        <PhotoLightbox urls={product.photoUrls} index={0} onIndexChange={() => {}} onClose={() => setViewingPhoto(false)} />
      )}
    </div>
  );
}

export function InventoryTab({ products, movements, onCreateProduct, onSaveProduct, onDeleteProduct, onAddMovement }) {
  const { role, adminTier } = useContext(AuthContext);
  // 자재담당관리자(admin_tier "material")는 모바일 앱에서 role이 engineer로 스코프되지만
  // (기사앱을 기사와 동일하게 쓰는 다른 화면들과 달리) 재고관리는 PC 관리자웹과 동일 권한이어야 한다.
  const isAdmin = role === "admin" || adminTier === "material";
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const active = products.filter((p) => p.active !== false);
  const rows = active.filter((p) => {
    const q = search.trim().toLowerCase();
    return !q || `${p.materialNo} ${p.name} ${p.spec ?? ""} ${p.memo ?? ""} ${p.location ?? ""} ${p.vendor ?? ""}`.toLowerCase().includes(q);
  });
  const selected = active.find((p) => p.id === selectedId) ?? null;
  const existingNos = active.map((p) => p.materialNo);

  async function handleCreate(form) {
    const product = await onCreateProduct(form);
    if (!product) return false;
    const initialQty = Number(form.initialQty);
    if (initialQty > 0) await onAddMovement(product, "adjust", { qtyDelta: initialQty, note: "초기 수량" });
    setSelectedId(product.id);
    return true;
  }

  if (selected) {
    return (
      <ProductDetail
        product={selected}
        movements={movements}
        isAdmin={isAdmin}
        existingNos={existingNos}
        onBack={() => setSelectedId(null)}
        onHome={() => setSelectedId(null)}
        onSave={onSaveProduct}
        onDelete={onDeleteProduct}
        onMovement={onAddMovement}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 flex gap-2 border-b border-slate-100">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-8`} placeholder="제품 이름, 자재번호, 규격, 비고, 위치, 구매처 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isAdmin && (
          <button onClick={() => setCreating(true)} className="text-xs font-bold text-white bg-blue-700 rounded-lg px-3 whitespace-nowrap">+ 등록</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">등록된 제품이 없습니다</p>
        ) : (
          rows.map((p) => (
            <ProductListRow key={p.id} p={p} stock={currentStock(movements, p.id)} isAdmin={isAdmin} onClick={() => setSelectedId(p.id)} />
          ))
        )}
      </div>

      {creating && (
        <ProductFormSheet
          title="제품 등록"
          initial={emptyForm(existingNos)}
          existingNos={existingNos}
          onClose={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}
