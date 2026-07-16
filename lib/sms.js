
// 실제 SMS 게이트웨이 연동 전이라, 발송 자체는 콘솔 로그로 시뮬레이션합니다.
export function simulateSms(phone, message) {
  console.log(`[SMS 발송 시뮬레이션] ${phone ?? "번호 없음"} → ${message}`);
}
