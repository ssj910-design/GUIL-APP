"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AccordionRow } from "@/app/components/ui";
import { FileCarousel } from "@/app/components/admin/adminShared";
import { uploadPhoto } from "@/lib/photos";
import { UNIT_PART_TAXONOMY, leafPathsOf, countFilled } from "@/lib/unitPartTaxonomy";

// 리프(세부항목) 한 칸 — 탭하면 펼쳐져서 사진 그리드(FileCarousel)가 나온다.
function PartLeafRow({ unitId, category, subcategory, part, photos, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const mine = photos.filter((p) => p.category === category && p.subcategory === subcategory && p.part === part);
  const urls = mine.map((p) => p.url);

  // FileCarousel은 "다음 urls 배열"만 넘겨준다 — 우리는 사진 1장=1행으로 저장하므로
  // 이전 urls와 비교해서 추가/삭제 중 뭐가 일어났는지 여기서 판단한다.
  // 단순 includes() 비교로는 같은 url이 두 장 이상 겹칠 때(중복 업로드 등) 삭제된 장을
  // 못 찾아 아무 반응이 없었다 — 개수 기반(멀티셋) 비교로 정확히 몇 번째가 빠졌는지 찾는다.
  async function handleSave(nextUrls) {
    if (nextUrls.length > urls.length) {
      const addedUrl = nextUrls.find((u) => !urls.includes(u));
      await onAdd({ unitId, category, subcategory, part, url: addedUrl });
    } else {
      const nextCounts = new Map();
      nextUrls.forEach((u) => nextCounts.set(u, (nextCounts.get(u) ?? 0) + 1));
      const removedIndex = urls.findIndex((u) => {
        const remaining = nextCounts.get(u) ?? 0;
        if (remaining > 0) { nextCounts.set(u, remaining - 1); return false; }
        return true;
      });
      const removed = removedIndex >= 0 ? mine[removedIndex] : undefined;
      if (removed) await onRemove(removed.id);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-100 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-bold text-slate-700">{part}</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold ${mine.length ? "text-emerald-600" : "text-slate-400"}`}>
            {mine.length ? `${mine.length}장` : "사진 없음"}
          </span>
          <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
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
    </div>
  );
}

// 중분류 한 칸 — 탭하면 펼쳐져서 그 안의 리프 목록이 나온다(PartNode로 재귀).
function PartGroup({ unitId, category, node, photos, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const paths = leafPathsOf(node, category, node.label);
  const filled = countFilled(paths, photos);
  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-2.5">
        <span className="text-[13px] font-extrabold text-slate-700">{node.label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{filled}/{paths.length}</span>
          <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="px-2 pb-2.5 pt-1 border-t border-slate-50 bg-slate-50/40 space-y-1.5">
          {node.children.map((child) => (
            <PartNode
              key={typeof child === "string" ? child : child.label}
              unitId={unitId}
              category={category}
              subcategory={node.label}
              node={child}
              photos={photos}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// node가 문자열이면 리프, 객체({label,children})면 중분류 — 깊이에 상관없이 재귀.
function PartNode({ unitId, category, subcategory, node, photos, onAdd, onRemove }) {
  if (typeof node === "string") {
    return (
      <PartLeafRow
        unitId={unitId} category={category} subcategory={subcategory} part={node}
        photos={photos} onAdd={onAdd} onRemove={onRemove}
      />
    );
  }
  return <PartGroup unitId={unitId} category={category} node={node} photos={photos} onAdd={onAdd} onRemove={onRemove} />;
}

export function PartPhotosPanel({ unitId, photos, onAdd, onRemove }) {
  const [openCategory, setOpenCategory] = useState(null);

  if (!unitId) {
    return <p className="text-xs text-slate-400 text-center py-10">호기 정보가 없어 부품현황을 쓸 수 없습니다</p>;
  }

  return (
    <div className="bg-slate-50 pb-6">
      {UNIT_PART_TAXONOMY.map((cat) => {
        const paths = leafPathsOf(cat, cat.label, null);
        const filled = countFilled(paths, photos);
        const open = openCategory === cat.label;
        return (
          <AccordionRow
            key={cat.label}
            label={cat.label}
            badge={`${filled}/${paths.length}`}
            open={open}
            onToggle={() => setOpenCategory(open ? null : cat.label)}
          >
            <div className="space-y-1.5">
              {cat.children.map((child) => (
                <PartNode
                  key={typeof child === "string" ? child : child.label}
                  unitId={unitId}
                  category={cat.label}
                  subcategory={null}
                  node={child}
                  photos={photos}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </AccordionRow>
        );
      })}
    </div>
  );
}
