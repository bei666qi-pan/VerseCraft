## 1. Repository-wide workflow policy

- [x] 1.1 Rewrite the root OpenSpec dispatch policy as tool-neutral default instructions while preserving explicit direct-execution exceptions and high-risk mandatory changes.
- [x] 1.2 Add concise matching OpenSpec dispatch guidance to the Claude and Cursor project instructions; remove the Cursor automatic ship/deploy behavior that conflicts with repository authorization rules.

## 2. Supported client adapters

- [x] 2.1 Use the OpenSpec CLI to install or refresh project-local adapters for Codex, Kimi Code, Claude Code, and Cursor without creating adapters for unused clients.
- [x] 2.2 Document the supported-client scope and the repeatable adapter update command at the repository workflow entry point.

## 3. Verification and OpenSpec completion

- [x] 3.1 Verify generated adapter files, root/client workflow references, and the absence of automatic deployment instructions without explicit authorization.
- [x] 3.2 Run `openspec validate standardize-openspec-agent-workflow --strict`, `git diff --check`, and update this change's task evidence before completion.

## Verification evidence

- `openspec validate standardize-openspec-agent-workflow --strict` — passed.
- `openspec validate cross-agent-openspec-workflow --strict` — passed after syncing the new main spec.
- Generated Codex, Kimi, Claude, and Cursor adapter paths were checked for presence and non-empty content; the scoped diff and whitespace checks passed.
- Full `git diff --check` was run but reports pre-existing trailing whitespace in unrelated user changes at `src/app/api/chat/route.ts:3573`; the scoped check for this change passed.
