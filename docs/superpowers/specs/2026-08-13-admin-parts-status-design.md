# 관리자웹 부품현황 탭 Design

## 목표

[2026-08-12 승강기 부품현황 사진 Design](2026-08-12-elevator-unit-part-photos-design.md)에서
모바일 앱(SiteTab)에만 만들고 "범위 밖"으로 미뤄뒀던 관리자웹(PC 콘솔) 화면을 붙인다.
데이터·분류체계·사진 저장 로직은 모바일과 완전히 동일 — 화면 배치만 PC 콘솔에
맞게 새로 짠다.

## 배치

`app/components/admin/SitesAdmin.jsx`의 `UnitDetailModal`(호기 상세정보 팝업, 현재
정보/고장내역/검사내역/부품교체내역/견적내역 5개 탭)에 "부품현황"을 6번째 탭으로
추가한다.

팝업 폭을 `wide`(→ `max-w-3xl`, 48rem)에서 `wide="xl"`(→ `max-w-5xl`, 64rem)로
넓힌다. 좌측 트리(240px) + 우측 상세 2단 레이아웃이 들어갈 폭이 필요해서다 — 다른
5개 탭도 같이 약간 넓어지지만 표·폼 위주라 문제 없다. 탭 전환 시 팝업 높이가
바뀌지 않게 하는 기존 관례(`h-[26rem] overflow-y-auto`)는 유지하되, 부품현황
탭만 그 안에서 좌우 2단으로 나누고 각 단을 독립적으로 스크롤시킨다(바깥은
`overflow-y-auto` 대신 `h-full flex`).

## UI 구조 — 트리 + 상세 2단

브라우저 mockup(옵션 B)으로 사용자 확인 완료. 모바일의 3단 아코디언과 달리, 왼쪽에
7개 대분류를 세로로 나열한 트리, 오른쪽에 선택한 세부항목의 사진 패널을 두는
구조다. 사무실에서 전체 진행 현황을 스크롤 한 번으로 훑어보는 용도에 맞춘다.

**좌측 트리 (`app/components/admin/PartsStatusTab.jsx` 내부, 폭 240px, 독립 스크롤)**
- 대분류 7개를 항상 나열. 한 번에 하나만 펼침(아코디언, `openCategory` 상태) —
  모바일 `PartPhotosPanel`의 `openCategory` 패턴과 동일.
- 대분류 행: 라벨 + 배지(`채워진 리프/전체 리프`, `countFilled`/`leafPathsOf` 그대로
  재사용). 전부 채워졌으면 배지 색을 강조(초록 계열)로 바꾼다.
- 펼친 대분류 안: 중분류가 있으면 소제목(클릭 불가, 라벨만) + 그 아래 리프 행들,
  중분류 없이 리프가 바로 붙는 경우(카도어 등)는 소제목 없이 리프 행만. 트리
  순회는 모바일 `PartNode`/`PartGroup`과 동일하게 재귀로 처리(문자열=리프,
  `{label,children}`=중분류, 깊이 상관없이).
- 리프 행: 라벨 + 점(사진 있으면 초록 점, 없으면 회색 점). 클릭하면 우측 상세를
  그 리프로 바꾼다. 현재 선택된 리프는 강조 표시(배경 + 글자색·굵기).

**우측 상세 (같은 파일, 나머지 폭, 독립 스크롤)**
- 상단에 요약 칩 2개: 전체 진행률(`채워진 리프/전체 리프`, 7개 대분류 합산) +
  완료된 대분류 수.
- breadcrumb(`대분류 › 중분류 › 리프`, 중분류 없으면 생략) + 리프명 제목.
- 그 아래 `FileCarousel`(`app/components/admin/adminShared.jsx`, 기존 컴포넌트
  그대로) — `accept="image/*"`로 사진만, 촬영/선택 시트·드래그드랍·전체화면·개별
  삭제 전부 기존 그대로 동작.
- 초기 진입 시(아무 리프도 선택 안 한 상태) 상세 영역엔 안내 문구만
  ("왼쪽에서 항목을 선택하세요") — 자동으로 첫 항목을 선택하지 않는다(가장 단순한
  기본값, 나중에 필요하면 추가).

