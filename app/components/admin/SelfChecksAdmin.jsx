"use client";

// 자체점검 출석부 (v2 신설) — 법정 월 1회 점검을 "출석부" 방식으로 관리.
// 매월 1일 generate_self_checks(ym) 호출로 활성 호기 전체에 줄이 생기고,
// 기사가 완료 처리하면 남은 줄이 곧 누락 후보다. (DESIGN-v2 §7-3)
import { useEffect, useState } from "react";
import { Search, Map as MapIcon } from "lucide-react";
import { supabase, fetchAll } from "@/lib/supabaseClient";
import { mapSelfCheck, mapSelfCheckItem, mapTodo } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";
import { shortDate, addDays } from "@/lib/utils";
import { locOf, personOf, StatusBadge, AdminTable, Modal, PhotoGrid, inputCls } from "@/app/components/admin/adminShared";
import { SiteMapModal } from "@/app/components/admin/SiteMapModal";
import { confirmAsync } from "@/app/components/ConfirmHost";
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
                    <span className="text-slate-700">{meta ? `${meta.no} ${meta.name}${meta.detail ? ` - ${meta.detail}` : ""}` : it.itemCd}</span>
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
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || r.loc.toLowerCase().includes(q) || (r.address ?? "").toLowerCase().includes(q));
  const sorted = [...filtered].sort((a, b) => (a.notes ? 0 : 1) - (b.notes ? 0 : 1));
  return (
    <>
      <Modal title={`${name} · 담당 현장 (${rows.length}건)`} onClose={onClose} wide="xl">
        {/* 검색으로 행 수가 줄어도 팝업 크기가 흔들리지 않도록 높이를 고정한다 */}
        <div className="min-h-[65vh]">
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
        </div>
      </Modal>
      {logRow && <SelfCheckLogModal c={logRow} onClose={() => setLogRow(null)} />}
    </>
  );
}

