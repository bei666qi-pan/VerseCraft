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

const CONTAINER = "versecraft-pg";

function run(cmd, inherit = true) {
  execSync(cmd, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    shell: true,
  });
}

function runOut(cmd) {
  return execSync(cmd, { encoding: "utf8", shell: true }).trim();
}

function containerExists() {
  try {
    runOut(`docker inspect -f "{{.Id}}" ${CONTAINER}`);
    return true;
  } catch {
    return false;
  }
}

function main() {
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
  console.log("");
  console.log("下一步：配置 one-api 与 .env.local，见 docs/local-one-api.md。");
}

main();
