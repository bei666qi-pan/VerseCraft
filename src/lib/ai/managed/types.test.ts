import test from "node:test";
import assert from "node:assert/strict";
import * as managedTypes from "./types";

test("managed transport normalization preserves OpenAI Responses services", () => {
  const normalize = (
    managedTypes as typeof managedTypes & {
      normalizeManagedTransportInput?: (value: unknown, allowMock?: boolean) => string;
    }
  ).normalizeManagedTransportInput;

  assert.equal(typeof normalize, "function");
  assert.equal(normalize?.("openai_responses"), "openai_responses");
  assert.equal(normalize?.("openai_compatible"), "openai_compatible");
  assert.equal(normalize?.("ark_multimodal"), "ark_multimodal");
});
