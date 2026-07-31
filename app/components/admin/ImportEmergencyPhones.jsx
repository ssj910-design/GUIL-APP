"use client";

// 비상통화장치 번호 일괄 업로드 — 현장·호기에 번호를 채운다.
//
// 실제 파일(비상통화장치 번호.xlsx, 738건) 구조:
//  · 한 시트에 같은 표가 좌우 2단으로 나뉘어 있다(A·B열 / D·E열)
//  · 이름은 현장명이거나 사업장명이고, "강변타운아파트 1호기"처럼 호기가 붙기도 한다(33건)
//  · 번호는 012-xxxx-xxxx(위성 통신) 471건, 국번 생략 7자리 198건, 지역번호 15건 등 형식이 섞여 있다
//
// 매칭은 엑셀 검증 업로드와 같은 규칙(lib/siteMatch)을 쓴다 — 법인기호·별칭·옛이름·유형어 등.
// 호기가 지정되면 그 호기(units.emergency_phone)에, 없으면 현장 대표번호(sites.emergency_phone)에 넣는다.
// 매칭 안 된 건은 저장하지 않고 목록으로 보여준다(검증 체계와 동일하게 사람이 확인).
import { useMemo, useState } from "react";
import { Upload, DatabaseZap, Download } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/app/components/admin/adminShared";
import { confirmAsync } from "@/app/components/ConfirmHost";
import { norm, nameKey, nameKeys, looseKeys, dongOf, similarity } from "@/lib/siteMatch";

