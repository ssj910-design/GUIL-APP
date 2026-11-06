import { mkdir, copyFile, rm, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(`${root}public`, {recursive:true, force:true});
await mkdir(`${root}public`, {recursive:true});
const files = [...(await readdir(root)).filter(file => file.endsWith('.html')), 'styles.css','site.js','home.css','home.js','robots.txt','sitemap.xml'];
const assets = new Set();
for (const file of files) {
  const source = await readFile(`${root}${file}`, 'utf8');
  for (const match of source.matchAll(/\bassets\/([a-zA-Z0-9][a-zA-Z0-9._-]*)/g)) assets.add(match[1]);
  await copyFile(`${root}${file}`, `${root}public/${file}`);
}
await mkdir(`${root}public/assets`, {recursive:true});
for (const file of assets) {
  // A missing referenced asset fails the build instead of shipping a broken image.
  await copyFile(`${root}assets/${file}`, `${root}public/assets/${file}`);
}
console.log(`Homepage static files prepared with ${assets.size} referenced assets. Unused assets, server code and packages excluded.`);
