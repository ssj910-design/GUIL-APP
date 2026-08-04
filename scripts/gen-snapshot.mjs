// 설계 문서 자동 생성 — 코드를 읽어 "지금 앱이 어떻게 생겼나"와 "타사 입주 시 바꿀 곳"을 뽑는다.
//
// 왜 자동인가: 두 사람이 매일 기능을 붙이고 지워서 손으로 쓴 문서는 며칠이면 낡는다.
// 사람이 관리하는 건 PRD(제품 정의)뿐이고, 화면 목록·알림 종류·브랜딩 위치처럼
// "코드에 이미 답이 있는 것"은 여기서 뽑아 쓴다.
//
// 실행:  node scripts/gen-snapshot.mjs      → docs/design/04-snapshot.html 갱신
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return ""; } };

// ── 1. 화면 목록 ─────────────────────────────────────────────
const app = read("app/components/ElevatorFieldApp.jsx");
const admin = read("app/components/admin/AdminApp.jsx");
const between = (src, start) => {
  const i = src.indexOf(start);
  if (i < 0) return "";
  return src.slice(i, src.indexOf("\n];", i));
};
const labels = (block) => [...block.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
const tabs = labels(between(app, "const TABS = ["));
const menus = [...between(admin, "const MENU = [").matchAll(/label:\s*"([^"]+)"(?:[^}]*?(superOnly))?/g)]
  .map((m) => ({ label: m[1], superOnly: !!m[2] }));

// ── 2. 알림 종류 ─────────────────────────────────────────────
const notif = read("lib/notifications.js");
const notifications = [...notif.matchAll(/\{\s*key:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*audience:\s*"([^"]+)",\s*level:\s*"([^"]+)",\s*trigger:\s*"([^"]+)"([^}]*)\}/g)]
  .map((m) => ({ key: m[1], label: m[2], audience: m[3], level: m[4], trigger: m[5], built: /built:\s*true/.test(m[6]) }));

// ── 3. 화이트라벨 대상 — 코드에 박힌 회사 브랜딩 ──────────────
// 타사가 쓰려면 여기가 전부 회사 설정에서 나와야 한다. 새 코드에 "구일"이 들어오면 자동으로 잡힌다.
const BRAND = /구일|guil/i;
const SKIP_DIR = new Set(["node_modules", ".next", ".git", "android", "ios", "public", ".playwright-mcp", "docs"]);
const brandHits = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { walk(rel); continue; }
    if (!/\.(js|jsx|json|sql)$/.test(e.name)) continue;
    if (/VerifyImport|gen-snapshot/.test(e.name)) continue; // 검증도구는 회사명이 데이터로 등장
    read(rel).split("\n").forEach((line, i) => {
      if (!BRAND.test(line)) return;
      if (/^\s*(\/\/|\*|--)/.test(line)) return;            // 주석은 브랜딩이 아님
      brandHits.push({ file: rel, line: i + 1, text: line.trim().slice(0, 110) });
    });
  }
})("");

// ── 4. DB 마이그레이션 (스키마 진행 상황) ─────────────────────
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();

// ── HTML 출력 ────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const byFile = brandHits.reduce((m, h) => { (m[h.file] ??= []).push(h); return m; }, {});
const AUD = { engineer: "기사", admin: "관리자", all: "전원", engineer_admin: "기사+관리자" };

