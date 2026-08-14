"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { currentStock, stockHistory } from "@/lib/inventoryStock";
import { supabase } from "@/lib/supabaseClient";
import { mapInventoryProduct, mapInventoryStockMovement } from "@/lib/mappers";
import { inputCls, Modal } from "@/app/components/admin/adminShared";
import { SinglePhotoUpload } from "@/app/components/formWidgets";
import { confirmAsync } from "@/app/components/ConfirmHost";

const SUBS = ["제품목록", "입출고내역", "구매"];
const MOVEMENT_LABEL = { in: "입고", out: "출고", adjust: "조정" };

// 자재번호 자동생성 — 6자리 숫자를 000000부터 순번으로. 기존 번호 중 6자리 숫자
// 형식인 것만 보고 가장 큰 값 다음 번호를 매긴다(자유 텍스트로 다르게 입력된
// 번호는 순번 계산에서 무시 — 충돌 없이 다음 번호만 결정하면 되므로 그걸로 충분).
function nextMaterialNo(existing) {
  const max = existing
    .filter((no) => /^\d{6}$/.test(no))
    .reduce((m, no) => Math.max(m, Number(no)), -1);
  return String(max + 1).padStart(6, "0");
}

// 등록 패널과 상세 인라인수정이 같은 필드 셋을 쓴다 — 첨부(제품 수정) 레이아웃 그대로:
// 자재번호·제품명(+우측 사진) → 구분선 → 제품 속성(세로 1열) → 구분선 → 가격 정보.
function ProductFormFields({ form, setForm, onGenerateMaterialNo }) {
  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">자재번호 *</p>
            <div className="flex gap-1.5">
              <input className={inputCls} value={form.materialNo} onChange={(e) => setForm({ ...form, materialNo: e.target.value })} />
              {onGenerateMaterialNo && (
                <button type="button" onClick={onGenerateMaterialNo} className="text-xs font-bold text-white bg-emerald-600 rounded-lg px-3 whitespace-nowrap">자동 생성</button>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">제품명 *</p>
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
        </div>
        <div className="w-28 shrink-0">
          <SinglePhotoUpload
            label="사진 추가"
            url={form.photoUrl}
            uploadFolder="inventory"
            onUploaded={(url) => setForm({ ...form, photoUrl: url })}
            onRemove={() => setForm({ ...form, photoUrl: "" })}
          />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 mb-3">
        <p className="text-xs font-extrabold text-slate-700 mb-3">제품 속성</p>
        <div className="space-y-3">
          <div><p className="text-xs font-bold text-slate-500 mb-1">규격</p><input className={inputCls} placeholder="텍스트 입력" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">비고</p><input className={inputCls} placeholder="텍스트 입력" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">위치</p><input className={inputCls} placeholder="텍스트 입력" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">구매처</p><input className={inputCls} placeholder="텍스트 입력" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">단가 기준일자</p><input type="date" className={inputCls} value={form.priceDate} onChange={(e) => setForm({ ...form, priceDate: e.target.value })} /></div>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-extrabold text-slate-700 mb-3">가격 정보</p>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">구매가</p>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₩</span>
              <input type="number" className={`${inputCls} pl-6`} value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">판매가</p>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₩</span>
              <input type="number" className={`${inputCls} pl-6`} value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 모달이 아니라 "제품 정보" 칸 자리에 그대로 뜬다 — 등록 성공 시 상위(InventoryAdmin)가
// creating을 꺼주고 새 제품을 선택해줘서 이 패널은 자연스럽게 ProductDetail로 바뀐다.
function ProductCreatePanel({ existingNos, onCancel, onCreate }) {
  const [form, setForm] = useState({
    materialNo: nextMaterialNo(existingNos), name: "", photoUrl: "", spec: "", location: "",
    vendor: "", priceDate: "", memo: "", purchasePrice: "", salePrice: "", initialQty: "",
  });
  const [saving, setSaving] = useState(false);
  const valid = form.materialNo.trim() && form.name.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 lg:h-full overflow-y-auto">
      <p className="text-sm font-extrabold mb-4">제품 등록</p>
      <ProductFormFields form={form} setForm={setForm} onGenerateMaterialNo={() => setForm({ ...form, materialNo: nextMaterialNo(existingNos) })} />
      <div className="border-t border-slate-100 mt-3 pt-3">
        <p className="text-xs font-bold text-slate-500 mb-1">초기 수량</p>
        <input type="number" step="1" className={inputCls} placeholder="0" value={form.initialQty} onChange={(e) => setForm({ ...form, initialQty: e.target.value })} />
      </div>
      <div className="flex gap-2 mt-5">
        <button disabled={!valid || saving} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
          {saving ? "등록 중..." : "저장"}
        </button>
        <button onClick={onCancel} className="text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl px-5 py-2.5">취소</button>
      </div>
    </div>
  );
}

function StockMovementModal({ type, onClose, onSubmit }) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const label = MOVEMENT_LABEL[type];
  const n = Number(qty);
  const valid = qty.trim() !== "" && Number.isInteger(n) && n !== 0 && (type === "adjust" || n > 0);

  async function submit() {
    if (!valid) return;
    setSaving(true);
    const qtyDelta = type === "out" ? -Math.abs(n) : type === "in" ? Math.abs(n) : n;
    await onSubmit({ qtyDelta, note: note.trim() || null });
    setSaving(false);
    onClose();
  }

  return (
    <Modal title={`재고 ${label}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">{type === "adjust" ? "증감량 (예: -4)" : "수량"}</p>
          <input type="number" step="1" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">메모</p>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end pt-2">
          <button disabled={!valid || saving} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
            {saving ? "저장 중..." : `${label} 등록`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ProductDetail({ product, movements, onSave, onDelete, onMovement }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [movementType, setMovementType] = useState(null);
  const stock = currentStock(movements, product.id);
  const history = stockHistory(movements, product.id);

  function startEdit() {
    setForm({
      materialNo: product.materialNo, name: product.name, photoUrl: product.photoUrl ?? "",
      spec: product.spec ?? "", location: product.location ?? "", vendor: product.vendor ?? "",
      priceDate: product.priceDate ?? "", memo: product.memo ?? "",
      purchasePrice: product.purchasePrice ?? "", salePrice: product.salePrice ?? "",
    });
    setEditing(true);
  }

  async function save() {
    const ok = await onSave(product, form);
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!(await confirmAsync(`"${product.name}"을(를) 삭제할까요?`))) return;
    await onDelete(product);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 lg:h-full">
    <div className="bg-white rounded-xl border border-slate-200 p-5 lg:h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-extrabold">{editing ? "제품 수정" : "제품 정보"}</p>
        {!editing && (
          <div className="flex gap-1.5">
            <button onClick={startEdit} className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5"><Pencil size={13} /> 수정</button>
            <button onClick={remove} className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 rounded-lg px-3 py-1.5"><Trash2 size={13} /> 삭제</button>
          </div>
        )}
      </div>
      {editing ? (
        <>
          <ProductFormFields form={form} setForm={setForm} onGenerateMaterialNo={null} />
          <div className="flex gap-2 mt-5">
            <button onClick={save} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-5 py-2.5">저장</button>
            <button onClick={() => setEditing(false)} className="text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl px-5 py-2.5">취소</button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3.5 mb-4">
            <div className="grid grid-cols-[80px_1fr] gap-y-2 text-sm flex-1">
              <span className="text-slate-400">자재번호</span><span className="font-bold">{product.materialNo}</span>
              <span className="text-slate-400">제품명</span><span className="font-bold">{product.name}</span>
            </div>
            {product.photoUrl ? (
              <img src={product.photoUrl} alt="" className="w-24 h-24 rounded-lg object-cover border border-slate-100 shrink-0" />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-slate-100 shrink-0" />
            )}
          </div>
          <div className="border-t border-slate-100 pt-3 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
            <span className="text-slate-400">규격</span><span>{product.spec || "-"}</span>
            <span className="text-slate-400">비고</span><span>{product.memo || "-"}</span>
            <span className="text-slate-400">위치</span><span>{product.location || "-"}</span>
            <span className="text-slate-400">구매처</span><span>{product.vendor || "-"}</span>
            <span className="text-slate-400">단가 기준일자</span><span>{product.priceDate || "-"}</span>
          </div>
          <div className="border-t border-slate-100 mt-3 pt-3 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
            <span className="text-slate-400">구매가</span><span>₩{Number(product.purchasePrice ?? 0).toLocaleString()}</span>
            <span className="text-slate-400">판매가</span><span>₩{Number(product.salePrice ?? 0).toLocaleString()}</span>
          </div>
        </>
      )}
    </div>

    <div className="bg-white rounded-xl border border-slate-200 p-5 lg:h-full overflow-y-auto">
      <p className="text-sm font-extrabold mb-1">현재 재고 및 내역</p>
      <p className="text-3xl font-extrabold text-blue-700 mb-3">{stock}</p>
      <div className="flex gap-1.5 mb-4">
        <button onClick={() => setMovementType("in")} className="flex-1 text-xs font-bold text-white bg-blue-700 rounded-lg py-2">입고</button>
        <button onClick={() => setMovementType("out")} className="flex-1 text-xs font-bold text-white bg-red-600 rounded-lg py-2">출고</button>
        <button onClick={() => setMovementType("adjust")} className="flex-1 text-xs font-bold text-white bg-slate-500 rounded-lg py-2">조정</button>
      </div>
      <div className="border-t border-slate-100">
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">내역이 없습니다</p>
        ) : (
          history.map((m) => (
            <div key={m.id} className="flex justify-between py-2 border-b border-slate-50">
              <div>
                <p className="text-sm font-bold">{MOVEMENT_LABEL[m.type]}</p>
                <p className="text-[11px] text-slate-400">{m.createdAt.slice(0, 10)}{m.note ? ` · ${m.note}` : ""}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${m.qtyDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>{m.qtyDelta >= 0 ? "+" : ""}{m.qtyDelta}</p>
                <p className="text-[11px] text-slate-400">{m.balance}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    {movementType && (
      <StockMovementModal
        type={movementType}
        onClose={() => setMovementType(null)}
        onSubmit={(payload) => onMovement(product, movementType, payload)}
      />
    )}
    </div>
  );
}

export default function InventoryAdmin({ data, setData }) {
  const { inventoryProducts = [], inventoryStockMovements = [] } = data;
  const [sub, setSub] = useState("제품목록");
  const [search, setSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const active = inventoryProducts.filter((p) => p.active !== false);
  const rows = active.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q && !`${p.materialNo} ${p.name}`.toLowerCase().includes(q)) return false;
    if (onlyInStock && currentStock(inventoryStockMovements, p.id) <= 0) return false;
    return true;
  });
  const selected = active.find((p) => p.id === selectedId) ?? null;

  function selectProduct(id) {
    setCreating(false);
    setSelectedId(id);
  }

  function startCreating() {
    setSelectedId(null);
    setCreating(true);
  }

  async function createProduct(form) {
    const row = {
      material_no: form.materialNo.trim(),
      name: form.name.trim(),
      photo_url: form.photoUrl || null,
      spec: form.spec.trim() || null,
      memo: form.memo.trim() || null,
      location: form.location.trim() || null,
      vendor: form.vendor.trim() || null,
      price_date: form.priceDate || null,
      purchase_price: form.purchasePrice === "" ? null : Number(form.purchasePrice),
      sale_price: form.salePrice === "" ? null : Number(form.salePrice),
    };
    const { data: inserted, error } = await supabase.from("inventory_products").insert(row).select().maybeSingle();
    if (error) { alert("등록 실패: " + error.message); return false; }
    if (!inserted) { alert("등록 실패: 저장된 결과를 받지 못했습니다."); return false; }
    const mapped = mapInventoryProduct(inserted);
    setData((prev) => ({ ...prev, inventoryProducts: [mapped, ...prev.inventoryProducts] }));
    const initialQty = Number(form.initialQty);
    if (initialQty > 0) {
      await addMovement(mapped, "adjust", { qtyDelta: initialQty, note: "초기 수량" });
    }
    setCreating(false);
    setSelectedId(mapped.id);
    return true;
  }

  async function saveProduct(product, form) {
    const patch = {
      material_no: form.materialNo.trim(),
      name: form.name.trim(),
      photo_url: form.photoUrl || null,
      spec: form.spec.trim() || null,
      memo: form.memo.trim() || null,
      location: form.location.trim() || null,
      vendor: form.vendor.trim() || null,
      price_date: form.priceDate || null,
      purchase_price: form.purchasePrice === "" ? null : Number(form.purchasePrice),
      sale_price: form.salePrice === "" ? null : Number(form.salePrice),
    };
    const { data: updated, error } = await supabase.from("inventory_products").update(patch).eq("id", product.id).select().maybeSingle();
    if (error) { alert("저장 실패: " + error.message); return false; }
    if (!updated) { alert("저장 실패: 저장된 결과를 받지 못했습니다."); return false; }
    const mapped = mapInventoryProduct(updated);
    setData((prev) => ({ ...prev, inventoryProducts: prev.inventoryProducts.map((p) => (p.id === mapped.id ? mapped : p)) }));
    return true;
  }

  async function deleteProduct(product) {
    const { error } = await supabase.from("inventory_products").update({ active: false }).eq("id", product.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, inventoryProducts: prev.inventoryProducts.map((p) => (p.id === product.id ? { ...p, active: false } : p)) }));
    setSelectedId(null);
  }

  async function addMovement(product, type, { qtyDelta, note }) {
    const row = { product_id: product.id, type, qty_delta: qtyDelta, note };
    const { data: inserted, error } = await supabase.from("inventory_stock_movements").insert(row).select().maybeSingle();
    if (error) { alert("재고 반영 실패: " + error.message); return; }
    if (!inserted) { alert("재고 반영 실패: 저장된 결과를 받지 못했습니다."); return; }
    const mapped = mapInventoryStockMovement(inserted);
    setData((prev) => ({ ...prev, inventoryStockMovements: [...prev.inventoryStockMovements, mapped] }));
  }

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {SUBS.map((s) => (
          <button key={s} onClick={() => setSub(s)}
            className={`text-sm font-bold px-4 py-2.5 -mb-px border-b-2 ${
              sub === s ? "text-blue-700 border-blue-700" : "text-slate-400 border-transparent"
            }`}>
            {s}
          </button>
        ))}
      </div>

      {sub !== "제품목록" ? (
        <p className="pt-20 text-center text-sm text-slate-400">준비 중입니다 (다음 단계)</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-extrabold">제품목록</h1>
            <button onClick={startCreating} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5">+ 제품 추가</button>
          </div>
          <div className="flex gap-2 mb-3">
            <input className={`${inputCls} flex-1`} placeholder="자재번호·제품명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-3 whitespace-nowrap">
              <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} /> 재고 보유
            </label>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-7 gap-5 items-stretch">
            <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col xl:h-[calc(100vh-20rem)]">
              {rows.length === 0 ? (
                <p className="flex-1 flex items-center justify-center text-xs text-slate-400 text-center py-10">등록된 제품이 없습니다</p>
              ) : (
              <ul className="flex-1 overflow-y-auto">
                {rows.map((p) => {
                  const stock = currentStock(inventoryStockMovements, p.id);
                  return (
                    <li key={p.id}>
                      <button onClick={() => selectProduct(p.id)}
                        className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 border-b border-slate-50 ${
                          selectedId === p.id ? "bg-blue-50" : "hover:bg-slate-50"
                        }`}>
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{p.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            ₩{Number(p.purchasePrice ?? 0).toLocaleString()} / ₩{Number(p.salePrice ?? 0).toLocaleString()} · {p.materialNo}
                          </p>
                        </div>
                        <p className={`text-sm font-extrabold ${stock > 0 ? "text-blue-700" : "text-slate-300"}`}>{stock}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
              )}
            </div>

            <div className="xl:col-span-5 xl:h-[calc(100vh-20rem)]">
              {creating ? (
                <ProductCreatePanel
                  existingNos={active.map((p) => p.materialNo)}
                  onCancel={() => setCreating(false)}
                  onCreate={createProduct}
                />
              ) : !selected ? (
                <div className="bg-white rounded-xl border border-slate-200 h-40 xl:h-full flex items-center justify-center text-sm text-slate-400">
                  왼쪽 목록에서 제품을 선택하세요
                </div>
              ) : (
                <ProductDetail
                  key={selected.id}
                  product={selected}
                  movements={inventoryStockMovements}
                  onSave={saveProduct}
                  onDelete={deleteProduct}
                  onMovement={addMovement}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
