import test from "node:test";
import assert from "node:assert/strict";
import { createDebouncedStorage } from "@/lib/idbDebouncedStorage";

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
