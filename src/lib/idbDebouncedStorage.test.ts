import test from "node:test";
import assert from "node:assert/strict";
import { flushGameStorePersistenceDebouncedWrites, createDebouncedStorage } from "@/lib/idbDebouncedStorage";

test("phase4: debounced storage should flush on hidden visibility", async () => {
  let visibilityHandler: (() => void) | null = null;
  const windowMock = {
    addEventListener: () => {},
  };
  const documentMock = {
    visibilityState: "visible",
    addEventListener: (name: string, cb: () => void) => {
      if (name === "visibilitychange") visibilityHandler = cb;
    },
  };
  (globalThis as unknown as { window?: unknown }).window = windowMock as Window;
  (globalThis as unknown as { document?: unknown }).document = documentMock as Document;

  let writes = 0;
  const storage = createDebouncedStorage(
    {
      getItem: () => null,
      setItem: () => {
        writes += 1;
      },
      removeItem: () => {},
    },
    10_000
  );
  storage.setItem("k", "v");
  assert.equal(writes, 0);
  (documentMock as { visibilityState: string }).visibilityState = "hidden";
  visibilityHandler?.();
  await Promise.resolve();
  assert.equal(writes, 1);
});

test("flushGameStorePersistenceDebouncedWrites persists pending debounced snapshot", async () => {
  let lastWrite: string | null = null;
  const base: import("zustand/middleware").StateStorage = {
    getItem: async () => null,
    setItem: async (_name, value) => {
      lastWrite = value;
    },
    removeItem: async () => {},
  };
  const storage = createDebouncedStorage(base, 60_000, { registerGamePersistenceFlush: true });
  storage.setItem("versecraft-storage", "snapshot-ready");
  assert.equal(lastWrite, null);
  await flushGameStorePersistenceDebouncedWrites();
  assert.equal(lastWrite, "snapshot-ready");
});
