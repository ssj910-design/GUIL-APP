import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(`${root}public`, {recursive:true, force:true});
await mkdir(`${root}public`, {recursive:true});
for (const file of ['index.html','styles.css','site.js','privacy.html','robots.txt','sitemap.xml']) {
  await copyFile(`${root}${file}`, `${root}public/${file}`);
}
await cp(`${root}assets`, `${root}public/assets`, {recursive:true});
console.log('Homepage static files prepared. Server code and packages excluded from public output.');
