"use client";

// 공단 "유지관리 현장관리" 엑셀 일괄 등록 — 온보딩용.
// 업체계정에서 받은 xlsx를 브라우저에서 파싱(JSZip, 이미 설치된 의존성)해
// 건물별로 묶어 sites + units를 생성한다. 이미 등록된 승강기(gov_no)는 스킵.
import { useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/lib/supabaseClient";
import { mapUnit, mapSite } from "@/lib/mappers";
import { Modal } from "@/app/components/admin/adminShared";

const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
const colIdx = (ref) => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const toDate = (v) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : null);

// 셀 참조(r="C5") 기준으로 읽는다 — 빈 셀이 XML에서 생략돼도 열이 밀리지 않도록.
async function parseXlsx(file) {
  const zip = await JSZip.loadAsync(file);
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string") ?? "";
  const shared = [...sharedXml.matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
    unesc(m[1].replace(/<[^>]+>/g, ""))
  );
  const sheetName = Object.keys(zip.files).find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n));
  const sheetXml = await zip.file(sheetName).async("string");
  return [...sheetXml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map((rm) => {
    const cells = [];
    // 셀을 통째로 잡은 뒤 속성(r, t)과 값을 따로 추출 — 속성 순서에 무관하게 동작
    for (const [cell] of rm[1].matchAll(/<c\b[^>]*(?:\/>|>.*?<\/c>)/gs)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cell)?.[1];
      if (!ref) continue;
      const isShared = /\bt="s"/.test(cell);
      const raw = /<v>([^<]*)<\/v>/.exec(cell)?.[1] ?? "";
      cells[colIdx(ref)] = isShared ? shared[Number(raw)] ?? "" : unesc(raw);
    }
    return cells;
  });
}

// 파일 행들 → { 건물키: { name, address, units: [...] } }
function toPlan(rows, existingGovNos) {
  const header = rows[0].map((h) => (h ?? "").trim());
  const col = (name) => header.findIndex((h) => h.replace(/\s/g, "") === name.replace(/\s/g, ""));
  const C = {
    name: col("건물명"), addr1: col("소재지1"), addr2: col("소재지2"),
    govNo: col("승강기고유번호"), status: col("승강기상태"), seq: col("호기"),
    kind: col("승강기종류"), model: col("승강기모델"), installed: col("최초설치일자"),
  };
  if (C.name < 0 || C.govNo < 0) throw new Error("공단 양식이 아닙니다 (건물명/승강기 고유번호 열 없음)");

  const buildings = new Map();
  const seen = new Set(); // 파일 내부 중복(같은 승강기가 두 줄) 방지
  let dup = 0, bad = 0;
  for (const r of rows.slice(1)) {
    const name = (r[C.name] ?? "").trim();
    const govNo = (r[C.govNo] ?? "").replace(/\D/g, "");
    if (!name || !govNo) { bad++; continue; }
    if (existingGovNos.has(govNo) || seen.has(govNo)) { dup++; continue; }
    seen.add(govNo);
    const key = name + "|" + (r[C.addr1] ?? "");
    if (!buildings.has(key)) {
      buildings.set(key, { name, address: `${r[C.addr1] ?? ""} ${r[C.addr2] ?? ""}`.trim(), units: [] });
    }
    const b = buildings.get(key);
    // 파일에 호기 번호가 중복되면(데이터 오류) 다음 빈 번호로 민다
    let seq = Number(r[C.seq]) || b.units.length + 1;
    while (b.units.some((u) => u.seq === seq)) seq++;
    b.units.push({
      seq,
      govNo,
      unitType: (r[C.kind] ?? "").includes("에스컬레이터") ? "에스컬레이터" : "엘리베이터",
      kind: (r[C.kind] ?? "").trim() || null,
      model: (r[C.model] ?? "").trim() || null,
      installDate: toDate((r[C.installed] ?? "").trim()),
      isActive: (r[C.status] ?? "운행중") === "운행중",
    });
  }
  return { buildings: [...buildings.values()], dup, bad };
}

