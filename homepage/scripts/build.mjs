import { mkdir, copyFile, cp, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(`${root}public`, {recursive:true, force:true});
await mkdir(`${root}public`, {recursive:true});
for (const file of [...(await readdir(root)).filter(file => file.endsWith('.html')), 'styles.css','site.js','robots.txt','sitemap.xml']) {
  await copyFile(`${root}${file}`, `${root}public/${file}`);
}
await cp(`${root}assets`, `${root}public/assets`, {recursive:true});
console.log('Homepage static files prepared. Server code and packages excluded from public output.');
