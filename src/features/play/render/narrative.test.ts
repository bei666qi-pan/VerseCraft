import assert from "node:assert/strict";
import test from "node:test";
import { prepareStreamingNarrativeForRender, splitNarrativeIntoParas } from "./narrative";

test("prepareStreamingNarrativeForRender: strips trailing unclosed BLOOD open", () => {
  assert.equal(
    prepareStreamingNarrativeForRender("前{{BLOOD}}后"),
    "前后"
  );
});

test("prepareStreamingNarrativeForRender: keeps closed BLOOD block", () => {
  const s = "x{{BLOOD}}a{{/BLOOD}}y";
  assert.equal(prepareStreamingNarrativeForRender(s), s);
});

test("prepareStreamingNarrativeForRender: only last unclosed block is stripped", () => {
  assert.equal(
    prepareStreamingNarrativeForRender("{{BLOOD}}a{{/BLOOD}}{{BLOOD}}b"),
    "{{BLOOD}}a{{/BLOOD}}b"
  );
});

test("prepareStreamingNarrativeForRender: removes lone opening **", () => {
  assert.equal(prepareStreamingNarrativeForRender("foo**bar"), "foobar");
});

test("prepareStreamingNarrativeForRender: keeps paired **", () => {
  assert.equal(prepareStreamingNarrativeForRender("a**b**c"), "a**b**c");
});

test("prepareStreamingNarrativeForRender: leading lone **", () => {
  assert.equal(prepareStreamingNarrativeForRender("**x"), "x");
});

test("splitNarrativeIntoParas: prefers blank line paragraphs", () => {
  const p = splitNarrativeIntoParas("a\n\nb\n\nc");
  assert.deepEqual(p, ["a", "b", "c"]);
});

test("splitNarrativeIntoParas: falls back to single newline paragraphs when no blank lines", () => {
  const p = splitNarrativeIntoParas("a\nb\nc");
  assert.deepEqual(p, ["a", "b", "c"]);
});
