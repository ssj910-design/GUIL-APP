# 담당 기사 복수지정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 현장에 담당 기사를 2명 이상 지정할 수 있게 하고, 앱 전체(기사앱·관리자웹) 40여 곳이 이를 올바르게 반영하도록 한다.

**Architecture:** `site_assignments`(이미 있는 N:M 테이블, 이미 760건 백필됨)를 로딩 시 읽어 `assignedEngineers`(배열)로 병합하고, 레거시 `assignedEngineer`(단수)는 `assignedEngineers[0]`에서 파생시켜 두 값이 구조적으로 어긋나지 않게 한다. "소속 판정"(내 현장 필터)과 "알림 팬아웃"만 실제 로직을 배열 기반으로 바꾸고, 나머지 표시용 호출부는 파생 방식 덕분에 대부분 무변경.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase(JS client), Tailwind v4. 테스트 프레임워크 없음 — 검증은 `npm run build`(타입/문법 체크) + 순수 함수는 `node -e` 인라인 체크 + 브라우저 수동 확인.

## Global Constraints

- Supabase는 실운영 DB(RLS 꺼짐) — 삭제·수정 테스트 금지, 읽기 전용 확인만.
- `main` 푸시 전 `npm run build` 통과 필수.
- 각 Task는 완료 후 작게 커밋 + push (배포는 `[deploy]` 없이 — 사용자가 명시적으로 요청할 때만 배포).
- DB 스키마 변경 없음 — `site_assignments`가 이미 `sites.assigned_engineer`와 1:1로 백필돼 있음(760=759, 2026-08-14 확인).
- 원본 스펙: [docs/superpowers/specs/2026-08-14-multi-engineer-design.md](../specs/2026-08-14-multi-engineer-design.md)

## 구현 완료 후 남은 후속 작업 (2026-08-14, 최종 브랜치 리뷰에서 발견 — 병합 차단 아님)

최종 전체 브랜치 리뷰(모든 Task + 리뷰에서 나온 Critical 2건·Important 4건 수정 완료 후 재검토)에서
의도적으로 남겨둔 것 2건:

1. **`app/api/cron/check-selfcheck/route.js`가 여전히 리드 기사에게만 알림을 보냄.** 다른 cron
   (`check-inspections`)은 `site_assignments`를 직접 조회해 전원에게 팬아웃하도록 고쳤지만, 이
   cron은 `self_checks.assignee_id`(레코드 생성 시점 스냅샷 컬럼)를 기준으로 삼고 있어 같은
   방식으로 기계적으로 못 고친다 — `SelfChecksAdmin.jsx`가 이미 이 스냅샷을 안 믿고
   `site_assignments`를 실시간으로 따르도록 바뀐 것과 방향이 갈린다. 스냅샷을 계속 쓸지,
   `site_assignments` 실시간 조회로 바꿀지 설계 결정이 필요 — 별도 논의 후 처리.
2. **관리자 쪽 할일완료 토글 2곳이 자체점검 형제 할일을 정리하지 않음.** `TodoTab.jsx`의
   기사용 체크박스(`toggleManualTodo`)는 이번에 고쳤지만, `ElevatorFieldApp.jsx`의
   `handleAdminToggleTodo`와 `TodosAdmin.jsx`(PC 관리자 콘솔 할일관리)의 `toggle`은 여전히
   `.eq("id", t.id)`로 그 할일 하나만 완료 처리한다 — 관리자가 자체점검 지적사항 할일을
   직접 완료 처리하면 동료 기사의 형제 할일이 계속 미완료로 남는다. 세 곳(기사앱 체크박스·
   관리자 토글·PC 콘솔 토글)이 각자 `idsToComplete` 필터를 복붙하고 있는 셈이라, 고칠 때는
   공용 헬퍼로 묶는 걸 권장.

---

## Task 1: 데이터 계층 — `site_assignments` 로딩 + `assignedEngineers` 파생

**Files:**
- Modify: `lib/mappers.js` (새 함수 추가, `mapSite` 근처)
- Modify: `app/components/ElevatorFieldApp.jsx:729-764` (로딩 Promise.all + setSites)

**Interfaces:**
- Produces: `mergeAssignedEngineers(sites, siteAssignments, profiles)` — `lib/mappers.js`에서 export. `sites`는 이미 `mapSite()`로 매핑된 배열, `siteAssignments`는 raw row 배열(`{site_id, tech_id, is_lead}`), `profiles`는 raw row 배열(`{id, name}`). 반환값: `sites`와 같은 배열이되 각 원소에 `assignedEngineers: string[]`(대표가 0번째)와 `assignedEngineer`(= `assignedEngineers[0] ?? null`, 기존 `s.assignedEngineer` 덮어씀)가 채워짐.
- 이후 모든 Task는 매핑된 site 객체가 `assignedEngineers`(배열)를 갖고 있다고 가정한다.

- [ ] **Step 1: `lib/mappers.js`에 병합 함수 추가**

`lib/mappers.js`의 `mapSite` 함수 바로 뒤에 추가:

```js
// site_assignments(N:M)를 조인해 sites 배열에 assignedEngineers(배열)를 채워 넣는다.
// assignedEngineer(단수, 레거시)는 이 배열의 0번째(대표)로 덮어써 — sites.assigned_engineer
// 컬럼과 site_assignments가 어긋나도 앱은 항상 site_assignments를 유일한 진실로 본다.
export function mergeAssignedEngineers(mappedSites, siteAssignmentRows, profileRows) {
  const nameById = new Map(profileRows.map((p) => [p.id, p.name]));
  const bySite = new Map();
  for (const a of siteAssignmentRows) {
    const name = nameById.get(a.tech_id);
    if (!name) continue;
    if (!bySite.has(a.site_id)) bySite.set(a.site_id, []);
    bySite.get(a.site_id).push({ name, isLead: !!a.is_lead });
  }
  for (const arr of bySite.values()) arr.sort((x, y) => Number(y.isLead) - Number(x.isLead));

  return mappedSites.map((s) => {
    const names = (bySite.get(s.id) ?? []).map((x) => x.name);
    return { ...s, assignedEngineers: names, assignedEngineer: names[0] ?? null };
  });
}
```

