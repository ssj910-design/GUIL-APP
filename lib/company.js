// lib/company.js
// 회사 정보 상수 — lib/quotePdf.js(서버 전용, fs/path 의존)에서 분리해 별도 파일에 둔다.
// QuoteSendModal.jsx 같은 클라이언트 컴포넌트가 이 상수만 필요할 때 quotePdf.js를 통째로
// import하면 fs/path가 클라이언트 번들에 딸려 들어와 빌드가 깨진다.
export const COMPANY = {
  name: "구일엘리베이터㈜",
  regNo: "등록번호. 119-86-31892",
  bizType: "업태. 서비스업  종목. 승강기유지관리,보수,설치공사",
  address: "서울특별시 금천구 가산디지털1로 75-24 아이에스비즈타워 909호",
  contact: "T. 02-588-2384  P. 010-2939-2431  F. 02-588-2384",
  email: "E. guil2020@naver.com   E. guil2383@naver.com",
  ceo: "대표이사 신 석 주",
};
