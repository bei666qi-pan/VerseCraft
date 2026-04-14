# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in VerseCraft, please report it responsibly:

1. **Do NOT open a public GitHub issue.**
2. Email your report to **bei666qi@gmail.com** with the subject line `[VerseCraft Security]`.
3. Include:
   - A description of the vulnerability.
   - Steps to reproduce.
   - Potential impact.
   - Suggested fix (if any).

We will acknowledge your report within **72 hours** and work with you to understand and address the issue before any public disclosure.

## Scope

The following are in scope:

- Server-side API routes (`src/app/api/`)
- Authentication and session handling
- Database queries and ORM usage
- AI gateway and prompt injection vectors
- Content safety and moderation bypasses
- Client-side state that could lead to privilege escalation

The following are out of scope:

- Vulnerabilities in upstream dependencies (report those to the respective project)
- Issues requiring physical access to the server
- Social engineering attacks

## Acknowledgements

We appreciate responsible disclosure and will credit reporters (with permission) in release notes.
