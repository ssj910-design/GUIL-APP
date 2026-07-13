export default function manifest() {
  return {
    name: "구일엘리베이터(주) 현장관리",
    short_name: "구일엘리베이터",
    description: "승강기 유지보수 현장관리 앱",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#172554",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
