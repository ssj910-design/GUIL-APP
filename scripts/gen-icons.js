const sharp = require("sharp");
const path = require("path");

const svgPath = path.join(__dirname, "icon.svg");
const publicDir = path.join(__dirname, "..", "public");

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

async function run() {
  for (const t of targets) {
    await sharp(svgPath).resize(t.size, t.size).png().toFile(path.join(publicDir, t.file));
    console.log("wrote", t.file);
  }
}

run();