- [ ] **Step 2: 인라인으로 함수 동작 확인**

`lib/mappers.js`는 `export function`(ESM) 문법이고 `package.json`엔 `"type": "module"`이 없어(CommonJS가 기본) 그냥 `node -e "require(...)"`는 `SyntaxError: Unexpected token 'export'`로 실패한다. `--input-type=module`로 강제 실행:

```bash
node --input-type=module -e "
import { mergeAssignedEngineers } from './lib/mappers.js';
const sites = [{ id: 's1', assignedEngineer: null }, { id: 's2', assignedEngineer: null }];
const assignments = [
  { site_id: 's1', tech_id: 'a', is_lead: false },
  { site_id: 's1', tech_id: 'b', is_lead: true },
];
const profiles = [{ id: 'a', name: '기사A' }, { id: 'b', name: '기사B' }];
const out = mergeAssignedEngineers(sites, assignments, profiles);
console.log(JSON.stringify(out));
"
```
Expected: `s1`은 `assignedEngineers: ["기사B","기사A"]`(대표 먼저), `assignedEngineer: "기사B"`. `s2`는 `assignedEngineers: []`, `assignedEngineer: null`.

- [ ] **Step 3: `ElevatorFieldApp.jsx` 로딩에 `site_assignments` 추가**

`app/components/ElevatorFieldApp.jsx:718-738`의 구조분해 목록 맨 끝(`unitPartPhotosRes,` 다음)에 한 줄 추가:

```js
        unitPartPhotosRes,
        siteAssignmentsRes,
      ] = await Promise.all([
```

그리고 `:762`(`supabase.from("unit_part_photos").select("*"), // 테이블 없으면...` 다음), `]);` 직전에 한 줄 추가:

```js
        supabase.from("unit_part_photos").select("*"), // 테이블 없으면(마이그레이션 전) error → 빈 배열
        supabase.from("site_assignments").select("*"),
      ]);
```

- [ ] **Step 4: `setSites` 호출에 병합 적용**

`app/components/ElevatorFieldApp.jsx:764`:

```js
      setSites((sitesRes.data ?? []).map(mapSite));
```

를 아래로 교체:

```js
      setSites(mergeAssignedEngineers((sitesRes.data ?? []).map(mapSite), siteAssignmentsRes.data ?? [], engineersRes.data ?? []));
```

**주의 — 변수명 함정**: "profiles" 테이블 조회 결과는 `profilesRes`가 아니라 **`engineersRes`**로 구조분해돼 있다(`:729`, `supabase.from("profiles").select("*").order("name")`에 대응). `profilesRes`라는 변수는 이 파일에 없으니 그 이름을 쓰면 `ReferenceError`가 난다.

파일 상단 import 목록(`import { mapSite, mapSiteManager, ... } from "@/lib/mappers"`)에 `mergeAssignedEngineers` 추가.

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 6: 브라우저로 확인**

`npm run dev` → `localhost:3000/?as=admin` → 아무 현장이나 열어서 기존처럼 "담당 기사" 이름이 그대로 보이는지 확인(이번 Task는 파생만 추가했으므로 화면상 변화는 없어야 정상).

- [ ] **Step 7: 커밋**

```bash
git add lib/mappers.js app/components/ElevatorFieldApp.jsx
git commit -m "feat: site_assignments를 로딩해 assignedEngineers 배열 파생 추가"
git push
```

---

## Task 2: `SitesAdmin.jsx` — 담당 기사 단일선택 → 다중선택

**Files:**
- Modify: `app/components/admin/SitesAdmin.jsx` (`AddSiteModal`, `select()`, `addSite()`, `saveSiteInfo()`, `changeLead()`→`changeAssignees()`, 목록 배지, 상세 표시, 편집 select)

**Interfaces:**
- Consumes: Task 1의 `assignedEngineers`(배열).
- Produces: 이후 Task 4에서 재사용할 `syncInspectionTodoAssignee` 호출 방식(기존 그대로, 대표 이름만 넘김 — 변경 없음).

- [ ] **Step 1: `AddSiteModal` 폼을 다중선택으로**

`app/components/admin/SitesAdmin.jsx:64-95` 교체:

