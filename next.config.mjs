/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false, // 개발 서버의 좌하단 N 버튼 숨김
  // 시큐어코딩: 클릭재킹/MIME스니핑/리퍼러 유출 방어. CSP는 제외 —
  // ponytail: 외부 스크립트(Tmap SDK 등) 도메인을 다 확인 못해 블라인드로 넣으면 운영 앱이 깨질 위험이 큼.
  //           전체 도메인 목록 확인 후 별도로 추가.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
