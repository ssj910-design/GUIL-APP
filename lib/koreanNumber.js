// lib/koreanNumber.js
// 견적서의 "일금 OOO원정" 표기를 위한 숫자 → 한글 금액 변환.
const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL_UNITS = ["", "십", "백", "천"];
const BIG_UNITS = ["", "만", "억", "조"];

function fourDigitsToKorean(n) {
  if (n === 0) return "";
  const digits = String(n).padStart(4, "0").split("").map(Number);
  let str = "";
  digits.forEach((d, i) => {
    if (d === 0) return;
    str += DIGITS[d] + SMALL_UNITS[3 - i];
  });
  return str;
}

export function numberToKoreanWon(amount) {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return "일금 영원정";
  let remaining = n;
  const groups = [];
  while (remaining > 0) {
    groups.push(remaining % 10000);
    remaining = Math.floor(remaining / 10000);
  }
  let result = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupStr = fourDigitsToKorean(groups[i]);
    if (groupStr) result += groupStr + BIG_UNITS[i];
  }
  return `일금 ${result}원정`;
}
