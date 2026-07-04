/**
 * 一次性/按需运行的静态图片瘦身脚本：把 public/assets 下的原始 PNG/JPG
 * 转成 AVIF/WebP 多密度档位，并把 fallback 位图缩小到实际展示尺寸附近
 * （原图普遍是 941x1672 的 AI 生图分辨率，展示框只有 82~92 CSS px 宽，
 * 原图直出是当前最大的体积浪费来源）。
 *
 * 用法：pnpm images:optimize
 *
 * 不是 build 步骤的一部分——静态素材改动频率低，生成结果直接提交到仓库，
 * 生产环境不跑 sharp、不新增运行时依赖。
 */
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const NPC_AVATAR_DIR = path.join(PUBLIC_DIR, "assets/npc-avatars");
const INTRO_DIR = path.join(PUBLIC_DIR, "assets/intro");

// 图鉴头像展示框 82~92 CSS px 宽（见 MobileCodexPanel.tsx），按 1x/2x/3x 密度出档。
const AVATAR_DENSITY_WIDTHS: Record<string, number> = { "1x": 96, "2x": 192, "3x": 288 };
// 序章世界观卡片背景，按常见移动端视口宽度出档（w 描述符 + sizes，非密度描述符）。
const INTRO_WIDTHS = [480, 720, 940];

async function processAvatar(file: string): Promise<{ before: number; after: number }> {
  const id = path.basename(file, ".png");
  const input = path.join(NPC_AVATAR_DIR, file);
  const before = (await stat(input)).size;
  const source = sharp(input);

  for (const [tier, width] of Object.entries(AVATAR_DENSITY_WIDTHS)) {
    const resized = source.clone().resize({ width, withoutEnlargement: true });
    await resized.clone().avif({ quality: 50, effort: 4 }).toFile(path.join(NPC_AVATAR_DIR, `${id}@${tier}.avif`));
    await resized.clone().webp({ quality: 74 }).toFile(path.join(NPC_AVATAR_DIR, `${id}@${tier}.webp`));
  }

  // fallback PNG 就地缩小到最大密度档（288w），供不支持 avif/webp 的旧浏览器兜底。
  const tmpPath = `${input}.tmp`;
  await source
    .clone()
    .resize({ width: AVATAR_DENSITY_WIDTHS["3x"], withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(tmpPath);
  await rename(tmpPath, input);

  const after = (await stat(input)).size;
  return { before, after };
}

async function processIntroBackground(file: string): Promise<{ before: number; after: number }> {
  const ext = path.extname(file);
  const id = path.basename(file, ext);
  const input = path.join(INTRO_DIR, file);
  const before = (await stat(input)).size;
  const source = sharp(input);

  for (const width of INTRO_WIDTHS) {
    const resized = source.clone().resize({ width, withoutEnlargement: true });
    await resized.clone().avif({ quality: 48, effort: 4 }).toFile(path.join(INTRO_DIR, `${id}-${width}w.avif`));
    await resized.clone().webp({ quality: 72 }).toFile(path.join(INTRO_DIR, `${id}-${width}w.webp`));
  }

  // fallback JPG 就地缩小到最大档位，供不支持 avif/webp 的旧浏览器兜底。
  const tmpPath = `${input}.tmp`;
  await source
    .clone()
    .resize({ width: INTRO_WIDTHS[INTRO_WIDTHS.length - 1], withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(tmpPath);
  await rename(tmpPath, input);

  const after = (await stat(input)).size;
  return { before, after };
}

async function main(): Promise<void> {
  await mkdir(NPC_AVATAR_DIR, { recursive: true });
  const avatarFiles = (await readdir(NPC_AVATAR_DIR)).filter(
    (f) => f.endsWith(".png") && /^[AN]-\d+\.png$/.test(f)
  );

  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of avatarFiles) {
    const { before, after } = await processAvatar(file);
    totalBefore += before;
    totalAfter += after;
    console.log(`[avatar] ${file}: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB (fallback png)`);
  }

  const introFiles = (await readdir(INTRO_DIR)).filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg"));
  for (const file of introFiles) {
    const { before, after } = await processIntroBackground(file);
    totalBefore += before;
    totalAfter += after;
    console.log(`[intro] ${file}: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB (fallback jpg)`);
  }

  console.log(
    `\n合计 fallback 位图: ${(totalBefore / 1024 / 1024).toFixed(1)}MB -> ${(totalAfter / 1024 / 1024).toFixed(1)}MB` +
      `（另外为每张图生成了 avif/webp 多密度档位，未计入以上合计）`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
