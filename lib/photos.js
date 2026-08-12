import JSZip from "jszip";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabaseClient";


// Supabase Storage의 "photos" 버킷에 사진을 업로드하고 공개 URL을 돌려줍니다.
const PHOTO_BUCKET = "photos";
const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15MB — 최신 폰 고화질 사진도 여유있게, 그 이상은 비정상

// 무료 플랜(Storage 1GB) 용량 절약용 — 요즘 폰카메라는 원본이 10MB 넘는 경우가 흔한데,
// 현장 사진은 그 정도 해상도가 필요 없다. JPEG 85%면 PCB 기판·명판 글씨를 확대해서
// 읽는 데는 지장 없으면서 용량은 크게 줄어든다. 화질은 비교적 여유 있게 잡았다.
// 긴 변은 2400px였다가 1600px로 낮췄다 — 이 웹뷰의 canvas.toBlob(JPEG 인코딩) 자체가
// 픽셀 수에 비례해 유난히 느려서(2400px에서 실측 13초) 인코딩 시간을 줄이려는 것.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

// data: URL(base64)을 Blob으로 바꾼다 — fetch() 없이 직접 디코딩(같은 프로세스 안이라
// 네트워크 왕복이 필요 없다).
function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// 실패하면(디코딩 안 되는 포맷 등) 원본 그대로 올린다 — 압축은 최적화일 뿐 업로드를
// 막을 이유가 아니다.
//
// createImageBitmap에 imageOrientation을 뭘 넘기든(옵션 없음/"none"/"from-image")
// 이 웹뷰는 실측상 항상 EXIF를 반영해서 이미 올바른 방향으로 디코딩해서 준다 — 그
// 위에 수동으로 또 돌리면 이중회전이 나서(세로사진이 누움), 수동 회전은 하지 않는다.
// canvas.toBlob()의 콜백이 이미지 크기와 무관하게 항상 13초쯤 걸리는 게 실측으로
// 확인됐다(픽셀 수를 44%로 줄여도 그대로) — 콜백 디스패치 쪽 버그로 보여, 동기
// 방식인 toDataURL로 바꿔서 그 지연을 피한다.
// steps: 임시 진단용 — 각 단계 소요시간(ms)을 담아준다. 원인 확인되면 제거.
async function compressImage(file, steps = []) {
  try {
    let t = Date.now();
    const bitmap = await createImageBitmap(file);
    steps.push([`디코딩(${bitmap.width}x${bitmap.height})`, Date.now() - t]); t = Date.now();
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    steps.push(["캔버스그리기", Date.now() - t]); t = Date.now();
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const blob = dataUrlToBlob(dataUrl);
    steps.push(["JPEG인코딩(toDataURL)", Date.now() - t]);
    if (!blob || blob.size >= file.size) return file; // 압축이 오히려 더 크면 원본 유지
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadPhoto(file, folder) {
  if (!file.type?.startsWith("image/") && file.type !== "application/pdf") throw new Error("이미지 또는 PDF 파일만 업로드할 수 있습니다.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("파일 용량이 너무 큽니다 (최대 15MB).");
  // 임시 진단용 타이밍 로그 — 원인 확인되면 제거.
  const t0 = Date.now();
  const steps = [];
  const upload = await compressImage(file, steps);
  const t1 = Date.now();
  const safeName = upload.name.replace(/[^\w.\-]/g, "_");
  const path = `${folder}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, upload);
  const t2 = Date.now();
  alert(
    `[진단] 원본 ${(file.size / 1024 / 1024).toFixed(1)}MB → 압축본 ${(upload.size / 1024 / 1024).toFixed(1)}MB\n` +
    steps.map(([label, ms]) => `${label}: ${ms}ms`).join("\n") +
    `\n압축 전체: ${t1 - t0}ms\n업로드: ${t2 - t1}ms`
  );
  if (error) throw error;
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}


// 파일 이름에 쓸 수 없는 문자(경로 구분자 등)를 안전한 문자로 바꿔줍니다.
export function sanitizeFilename(str) {
  return String(str ?? "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_");
}


// URL의 확장자를 그대로 유지해서 다운로드 파일에 붙여줍니다.
export function extOf(url) {
  const m = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(url);
  return m ? m[1] : "png";
}


// 앱(Android WebView)은 blob: URL 다운로드를 받아주는 다운로드 매니저가 기본적으로 없다.
// MainActivity.java에 등록해둔 WebView.setDownloadListener가 Content-Disposition:
// attachment로 응답하는 URL만 안드로이드 DownloadManager로 넘겨받는데, Supabase
// Storage는 ?download= 파라미터를 붙이면 그 헤더로 응답해준다 — 앱 밖으로 안 나가고
// 바로 다운로드된다. 브라우저의 <a download>와 달리 안드로이드 DownloadManager는
// 여러 번 연달아 걸어도 두 번째부터 막지 않아서, 여러 장 다운로드도 이걸 반복 호출하면 된다.
function nativeDownload(url, filename) {
  const sep = url.includes("?") ? "&" : "?";
  const a = document.createElement("a");
  a.href = `${url}${sep}download=${encodeURIComponent(filename)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 사진 URL을 실제 파일로 다운로드합니다 (교차 출처라 <a download>만으로는 강제 다운로드가 안 되어, blob으로 받아서 내려줍니다).
export async function downloadPhoto(url, filename) {
  if (Capacitor.isNativePlatform()) {
    nativeDownload(url, filename);
    return;
  }
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 클릭 직후 바로 revoke하면 브라우저가 실제 다운로드를 채 시작하기 전에 objectUrl이
  // 무효화돼 다운로드가 조용히 실패하는 경우가 있다(특히 모바일) — 한 박자 늦춘다.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}


// 여러 장을 순차적으로 개별 다운로드하면 모바일 브라우저(특히 iOS/Android)가 첫 장 이후는
// 사용자 제스처로 인정하지 않고 막아버려서, 하나의 zip 파일로 묶어 한 번만 다운로드합니다.
export async function downloadPhotosAsZip(urls, zipName, baseName) {
  if (Capacitor.isNativePlatform()) {
    // zip은 앱 안에서 만든 메모리상 blob이라 다운로드 리스너가 잡을 실제 URL이 없다 —
    // 대신 이미 되는 개별 다운로드(nativeDownload)를 한 장씩 순서대로 호출한다.
    for (let i = 0; i < urls.length; i++) {
      nativeDownload(urls[i], `${baseName}_${i + 1}.${extOf(urls[i])}`);
      await new Promise((r) => setTimeout(r, 150));
    }
    return;
  }
  const zip = new JSZip();
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    const blob = await res.blob();
    zip.file(`${baseName}_${i + 1}.${extOf(urls[i])}`, blob);
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const objectUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
