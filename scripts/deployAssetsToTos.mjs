/**
 * 把 public/assets 下的静态图片（NPC 头像、序章卡片背景等）上传到火山引擎 TOS，
 * 供 CDN 加速域名回源使用。按需运行，不是 build/部署流程的一部分。
 *
 * 用法：VOLC_AK=... VOLC_SK=... VOLC_REGION=... node scripts/deployAssetsToTos.mjs
 * （不要把凭证写进这个文件；本地可从「部署凭证.txt」手动 export 后再跑）
 *
 * 依赖 @volcengine/tos-sdk（TOS 走独立的 TOS4-HMAC-SHA256 数据面协议，
 * 跟 scripts/autoops/lib/volc-openapi.mjs 里 ECS/CDN 用的通用 OpenAPI 签名不是一回事，
 * 不能复用同一个签名器）。
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { TosClient } from "@volcengine/tos-sdk";

const AK = process.env.VOLC_AK;
const SK = process.env.VOLC_SK;
const REGION = process.env.VOLC_REGION || "cn-shanghai";
const BUCKET = process.env.VOLC_TOS_ASSETS_BUCKET || `versecraft-assets-${REGION}`;

if (!AK || !SK) {
  console.error("缺少 VOLC_AK / VOLC_SK 环境变量。");
  process.exit(1);
}

const client = new TosClient({
  accessKeyId: AK,
  accessKeySecret: SK,
  region: REGION,
  endpoint: `tos-${REGION}.volces.com`,
  secure: true,
});

const CONTENT_TYPE_BY_EXT = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const SOURCE_DIRS = ["npc-avatars", "intro", "brand"];
const ASSETS_ROOT = path.join(process.cwd(), "public/assets");

async function ensureBucket() {
  const exists = await client.doesBucketExist({ bucket: BUCKET });
  if (exists) {
    console.log(`bucket ${BUCKET} 已存在，跳过创建。`);
    return;
  }
  await client.createBucket({ bucket: BUCKET, acl: "public-read" });
  console.log(`已创建 bucket ${BUCKET}（region=${REGION}, acl=public-read）。`);
}

async function uploadDir(dirName) {
  const dirPath = path.join(ASSETS_ROOT, dirName);
  let files;
  try {
    files = await readdir(dirPath);
  } catch {
    console.log(`跳过不存在的目录: ${dirName}`);
    return { uploaded: 0, skipped: 0 };
  }

  let uploaded = 0;
  let skipped = 0;
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext];
    if (!contentType) {
      skipped += 1;
      continue;
    }
    const key = `${dirName}/${file}`;
    const body = await readFile(path.join(dirPath, file));
    await client.putObject({
      bucket: BUCKET,
      key,
      body,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
      acl: "public-read",
    });
    uploaded += 1;
    console.log(`上传完成: ${key} (${(body.length / 1024).toFixed(0)}KB)`);
  }
  return { uploaded, skipped };
}

async function main() {
  await ensureBucket();
  let totalUploaded = 0;
  let totalSkipped = 0;
  for (const dir of SOURCE_DIRS) {
    const { uploaded, skipped } = await uploadDir(dir);
    totalUploaded += uploaded;
    totalSkipped += skipped;
  }
  console.log(`\n完成：上传 ${totalUploaded} 个对象，跳过 ${totalSkipped} 个非图片文件。`);
  console.log(`bucket: ${BUCKET}（region=${REGION}）`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
