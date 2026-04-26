import assert from "node:assert/strict";
import { test } from "node:test";

import { isPostgresUnavailableError } from "@/lib/db/postgresErrors";

test("isPostgresUnavailableError detects direct postgres connection refusal", () => {
  const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
    code: "ECONNREFUSED",
  });

  assert.equal(isPostgresUnavailableError(error), true);
});

test("isPostgresUnavailableError detects nested drizzle cause", () => {
  const error = Object.assign(new Error("Failed query: select 1"), {
    cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    }),
  });

  assert.equal(isPostgresUnavailableError(error), true);
});

test("isPostgresUnavailableError detects aggregate nested errors", () => {
  const error = Object.assign(new Error("connection failed"), {
    errors: [Object.assign(new Error("getaddrinfo ENOTFOUND postgres.internal"), { code: "ENOTFOUND" })],
  });

  assert.equal(isPostgresUnavailableError(error), true);
});

test("isPostgresUnavailableError does not suppress normal postgres schema errors", () => {
  const error = Object.assign(new Error("relation analytics_events does not exist"), {
    code: "42P01",
  });

  assert.equal(isPostgresUnavailableError(error), false);
});
