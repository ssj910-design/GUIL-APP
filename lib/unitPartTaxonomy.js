// 호기별 "부품현황" 사진 분류 체계 — 회사가 정한 고정 점검 항목(현장마다 다르지 않음).
// 대분류(배열 원소) 아래 children 원소가 문자열이면 리프(실제 사진 슬롯), {label,
// children} 객체면 한 겹 더 있는 중분류. 카테고리마다 중분류가 있을 수도 없을 수도
// 있어서(예: 기계실은 있고 카상부는 없음), 렌더링 쪽(PartPhotosPanel)은 이 모양을
// 그대로 재귀로 따라가면 된다.
export const UNIT_PART_TAXONOMY = [
  {
    label: "기계실",
    children: [
      { label: "제어반", children: ["전체사진", "PCB", "인버터", "ARD", "마그네트", "SMPS"] },
      { label: "권상기", children: ["전체사진", "구동기", "권상기", "브레이크"] },
      { label: "조속기", children: ["전체사진", "조속기 스위치"] },
      "비상통화장치",
    ],
  },
  { label: "카 상부", children: ["전체사진", "카탑PCB", "랜딩스위치", "가이드슈/가이드롤러/오일러"] },
  { label: "카도어", children: ["도어드라이브", "도어모터·벨트", "카도어 인터록", "카도어 벤", "카도어 씰"] },
  { label: "승장도어", children: ["행거플레이트", "승장도어 인터록", "승장도어 씰"] },
  { label: "승강장", children: ["승장버튼", "승장인디게이터"] },
  {
    label: "카 내부",
    children: [
      { label: "조작반", children: ["전체사진", "버튼", "통신보드", "카 인디게이터"] },
      "조명등",
    ],
  },
  { label: "승강로", children: ["리미트스위치", "조속기 인장풀리", "완충기 스위치", "피트 조작반"] },
];

// node(대분류 또는 중분류) 아래 모든 리프를 {category, subcategory, part} 경로로
// 평탄화한다. initialSubcategory: node가 대분류면 null, 중분류 노드 자체를 넘겼으면
// 그 중분류의 label.
export function leafPathsOf(node, category, initialSubcategory) {
  function walk(child, subcategory) {
    if (typeof child === "string") return [{ category, subcategory, part: child }];
    return child.children.flatMap((c) => walk(c, subcategory ?? child.label));
  }
  return node.children.flatMap((child) => walk(child, initialSubcategory));
}

// paths 중 photos(각 원소가 {category, subcategory, part}를 가짐) 안에 실제로
// 존재하는(사진이 1장 이상 있는) 개수.
export function countFilled(paths, photos) {
  return paths.filter((p) =>
    photos.some((ph) => ph.category === p.category && ph.subcategory === p.subcategory && ph.part === p.part)
  ).length;
}
