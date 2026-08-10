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
  contact: "T. 02-588-2384  P. 010-2939-2431  F. 02-588-2384",
  email: "E. guil2020@naver.com   E. guil2383@naver.com",
  ceo: "대표이사 신 석 주",
};