```js
function AddSiteModal({ engineers, onClose, onSave }) {
  const [form, setForm] = useState({
    name: "", address: "", contractType: CONTRACT_TYPES[0], maintenanceCost: "",
    contractDate: "", contractEnd: "", assignedEngineers: [], leadEngineer: "",
    phone: "", fax: "", email: "", accessInfo: "", notes: "",
  });
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  function toggleEngineer(name) {
    setForm((f) => {
      const has = f.assignedEngineers.includes(name);
      const nextList = has ? f.assignedEngineers.filter((n) => n !== name) : [...f.assignedEngineers, name];
      const nextLead = has && f.leadEngineer === name ? (nextList[0] ?? "") : (f.leadEngineer || name);
      return { ...f, assignedEngineers: nextList, leadEngineer: nextLead };
    });
  }
  return (
    <Modal title="새 현장 추가" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><p className="text-xs font-bold text-slate-500 mb-1">현장명</p>
            <input className={inputCls} placeholder="예: ○○빌딩" value={form.name} onChange={(e) => set("name")(e.target.value)} autoFocus /></div>
          <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">주소</p>
            <input className={inputCls} placeholder="예: 서울특별시 강남구 테헤란로 123" value={form.address} onChange={(e) => set("address")(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><p className="text-xs font-bold text-slate-500 mb-1">계약구분</p>
            <select className={inputCls} value={form.contractType} onChange={(e) => set("contractType")(e.target.value)}>
              {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">보수료(VAT별도)</p>
            <input className={inputCls} type="number" placeholder="원" value={form.maintenanceCost} onChange={(e) => set("maintenanceCost")(e.target.value)} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">계약일자</p>
            <DateTextInput value={form.contractDate} onChange={set("contractDate")} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">계약종료일</p>
            <DateTextInput value={form.contractEnd} onChange={set("contractEnd")} /></div>
          <div className="md:col-span-1">
            <p className="text-xs font-bold text-slate-500 mb-1">담당 기사 (체크, ★ = 대표)</p>
            <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-1.5 space-y-0.5">
              {engineers.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-xs px-1 py-0.5">
                  <input type="checkbox" checked={form.assignedEngineers.includes(p.name)} onChange={() => toggleEngineer(p.name)} />
                  <span className="flex-1">{p.name}</span>
                  {form.assignedEngineers.includes(p.name) && (
                    <button type="button" onClick={() => set("leadEngineer")(p.name)}
                      className={form.leadEngineer === p.name ? "text-amber-500" : "text-slate-300"}>★</button>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><p className="text-xs font-bold text-slate-500 mb-1">전화번호</p>
            <input className={inputCls} placeholder="관리사무소 대표번호" value={form.phone} onChange={(e) => set("phone")(formatPhone(e.target.value))} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">팩스</p>
            <input className={inputCls} value={form.fax} onChange={(e) => set("fax")(formatPhone(e.target.value))} /></div>
          <div><p className="text-xs font-bold text-slate-500 mb-1">이메일</p>
            <input className={inputCls} value={form.email} onChange={(e) => set("email")(e.target.value)} /></div>
        </div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">출입 정보(비번·열쇠)</p>
          <textarea className={inputCls + " resize-y"} rows={2} value={form.accessInfo} onChange={(e) => set("accessInfo")(e.target.value)} /></div>
        <div><p className="text-xs font-bold text-slate-500 mb-1">비고(현장직 참고사항)</p>
          <input className={inputCls} value={form.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
        <p className="text-[11px] text-slate-400">호기(승강기 정보)는 등록 후 상세화면에서 추가하면 됩니다.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">취소</button>
          <button
            disabled={!form.name.trim()}
            onClick={() => onSave(form)}
            className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
          >
            추가
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: `select()`의 `siteForm` 초기값 수정**

`app/components/admin/SitesAdmin.jsx:578-583`:

```js
    setSiteForm({
      name: s.name, address: s.address ?? "",
      notes: s.notes ?? "", officeNotes: s.officeNotes ?? "",
      assignedEngineers: s.assignedEngineers ?? [], leadEngineer: s.assignedEngineer ?? "",
      phone: s.phone ?? "", fax: s.fax ?? "", email: s.email ?? "", accessInfo: s.accessInfo ?? "",
      contractDate: s.contractDate ?? "", contractEnd: s.contractEnd ?? "",
    });
```

- [ ] **Step 3: `addSite()` — 다건 insert로 확장**

`app/components/admin/SitesAdmin.jsx:598-602`:

```js
    if (error) { alert("현장 추가 실패: " + error.message); return; }
    if (form.assignedEngineers.length) {
      const rows = form.assignedEngineers
        .map((name) => engineers.find((x) => x.name === name))
        .filter(Boolean)
        .map((p) => ({ site_id: id, tech_id: p.id, is_lead: p.name === form.leadEngineer }));
      if (rows.length) await supabase.from("site_assignments").insert(rows);
    }
```

같은 함수 위쪽 insert에서 `assigned_engineer: form.assignedEngineer || null`(597번째 줄)을 `assigned_engineer: form.leadEngineer || null`로 변경.

- [ ] **Step 4: `changeLead` → `changeAssignees`로 교체**

`app/components/admin/SitesAdmin.jsx:821-828` 전체 교체:

```js
  // 담당 기사 배열 전체를 다시 쓴다 — site_assignments를 지우고 배열 수만큼 재삽입.
  // is_lead는 leadName과 일치하는 것만 true. sites.assigned_engineer(레거시)는 대표 이름으로 듀얼라이트.
  async function changeAssignees(names, leadName) {
    await supabase.from("site_assignments").delete().eq("site_id", selectedId);
    const rows = names
      .map((name) => profiles.find((x) => x.name === name))
      .filter(Boolean)
      .map((p) => ({ site_id: selectedId, tech_id: p.id, is_lead: p.name === leadName }));
    if (rows.length) await supabase.from("site_assignments").insert(rows);
    await supabase.from("sites").update({ assigned_engineer: leadName || null }).eq("id", selectedId); // 듀얼라이트
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, assignedEngineers: names, assignedEngineer: leadName || null } : s)),
    }));
    await syncInspectionTodoAssignee([selectedId], leadName);
  }
```

- [ ] **Step 5: `saveSiteInfo()`에서 새 함수 호출하도록 수정**

`app/components/admin/SitesAdmin.jsx:792-807`:

```js
  async function saveSiteInfo() {
    const namesChanged = JSON.stringify([...siteForm.assignedEngineers].sort()) !== JSON.stringify([...(site.assignedEngineers ?? [])].sort());
    const leadChanged = siteForm.leadEngineer !== (site.assignedEngineer ?? "");
    if (namesChanged || leadChanged) {
      await changeAssignees(siteForm.assignedEngineers, siteForm.leadEngineer);
    }
    await supabase.from("sites").update({
      name: siteForm.name, address: siteForm.address, notes: siteForm.notes || null,
      phone: siteForm.phone || null, fax: siteForm.fax || null, email: siteForm.email || null,
      access_info: siteForm.accessInfo || null,
      ...(contractDateReady ? { contract_date: siteForm.contractDate || null } : {}),
      contract_end: siteForm.contractEnd || null,
      ...(officeNotesReady ? { office_notes: siteForm.officeNotes || null } : {}),
    }).eq("id", selectedId);
    setData((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === selectedId ? { ...s, ...siteForm, assignedEngineers: siteForm.assignedEngineers, assignedEngineer: siteForm.leadEngineer } : s)),
    }));
    setEditingInfo(false);
  }
