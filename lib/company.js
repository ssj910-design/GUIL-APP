// lib/company.js
// 회사 정보 상수 — 앱 곳곳에 흩어져 있던 회사명·표기를 여기 한 곳으로 모은다.
//
// ⚠️ 화이트라벨(타사 입주) 준비: 화면에 회사 이름이 보이는 자리는 전부 이 파일을 import해서
// 쓴다. 나중에 테넌트별로 갈아끼울 때 "여기만 DB(tenants)에서 읽어오게" 바꾸면 화면 코드는
// 손대지 않아도 된다. 새 코드에 회사명을 직접 타이핑하지 말 것 (docs/design/04-snapshot.html의
// 스캐너가 하드코딩을 계속 추적한다).
//
// quotePdf.js(서버 전용, fs/path 의존)에서 분리해 둔 파일이라 클라이언트에서도 안전하게
// import할 수 있다 — quotePdf를 통째로 가져오면 fs가 클라이언트 번들에 딸려와 빌드가 깨진다.

// 화면 표기용 — 헤더·로그인·콘솔 사이드바·PWA 이름·메일 발신자 등
export const BRAND = {
  name: "구일엘리베이터(주)",   // 정식 표기 (화면 타이틀)
  short: "구일엘리베이터",       // 짧은 표기 (PWA short_name, 이미지 alt)
  shortEn: "구일E/L",           // 문서 본문에서 줄여 쓰는 표기 (견적서 특이사항 등)
  appTitle: "현장관리",          // 서비스 이름 — 회사명과 조합해서 쓴다
  legal: "구일엘리베이터 주식회사", // 문서 하단 법인 정식 표기
  code: "GUIL",                 // 시스템 식별자 접두어 (공단 제출 COMPANY_UNIQUE_NO 등)
  // 브랜딩 자산 — public/ 안의 파일 경로. 타사는 이 파일들을 갈아끼우거나(단순) 나중에
  // 테넌트별 Storage URL로 바꾼다(멀티테넌트). 파일이 없으면 각 생성기가 알아서 건너뛴다.
  assets: {
    icon: "public/guil-icon.png",   // 견적서 헤더 로고
    seal: "public/guil-seal.png",   // 견적서 직인
    card: "public/guil-card.jpg",   // 메일 하단 명함 이미지
  },
};

// 문서(견적서·메일) 발행용 법인 정보 — 사업자등록증 기재 사항
export const COMPANY = {
  name: "구일엘리베이터㈜",
  regNo: "등록번호. 119-86-31892",
  bizType: "업태. 서비스업  종목. 승강기유지관리,보수,설치공사",
  address: "서울특별시 금천구 가산디지털1로 75-24 아이에스비즈타워 909호",
  contact: "T. 02-588-2384  P. 010-2939-2431  F. 02-525-2475",
  email: "E. guil2020@naver.com   E. guil2383@naver.com",
  ceo: "대표이사 신 석 주",
};

// 청구서 입금계좌 — 무자료 건 청구서 발송용.
export const BANK_ACCOUNT = {
  bank: "NH농협은행",
  number: "302-1863-9964-21",
  holder: "신석주",
};

// 견적서 양식에 고정으로 박히는 "특이사항" 조항 — lib/quotePdf.js(PDF)와 견적 승인
// 페이지(app/quote-approve) 요약 양쪽에서 같은 문구를 써야 해서 여기로 뺐다. 견적마다
// 관리자가 따로 적는 자유 텍스트(quote_requests.notice_message)와는 다른, 항상 붙는 약관이다.
export const QUOTE_NOTES = [
  { text: "교체된 부품 보증기간은 1년입니다.", emphasis: false },
  {
    text: `폐기물처리관리법에 의거해 교체된 불량 PCB류, 로프, 벨트, 풀리, 쉬브, 모터ASSY 등은 환경보호 및 임의 수리 재사용 시 품질 신뢰성 등 안전상의 목적으로 전량 회수를 원칙으로 하며, 본 견적서에 동의함으로써 ${BRAND.shortEn}의 폐부품 무상수거에 동의합니다.`,
    emphasis: true,
  },
  {
    text: "작업은 당사의 평일 근무시간(월~금, 09:00~17:30)에 실시하며, 근무시간 외 작업 요청 시 구간별 인건비(평일근무시간 인건비×1.5)가 가산됩니다.",
    emphasis: false,
  },
];
