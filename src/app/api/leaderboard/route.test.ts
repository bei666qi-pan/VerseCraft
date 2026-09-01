import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import {
  parseOutcome,
  parseGrade,
  parsePage,
  parseLimit,
  parseLeaderboardQueryFromSearchParams,
  LEADERBOARD_MAX_LIMIT,
  LEADERBOARD_DEFAULT_LIMIT,
} from "./route.parseQuery";
import { clampLeaderboardOffset } from "@/lib/leaderboard/utils";

// ---------- 入参解析纯函数 ----------

test("parseOutcome accepts only the three known values", () => {
  assert.equal(parseOutcome("died"), "died");
  assert.equal(parseOutcome("survived"), "survived");
  assert.equal(parseOutcome("escaped"), "escaped");
  assert.equal(parseOutcome("Died"), null);
  assert.equal(parseOutcome("foo"), null);
  assert.equal(parseOutcome(null), null);
  assert.equal(parseOutcome(""), null);
});

test("parseGrade accepts only the six known grades", () => {
  for (const g of ["S", "A", "B", "C", "D", "E"] as const) {
    assert.equal(parseGrade(g), g);
  }
  assert.equal(parseGrade("s"), null);
  assert.equal(parseGrade("F"), null);
  assert.equal(parseGrade(""), null);
  assert.equal(parseGrade(null), null);
});

test("parsePage defaults to 1 for invalid input", () => {
  assert.equal(parsePage(null), 1);
  assert.equal(parsePage(""), 1);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("-2"), 1);
  assert.equal(parsePage("foo"), 1);
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage("3.7"), 3);
});

test("parseLimit defaults to 25 and clamps to LEADERBOARD_MAX_LIMIT", () => {
  assert.equal(parseLimit(null), 25);
  assert.equal(parseLimit("0"), 25);
  assert.equal(parseLimit("-1"), 25);
  assert.equal(parseLimit("999"), LEADERBOARD_MAX_LIMIT);
  assert.equal(parseLimit("10"), 10);
  assert.equal(parseLimit(`${LEADERBOARD_MAX_LIMIT + 1}`), LEADERBOARD_MAX_LIMIT);
});

test("parseLeaderboardQueryFromSearchParams composes all helpers and offsets", () => {
  const params = new URLSearchParams("outcome=died&grade=S&page=3&limit=15");
  assert.deepEqual(parseLeaderboardQueryFromSearchParams(params), {
    outcome: "died",
    grade: "S",
    page: 3,
    limit: 15,
    offset: clampLeaderboardOffset((3 - 1) * 15),
  });
  assert.equal(LEADERBOARD_DEFAULT_LIMIT, 25);
});

test("parseLeaderboardQueryFromSearchParams ignores invalid outcome/grade silently", () => {
  const params = new URLSearchParams("outcome=unknown&grade=Z");
  const r = parseLeaderboardQueryFromSearchParams(params);
  assert.equal(r.outcome, null);
  assert.equal(r.grade, null);
});

// ---------- 端点测试（鉴权 + 降级） ----------
// 通过 Module._load monkey-patch + mutable reference 替换 auth() 与 fetchLeaderboardEntries，
// 避免 Node 模块缓存把首次 stub 固化到 route.ts 模块对象。

type RouteHandlers = {
  GET: (req: Request) => Promise<Response>;
};

type AuthStub = () => Promise<{ user?: { id?: string | null } | null } | null>;
type RepositoryStub = (q: unknown) => Promise<unknown>;

let routeHandlers: RouteHandlers | null = null;

// 进程级 mutable 引用；route.ts 内部 import 固定持有 authRef/repositoryRef 对象，
// 我们只换它们的 .current，让每次测试都能控制返回值。
const authRef: { current: AuthStub } = { current: async () => null };
const repositoryRef: { current: RepositoryStub } = { current: async () => [] };

let loadPatchInstalled = false;