export default function ImportSites({ data, setData, onClose }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const rows = await parseXlsx(file);
      const existing = new Set(data.units.map((u) => u.govNo).filter(Boolean));
      setPlan(toPlan(rows, existing));
    } catch (err) {
      alert("파일을 읽지 못했습니다: " + err.message);
    }
    setBusy(false);
  }

  async function run() {
    setBusy(true);
    const stamp = Date.now();
    const byName = new Map(data.sites.map((s) => [s.name + "|" + (s.address ?? "").split(" (")[0], s.id]));
    const siteRows = [];
    const unitRows = [];
    plan.buildings.forEach((b, i) => {
      // 같은 이름+주소 현장이 이미 있으면 그 현장에 호기만 추가
      let siteId = byName.get(b.name + "|" + b.address.split(" (")[0]);
      if (!siteId) {
        siteId = `site-${stamp}-${i}`;
        siteRows.push({
          id: siteId, name: b.name, address: b.address, contract_type: "POG(일반계약)",
          unit_count: b.units.length,
          gov_elevator_nos: b.units.sort((x, y) => x.seq - y.seq).map((u) => u.govNo),
          elevator_model: b.units[0]?.model ?? null,
        });
      }
      for (const u of b.units) {
        unitRows.push({
          site_id: siteId, seq: u.seq, unit_no: `${u.seq}호기`, unit_type: u.unitType,
          model: u.model, install_date: u.installDate, gov_no: u.govNo, is_active: u.isActive,
        });
      }
    });

    for (let i = 0; i < siteRows.length; i += 200) {
      const { error } = await supabase.from("sites").insert(siteRows.slice(i, i + 200));
      if (error) { alert("현장 등록 실패: " + error.message); setBusy(false); return; }
    }
    let inserted = 0;
    for (let i = 0; i < unitRows.length; i += 200) {
      const { data: created, error } = await supabase.from("units").insert(unitRows.slice(i, i + 200)).select();
      if (error) { alert(`호기 등록 실패(${inserted}개 성공 후): ` + error.message); break; }
      inserted += created.length;
    }
    // 새로고침이 가장 단순·정확 (일괄 등록은 드문 작업)
    const [sites, units] = await Promise.all([
      supabase.from("sites").select("*").order("name"),
      supabase.from("units").select("*").order("seq"),
    ]);
    setData((prev) => ({ ...prev, sites: (sites.data ?? []).map(mapSite), units: (units.data ?? []).map(mapUnit) }));
    setDone({ sites: siteRows.length, units: inserted });
    setBusy(false);
  }

  return (
    <Modal title="공단 엑셀 일괄 등록" onClose={onClose}>
      {done ? (
        <div className="text-center py-8">
          <p className="text-lg font-extrabold text-emerald-600 mb-1">등록 완료</p>
          <p className="text-sm text-slate-600">현장 {done.sites}개 · 호기 {done.units}대가 등록됐습니다.</p>
          <button onClick={onClose} className="mt-5 text-sm font-bold text-white bg-blue-700 rounded-xl px-5 py-2.5">닫기</button>
        </div>
      ) : !plan ? (
        <div className="py-4">
          <p className="text-sm text-slate-600 mb-3">
            국가승강기정보센터 <b>업체계정 → 유지관리 현장관리</b>에서 내려받은 엑셀(.xlsx)을 선택하세요.
            건물별로 현장과 호기(고유번호·모델·설치일 포함)가 자동 생성됩니다.
          </p>
          <input type="file" accept=".xlsx" onChange={pick} disabled={busy} className="text-sm" />
          {busy && <p className="text-xs text-slate-400 mt-2">파일 분석 중...</p>}
        </div>
      ) : (
        <div className="py-2">
          <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1 mb-4">
            <p><b>{plan.buildings.length}개 건물 · {plan.buildings.reduce((n, b) => n + b.units.length, 0)}대 승강기</b>를 등록합니다.</p>
            {plan.dup > 0 && <p className="text-slate-500">이미 등록된 승강기 {plan.dup}대는 건너뜁니다.</p>}
            {plan.bad > 0 && <p className="text-slate-500">건물명/고유번호가 없는 {plan.bad}행은 무시합니다.</p>}
          </div>
          <ul className="max-h-48 overflow-y-auto text-xs text-slate-500 border border-slate-100 rounded-lg p-3 mb-4">
            {plan.buildings.slice(0, 30).map((b) => (
              <li key={b.name + b.address}>{b.name} — {b.units.length}대</li>
            ))}
            {plan.buildings.length > 30 && <li>... 외 {plan.buildings.length - 30}개 건물</li>}
          </ul>
          <div className="flex justify-end gap-2">
            <button onClick={() => setPlan(null)} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">다시 선택</button>
            <button onClick={run} disabled={busy} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
              {busy ? "등록 중..." : "일괄 등록 실행"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
