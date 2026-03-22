/**
 * 本机一键：Docker 启动共用 PostgreSQL（映射宿主机端口），并确保存在 versecraft / oneapi 两库。
 *
 * 前提：Docker Desktop 已启动。
 *
 * 环境变量（均可选）：
 *   VERSECRAFT_PG_USER（默认 postgres）
 *   VERSECRAFT_PG_PASSWORD（默认 change_me，与文档示例一致）
 *   VERSECRAFT_PG_PORT（默认 5432；若占用可改为 5433）
 *   VERSECRAFT_PG_IMAGE（默认 postgres:16-alpine）
 *
 * 用法：pnpm postgres:local
 */
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CONTAINER = "versecraft-pg";

function run(cmd, inherit = true) {
  execSync(cmd, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    shell: true,
  });
}

function runOut(cmd, inherit = false) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    shell: true,
  }).trim();
}

function containerExists() {
  try {
    execSync(`docker inspect -f "{{.Id}}" ${CONTAINER}`, {
      encoding: "utf8",
      stdio: "pipe",
      shell: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** @param {string} user */
async function waitForPostgresReady(user) {
  const deadline = Date.now() + 90_000;
  let dots = false;
  while (Date.now() < deadline) {
    try {
      execSync(`docker exec ${CONTAINER} pg_isready -U ${user}`, {
        stdio: "pipe",
        shell: true,
      });
      if (dots) process.stdout.write("\n");
      return;
    } catch {
      if (!dots) {
        process.stdout.write("[postgres:local] 等待 PostgreSQL 就绪");
        dots = true;
      }
      process.stdout.write(".");
      await sleep(1000);
    }
  }
  if (dots) process.stdout.write("\n");
  throw new Error("[postgres:local] 超时：容器内 PostgreSQL 未就绪。");
}

async function main() {
  try {
    runOut("docker info");
  } catch {
    console.error(
      "[postgres:local] 无法连接 Docker 守护进程。请先启动 Docker Desktop，再执行本命令。"
    );
    process.exitCode = 1;
    return;
  }

  const user = process.env.VERSECRAFT_PG_USER || "postgres";
  const password = process.env.VERSECRAFT_PG_PASSWORD || "change_me";
  const port = process.env.VERSECRAFT_PG_PORT || "5432";
  const image = process.env.VERSECRAFT_PG_IMAGE || "postgres:16-alpine";

  if (!containerExists()) {
    console.log(`[postgres:local] 创建容器 ${CONTAINER}（镜像 ${image}，映射 ${port}:5432）…`);
    run(
      `docker run -d --name ${CONTAINER} -e POSTGRES_USER=${user} -e POSTGRES_PASSWORD=${password} -p ${port}:5432 ${image}`
    );
  } else {
    const running = runOut(`docker inspect -f "{{.State.Running}}" ${CONTAINER}`);
    if (running !== "true") {
      console.log(`[postgres:local] 启动已有容器 ${CONTAINER}…`);
      run(`docker start ${CONTAINER}`);
    } else {
      console.log(`[postgres:local] 容器 ${CONTAINER} 已在运行。`);
    }
  }

  await waitForPostgresReady(user);

  /** @param {string} db */
  function ensureDb(db) {
    if (!/^[a-zA-Z0-9_]+$/.test(db)) {
      throw new Error(`非法库名: ${db}`);
    }
    const q = runOut(
      `docker exec ${CONTAINER} psql -U ${user} -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'"`
    );
    if (q === "1") {
      console.log(`[postgres:local] 数据库 ${db} 已存在。`);
      return;
    }
    console.log(`[postgres:local] 创建数据库 ${db}…`);
    run(`docker exec ${CONTAINER} psql -U ${user} -d postgres -c "CREATE DATABASE ${db};"`);
  }

  ensureDb("versecraft");
  ensureDb("oneapi");

  console.log("");
  console.log("[postgres:local] 完成。连接串示例（密码含特殊字符时请自行 URL 编码）：");
  console.log(`  VerseCraft DATABASE_URL → postgresql://${user}:***@127.0.0.1:${port}/versecraft`);
  console.log(`  one-api SQL_DSN（宿主机跑网关）→ postgresql://${user}:***@127.0.0.1:${port}/oneapi`);
  if (port !== "5432") {
    console.log("");
    console.log(
      `[postgres:local] 提示：宿主机端口为 ${port}（因 5432 常被占用）。请把 DATABASE_URL / SQL_DSN 中的端口改为 ${port}。`
    );
  }
  console.log("");
  console.log("下一步：配置 one-api 与 .env.local，见 docs/local-one-api.md。");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