// 자체점검 지적사항(B/C) — 결과가 B(주의관찰)·C(긴급수리)로 저장된 항목만 모아 보여준다.
// 저장되는 순간 자동으로 본인 할일이 되게 하면 "내 할일이 느니까 애매하면 A로 넘기자"는
// 유인이 생겨서, 관리자가 여기서 확인하고 "할일로 발행"해야 담당기사에게 할일이 간다.
function FlaggedItemsView({ data, setData }) {
  const [publishing, setPublishing] = useState(null);
  const [onlyOpen, setOnlyOpen] = useState(true);

  const rows = data.selfCheckItems
    .map((it) => {
      const check = data.selfChecks.find((c) => c.id === it.selfCheckId);
      if (!check) return null;
      const unit = data.units.find((u) => u.id === check.unitId);
      const site = unit ? data.sites.find((s) => s.id === unit.siteId) : null;
      const meta = SELF_CHECK_ITEM_CODES.find((x) => x.code === it.itemCd);
      const todo = data.todos.find((t) => t.selfCheckItemId === it.id);
      return {
        ...it,
        ym: check.ym,
        unitId: check.unitId,
        siteId: site?.id ?? null,
        assignedEngineer: site?.assignedEngineer ?? null,
        itemName: meta ? `${meta.no} ${meta.name}${meta.detail ? ` - ${meta.detail}` : ""}` : it.itemCd,
        todo,
      };
    })
    .filter(Boolean)
    .filter((r) => !onlyOpen || !r.todo)
    .sort((a, b) => (a.result === b.result ? (b.ym ?? "").localeCompare(a.ym ?? "") : a.result === "C" ? -1 : 1));

  async function publish(row) {
    if (!(await confirmAsync(`${locOf(data, row.unitId)} · ${row.itemName} — 할일로 발행할까요?\n담당기사: ${row.assignedEngineer ?? "미배정"}`))) return;
    setPublishing(row.id);
    const engineer = row.assignedEngineer ? data.profiles.find((p) => p.name === row.assignedEngineer) : null;
    const gradeLabel = RESULT_LABEL[row.result] ?? row.result;
    const patch = {
      id: `todo-selfcheck-${row.id}`,
      source: "selfcheck",
      self_check_item_id: row.id,
      title: `${locOf(data, row.unitId)} 자체점검 지적사항 — ${row.itemName} (${gradeLabel})`,
      site_name: data.sites.find((s) => s.id === row.siteId)?.name ?? null,
      elevator_no: data.units.find((u) => u.id === row.unitId)?.unitNo ?? null,
      unit_id: row.unitId,
      part: "자체점검 지적사항",
      assignee: row.assignedEngineer,
      assignee_id: engineer?.id ?? null,
      assigned_date: TODAY_STR,
      due_date: addDays(TODAY_STR, row.result === "C" ? 7 : 14),
      done: false,
      description: row.remark || "특이사항 입력 없음",
    };
    const { data: inserted, error } = await supabase.from("todos").insert(patch).select().single();
    setPublishing(null);
    if (error) { alert("발행 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, todos: [mapTodo(inserted), ...prev.todos] }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">B(주의관찰)·C(긴급수리)로 표시된 항목 — 확인 후 할일로 발행하면 담당기사에게 갑니다.</p>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 shrink-0">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          미발행만 보기
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center text-sm text-slate-400">
          {onlyOpen ? "미발행 지적사항이 없습니다" : "지적사항이 없습니다"}
        </div>
      ) : (
        <AdminTable head={["현장 · 호기", "점검월", "항목", "등급", "특이사항", ""]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{locOf(data, r.unitId)}</td>
              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.ym}</td>
              <td className="px-3 py-2.5 max-w-xs">{r.itemName}</td>
              <td className="px-3 py-2.5"><StatusBadge tone={RESULT_TONE[r.result] ?? "slate"}>{RESULT_LABEL[r.result] ?? r.result}</StatusBadge></td>
              <td className="px-3 py-2.5 text-slate-600 max-w-xs">{r.remark || "-"}</td>
              <td className="px-3 py-2.5 text-right pr-4 whitespace-nowrap">
                {r.todo ? (
                  <StatusBadge tone="green">발행됨</StatusBadge>
                ) : (
                  <button
                    disabled={publishing === r.id}
                    onClick={() => publish(r)}
                    className="text-xs font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-lg px-3 py-1.5"
                  >
                    {publishing === r.id ? "발행 중..." : "할일로 발행"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

export default function SelfChecksAdmin({ data, setData }) {
  const { selfChecks } = data;
  const [view, setView] = useState("progress"); // "progress" | "flags"
  const [ym, setYm] = useState(TODAY_STR.slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [engineerKey, setEngineerKey] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);

  const rows = selfChecks
    .filter((c) => c.ym === ym)
    .map((c) => {
      const u = data.units.find((x) => x.id === c.unitId);
      const s = u ? data.sites.find((x) => x.id === u.siteId) : null;
      // 담당자는 출석부 생성 시점 스냅샷(c.assigneeId)이 아니라 현장정보에 지금 배정된 담당
      // 기사를 실시간으로 따른다 — 점검완료 여부(status·doneDate 등)는 그대로 c에서 유지된다.
      const currentAssignee = s?.assignedEngineer ? data.profiles.find((p) => p.name === s.assignedEngineer) : null;
      return { ...c, assigneeId: currentAssignee?.id ?? null, loc: locOf(data, c.unitId), address: s?.address ?? null, gu: guOf(s?.address) };
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
    const { data: fresh } = await fetchAll("self_checks");
    setData((prev) => ({ ...prev, selfChecks: (fresh ?? []).map(mapSelfCheck) }));
    setBusy(false);
  }

  const detail = summaryRows.find((g) => g.key === engineerKey);
  const openFlagCount = data.selfCheckItems.filter((it) => !data.todos.some((t) => t.selfCheckItemId === it.id)).length;

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-xl font-extrabold">자체점검 현황</h1>
          <div className="flex items-center gap-1 mt-2">
            {[{ k: "progress", label: "월별현황" }, { k: "flags", label: "지적사항(B/C)" }].map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border ${view === t.k ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-200"}`}
              >
                {t.label}
                {t.k === "flags" && openFlagCount > 0 && (
                  <span className={`ml-1.5 ${view === t.k ? "text-blue-100" : "text-red-500"}`}>{openFlagCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        {view === "progress" && (
          <div className="flex items-center gap-2">
            <button onClick={() => setMapOpen(true)} className="flex items-center gap-1.5 text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2">
              <MapIcon size={15} /> 지도보기
            </button>
            <input type="month" className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white" value={ym} onChange={(e) => setYm(e.target.value)} />
            {rows.length === 0 && (
              <button onClick={generate} disabled={busy} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2">
                {busy ? "생성 중..." : `${ym} 출석부 생성`}
              </button>
            )}
          </div>
        )}
      </div>

      {view === "flags" ? (
        <FlaggedItemsView data={data} setData={setData} />
      ) : (
        <>
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
        </>
      )}

      {detail && <EngineerDetailModal name={detail.name} rows={detail.rows} onClose={() => setEngineerKey(null)} />}
      {mapOpen && <SiteMapModal sites={data.sites} units={data.units} onClose={() => setMapOpen(false)} />}
    </div>
  );
}
