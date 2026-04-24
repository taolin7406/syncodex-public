# Security Policy

## Scope

Syncodex is a local-first Windows bridge for the official Codex desktop app.
Security reports are especially helpful for issues involving:

- local HTTP exposure
- phone access proxy behavior
- token handling
- file upload and path handling
- unintended writes to official Codex data

## Reporting

Please do not open a public issue for suspected security vulnerabilities.

Instead, contact the maintainer privately and include:

- the affected version or commit
- reproduction steps
- impact
- any suggested mitigation

## Expectations

- We will acknowledge receipt.
- We will investigate and determine severity.
- We will coordinate disclosure after a fix or mitigation is available.

## Out of Scope

The following are generally out of scope unless they cause an actual security impact:

- Windows-only operational limitations
- breakage caused by unsupported unofficial runtime modifications
- behavior that already requires local machine access and provides no privilege increase