```

- [ ] **Step 6: 목록 배지 — "대표 + 외 N명"**

`app/components/admin/SitesAdmin.jsx:1042-1043`:

```js
                        {s.assignedEngineer
                          ? <span className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">{s.assignedEngineer}{s.assignedEngineers?.length > 1 ? ` 외 ${s.assignedEngineers.length - 1}명` : ""}</span>
                          : <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">미배정</span>}
```

- [ ] **Step 7: 상세 표시 — 전체 이름**

`app/components/admin/SitesAdmin.jsx:1136`:

```js
                        <div><p className="text-xs font-bold text-slate-400 mb-1">담당 기사</p><p className="font-semibold text-slate-800">{s.assignedEngineers?.length ? s.assignedEngineers.join(", ") : "미배정"}</p></div>
```

(이 블록의 변수명이 `site`인지 `s`인지 실제 파일에서 확인 후 맞출 것 — 1136번째 줄 주변은 `site` 사용 중이었음: `site.assignedEngineers`로.)

- [ ] **Step 8: 편집 폼 — 체크박스로 교체**

`app/components/admin/SitesAdmin.jsx:1226-1230` 교체:

```js
                      <div className="md:col-span-1">
                        <p className="text-xs font-bold text-slate-500 mb-1">담당 기사 (체크, ★ = 대표)</p>
                        <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-1.5 space-y-0.5">
                          {engineers.map((p) => {
                            const checked = siteForm.assignedEngineers.includes(p.name);
                            return (
                              <label key={p.id} className="flex items-center gap-1.5 text-xs px-1 py-0.5">
                                <input type="checkbox" checked={checked} onChange={() => {
                                  const nextList = checked
                                    ? siteForm.assignedEngineers.filter((n) => n !== p.name)
                                    : [...siteForm.assignedEngineers, p.name];
                                  const nextLead = checked && siteForm.leadEngineer === p.name
                                    ? (nextList[0] ?? "")
                                    : (siteForm.leadEngineer || p.name);
                                  setSiteForm({ ...siteForm, assignedEngineers: nextList, leadEngineer: nextLead });
                                }} />
                                <span className="flex-1">{p.name}</span>
                                {checked && (
                                  <button type="button" onClick={() => setSiteForm({ ...siteForm, leadEngineer: p.name })}
                                    className={siteForm.leadEngineer === p.name ? "text-amber-500" : "text-slate-300"}>★</button>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
```

- [ ] **Step 9: 미배정 필터 두 곳 — 배열 기준으로**

`app/components/admin/SitesAdmin.jsx:553`과 `:975`:

```js
    .filter((s) => !onlyUnassigned || !s.assignedEngineers?.length)
```
```js
                미배정만 ({sites.filter((x) => !x.assignedEngineers?.length).length})
```

- [ ] **Step 10: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 11: 브라우저로 확인**

`npm run dev` → `/?as=admin` → 현장관리 → 아무 현장 편집 → 기사 2명 체크(그중 1명 ★로 대표 지정) → 저장 → 목록에서 "대표이름 외 1명" 배지 확인 → 상세에서 두 이름 다 보이는지 확인.

- [ ] **Step 12: 커밋**

```bash
git add app/components/admin/SitesAdmin.jsx
git commit -m "feat: SitesAdmin 담당 기사 다중선택 UI로 전환"
git push
```

---

## Task 3: 기사앱 "내 현장" 필터 4곳 — 소속 판정을 배열 기준으로

**Files:**
- Modify: `app/components/tabs/CheckupTab.jsx:126,132`
- Modify: `app/components/tabs/HomeTab.jsx:611`
- Modify: `app/components/tabs/InspectionTab.jsx:95`
- Modify: `app/components/tabs/SiteTab.jsx:619`

**Interfaces:**
- Consumes: Task 1의 `s.assignedEngineers`(배열).

- [ ] **Step 1: `CheckupTab.jsx`**

`app/components/tabs/CheckupTab.jsx:126`:
```js
  const scopedSites = activeSites(sites).filter((s) => showAll || s.assignedEngineers?.includes(CURRENT_ENGINEER));
```
`app/components/tabs/CheckupTab.jsx:132`:
```js
  const myUnitIds = new Set(units.filter((u) => sites.some((s) => s.id === u.siteId && s.assignedEngineers?.includes(CURRENT_ENGINEER))).map((u) => u.id));
```

- [ ] **Step 2: `HomeTab.jsx`**

`app/components/tabs/HomeTab.jsx:611`:
```js
  const mySites = activeSites(role === "admin" ? sites : sites.filter((s) => s.assignedEngineers?.includes(CURRENT_ENGINEER)));
```

- [ ] **Step 3: `InspectionTab.jsx`**

`app/components/tabs/InspectionTab.jsx:95`:
```js
  const mySites = activeSites(role === "admin" ? sites : sites.filter((s) => s.assignedEngineers?.includes(CURRENT_ENGINEER)));
```

- [ ] **Step 4: `SiteTab.jsx`**

`app/components/tabs/SiteTab.jsx:619`:
```js
    .filter((s) => !onlyMine || s.assignedEngineers?.includes(CURRENT_ENGINEER));
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 6: 브라우저로 확인**

Task 2에서 2명 배정한 현장으로, 그 두 기사 각각 `/?as=engineer&name=<기사이름>`으로 접속해서 홈/현장관리/정기점검/검사관리 각 탭에 그 현장이 "내 현장"으로 뜨는지 확인(양쪽 다 떠야 함).

- [ ] **Step 7: 커밋**

```bash
git add app/components/tabs/CheckupTab.jsx app/components/tabs/HomeTab.jsx app/components/tabs/InspectionTab.jsx app/components/tabs/SiteTab.jsx
git commit -m "feat: 기사앱 내 현장 필터 4곳을 다중 담당기사 기준으로 변경"
git push
```

---

## Task 4: 관리자/기타 소속 판정 — `EngineersAdmin`·`VerifyImport`·알림벨

**Files:**
- Modify: `app/components/admin/EngineersAdmin.jsx:347`
- Modify: `app/components/admin/VerifyImport.jsx:740`
- Modify: `app/components/ElevatorFieldApp.jsx:2052-2056`

**Interfaces:**
- Consumes: Task 1의 `s.assignedEngineers`(배열).

- [ ] **Step 1: `EngineersAdmin.jsx` 담당대수 카운트**

`app/components/admin/EngineersAdmin.jsx:347`:
```js
    return units.filter((u) => u.isActive !== false && sites.some((s) => s.id === u.siteId && s.assignedEngineers?.includes(p.name))).length;
```

- [ ] **Step 2: `VerifyImport.jsx` 이미 배정된 현장 스킵 조건**

`app/components/admin/VerifyImport.jsx:740`:
```js
      if (!site || site.assignedEngineers?.length || out.has(siteId)) continue; // 이미 배정됐으면 건너뜀
```

- [ ] **Step 3: `ElevatorFieldApp.jsx` 알림벨 필터 — 배열 기준 Map으로**

`app/components/ElevatorFieldApp.jsx:2052-2056`:

```js
  const siteAssigneesById = new Map(sites.map((s) => [s.id, s.assignedEngineers ?? []]));
  const notifCompletedFailures = failures.filter((f) => {
    if (f.status !== "완료" || !f.assignee || f.assignee === myName) return false;
    if (!(siteAssigneesById.get(f.siteId) ?? []).includes(myName)) return false;
    return !dismissedIds.has("faildone:" + f.id);
  });
```

(변수명이 `siteAssigneeById` → `siteAssigneesById`로 바뀌므로, 이 파일 안에 다른 사용처가 없는지 확인 — Task 4 범위에서 다른 참조 없음, grep으로 재확인할 것: `grep -n siteAssigneeById app/components/ElevatorFieldApp.jsx`가 이 블록 하나만 나와야 함.)

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 5: 브라우저로 확인**

관리자 콘솔 → 직원관리 → Task 2에서 2명 배정한 현장의 두 기사 카드에서 "담당대수"가 둘 다 그 현장의 호기 수를 포함해서 세는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add app/components/admin/EngineersAdmin.jsx app/components/admin/VerifyImport.jsx app/components/ElevatorFieldApp.jsx
git commit -m "feat: EngineersAdmin·VerifyImport·알림벨 소속판정을 다중 담당기사 기준으로 변경"
git push
```

---

## Task 5: 알림 팬아웃 — 고장 알림을 담당 기사 전원에게

**Files:**
- Modify: `app/components/ElevatorFieldApp.jsx:386-389` (`siteEngineerId` → `siteEngineerIds`)
- Modify: `app/components/ElevatorFieldApp.jsx:925-948` (`handleFailureReported`)
- Modify: `app/components/ElevatorFieldApp.jsx:1147-1153` (처리완료 알림)

**Interfaces:**
- Consumes: Task 1의 `s.assignedEngineers`(배열), `lib/utils.js`의 기존 `profileIdByName`.
- Produces: `siteEngineerIds(siteId)` — 배열 반환(빈 배열 가능). 이후 다른 Task가 `siteEngineerId`(단수)를 참조하지 않도록 grep으로 확인.

- [ ] **Step 1: `siteEngineerId` → `siteEngineerIds`**

`app/components/ElevatorFieldApp.jsx:386-389`:

```js
  // 그 현장의 상시 담당기사 전원의 profile id — 미배정 상태에서도 늘 알아야 하는 사람들이라 failure.assignee와 별개로 구한다.
  const siteEngineerIds = (siteId) => {
    const site = sites.find((s) => s.id === siteId);
    return (site?.assignedEngineers ?? []).map((name) => profileIdByName(profilesAll, name)).filter(Boolean);
  };
```

- [ ] **Step 2: `handleFailureReported` 팬아웃**

`app/components/ElevatorFieldApp.jsx:925-948`:

```js
  function handleFailureReported(created) {
    const first = created[0];
    if (!first) return;
    const where = `${first.siteName} · ${created.map((f) => formatUnitLabel(f.elevatorNo)).filter(Boolean).join(", ") || "호기 미상"}`;
    const what = parseErrorCode(first.errorCode).faultType;
    const more = created.length > 1 ? ` 외 ${created.length - 1}건` : "";
    const engIds = siteEngineerIds(first.siteId);

    sendPush("failure_reported", [...new Set([...seniorAdminIds(), ...engIds])], {
      title: `고장 접수 — ${what}`,
      body: `${where}${more}`,
      url: `/?openFailure=${first.id}`,
    });
    if (created.some((f) => f.escalation)) {
      sendPush("failure_escalated", adminIds(), { title: "중대 고장 접수", body: `${where} — ${what}`, url: `/?openFailure=${first.id}` });
    }
    if (!first.assignee) {
      // 해당현장 담당기사(전원)는 위 failure_reported로 이미 알림을 받았으니 여기서 또 안 보낸다.
      sendPush("failure_unassigned", engineerIds().filter((id) => !engIds.includes(id)), {
        title: "미배정 고장 — 먼저 잡는 사람이 담당",
        body: `${where} — ${what}`,
        url: `/?openFailure=${first.id}`,
      });
    }
```

(이 블록 이후 950번째 줄부터 이어지는 집중관리현장 판정 코드는 변경하지 않음 — 그대로 둠.)

- [ ] **Step 3: 처리완료 알림 팬아웃**

`app/components/ElevatorFieldApp.jsx:1147-1153`:

```js
    if (isClosed) {
      // 처리완료·오신고 — 최고+중간관리자와 그 현장 담당기사 전원에게. 담당기사가 직접 처리한
      // 본인 건이어도 "확인용"으로 그대로 보낸다(누가 처리했든 알아야 하는 관리 성격의 알림).
      sendPush("failure_completed", [...new Set([...seniorAdminIds(), ...siteEngineerIds(failure.siteId)])], {
        title: `고장 처리완료 — ${result}`,
        body: `${failure.siteName}${unit ? ` ${unit}` : ""}`,
        url: `/?openFailure=${failure.id}`,
      });
    }
```

- [ ] **Step 4: 다른 사용처 없는지 확인**

Run:
```bash
grep -n "siteEngineerId\b" app/components/ElevatorFieldApp.jsx
```
Expected: 위에서 고친 3곳 외에 `siteEngineerId(`(단수) 호출이 더 없어야 함. 있으면 같은 방식(`engIds` 배열 스프레드)으로 고칠 것.

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 6: 브라우저로 확인**

Task 2에서 2명 배정한 현장에서 기사앱으로 고장 접수 → 관리자 콘솔 또는 두 기사 계정 각각 접속해 알림(푸시는 로컬에서 확인 어려우면 서버 로그나 `/api/push/send` 호출 페이로드로 대체 확인)이 두 기사 id 모두 포함하는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add app/components/ElevatorFieldApp.jsx
git commit -m "feat: 고장 알림 팬아웃을 담당기사 전원에게 보내도록 변경"
git push
```

---

## Task 6: `SelfChecksAdmin.jsx` — 총대수 이중계산 방지

**Files:**
- Modify: `app/components/admin/SelfChecksAdmin.jsx:245-278`

**Interfaces:**
- Consumes: Task 1의 `s.assignedEngineers`(배열), `lib/utils.js`의 `profileIdByName`.
- Produces: `rows`(총대수 근거, unit×월 1줄 유지), `groups`(기사별 집계, 여러 그룹에 같은 row 포함 가능).

- [ ] **Step 1: `rows`/`groups` 구성 교체**

`app/components/admin/SelfChecksAdmin.jsx:245-278` 교체:

```js
  const rows = selfChecks
    .filter((c) => c.ym === ym)
    .map((c) => {
      const u = data.units.find((x) => x.id === c.unitId);
      const s = u ? data.sites.find((x) => x.id === u.siteId) : null;
      // 담당자는 출석부 생성 시점 스냅샷(c.assigneeId)이 아니라 현장정보에 지금 배정된 담당
      // 기사 전원을 실시간으로 따른다 — 점검완료 여부(status·doneDate 등)는 그대로 c에서 유지된다.
      const currentAssigneeIds = (s?.assignedEngineers ?? [])
        .map((name) => profileIdByName(data.profiles, name))
        .filter(Boolean);
      return { ...c, assigneeIds: currentAssigneeIds, loc: locOf(data, c.unitId), address: s?.address ?? null, gu: guOf(s?.address), siteActive: s?.isActive !== false };
    })
    // 출석부는 생성 시점(매월 1일)에 활성 호기 전체로 만들어져서, 그 뒤 현장이 계약중지돼도
    // 이미 만들어진 줄은 그대로 남는다 — 지금 계약중지인 현장의 줄은 화면에서 제외한다.
    .filter((c) => c.siteActive)
    .sort((a, b) => a.loc.localeCompare(b.loc, "ko"));
  const done = rows.filter((c) => c.status === "완료");

  // 총대수(rows.length)는 위에서 이미 확정 — 아래는 기사별 집계만, row를 복제하지 않고
  // 배정된 기사 수만큼 같은 row 참조를 여러 그룹에 push한다(2명 배정 현장은 두 기사의
  // "담당대수"엔 각각 반영되지만 rows.length·done.length는 늘지 않는다).
  const groups = new Map();
  for (const r of rows) {
    const keys = r.assigneeIds.length ? r.assigneeIds : ["__unassigned"];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
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
```

`app/components/admin/SelfChecksAdmin.jsx` 상단 import는 현재 `import { shortDate, addDays } from "@/lib/utils";`뿐이라 `profileIdByName`이 없다 — 아래처럼 추가:
```js
import { shortDate, addDays, profileIdByName } from "@/lib/utils";
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 3: 인라인으로 이중계산 안 되는지 확인**

Run:
```bash
node -e "
const rows = [{id:'r1', assigneeIds:['a','b']}, {id:'r2', assigneeIds:['a']}];
const groups = new Map();
for (const r of rows) {
  const keys = r.assigneeIds.length ? r.assigneeIds : ['__unassigned'];
  for (const key of keys) { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); }
}
console.log('총대수(원본)', rows.length);
console.log('a 담당대수', groups.get('a').length, 'b 담당대수', groups.get('b').length);
"
```
Expected: `총대수(원본) 2`(늘지 않음), `a 담당대수 2 b 담당대수 1`(a는 2건 다, b는 1건만 — 정확히 반영).

- [ ] **Step 4: 브라우저로 확인**

관리자 콘솔 → 자체점검현황. Task 2에서 2명 배정한 현장이 있으면 상단 "완료 X / 전체 Y" 진행률의 Y가 그 현장의 호기 수만큼만 늘고(두 배로 안 늘고), 아래 표에서 두 기사 각각의 "담당대수"엔 그 현장 호기가 포함돼 있는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/components/admin/SelfChecksAdmin.jsx
git commit -m "fix: 자체점검현황 총대수 이중계산 방지 — rows는 유지, groups만 다중배정 반영"
git push
```

---

## Task 7: `SelfChecksAdmin.jsx` 발행 다중생성 + `BillingTab.jsx` 형제 할일 자동완료

**Files:**
- Modify: `app/components/admin/SelfChecksAdmin.jsx:167-192` (`publish`)
- Modify: `app/components/tabs/BillingTab.jsx:90-102` (`idsToComplete`)

**Interfaces:**
- Consumes: Task 6의 `row.assigneeIds`(이번 Task에서 이름 배열도 필요 — `row`에 `assignedEngineers`를 추가로 실어 보냄).

- [ ] **Step 1: `rows` 매핑에 `assignedEngineers`(이름 배열)도 함께 싣기**

Task 6에서 만든 `rows` map 콜백(`app/components/admin/SelfChecksAdmin.jsx`) 안, `return { ...c, assigneeIds: currentAssigneeIds, ... }` 줄을 아래로 교체:

```js
      return { ...c, assigneeIds: currentAssigneeIds, assignedEngineers: s?.assignedEngineers ?? [], loc: locOf(data, c.unitId), address: s?.address ?? null, gu: guOf(s?.address), siteActive: s?.isActive !== false };
```

- [ ] **Step 2: `publish()` — 기사 수만큼 todo 생성**

`app/components/admin/SelfChecksAdmin.jsx:167-192` 교체:

```js
  async function publish(row) {
    const names = row.assignedEngineers.length ? row.assignedEngineers : [null];
    const confirmNames = row.assignedEngineers.length ? row.assignedEngineers.join(", ") : "미배정";
    if (!(await confirmAsync(`${locOf(data, row.unitId)} · ${row.itemName} — 할일로 발행할까요?\n담당기사: ${confirmNames}`))) return;
    setPublishing(row.id);
    const gradeLabel = RESULT_LABEL[row.result] ?? row.result;
    const dueDate = addDays(TODAY_STR, row.result === "C" ? 7 : 14);
    const patches = names.map((name, idx) => {
      const engineer = name ? data.profiles.find((p) => p.name === name) : null;
      return {
        id: `todo-selfcheck-${row.id}-${idx}`,
        source: "selfcheck",
        self_check_item_id: row.id,
        title: `${locOf(data, row.unitId)} 자체점검 지적사항 — ${row.itemName} (${gradeLabel})`,
        site_name: data.sites.find((s) => s.id === row.siteId)?.name ?? null,
        elevator_no: data.units.find((u) => u.id === row.unitId)?.unitNo ?? null,
        unit_id: row.unitId,
        part: "자체점검 지적사항",
        assignee: name,
        assignee_id: engineer?.id ?? null,
        assigned_date: TODAY_STR,
        due_date: dueDate,
        done: false,
        description: row.remark || "특이사항 입력 없음",
      };
    });
    const { data: inserted, error } = await supabase.from("todos").insert(patches).select();
    setPublishing(null);
    if (error) { alert("발행 실패: " + error.message); return; }
    setData((prev) => ({ ...prev, todos: [...(inserted ?? []).map(mapTodo), ...prev.todos] }));
  }
```

(원래 `publish()`도 푸시 발송 없이 todo만 insert했다 — `SelfChecksAdmin.jsx`를 포함한 관리자 콘솔 어디에도 `sendPush` 호출이 없음(`grep -rn sendPush app/components/admin`으로 확인됨, 있는 건 `TodosAdmin.jsx`·`NotifySettings.jsx`뿐이고 그 둘도 다른 용도). 기존 동작 그대로 유지 — 푸시 추가는 이번 스코프 밖.)

- [ ] **Step 3: `BillingTab.jsx` 형제 할일 탐색에 `selfCheckItemId` 조건 추가**

`app/components/tabs/BillingTab.jsx:90-102`:

```js
    // 견적 지급 시 담당자를 2명 이상 지정한 경우, 같은 quoteRequestId(또는 materialRequestId,
    // selfCheckItemId)를 공유하는 할 일이 여러 개 생성돼 있습니다. 그중 한 명이 비용청구를
    // 하면 나머지 담당자의 할 일도 함께 자동완료되도록, 이 건과 같은 요청을 공유하는
    // 미완료 할 일을 모두 찾아 완료 처리합니다.
    const idsToComplete = (selected.quoteRequestId || selected.materialRequestId || selected.selfCheckItemId)
      ? todos
          .filter(
            (t) =>
              !t.done &&
              ((selected.quoteRequestId && t.quoteRequestId === selected.quoteRequestId) ||
                (selected.materialRequestId && t.materialRequestId === selected.materialRequestId) ||
                (selected.selfCheckItemId && t.selfCheckItemId === selected.selfCheckItemId))
          )
          .map((t) => t.id)
      : [selected.id];
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 5: 브라우저로 확인**

Task 2에서 2명 배정한 현장의 호기에 자체점검 B/C 지적사항을 하나 등록(자체점검 탭에서) → 관리자 콘솔 자체점검현황 → 지적사항(B/C) → "할일로 발행" → 두 기사 계정 각각(`/?as=engineer&name=...`) 할일탭에서 같은 지적사항의 할일이 보이는지 확인 → 한 기사 계정에서 비용청구탭으로 그 할일 청구 → 다른 기사 계정에서 새로고침 후 그 할일이 자동으로 완료 처리됐는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add app/components/admin/SelfChecksAdmin.jsx app/components/tabs/BillingTab.jsx
git commit -m "feat: 자체점검 지적사항 발행을 담당기사 전원에게, 비용청구 시 형제 할일 자동완료"
git push
```

---

## Task 8: 표시 개선 — 현장 담당자(고객사) A섹션 + 나머지 표시용 호출부(D/G/F)

**Files:**
- Modify: `app/components/admin/MaterialsAdmin.jsx:1041,1068` (A섹션 — 현장 담당자 연락처 "대표 + 외 N명")
- Modify: `app/components/admin/Dashboard.jsx:52,392,439`
- Modify: `app/components/admin/ContractDashboard.jsx:146`
- Modify: `app/components/tabs/FailureTab.jsx:155,472`
- Modify: `app/components/admin/InspectionsAdmin.jsx:95,198`
- Modify: `app/components/tabs/SiteTab.jsx:515`
- Modify: `app/components/admin/SiteMapModal.jsx:179`
- Modify: `app/components/admin/FailuresAdmin.jsx:368`

이 Task는 전부 "표시 문자열을 한 줄 바꾸는" 수준이라 한 번에 묶는다. 각 스텝은 독립적으로
커밋 안 하고 마지막에 한 번에 커밋한다(전부 같은 성격의 변경이라 리뷰 단위를 쪼갤 이유가
적음). 파일별 원본 줄은 이미 앞서 확인한 그대로다 — 실제 적용 전 `grep -n`으로 줄번호가
Task 1~7 진행 중 밀리지 않았는지 재확인할 것.

**Interfaces:**
- Consumes: Task 1의 `s.assignedEngineers`(배열). `assignedEngineer`(단수, 대표)는 이미 파생돼 있으니 대표만 필요한 자리는 그대로 두고, "N명 다 보여줄" 자리만 고친다.

- [ ] **Step 1: `MaterialsAdmin.jsx` — 현장 담당자(고객사) 연락처**

`app/components/admin/MaterialsAdmin.jsx:1041-1044` 근처, `primaryManager` 정의 다음 줄에 추가:
```js
  const otherManagers = !isMaterial ? (data.siteManagers ?? []).filter((m) => m.siteId === r.siteId && m.id !== primaryManager?.id) : [];
```
`:1068`:
```js
          <div><p className="text-xs font-bold text-slate-400 mb-1">{isMaterial ? "긴급도" : "현장 담당자 연락처"}</p><p className="font-semibold text-slate-800">{isMaterial ? r.urgency : (r.contactPhone || (primaryManager?.phone ? `${primaryManager.phone}${otherManagers.length ? ` 외 ${otherManagers.length}명` : ""}` : "-"))}</p></div>
```

- [ ] **Step 2: `Dashboard.jsx` 3곳**

`:52`:
```js
    { label: "담당 기사", value: loc.siteObj?.assignedEngineers?.length ? loc.siteObj.assignedEngineers.join(", ") : "미배정" },
```
`:392`:
```js
                    <td className="px-2 py-2.5 whitespace-nowrap">{loc.siteObj?.assignedEngineers?.length ? loc.siteObj.assignedEngineers.join(", ") : "미배정"}</td>
```
`:439`:
```js
                      담당 {loc.siteObj?.assignedEngineers?.length ? loc.siteObj.assignedEngineers.join(", ") : "미배정"} · 배정 {engineerName(f.assigneeId, f.assignee)}
```

- [ ] **Step 3: `ContractDashboard.jsx:146`**

```js
                    <p className="text-[10px] text-slate-400">{s.contractType ?? "계약구분 없음"} · {s.assignedEngineers?.length ? s.assignedEngineers.join(", ") : "담당 미지정"}</p>
```

- [ ] **Step 4: `FailureTab.jsx` 2곳**

`:155`:
```js
    ["담당자", site.manager], ["담당 기사", site.assignedEngineers?.length ? site.assignedEngineers.join(", ") : "미배정"], ["접수일시", nowLabel],
```
`:472`:
```js
          <span className="font-semibold text-slate-700">{site?.assignedEngineers?.length ? site.assignedEngineers.join(", ") : "미배정"}</span>
```

- [ ] **Step 5: `InspectionsAdmin.jsx` 2곳**

`:95`:
```js
      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap align-top">{site?.assignedEngineers?.length ? site.assignedEngineers.join(", ") : "미배정"}</td>
```
`:198`(검색용 — 대표 이름 하나로도 검색되던 걸 전체로 넓힘):
```js
      case "person": return sites.find((s) => s.id === i.siteId)?.assignedEngineers?.join(" ") ?? "";
```

- [ ] **Step 6: `SiteTab.jsx:515`**

```js
          <TimelineRow icon={User} label="이름" value={site.assignedEngineers?.length ? site.assignedEngineers.join(", ") : "미배정"} />
```

- [ ] **Step 7: `SiteMapModal.jsx:179` 툴팁만 (마커색은 대표 기준 유지, 변경 없음)**

```js
              <div>담당자: ${s.assignedEngineers?.length ? s.assignedEngineers.join(", ") : "미배정"}</div>
```

- [ ] **Step 8: `FailuresAdmin.jsx:368` 검색 haystack 확장**

```js
    const haystack = [f.reportedAt, f.siteName, site?.name, f.errorCode, ...(site?.assignedEngineers ?? []), f.assignee]
```

(원래 `site?.assignedEngineer,`였던 자리를 배열 스프레드로 교체 — 나머지 `haystack` 배열 원소는 그대로 둠.)

- [ ] **Step 9: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 10: 브라우저로 확인**

Task 2에서 2명 배정한 현장 기준으로: 관리자 콘솔 대시보드(실시간 검사 현황), 계약현황, 고장현황, 검사관리 표, 자재신청 상세(견적 카드), 기사앱 현장상세, 지도보기 툴팁에서 전부 두 이름이 나열되는지 확인. 고장 검색창에 두 번째 기사 이름으로 검색해서 그 현장 고장이 걸리는지 확인.

- [ ] **Step 11: 커밋**

```bash
git add app/components/admin/MaterialsAdmin.jsx app/components/admin/Dashboard.jsx app/components/admin/ContractDashboard.jsx app/components/tabs/FailureTab.jsx app/components/admin/InspectionsAdmin.jsx app/components/tabs/SiteTab.jsx app/components/admin/SiteMapModal.jsx app/components/admin/FailuresAdmin.jsx
git commit -m "feat: 담당 기사·현장 담당자 표시를 다중 배정 반영하도록 확장"
git push
```

---

## 완료 후 확인

모든 Task 완료 후 Task 2에서 만든 테스트용 2인 배정 현장을 정리(원래 담당자 1명으로 되돌리거나, 테스트용으로 새로 만든 현장이면 계약종료 처리)할지 사용자에게 확인할 것 — 실운영 DB라 테스트 흔적을 남길지 지울지는 사용자 판단.
