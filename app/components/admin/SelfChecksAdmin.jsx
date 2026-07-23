"use client";

// 자체점검 출석부 (v2 신설) — 법정 월 1회 점검을 "출석부" 방식으로 관리.
// 매월 1일 generate_self_checks(ym) 호출로 활성 호기 전체에 줄이 생기고,
// 기사가 완료 처리하면 남은 줄이 곧 누락 후보다. (DESIGN-v2 §7-3)
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapSelfCheck, mapSelfCheckItem } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";
import { shortDate } from "@/lib/utils";
import { locOf, personOf, StatusBadge, AdminTable, Modal, PhotoGrid, inputCls } from "@/app/components/admin/adminShared";
import SELF_CHECK_ITEM_CODES from "@/lib/data/selfCheckItemCodes.json";

const RESULT_LABEL = { A: "양호", B: "주의관찰", C: "긴급수리", E: "없음" };
const RESULT_TONE = { A: "green", B: "amber", C: "red", E: "slate" };
const OVERDUE_DAYS = 10;

// 주소에서 "구/군"만 추출 — 예: "서울특별시 강남구 학동로 120" -> "강남구". region 컬럼은 항상 비어있어 주소로 대신한다.
function guOf(address) {
  const m = (address ?? "").trim().match(/^\S+\s+(\S+?[구군])(\s|$)/);
  return m ? m[1] : null;
}

function daysBetween(dateA, dateB) {
  return Math.round((new Date(dateB) - new Date(dateA)) / 86400000);
}

function GovBadge({ code, msg }) {
  return (
    <span title={msg ?? ""}>
      {code === "000" ? (
        <StatusBadge tone="green">제출완료</StatusBadge>
      ) : code ? (
        <StatusBadge tone="red">실패 {code}</StatusBadge>
      ) : (
        <StatusBadge tone="slate">미제출</StatusBadge>
      )}
    </span>
  );
}

// 자체점검일지 — 이번 달 기록 중 기본값(양호)과 다른 예외 항목 + 특이사항 + 점검사진.
function SelfCheckLogModal({ c, onClose }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.from("self_check_items").select("*").eq("self_check_id", c.id).then(({ data }) => {
      if (alive) setItems((data ?? []).map(mapSelfCheckItem));
    });
    return () => { alive = false; };
  }, [c.id]);

  return (
    <Modal title={`${c.loc} · 자체점검일지`} onClose={onClose} wide="xl">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">점검 결과 (기본값과 다른 예외 항목만 표시 · 나머지는 전부 양호)</p>
          {items == null ? (
            <p className="text-xs text-slate-400">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-400">전 항목 양호(기본값)</p>
          ) : (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {items.map((it) => {
                const meta = SELF_CHECK_ITEM_CODES.find((x) => x.code === it.itemCd);
                return (
                  <div key={it.id} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                    <span className="text-slate-700">{meta ? `${meta.no} ${meta.name}` : it.itemCd}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {it.remark && <span className="text-xs text-slate-400">{it.remark}</span>}
                      <StatusBadge tone={RESULT_TONE[it.result] ?? "slate"}>{RESULT_LABEL[it.result] ?? it.result}</StatusBadge>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {c.notes && (
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">특이사항</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.notes}</p>
          </div>
        )}

        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">점검사진 ({(c.photos ?? []).length}장)</p>
          <PhotoGrid urls={c.photos ?? []} emptyText="등록된 점검사진이 없습니다" />
        </div>
      </div>
    </Modal>
  );
}

// 담당자 한 명의 담당 현장 목록 — 카드 클릭 시 자체점검일지(항목결과·특이사항·사진)를 연다.
// 특이사항이 입력된 호기는 정렬 기준과 무관하게 항상 맨 위 — 확인이 더 급하다.
function EngineerDetailModal({ name, rows, onClose }) {
  const [logRow, setLogRow] = useState(null);
  const [search, setSearch] = useState("");
  const q = search.trim();
  const filtered = rows.filter((r) => !q || r.loc.includes(q) || (r.address ?? "").includes(q));
  const sorted = [...filtered].sort((a, b) => (a.notes ? 0 : 1) - (b.notes ? 0 : 1));
  return (
    <>
      <Modal title={`${name} · 담당 현장 (${rows.length}건)`} onClose={onClose} wide="xl">
        <div className="relative mb-3 max-w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-8`} placeholder="현장명·주소로 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <AdminTable head={["현장 · 호기", "주소", "점검완료일", "공단 제출일자", "공단 제출"]}>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setLogRow(r)}>
              <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">
                {r.loc}
                {r.notes && <span className="ml-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">특이사항</span>}
              </td>
              <td className="px-3 py-2.5 text-slate-500">{r.address ?? "-"}</td>
              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{shortDate(r.doneDate)}</td>
              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.govSubmittedAt ? shortDate(r.govSubmittedAt.slice(0, 10)) : "-"}</td>
              <td className="px-3 py-2.5"><GovBadge code={r.govResultCode} msg={r.govResultMsg} /></td>
            </tr>
          ))}
        </AdminTable>
      </Modal>
      {logRow && <SelfCheckLogModal c={logRow} onClose={() => setLogRow(null)} />}
    </>
  );
}