## 재사용 vs 신규

**그대로 재사용 (변경 없음)**
- `lib/unitPartTaxonomy.js` — `UNIT_PART_TAXONOMY`/`leafPathsOf`/`countFilled`
- `unit_part_photos` 테이블(마이그레이션 111, 이미 적용됨), `uploadPhoto()`
- `FileCarousel`(`app/components/admin/adminShared.jsx`)

**리팩터 (로직 추출, 모바일 동작 변경 없음)**
- 현재 모바일 `PartLeafRow`(`app/components/tabs/PartPhotosPanel.jsx`) 안에 있는
  "다음 urls와 이전 urls를 비교해 추가/삭제 중 뭐가 일어났는지 판별"하는 로직
  (사진 URL이 여러 장 겹칠 때를 위한 멀티셋 기반 비교, 기존 주석에 설명된 그 로직)을
  새 파일 `lib/partLeafPhotos.js`로 뽑아낸다. React 상태(useState 등)를 쓰지 않는
  순수 함수라 "훅"이 아니라 일반 유틸 함수로 둔다(더 단순하고, `unitPartTaxonomy.js`처럼
  `.check.mjs`로 바로 단위 검증 가능).
  시그니처: `partLeafPhotos(photos, category, subcategory, part)` → `{ mine, urls }`,
  `savePartLeafPhotos({ unitId, category, subcategory, part, mine, urls, nextUrls, onAdd, onRemove })`.
  모바일 `PartLeafRow`와 관리자웹 우측 상세 패널이 이 두 함수를 같이 쓴다 — 로직은
  한 곳, 감싸는 UI(아코디언 행 vs 상세 패널)만 다르다.

**신규**
- `app/components/admin/PartsStatusTab.jsx` — 위 트리+상세 2단 UI 전체.
  `{ unitId, photos, onAdd, onRemove }` props (모바일 `PartPhotosPanel`과 동일한
  시그니처).

## 데이터 배선

- `app/components/admin/AdminApp.jsx`의 최초 로드 `Promise.all`에
  `supabase.from("unit_part_photos").select("*")` 추가, 결과를 기존
  `mapUnitPartPhoto`(`lib/mappers.js`, 모바일에서 이미 씀)로 매핑해
  `data.unitPartPhotos`에 저장. 모바일 `ElevatorFieldApp.jsx`의 동일 fetch와
  같은 방식(페이지네이션 없는 단순 `select("*")`).
- `SitesAdmin.jsx`에 `addUnitPartPhoto`/`removeUnitPartPhoto` 함수를 추가한다.
  이 파일의 기존 관례(`saveUnitDetail`처럼 직접 `supabase` 호출 → 성공하면
  `setData((prev) => ...)`로 로컬 상태 갱신)를 그대로 따른다 — 모바일처럼
  `ElevatorFieldApp.jsx` 최상단에 핸들러를 두고 props로 내려보내는 방식이 아니라,
  `SitesAdmin.jsx` 안에서 처리한다(이 파일에 이미 있는 컨벤션).
- `UnitDetailModal`에 `unitPartPhotos`(해당 unit.id로 필터링된 배열),
  `onAddPartPhoto`, `onRemovePartPhoto`를 새 props로 전달, 부품현황 탭에서
  `<PartsStatusTab unitId={unit.id} photos={unitPartPhotos} onAdd={onAddPartPhoto} onRemove={onRemovePartPhoto} />`로 렌더.

## 범위 밖

- 좌측 트리 전부 펼쳐서 한 화면에 다 보여주는 방식(대분류 아코디언 없이) — 시안
  단계에서 옵션 B로 확정된 "한 번에 하나만 펼침" 방식을 그대로 따른다.
- 부품현황 탭 진입 시 첫 리프 자동 선택 — 위 "초기 진입" 항목 참고, 지금은 안 함.
- PDF 등 사진 외 파일 첨부 — 모바일과 동일하게 사진만.
