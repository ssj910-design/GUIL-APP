"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { currentStock } from "@/lib/inventoryStock";
import { supabase } from "@/lib/supabaseClient";
import { mapInventoryProduct } from "@/lib/mappers";
import { inputCls, Modal } from "@/app/components/admin/adminShared";
import { SinglePhotoUpload } from "@/app/components/formWidgets";
import { confirmAsync } from "@/app/components/ConfirmHost";

const SUBS = ["제품목록", "입출고내역", "구매"];

// 자재번호 자동생성 — MAT- + 임의 8자, 이미 쓰는 번호와 겹치면 다시 뽑는다.
function randomMaterialNo(existing) {
  const used = new Set(existing);
  let no;
  do {
    no = "MAT-" + Math.random().toString(36).slice(2, 10).toUpperCase();
  } while (used.has(no));
  return no;
}

// 등록 모달과 상세 인라인수정이 같은 필드 셋을 쓴다.
function ProductFormFields({ form, setForm, onGenerateMaterialNo }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold text-slate-500 mb-1">자재번호 *</p>
        <div className="flex gap-1.5">
          <input className={inputCls} value={form.materialNo} onChange={(e) => setForm({ ...form, materialNo: e.target.value })} />
          <button type="button" onClick={onGenerateMaterialNo} className="text-xs font-bold text-white bg-emerald-600 rounded-lg px-3 whitespace-nowrap">자동 생성</button>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 mb-1">제품명 *</p>
        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <SinglePhotoUpload
        label="사진 추가"
        url={form.photoUrl}
        uploadFolder="inventory"
        onUploaded={(url) => setForm({ ...form, photoUrl: url })}
        onRemove={() => setForm({ ...form, photoUrl: "" })}
      />
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs font-bold text-slate-500 mb-1">규격</p><input className={inputCls} value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">위치</p><input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">구매처</p><input className={inputCls} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">단가 기준일자</p><input type="date" className={inputCls} value={form.priceDate} onChange={(e) => setForm({ ...form, priceDate: e.target.value })} /></div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 mb-1">비고</p>
        <input className={inputCls} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs font-bold text-slate-500 mb-1">구매가</p><input type="number" className={inputCls} value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">판매가</p><input type="number" className={inputCls} value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} /></div>
      </div>
    </div>
  );
}

function RegisterProductModal({ existingNos, onClose, onCreate }) {
  const [form, setForm] = useState({
    materialNo: randomMaterialNo(existingNos), name: "", photoUrl: "", spec: "", location: "",
    vendor: "", priceDate: "", memo: "", purchasePrice: "", salePrice: "",
  });
  const [saving, setSaving] = useState(false);
  const valid = form.materialNo.trim() && form.name.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="제품 등록" onClose={onClose}>
      <ProductFormFields form={form} setForm={setForm} onGenerateMaterialNo={() => setForm({ ...form, materialNo: randomMaterialNo(existingNos) })} />
      <div className="flex justify-end pt-4">
        <button disabled={!valid || saving} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
          {saving ? "등록 중..." : "등록하기"}
        </button>
      </div>
    </Modal>
  );
}

function ProductDetail({ product, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

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
    await onSave(product, form);
    setEditing(false);
  }

  async function remove() {
    if (!(await confirmAsync(`"${product.name}"을(를) 삭제할까요?`))) return;
    await onDelete(product);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-extrabold">제품 정보</p>
        {!editing ? (
          <div className="flex gap-1.5">
            <button onClick={startEdit} className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5"><Pencil size={13} /> 수정</button>
            <button onClick={remove} className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 rounded-lg px-3 py-1.5"><Trash2 size={13} /> 삭제</button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <button onClick={() => setEditing(false)} className="text-xs font-bold text-slate-500 bg-slate-100 rounded-lg px-3 py-1.5">취소</button>
            <button onClick={save} className="text-xs font-bold text-white bg-blue-700 rounded-lg px-3 py-1.5">저장</button>
          </div>
        )}
      </div>
      {editing ? (
        <ProductFormFields form={form} setForm={setForm} onGenerateMaterialNo={() => {}} />
      ) : (
        <>
          <div className="flex gap-3.5 mb-4">
            {product.photoUrl ? (
              <img src={product.photoUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-100" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-slate-100" />
            )}
            <div className="grid grid-cols-[80px_1fr] gap-y-2 text-sm flex-1">
              <span className="text-slate-400">자재번호</span><span className="font-bold">{product.materialNo}</span>
              <span className="text-slate-400">제품명</span><span className="font-bold">{product.name}</span>
            </div>
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
  );
}

export default function InventoryAdmin({ data, setData }) {
  const { inventoryProducts = [], inventoryStockMovements = [] } = data;
  const [sub, setSub] = useState("제품목록");
  const [search, setSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [registering, setRegistering] = useState(false);

  const active = inventoryProducts.filter((p) => p.active !== false);
  const rows = active.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q && !`${p.materialNo} ${p.name}`.toLowerCase().includes(q)) return false;
    if (onlyInStock && currentStock(inventoryStockMovements, p.id) <= 0) return false;
    return true;
  });
  const selected = active.find((p) => p.id === selectedId) ?? null;

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
    if (error) { alert("등록 실패: " + error.message); return; }
    if (!inserted) { alert("등록 실패: 저장된 결과를 받지 못했습니다."); return; }
    const mapped = mapInventoryProduct(inserted);
    setData((prev) => ({ ...prev, inventoryProducts: [mapped, ...prev.inventoryProducts] }));
    setSelectedId(mapped.id);
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
    if (error) { alert("저장 실패: " + error.message); return; }
    if (!updated) { alert("저장 실패: 저장된 결과를 받지 못했습니다."); return; }
    const mapped = mapInventoryProduct(updated);
    setData((prev) => ({ ...prev, inventoryProducts: prev.inventoryProducts.map((p) => (p.id === mapped.id ? mapped : p)) }));
  }

  async function deleteProduct(product) {
    const { error } = await supabase.from("inventory_products").update({ active: false }).eq("id", product.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, inventoryProducts: prev.inventoryProducts.map((p) => (p.id === product.id ? { ...p, active: false } : p)) }));
    setSelectedId(null);
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
            <button onClick={() => setRegistering(true)} className="text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5">+ 제품 추가</button>
          </div>
          <div className="flex gap-2 mb-3">
            <input className={`${inputCls} flex-1`} placeholder="자재번호·제품명 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg px-3 whitespace-nowrap">
              <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} /> 재고 보유
            </label>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-7 gap-5 items-start">
            <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <ul className="max-h-[calc(100vh-20rem)] overflow-y-auto">
                {rows.map((p) => {
                  const stock = currentStock(inventoryStockMovements, p.id);
                  return (
                    <li key={p.id}>
                      <button onClick={() => setSelectedId(p.id)}
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
              {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-10">등록된 제품이 없습니다</p>}
            </div>

            <div className="xl:col-span-5">
              {!selected ? (
                <div className="bg-white rounded-xl border border-slate-200 h-40 xl:h-64 flex items-center justify-center text-sm text-slate-400">
                  왼쪽 목록에서 제품을 선택하세요
                </div>
              ) : (
                <ProductDetail product={selected} onSave={saveProduct} onDelete={deleteProduct} />
              )}
            </div>
          </div>

          {registering && (
            <RegisterProductModal
              existingNos={active.map((p) => p.materialNo)}
              onClose={() => setRegistering(false)}
              onCreate={createProduct}
            />
          )}
        </>
      )}
    </div>
  );
}