export default function SelfChecksAdmin({ data, setData }) {
  const { selfChecks } = data;
  const [ym, setYm] = useState(TODAY_STR.slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [engineerKey, setEngineerKey] = useState(null);

  const rows = selfChecks
    .filter((c) => c.ym === ym)
    .map((c) => {
      const u = data.units.find((x) => x.id === c.unitId);
      const s = u ? data.sites.find((x) => x.id === u.siteId) : null;
      return { ...c, loc: locOf(data, c.unitId), address: s?.address ?? null, gu: guOf(s?.address) };
    })
    .sort((a, b) => a.loc.localeCompare(b.loc, "ko"));
  const done = rows.filter((c) => c.status === "완료");

  const groups = new Map();
  for (const r of rows) {
    const key = r.assigneeId ?? "__unassigned";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const summaryRows = [...groups.entries()]
    .map(([key, list]) => ({
      key,
      name: key === "__unassigned" ? "미배정" : personOf(data, key),
      gus: [...new Set(list.map((r) => r.gu).filter(Boolean))],
      total: list.length,
      doneCount: list.filter((r) => r.status === "완료").length,
      overdueCount: list.filter((r) => r.doneDate && r.govSubmittedAt && daysBetween(r.doneDate, r.govSubmittedAt.slice(0, 10)) > OVERDUE_DAYS).length,
      notesCount: list.filter((r) => (r.notes ?? "").trim()).length,
      rows: list,
    }))
    .sort((a, b) => (a.key === "__unassigned" ? 1 : b.key === "__unassigned" ? -1 : a.name.localeCompare(b.name, "ko")));

  async function generate() {
    setBusy(true);
    const { error } = await supabase.rpc("generate_self_checks", { p_ym: ym });
    if (error) { alert("생성 실패: " + error.message); setBusy(false); return; }
    const { data: fresh } = await supabase.from("self_checks").select("*");
    setData((prev) => ({ ...prev, selfChecks: (fresh ?? []).map(mapSelfCheck) }));
    setBusy(false);
  }

  const detail = summaryRows.find((g) => g.key === engineerKey);

  return (
    <div className="max-w-5xl">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-xl font-extrabold">자체점검 현황</h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white" value={ym} onChange={(e) => setYm(e.target.value)} />
          {rows.length === 0 && (
            <button onClick={generate} disabled={busy} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2">
              {busy ? "생성 중..." : `${ym} 출석부 생성`}
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-bold">{ym} 진행률</span>
            <span className="text-slate-500">완료 {done.length} / {rows.length} · 공단 제출 {rows.filter((c) => c.govResultCode === "000").length}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${rows.length ? (done.length / rows.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center text-sm text-slate-400">
          {ym} 출석부가 아직 없습니다 — 위 버튼으로 생성하세요 (활성 호기 전체에 1줄씩)
        </div>
      ) : (
        <AdminTable head={["담당자", "담당 지역", "담당대수", "점검완료", `입력기한초과 (${OVERDUE_DAYS}일)`, "특이사항 입력"]}>
          {summaryRows.map((g) => (
            <tr key={g.key} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setEngineerKey(g.key)}>
              <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{g.name}</td>
              <td className="px-3 py-2.5 text-slate-500">{g.gus.length ? g.gus.join(", ") : "-"}</td>
              <td className="px-3 py-2.5">{g.total}</td>
              <td className="px-3 py-2.5">{g.doneCount}</td>
              <td className="px-3 py-2.5">{g.overdueCount > 0 ? <StatusBadge tone="red">{g.overdueCount}</StatusBadge> : g.overdueCount}</td>
              <td className="px-3 py-2.5">{g.notesCount > 0 ? <StatusBadge tone="amber">{g.notesCount}</StatusBadge> : g.notesCount}</td>
            </tr>
          ))}
        </AdminTable>
      )}
      <p className="text-[10px] text-slate-400 mt-2">
        * 기사용 모바일 점검 화면(사진·특이사항 입력)은 다음 단계. 매월 1일 자동 생성은 pg_cron 설정으로 가능 (supabase/migrations/004 참고).
      </p>

      {detail && <EngineerDetailModal name={detail.name} rows={detail.rows} onClose={() => setEngineerKey(null)} />}
    </div>
  );
}
