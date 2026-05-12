import test from "node:test";
import assert from "node:assert/strict";
import { buildAdminActorKey, normalizePresenceMemberToActorKey } from "@/lib/admin/adminActorKeys";

test("normalizes presence members into admin actor keys", () => {
  assert.equal(normalizePresenceMemberToActorKey("user-1"), "u:user-1");
  assert.equal(normalizePresenceMemberToActorKey("u:user-1"), "u:user-1");
  assert.equal(normalizePresenceMemberToActorKey("g:guest-1"), "g:guest-1");
  assert.equal(normalizePresenceMemberToActorKey("guest:guest-2"), "g:guest-2");
  assert.equal(normalizePresenceMemberToActorKey("guest_legacy"), "g:legacy");
  assert.equal(normalizePresenceMemberToActorKey(""), "");
});

test("builds stable actor keys from analytics identity parts", () => {
  assert.equal(buildAdminActorKey({ actorId: "g:guest-1", userId: "user-1" }), "g:guest-1");
  assert.equal(buildAdminActorKey({ userId: "user-1" }), "u:user-1");
  assert.equal(buildAdminActorKey({ guestId: "guest-1" }), "g:guest-1");
  assert.equal(buildAdminActorKey({ sessionId: "session-1" }), "s:session-1");
  assert.equal(buildAdminActorKey({}), "");
});
