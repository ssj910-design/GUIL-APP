// 국가승강기정보센터 검사이력·부적합상세 조회 — 서버 전용(공단 서비스키 필요).
// app/api/elevator-fail-detail/route.js(사용자 요청 시 실시간 조회)와
// app/api/cron/sync-inspection-cache/route.js(매일 배치로 조건부/불합격 호기 캐싱)가 같이 쓴다.

const SAFE_URL = "https://apis.data.go.kr/B553664/ElevatorInspectsafeService/getInspectsafeList";
const FAIL_URL = "https://apis.data.go.kr/B553664/ElevatorInspectsafeService/getInspectFailList";
const ONE_DAY_MS = 86400000;
const MAX_MATCH_DAYS = 45; // 이 범위 밖이면 다른 회차 검사이력으로 보고 매칭하지 않는다.

export function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((itemMatch) => {
    const fields = {};
    for (const fieldMatch of itemMatch[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)) {
      fields[fieldMatch[1]] = fieldMatch[2];
    }
    return fields;
  });
}

// 실데이터로 확인된 실제 검사일자 필드는 inspctDe다(청담포레·대흥빌딩 응답에서 검증됨).
export function inspectDateMs(record) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(record.inspctDe ?? "");
  if (!m) return null;
  const t = new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime();
  return Number.isNaN(t) ? null : t;
}

export async function fetchInspectionHistory(elevatorNo) {
  const safeUrl = `${SAFE_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=50&elevator_no=${encodeURIComponent(elevatorNo)}`;
  const safeRes = await fetch(safeUrl);
  const safeXml = await safeRes.text();
  const safeResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(safeXml)?.[1];
  if (safeResultCode !== "00") return null;
  return parseItems(safeXml).sort((a, b) => (inspectDateMs(b) ?? 0) - (inspectDateMs(a) ?? 0));
}

export function findRecordByAnchor(records, anchorDate) {
  const anchorTime = new Date(anchorDate).getTime();
  if (Number.isNaN(anchorTime)) return null;
  let record = null;
  let bestDiff = Infinity;
  for (const r of records) {
    const t = inspectDateMs(r);
    if (t === null) continue;
    const diff = Math.abs(t - anchorTime);
    if (diff < bestDiff) { bestDiff = diff; record = r; }
  }
  return record && bestDiff <= MAX_MATCH_DAYS * ONE_DAY_MS ? record : null;
}

async function fetchFailItemsOnce(failCd) {
  const failUrl = `${FAIL_URL}?serviceKey=${process.env.ELEVATOR_API_SERVICE_KEY}&pageNo=1&numOfRows=50&fail_cd=${encodeURIComponent(failCd)}`;
  const failRes = await fetch(failUrl);
  const failXml = await failRes.text();
  const failResultCode = /<resultCode>([^<]*)<\/resultCode>/.exec(failXml)?.[1];
  if (failResultCode !== "00") return { items: [], reason: "fetch_failed" };
  const items = parseItems(failXml);
  // failCd는 있는데 상세 항목이 0건인 경우도 있다 — 국가승강기정보센터 쪽 데이터 공백으로 보이며 코드로는 더 확인할 수 없다.
  return { items, reason: items.length === 0 ? "no_items_for_fail_code" : null };
}

// 과거 회차의 부적합내역은 한번 확정되면 절대 안 바뀌는 데이터라 fail_cd 기준으로
// inspection_fail_cache(Supabase)에 저장해두고, 있으면 외부 API를 다시 안 부른다.
export async function fetchFailItems(supabase, failCd) {
  if (supabase) {
    const { data: cached } = await supabase.from("inspection_fail_cache").select("items, reason").eq("fail_cd", failCd).maybeSingle();
    if (cached) return { items: cached.items ?? [], reason: cached.reason };
  }
  const first = await fetchFailItemsOnce(failCd);
  const result = first.reason !== "fetch_failed" ? first : await fetchFailItemsOnce(failCd);
  if (supabase && result.reason !== "fetch_failed") {
    await supabase.from("inspection_fail_cache").upsert({ fail_cd: failCd, items: result.items, reason: result.reason }).select();
  }
  return result;
}

// anchorDate 없이(=최신 회차) 부적합 상세까지 한 번에 끝까지 풀어서 가져온다 — 검사관리
// 조건부·불합격 캐싱 배치(sync-inspection-cache)와 InspectionFailDetailSheet의 "회차 목록만
// 먼저 받고 그중 최신 회차에 items가 없으면 그 회차 날짜로 한 번 더 조회" 흐름을 함수 하나로 합친 것.
export async function resolveLatestFailItems(supabase, elevatorNo) {
  const records = await fetchInspectionHistory(elevatorNo);
  if (!records) return { items: [], reason: "fetch_failed", record: null };
  const latest = records[0];
  if (!latest) return { items: [], reason: "no_record", record: null };
  if (!latest.failCd) return { items: [], reason: "no_fail_code", record: latest };
  const { items, reason } = await fetchFailItems(supabase, latest.failCd);
  return { items, reason, record: latest };
}
