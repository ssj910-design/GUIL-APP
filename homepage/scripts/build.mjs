import { mkdir, copyFile, cp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(`${root}public`, {recursive:true, force:true});
await mkdir(`${root}public`, {recursive:true});
const files = [...(await readdir(root)).filter(file => file.endsWith('.html')), 'styles.css','site.js','home.css','home.js','services.css','services.js','contact.css','robots.txt','sitemap.xml'];
const assets = new Set();
const inquiryDialog = await readFile(`${root}partials/inquiry-dialog.html`, 'utf8');
const serviceNames = ['maintenance', 'replacement', 'remodeling', 'safety', 'installation'];
const servicePanels = [];
for (const [index, name] of serviceNames.entries()) {
  // Use the reviewed detail content as the single source for the tab panels.
  const source = await readFile(`${root}${name}.html`, 'utf8');
  const intro = source.match(/<h1>(.*?)<\/h1><p>(.*?)<\/p>/);
  const detail = source.match(/<div class="detail-wrap">([\s\S]*)<\/div><\/main>/);
  if (!intro || !detail) throw new Error(`Service content missing: ${name}`);
  const content = detail[1]
    .replace(/<(\/?)(h[23])\b/g, (_, close, tag) => `<${close}h${Number(tag[1]) + 1}`)
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${name}-${id}"`)
    .replace(/href="(?:\/)?services\.html#([^"]+)"/g, 'href="#$1"');
  servicePanels.push(`<section class="service-panel" id="${name}" data-service-panel aria-labelledby="service-${name}-title"><div class="service-panel-heading"><span class="service-panel-number">${String(index + 1).padStart(2, '0')}</span><h2 id="service-${name}-title">${intro[1]}</h2><p>${intro[2]}</p></div>${content}</section>`);
}
for (const file of files) {
  let source = await readFile(`${root}${file}`, 'utf8');
  if (file === 'services.html') {
    if (!source.includes('<!-- SERVICE_PANELS -->')) throw new Error('Service panel placeholder missing');
    source = source.replace('<!-- SERVICE_PANELS -->', servicePanels.join('\n'));
  }
  // Share one accessible form across the homepage and its detail pages.
  if (file.endsWith('.html') && /src="site\.js(?:\?[^"\s]*)?"/.test(source)) {
    source = source.replace('</body>', `${inquiryDialog}\n</body>`);
  }
  for (const match of source.matchAll(/\bassets\/([a-zA-Z0-9][a-zA-Z0-9._-]*)/g)) assets.add(match[1]);
  await writeFile(`${root}public/${file}`, source);
}
await mkdir(`${root}public/assets`, {recursive:true});
for (const file of assets) {
  // A missing referenced asset fails the build instead of shipping a broken image.
  await copyFile(`${root}assets/${file}`, `${root}public/assets/${file}`);
}
console.log(`Homepage static files prepared with ${assets.size} referenced assets. Unused assets, server code and packages excluded.`);
// Standalone client review. Not linked from the homepage or included in its sitemap.
// Remove this copy step and kv-preview/ together after the concept is reviewed.
await cp(`${root}kv-preview`, `${root}public/kv-preview`, {recursive:true, filter: source => !source.endsWith('README.md')});
