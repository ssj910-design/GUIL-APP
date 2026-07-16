import JSZip from "jszip";
import { supabase } from "@/lib/supabaseClient";


// Supabase Storage의 "photos" 버킷에 사진을 업로드하고 공개 URL을 돌려줍니다.
const PHOTO_BUCKET = "photos";

export async function uploadPhoto(file, folder) {
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${folder}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file);
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


// 사진 URL을 실제 파일로 다운로드합니다 (교차 출처라 <a download>만으로는 강제 다운로드가 안 되어, blob으로 받아서 내려줍니다).
export async function downloadPhoto(url, filename) {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}


// 여러 장을 순차적으로 개별 다운로드하면 모바일 브라우저(특히 iOS/Android)가 첫 장 이후는
// 사용자 제스처로 인정하지 않고 막아버려서, 하나의 zip 파일로 묶어 한 번만 다운로드합니다.
export async function downloadPhotosAsZip(urls, zipName, baseName) {
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
  URL.revokeObjectURL(objectUrl);
}