// "강변타운아파트 1호기" / "대진인더스 (2호기)" → { base: "강변타운아파트", seq: 1 }
function splitUnit(raw) {
  const s = norm(raw);
  const m = /[(\s]*(\d{1,2})\s*호기\s*\)?\s*$/.exec(s);
  if (!m) return { base: s, seq: null };
  return { base: s.slice(0, m.index).replace(/[(\s]+$/, "").trim(), seq: Number(m[1]) };
}

// 번호 정리 — 표기 흔들림만 잡고 원본 형식은 보존한다(012 위성번호·국번 생략 모두 그대로 쓴다)
const cleanPhone = (v) => norm(v).replace(/[^\d-]/g, "").replace(/^-+|-+$/g, "");

export default function ImportEmergencyPhones({ data, setData, onClose }) {
  const [rows, setRows] = useState(null); // [{ raw, base, seq, phone, siteId, siteName, unitId, unitNo, how }]
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [links, setLinks] = useState({});     // 미매칭 행 idx → { siteId, siteName } (사람이 고른 연결)
  const [openIdx, setOpenIdx] = useState(null); // 후보를 펼쳐 볼 행
  const [query, setQuery] = useState("");      // 직접 검색어

  const dbSites = useMemo(() => (data?.sites ?? []).filter((s) => s.name).map((s) => ({
    id: s.id, name: s.name, keys: nameKeys(s.name), loose: looseKeys(s.name, s.address), dong: dongOf(s.address),
    address: s.address, emergencyPhone: s.emergencyPhone,
  })), [data]);

  // 이 파일엔 이름 앞뒤에 지역 힌트가 붙는다 — "중구 포커스빌딩", "서진빌딩 (서초동)", "㈜한국카본 (마포구)".
  // 그 힌트로 이름을 좁히고, 이름이 같은 현장이 여러 곳이면 힌트로 고른다.
  function regionHintOf(raw) {
    const s = norm(raw);
    const inParen = /\(([^)]*[구동])\)/.exec(s)?.[1];              // "(서초동)", "(마포구)"
    const prefix = /^([가-힣]{1,4}구)\s/.exec(s)?.[1];             // "중구 포커스빌딩"
    return norm(inParen || prefix || "") || null;
  }
  const stripRegion = (raw) => norm(raw).replace(/^[가-힣]{1,4}구\s+/, "").replace(/\s*\([^)]*[구동]\)\s*$/, "").trim();

  function matchSite(base, hint) {
    const tryKeys = (name) => {
      const keys = nameKeys(name);
      let hits = dbSites.filter((s) => s.keys.some((k) => keys.includes(k)));
      if (!hits.length) {
        const loose = looseKeys(name, "").filter((k) => k.length >= 3);
        hits = loose.length ? dbSites.filter((s) => s.loose.some((k) => k.length >= 3 && loose.includes(k))) : [];
      }
      return hits;
    };
    let hits = tryKeys(base);
    const stripped = stripRegion(base);
    if (!hits.length && stripped && stripped !== base) hits = tryKeys(stripped); // "중구 포커스빌딩" → "포커스빌딩"
    // 후보가 여럿이면 지역 힌트(괄호 안 동·구, 앞의 구)로 고른다
    if (hits.length > 1 && hint) {
      const h = nameKey(hint);
      const narrowed = hits.filter((s) => {
        const dong = s.dong ? nameKey(s.dong) : "";
        return dong === h || (s.address ? nameKey(s.address).includes(h) : false);
      });
      if (narrowed.length === 1) return narrowed;
    }
    return hits;
  }

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      const header = (sheet[0] ?? []).map((h) => norm(h));
      // 좌우 2단 구조 — "현장명/번호" 쌍이 나오는 열 위치를 헤더에서 찾는다
      const pairs = [];
      header.forEach((h, i) => {
        if (/현장명|건물명|사업장/.test(h) && /전화|번호/.test(header[i + 1] ?? "")) pairs.push([i, i + 1]);
      });
      if (!pairs.length) throw new Error("헤더에서 '현장명 + 비상통화번호' 열 쌍을 못 찾았습니다");

      const units = data?.units ?? [];
      const out = [];
      sheet.slice(1).forEach((r, i) => {
        for (const [a, b] of pairs) {
          const raw = norm(r[a]);
          const phone = cleanPhone(r[b]);
          if (!raw && !phone) continue;
          const { base, seq } = splitUnit(raw);
          const hits = base ? matchSite(base, regionHintOf(raw)) : [];
          const site = hits.length === 1 ? hits[0] : null;
          let unit = null;
          if (site && seq) unit = units.find((u) => u.siteId === site.id && u.seq === seq) ?? null;
          out.push({
            idx: out.length, excelRow: i + 2, raw, base, seq, phone,
            siteId: site?.id ?? null, siteName: site?.name ?? null,
            unitId: unit?.id ?? null, unitNo: unit?.unitNo ?? null,
            multi: hits.length > 1 ? hits.length : 0,
            how: !phone ? "번호 없음"
              : !site ? (hits.length > 1 ? `이름이 같은 현장 ${hits.length}곳 — 골라주세요` : "현장 못 찾음 — 후보에서 고르거나 검색")
              // 호기가 DB에 없으면(대표번호로 통합 운영하는 현장) 현장 대표번호로 넣는다
              : seq && !unit ? `${seq}호기가 DB에 없음 → 현장 대표번호로`
              : unit ? `${unit.unitNo} 지정` : "현장 대표번호",
          });
        }
      });
      setRows(out);
    } catch (err) {
      alert("파일을 읽지 못했습니다: " + err.message);
    }
    setBusy(false);
  }

  // 미매칭 행에 보여줄 후보 — 이름 유사도(느슨한 키 포함) + 지역 힌트 가산점, 상위 4곳.
  // 검증 업로드와 같은 방식으로, 이름 표기가 달라도(코킴하우스 ↔ KOKIM HOUSE) 사람이 클릭해 연결할 수 있게.
  function candidatesFor(r) {
    const myKeys = looseKeys(stripRegion(r.base), "");
    const hint = regionHintOf(r.raw);
    const h = hint ? nameKey(hint) : "";
    return dbSites
      .map((s) => {
        let score = Math.max(...myKeys.flatMap((a) => s.loose.map((b) => similarity(a, b))), 0);
        const tags = [];
        if (myKeys.some((a) => a.length >= 3 && s.loose.includes(a))) { score = Math.max(score, 0.8); tags.push("이름 핵심 일치"); }
        if (h && (nameKey(s.dong ?? "") === h || nameKey(s.address ?? "").includes(h))) { score += 0.2; tags.push("지역 일치"); }
        return { ...s, score: Math.min(score, 1), tags };
      })
      .filter((s) => s.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }
  // 사람이 고른 연결을 반영한 최종 행
  const finalRows = useMemo(() => {
    if (!rows) return null;
    const units = data?.units ?? [];
    return rows.map((r) => {
      const link = links[r.idx];
      if (!link) return r;
      const unit = r.seq ? units.find((u) => u.siteId === link.siteId && u.seq === r.seq) ?? null : null;
      return {
        ...r, siteId: link.siteId, siteName: link.siteName,
        unitId: unit?.id ?? null, unitNo: unit?.unitNo ?? null,
        how: r.seq && !unit ? `${r.seq}호기가 DB에 없음 → 현장 대표번호로` : unit ? `${unit.unitNo} 지정(수동 연결)` : "현장 대표번호(수동 연결)",
      };
    });
  }, [rows, links, data]);

  // 반영 계획 — 번호가 있고 현장이 확정된 것만. 이미 같은 번호면 건너뛴다.
  const plan = useMemo(() => {
    if (!finalRows) return { units: [], sites: [], skip: 0 };
    const unitRows = [], siteRows = [];
    let skip = 0;
    const seen = new Set();
    for (const r of finalRows) {
      if (!r.phone || !r.siteId) continue;
      if (r.unitId) {
        const u = (data?.units ?? []).find((x) => x.id === r.unitId);
        if (u?.emergencyPhone === r.phone) { skip++; continue; }
        unitRows.push(r);
      } else {
        // 호기가 안 적혔거나(대표번호로 통합 운영) 그 호기가 DB에 없으면 현장 대표번호로 넣는다.
        // 한 현장에 여러 줄이면 첫 줄만 — 뒤 줄이 앞 줄을 덮어쓰지 않게.
        if (seen.has(r.siteId)) continue;
        seen.add(r.siteId);
        const s = dbSites.find((x) => x.id === r.siteId);
        if (s?.emergencyPhone === r.phone) { skip++; continue; }
        siteRows.push(r);
      }
    }
    return { units: unitRows, sites: siteRows, skip };
  }, [finalRows, data, dbSites]);

  const unmatched = (finalRows ?? []).filter((r) => r.phone && !r.siteId);

  async function apply() {
    const total = plan.units.length + plan.sites.length;
    if (!(await confirmAsync(
      `비상통화장치 번호를 반영합니다.\n· 호기별 ${plan.units.length}건\n· 현장 대표 ${plan.sites.length}건` +
      `${plan.skip ? `\n(이미 같은 번호 ${plan.skip}건은 건너뜁니다)` : ""}\n\n기존 번호가 다르면 새 번호로 갱신됩니다. 진행할까요?`
    ))) return;
    setBusy(true);
    setProgress({ done: 0, total });
    let ok = 0, i = 0;
    const failed = [];
    for (const r of plan.units) {
      const { error } = await supabase.from("units").update({ emergency_phone: r.phone }).eq("id", r.unitId);
      if (error) failed.push(`${r.siteName} ${r.unitNo}: ${error.message}`); else ok++;
      setProgress({ done: ++i, total });
    }
    for (const r of plan.sites) {
      const { error } = await supabase.from("sites").update({ emergency_phone: r.phone }).eq("id", r.siteId);
      if (error) failed.push(`${r.siteName}: ${error.message}`); else ok++;
      setProgress({ done: ++i, total });
    }
    // 화면에도 반영
    if (ok && setData) {
      const unitPhone = new Map(plan.units.map((r) => [r.unitId, r.phone]));
      const sitePhone = new Map(plan.sites.map((r) => [r.siteId, r.phone]));
      setData((prev) => ({
        ...prev,
        units: prev.units.map((u) => (unitPhone.has(u.id) ? { ...u, emergencyPhone: unitPhone.get(u.id) } : u)),
        sites: prev.sites.map((s) => (sitePhone.has(s.id) ? { ...s, emergencyPhone: sitePhone.get(s.id) } : s)),
      }));
    }
    setProgress(null);
    setBusy(false);
    alert(failed.length ? `${ok}건 반영, 실패 ${failed.length}건:\n${failed.slice(0, 5).join("\n")}` : `완료 — ${ok}건 반영했습니다.`);
  }

  async function downloadUnmatched() {
    const XLSX = await import("xlsx");
    const body = unmatched.map((r) => [r.excelRow, r.raw, r.phone, r.how, r.siteName ?? ""]);
    const ws = XLSX.utils.aoa_to_sheet([["원본행", "엑셀 이름", "번호", "사유", "매칭된 현장"], ...body]);
    ws["!cols"] = [{ wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "미매칭");
    XLSX.writeFile(wb, "비상통화장치_미매칭.xlsx");
  }

  const counts = rows && {
    all: rows.filter((r) => r.phone).length,
    unit: plan.units.length,
    site: plan.sites.length,
    skip: plan.skip,
    bad: unmatched.length,
  };

  return (
    <Modal title="비상통화장치 번호 일괄 업로드" onClose={onClose} wide="xl">
      <div className="p-5 overflow-y-auto space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 cursor-pointer">
            <Upload size={15} /> 엑셀 올리기 {rows ? `(${rows.filter((r) => r.phone).length}건 읽음)` : ""}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={pick} disabled={busy} />
          </label>
          {rows && (
            <div className="flex gap-2 ml-auto">
              {counts.bad > 0 && (
                <button onClick={downloadUnmatched} className="flex items-center gap-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl px-4 py-2.5">
                  <Download size={15} /> 미매칭 목록 받기
                </button>
              )}
              <button onClick={apply} disabled={busy || (!plan.units.length && !plan.sites.length)}
                className="flex items-center gap-2 text-sm font-bold text-white bg-emerald-600 disabled:bg-slate-300 rounded-xl px-4 py-2.5">
                <DatabaseZap size={15} /> {progress ? `반영 중… ${progress.done}/${progress.total}` : `DB 반영 (호기 ${plan.units.length} · 현장 ${plan.sites.length})`}
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400">
          호기가 적힌 건(예: “강변타운아파트 1호기”)은 그 호기에, 없으면 현장 대표번호로 넣습니다.
          이름이 안 맞거나 호기가 DB에 없는 건은 저장하지 않고 아래에 모아둡니다.
        </p>

        {progress && (
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
        )}

        {counts && (
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full px-3 py-1.5 bg-slate-100 text-slate-600">전체 {counts.all}</span>
            <span className="rounded-full px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200">호기 지정 {counts.unit}</span>
            <span className="rounded-full px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200">현장 대표 {counts.site}</span>
            {counts.skip > 0 && <span className="rounded-full px-3 py-1.5 bg-slate-50 text-slate-500 border border-slate-200">이미 같음 {counts.skip}</span>}
            {counts.bad > 0 && <span className="rounded-full px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200">확인 필요 {counts.bad}</span>}
          </div>
        )}

        {counts?.bad > 0 && (
          <>
            <p className="text-xs font-bold text-slate-500">확인 필요 — 줄을 눌러 후보에서 고르거나 직접 검색해 연결하세요</p>
            <div className="border border-amber-200 rounded-xl divide-y divide-amber-100 max-h-[45vh] overflow-y-auto">
              {unmatched.map((r) => {
                const open = openIdx === r.idx;
                const cands = open ? candidatesFor(r) : [];
                const qk = query.trim().length >= 2 ? nameKey(query) : "";
                const searched = open && qk ? dbSites.filter((s) => s.keys.some((k) => k.includes(qk))).slice(0, 5) : [];
                const pick = (s) => { setLinks((p) => ({ ...p, [r.idx]: { siteId: s.id, siteName: s.name } })); setOpenIdx(null); setQuery(""); };
                return (
                  <div key={r.idx}>
                    <button onClick={() => { setOpenIdx(open ? null : r.idx); setQuery(""); }}
                      className="w-full px-4 py-2 flex items-center gap-3 text-sm text-left hover:bg-amber-50/50">
                      <span className="font-bold text-slate-800 truncate">{r.raw || "(이름 없음)"}</span>
                      <span className="text-slate-400 shrink-0">{r.phone}</span>
                      <span className="ml-auto text-xs font-bold text-amber-700 shrink-0">{r.how}</span>
                    </button>
                    {open && (
                      <div className="px-4 pb-3 space-y-2 bg-white">
                        <div className="flex flex-wrap gap-1.5">
                          {cands.map((c) => (
                            <button key={c.id} onClick={() => pick(c)}
                              className="text-xs font-bold px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-700 hover:bg-blue-50">
                              {c.name} {c.dong ? `(${c.dong})` : ""} · {Math.round(c.score * 100)}%{c.tags.length ? ` · ${c.tags.join("·")}` : ""}
                            </button>
                          ))}
                          {cands.length === 0 && <span className="text-xs text-slate-400">비슷한 이름 없음 — 아래에서 검색</span>}
                        </div>
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="현장 이름으로 직접 검색 (2자 이상)"
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white" />
                        {searched.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {searched.map((s) => (
                              <button key={s.id} onClick={() => pick(s)}
                                className="text-xs font-bold px-2.5 py-1 rounded-full bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                                {s.name} {s.dong ? `(${s.dong})` : ""}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {/* 사람이 연결한 건 목록 */}
        {Object.keys(links).length > 0 && (
          <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-700">
            <b>수동 연결 {Object.keys(links).length}건</b> — 반영 대상에 포함됩니다.
            <button onClick={() => setLinks({})} className="ml-2 font-bold text-slate-400">모두 해제</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
