"use client";

import { useState } from "react";
import { UNIT_PART_TAXONOMY, leafPathsOf, countFilled } from "@/lib/unitPartTaxonomy";
import { partLeafPhotos, savePartLeafPhotos } from "@/lib/partLeafPhotos";
import { FileCarousel } from "@/app/components/admin/adminShared";
import { uploadPhoto } from "@/lib/photos";

// 트리 리프 한 줄 — 점(사진 유무) + 라벨. 클릭하면 우측 상세를 이 리프로 바꾼다.
function TreeLeaf({ category, subcategory, part, photos, selected, onSelect }) {
  const has = photos.some((p) => p.category === category && p.subcategory === subcategory && p.part === part);
  return (
    <button
      type="button"
      onClick={() => onSelect({ category, subcategory, part })}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs ${
        selected ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-500"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${has ? "bg-emerald-500" : "bg-slate-200"}`} />
      {part}
    </button>
  );
}

// node가 문자열이면 리프, 객체({label,children})면 중분류 소제목 + 그 아래 리프들 —
// 깊이 상관없이 재귀(모바일 PartPhotosPanel의 PartNode/PartGroup과 동일한 순회 방식).
function TreeNode({ category, subcategory, node, photos, selected, onSelect }) {
  if (typeof node === "string") {
    const isSelected = selected?.category === category && selected?.subcategory === subcategory && selected?.part === node;
    return <TreeLeaf category={category} subcategory={subcategory} part={node} photos={photos} selected={isSelected} onSelect={onSelect} />;
  }
  return (
    <div>
      <p className="px-2.5 pt-2 pb-1 text-[10px] font-bold text-slate-400">{node.label}</p>
      {node.children.map((child) => (
        <TreeNode
          key={typeof child === "string" ? child : child.label}
          category={category}
          subcategory={node.label}
          node={child}
          photos={photos}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// 대분류 한 칸 — 탭하면 펼쳐져서 안의 트리가 나온다. 한 번에 하나만 펼침(부모가 상태 관리).
function TreeCategory({ cat, photos, open, onToggle, selected, onSelect }) {
  const paths = leafPathsOf(cat, cat.label, null);
  const filled = countFilled(paths, photos);
  const full = filled === paths.length;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left ${open ? "bg-blue-50" : ""}`}
      >
        <span className={`text-xs font-extrabold ${open ? "text-blue-700" : "text-slate-700"}`}>{cat.label}</span>
        <span className={`text-[10px] font-extrabold ${full ? "text-emerald-600" : "text-slate-400"}`}>{filled}/{paths.length}</span>
      </button>
      {open && (
        <div className="pl-1.5 pb-1">
          {cat.children.map((child) => (
            <TreeNode
              key={typeof child === "string" ? child : child.label}
              category={cat.label}
              subcategory={null}
              node={child}
              photos={photos}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 우측 상세 — 선택된 리프의 사진 패널. FileCarousel 하나로 촬영/선택/드래그드랍/전체화면/삭제 전부 처리.
function LeafDetail({ unitId, selected, photos, onAdd, onRemove }) {
  if (!selected) {
    return <p className="text-xs text-slate-400 text-center py-16">왼쪽에서 항목을 선택하세요</p>;
  }
  const { mine, urls } = partLeafPhotos(photos, selected.category, selected.subcategory, selected.part);
  async function handleSave(nextUrls) {
    await savePartLeafPhotos({ unitId, ...selected, mine, urls, nextUrls, onAdd, onRemove });
  }
  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-1">
        {selected.category}{selected.subcategory ? ` › ${selected.subcategory}` : ""}
      </p>
      <h3 className="text-sm font-extrabold text-slate-800 mb-3">{selected.part}</h3>
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
    </div>
  );
}

export function PartsStatusTab({ unitId, photos, onAdd, onRemove }) {
  const [openCategory, setOpenCategory] = useState(null);
  const [selected, setSelected] = useState(null);

  if (!unitId) {
    return <p className="text-xs text-slate-400 text-center py-10">호기 정보가 없어 부품현황을 쓸 수 없습니다</p>;
  }

  const allPaths = UNIT_PART_TAXONOMY.flatMap((cat) => leafPathsOf(cat, cat.label, null));
  const totalFilled = countFilled(allPaths, photos);
  const fullCategoryCount = UNIT_PART_TAXONOMY.filter((cat) => {
    const paths = leafPathsOf(cat, cat.label, null);
    return countFilled(paths, photos) === paths.length;
  }).length;

  return (
    <div className="h-full flex gap-4">
      <div className="w-[240px] shrink-0 overflow-y-auto border-r border-slate-100 pr-3">
        {UNIT_PART_TAXONOMY.map((cat) => (
          <TreeCategory
            key={cat.label}
            cat={cat}
            photos={photos}
            open={openCategory === cat.label}
            onToggle={() => setOpenCategory(openCategory === cat.label ? null : cat.label)}
            selected={selected}
            onSelect={setSelected}
          />
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="flex gap-2 mb-4">
          <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1">
            전체 <span className="text-slate-800">{totalFilled}/{allPaths.length}</span>
          </span>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1">
            완료 <span className="text-emerald-600">{fullCategoryCount}개 대분류</span>
          </span>
        </div>
        <LeafDetail unitId={unitId} selected={selected} photos={photos} onAdd={onAdd} onRemove={onRemove} />
      </div>
    </div>
  );
}
