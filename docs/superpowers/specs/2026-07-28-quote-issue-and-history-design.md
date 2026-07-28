# 견적 신규발행 + 호기별 견적내역 조회 — 설계

## 배경

지금까지 견적은 기사가 모바일 앱에서 부품명·수량을 신청해야만(`quote_requests` 요청접수) 만들어졌다.
관리자가 기사 요청 없이 직접 새 견적을 발행하고 싶을 때가 있는데 그 경로가 없다. 또한 견적
발행/발송 내역을 볼 수 있는 곳이 "자재·견적 신청내역" 목록뿐이라, 현장 단위로 그 현장에 얽힌
모든 자료(고장·검사·부품교체·견적)를 한 곳에서 보고 싶다는 요구를 못 채운다.

## 1. 새 견적 발행 (자재·견적 신청내역)

**위치:** `app/components/admin/MaterialsAdmin.jsx`의 "견적요청" 섹션 헤더 옆(`:366` 부근)에
"새 견적 발행" 버튼 추가.

**흐름:**
1. 버튼 클릭 → 현장검색 모달(신설, 기존 `SiteSearchSelect`를 감싼 작은 모달) 오픈.
2. 현장 선택 → 그 즉시 `quote_requests`에 빈 행 하나를 만든다(호기·담당기사·부품명 전부 비움,
   기사 요청이 아니므로). id 생성 방식은 기존 기사 신청과 동일한 컨벤션(`"q" + Date.now()`)을
   따른다.
   ```js
   {
     id: "q" + Date.now(),
     site_id, site_name,
     elevator_no: null, unit_id: null,
     construction_type: null, contact_phone: null, note: null,
     engineer: null, requester_id: null,
     requested_date: TODAY_STR,
     status: "요청접수",
   }
   ```
3. 생성 직후 바로 기존 `QuoteItemsModal`을 그 행으로 연다(기존 "견적발행 처리" 버튼을 눌렀을 때와
   동일한 진입점 재사용 — `QuoteItemsModal` 자체는 수정 없음).
4. 이후 흐름(품목편집 → PDF 생성 → 발송)은 기사요청건과 완전히 동일.

**목록에서 구분:** 자재·견적 신청내역의 견적요청 표에서, `requesterId`와 `engineer`가 둘 다
비어있으면 "관리자발행" 배지를, 아니면 기존처럼 담당 기사 이름을 보여준다(새 DB 컬럼 없이 기존
필드로 판단 — 마이그레이션 불필요).

## 2. 호기별 견적내역 (현장정보 → 호기 상세창)

**위치:** `app/components/admin/SitesAdmin.jsx`의 `UnitDetailModal`(호기 클릭 시 뜨는 상세창) —
현재 탭 `["정보", "고장내역", "검사내역", "부품교체내역"]`에 **"견적내역"** 탭을 추가.

**필터 규칙:** 기존 고장내역/부품교체내역 탭과 정확히 같은 컨벤션을 그대로 쓴다 — 견적에
`unit_id`가 있으면 그 호기 것만, 없으면(관리자가 호기를 안 정한 경우 등) 그 현장 전체 것으로
fallback:
```js
const unitQuotes = quoteRequests.filter((q) => (q.unitId ? q.unitId === unit.id : q.siteId === site.id));
```
`UnitDetailModal`은 이미 `site` prop을 받고 있어 추가 조회 없이 바로 가능하다. 새로 필요한 건
`quoteRequests` prop 하나 — 호출부(`SitesAdmin.jsx:992` 부근)에서 `data.quoteRequests`를
내려주기만 하면 된다(AdminApp.jsx가 이미 전부 로드해둔 데이터, 새 쿼리 없음).

**표시 내용:** 같은 모달의 고장내역/부품교체내역 탭과 동일하게 **읽기전용 카드 목록**으로
충분하다(그 두 탭 다 클릭 상세보기가 없음 — 검사내역 탭만 부적합 상세용으로 예외적으로 클릭 가능,
견적은 그런 예외가 필요 없음). 카드에 표시: 상태(요청접수/견적발행/승인/자재지급완료="교체완료"),
견적명, 발행일, 발송여부(`emailSentAt`/`kakaoSentAt` 있으면 아이콘), PDF 링크(있으면 새 탭으로
열리는 `<a>`).

## 범위 밖

- 현장 단위(호기 구분 없는) 별도 통합 대시보드 — 이번엔 호기 상세창의 견적내역 탭까지만
- 견적 신규발행 시 호기를 함께 지정하는 UI — 필요해지면 나중에 추가(지금은 현장만 고름, 품목편집
  모달 안에서 항목별로 호기(unitNo) 텍스트를 자유 입력하는 기존 방식 그대로 사용)
