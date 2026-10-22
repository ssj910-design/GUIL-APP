import { BRAND, COMPANY } from "@/lib/company";
import { Doc, H2, P, UL } from "./Doc";

export const metadata = {
  title: `${BRAND.name} — 승강기 유지관리·보수·설치`,
  description: `${BRAND.name}는 승강기 유지관리, 보수, 설치공사를 하는 서울 금천구 소재 회사입니다.`,
};

export default function CompanyPage() {
  return (
    <Doc title={BRAND.name}>
      <P>{BRAND.name}는 승강기 유지관리·보수·설치공사 전문 회사로, 건물주와 관리 주체가 승강기를 안전하게 운행하도록 정기점검·고장 출동·부품 교체·법정 검사 대행을 맡고 있습니다.</P>

      <H2>사업 분야</H2>
      <UL items={["승강기 유지관리(정기 점검, 고장 출동)", "부품 교체·보수 공사", "승강기 설치공사", "법정 검사 일정 관리 및 대행"]} />

      <H2>{BRAND.appTitle} 앱</H2>
      <P>당사 소속 기사와 관리자가 쓰는 모바일 앱입니다. 고장 접수·배정, 점검 기록, 자재 신청, 비용 청구, 근태 관리를 하나의 앱에서 처리해 현장 대응 속도를 높이기 위해 직접 운영합니다. 앱 이용에는 당사가 발급한 계정이 필요합니다.</P>

      <H2>회사 정보</H2>
      <dl className="text-sm leading-7 text-slate-700 grid grid-cols-[7rem_1fr] gap-y-1">
        <dt className="font-bold">상호</dt><dd>{COMPANY.name}</dd>
        <dt className="font-bold">대표자</dt><dd>{COMPANY.ceo.replace("대표이사 ", "").replace(/ /g, "")}</dd>
        <dt className="font-bold">사업자등록번호</dt><dd>{COMPANY.regNo.replace("등록번호. ", "")}</dd>
        <dt className="font-bold">업태·종목</dt><dd>서비스업 · 승강기유지관리, 보수, 설치공사</dd>
        <dt className="font-bold">주소</dt><dd>{COMPANY.address}</dd>
        <dt className="font-bold">전화</dt><dd>02-588-2384</dd>
        <dt className="font-bold">이메일</dt><dd>guil2020@naver.com</dd>
      </dl>
    </Doc>
  );
}
