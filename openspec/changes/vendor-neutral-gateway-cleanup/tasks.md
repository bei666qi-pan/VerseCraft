## 1. Provider-neutral cleanup

- [x] 1.1 Remove retired-provider values and comments from local configuration, local tool permissions, and AI provider metadata without replacing them with another endpoint.
- [x] 1.2 Remove obsolete change artifacts and confirm no prohibited identity marker remains in source, configuration, permissions, file names, or active change artifacts.

## 2. Verification

- [x] 2.1 Run the bounded tracked-and-ignored repository scan without printing sensitive configuration values.
- [x] 2.2 Run relevant AI configuration/type tests and `git diff --check`.
- [x] 2.3 Strict-validate the change and record the completed verification evidence.