function installLoadPatch() {
  if (loadPatchInstalled) return;
  const moduleWithLoad = Module as unknown as {
    _load: (request: string, parent?: unknown, isMain?: boolean) => unknown;
  };
  const originalLoad = moduleWithLoad._load;
  moduleWithLoad._load = function patchedLoad(
    this: unknown,
    request: string,
    parent?: unknown,
    isMain?: boolean
  ) {
    let resolved = "";
    try {
      const resolver = (Module as unknown as {
        _resolveFilename: (req: string, par?: unknown, main?: boolean) => string;
      })._resolveFilename;
      resolved = resolver.call(Module, request, parent, isMain);
    } catch {
      // 解析失败时退化到字面字符串。
    }
    const sep = path.sep;
    if (resolved && resolved.endsWith(`${sep}auth.ts`)) {
      // 惰性 getter：route.ts 模块缓存不会在 import 那一刻固化 authRef.current，
      // 每次 route.ts 内部访问 .auth 时才取最新 stub。
      return { get auth() { return authRef.current; } } as unknown as {
        auth: AuthStub;
      };
    }
    if (resolved && resolved.endsWith(`${sep}leaderboard${sep}repository.ts`)) {
      return {
        get fetchLeaderboardEntries() {
          return repositoryRef.current;
        },
      } as unknown as { fetchLeaderboardEntries: RepositoryStub };
    }
    // 兜底：字面字符串（防止 tsx 别名解析差异）。
    if (request === "../../../../auth") {
      return { get auth() { return authRef.current; } } as unknown as {
        auth: AuthStub;
      };
    }
    if (request === "@/lib/leaderboard/repository") {
      return {
        get fetchLeaderboardEntries() {
          return repositoryRef.current;
        },
      } as unknown as { fetchLeaderboardEntries: RepositoryStub };
    }
    return originalLoad.apply(this, [request, parent, isMain]);
  } as typeof originalLoad;
  loadPatchInstalled = true;
}

async function withStubs<T>(
  authStub: AuthStub,
  repositoryStub: RepositoryStub,
  fn: () => Promise<T>
): Promise<T> {
  installLoadPatch();
  authRef.current = authStub;
  repositoryRef.current = repositoryStub;
  try {
    return await fn();
  } finally {
    authRef.current = async () => null;
    repositoryRef.current = async () => [];
  }
}

async function loadRoute(): Promise<RouteHandlers> {
  installLoadPatch();
  if (!routeHandlers) {
    const mod = await import("./route");
    routeHandlers = { GET: mod.GET as unknown as RouteHandlers["GET"] };
  }
  return routeHandlers;
}

test("GET /api/leaderboard returns requiresLogin when unauthenticated", async () => {
  await withStubs(async () => null, async () => [], async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://127.0.0.1/api/leaderboard"));
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("cache-control")?.includes("max-age=30"));
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.degraded, false);
    assert.equal(body.reason, null);
    assert.equal(body.data.requiresLogin, true);
    assert.deepEqual(body.data.entries, []);
    assert.equal(body.data.page, 1);
    assert.equal(body.data.limit, 25);
  });
});

test("GET /api/leaderboard returns entries on success", async () => {
  await withStubs(
    async () => ({ user: { id: "oidc-abc123" } }),
    async () => [
      {
        rank: 1,
        userId: "oidc-abc123",
        displayName: "匿名旅人 #oidc-abc",
        grade: "S",
        maxFloorScore: 99,
        maxFloorLabel: "第十层",
        survivalTimeSeconds: 12345,
        killedAnomalies: 7,
        profession: "守夜人",
        outcome: "escaped",
        createdAt: "2026-08-01T10:00:00.000Z",
      },
    ],
    async () => {
      const { GET } = await loadRoute();
      const res = await GET(new Request("http://127.0.0.1/api/leaderboard?outcome=escaped"));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.data.requiresLogin, false);
      assert.equal(body.data.entries.length, 1);
      assert.equal(body.data.entries[0].grade, "S");
      assert.equal(body.data.entries[0].outcome, "escaped");
    }
  );
});

test("GET /api/leaderboard returns degraded when repository throws", async () => {
  await withStubs(
    async () => ({ user: { id: "oidc-abc123" } }),
    async () => {
      throw new Error("db down");
    },
    async () => {
      const { GET } = await loadRoute();
      const res = await GET(new Request("http://127.0.0.1/api/leaderboard"));
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("cache-control")?.includes("max-age=10"));
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.degraded, true);
      assert.equal(body.reason, "leaderboard_unavailable");
      assert.deepEqual(body.data.entries, []);
    }
  );
});

test("GET /api/leaderboard clamps limit and ignores invalid filters", async () => {
  await withStubs(
    async () => ({ user: { id: "oidc-abc123" } }),
    async () => [],
    async () => {
      const { GET } = await loadRoute();
      const res = await GET(
        new Request(
          "http://127.0.0.1/api/leaderboard?outcome=BOGUS&grade=Z9&limit=999&page=0"
        )
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.data.page, 1);
      assert.equal(body.data.limit, LEADERBOARD_MAX_LIMIT);
    }
  );
});