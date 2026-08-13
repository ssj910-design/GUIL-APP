// 호기 부품현황 사진 — 리프(세부항목) 단위로 "지금 사진이 몇 장 있는지"와 "다음 urls
// 배열과 비교해서 추가/삭제 중 뭐가 일어났는지" 판별하는 순수 로직. 모바일 아코디언
// 행(PartLeafRow)과 관리자웹 상세패널(PartsStatusTab)이 이 파일 하나를 같이 쓴다.

// 이 리프(category+subcategory+part)에 해당하는 사진들과 그 url 목록.
export function partLeafPhotos(photos, category, subcategory, part) {
  const mine = photos.filter((p) => p.category === category && p.subcategory === subcategory && p.part === part);
  return { mine, urls: mine.map((p) => p.url) };
}

// FileCarousel은 "다음 urls 배열"만 넘겨준다 — 이전 urls와 비교해서 추가/삭제 중 뭐가
// 일어났는지 여기서 판단한다. 단순 includes() 비교로는 같은 url이 두 장 이상 겹칠 때
// (중복 업로드 등) 삭제된 장을 못 찾아 아무 반응이 없었다 — 개수 기반(멀티셋) 비교로
// 정확히 몇 번째가 빠졌는지 찾는다.
export async function savePartLeafPhotos({ unitId, category, subcategory, part, mine, urls, nextUrls, onAdd, onRemove }) {
  if (nextUrls.length > urls.length) {
    const addedUrl = nextUrls.find((u) => !urls.includes(u));
    await onAdd({ unitId, category, subcategory, part, url: addedUrl });
    return;
  }
  const nextCounts = new Map();
  nextUrls.forEach((u) => nextCounts.set(u, (nextCounts.get(u) ?? 0) + 1));
  const removedIndex = urls.findLastIndex((u) => {
    const remaining = nextCounts.get(u) ?? 0;
    if (remaining > 0) { nextCounts.set(u, remaining - 1); return false; }
    return true;
  });
  const removed = removedIndex >= 0 ? mine[removedIndex] : undefined;
  if (removed) await onRemove(removed.id);
}