const html = `<!doctype html>
<!-- ⚠️ 이 파일은 자동 생성됩니다 — 직접 고치지 마세요. 고쳐도 다음 실행 때 지워집니다.
     갱신:  node scripts/gen-snapshot.mjs
     사람이 쓰는 문서는 01-prd.html(제품 정의)뿐입니다. 화면·알림·브랜딩 목록은 코드가 원본입니다. -->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>04. 코드 스냅샷 (자동)</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
  <nav class="docnav"><a href="index.html" class="home">설계 허브</a><span class="sep">·</span><a href="01-prd.html">01 PRD</a><span class="sep">·</span><a href="02-userflow.html">02 유저플로우</a><span class="sep">·</span><a href="03-sitemap.html">03 화면지도</a><span class="sep">·</span><a href="04-snapshot.html" class="here">04 스냅샷</a><span class="sep">|</span><span class="sep" style="font-size:11px">화면설계</span><a href="screens/login.html">로그인</a></nav>
  <h1>코드 스냅샷 <span class="badge done">자동 생성</span></h1>
  <p class="doc-meta">${today} 기준 · <code>node scripts/gen-snapshot.mjs</code>로 갱신 · 손으로 고치지 마세요(코드가 원본)</p>

  <div class="callout">
    앱이 매일 바뀌어 손으로 쓴 목록은 금방 낡습니다. 이 문서는 <b>코드에서 직접 뽑아</b> 만들기 때문에
    스크립트만 다시 돌리면 항상 최신입니다. 사람이 관리하는 건 <a href="01-prd.html">PRD</a>(제품 정의)뿐입니다.
  </div>

  <h2>1. 화면 <span style="font-size:13px;font-weight:400;color:var(--sub)">모바일 탭 ${tabs.length} · 콘솔 메뉴 ${menus.length}</span></h2>
  <p><b>모바일 하단 탭</b><br>${tabs.map((t) => `<code>${esc(t)}</code>`).join(" · ")}</p>
  <p><b>PC 관리자 콘솔 메뉴</b><br>${menus.map((m) => `<code>${esc(m.label)}</code>${m.superOnly ? '<span class="badge gate">최고관리자</span>' : ""}`).join(" · ")}</p>

  <h2>2. 알림 <span style="font-size:13px;font-weight:400;color:var(--sub)">${notifications.length}종 · 크론 구현 ${notifications.filter((n) => n.built).length}종</span></h2>
  <table>
    <tr><th>상황</th><th>받는 사람</th><th>시점</th><th>등급</th></tr>
    ${notifications.map((n) => `<tr><td>${esc(n.label)}</td><td>${AUD[n.audience] ?? n.audience}</td><td>${n.trigger === "instant" ? "즉시" : `정해진 시각${n.built ? "" : ' <span class="tbd">미구현</span>'}`}</td><td>${n.level === "urgent" ? "긴급" : n.level === "normal" ? "보통" : "낮음"}</td></tr>`).join("\n    ")}
  </table>

  <h2>3. 화이트라벨 대상 <span style="font-size:13px;font-weight:400;color:var(--sub)">${brandHits.length}곳 · ${Object.keys(byFile).length}개 파일</span></h2>
  <p>타사가 쓰려면 아래가 전부 <b>회사 설정에서 읽어오도록</b> 바뀌어야 합니다. 코드에 회사명이 새로 들어오면 다음 실행 때 자동으로 잡힙니다.</p>
  ${Object.entries(byFile).map(([f, hits]) => `<details class="history"><summary>${esc(f)} — ${hits.length}곳</summary>${hits.map((h) => `<div style="font-family:ui-monospace,monospace;font-size:12px;margin:3px 0"><span style="color:var(--faint)">${h.line}:</span> ${esc(h.text)}</div>`).join("")}</details>`).join("\n  ")}

  <h2>4. DB 마이그레이션 <span style="font-size:13px;font-weight:400;color:var(--sub)">${migrations.length}개</span></h2>
  <p style="font-family:ui-monospace,monospace;font-size:12px;color:var(--sub);line-height:1.9">${migrations.map((m) => esc(m.replace(".sql", ""))).join(" · ")}</p>
</main>
<footer>GUIL-APP 설계 문서 · docs/design/04-snapshot.html · 자동 생성 (node scripts/gen-snapshot.mjs)</footer>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, "docs/design/04-snapshot.html"), html);
console.log(`생성 완료 — 탭 ${tabs.length} · 메뉴 ${menus.length} · 알림 ${notifications.length}종 · 브랜딩 ${brandHits.length}곳 · 마이그 ${migrations.length}개`);
