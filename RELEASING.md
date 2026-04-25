# Releasing Syncodex

This document is for maintainers preparing a public release.

## Basic Flow

1. Prepare changes in the private development repository.
2. Export the public repository contents from the private repository.
3. Review the exported public repository for accidental internal data.
4. Commit the public-facing changes in `syncodex-public`.
5. Tag and publish a GitHub Release when ready.

## Before Publishing

Verify the following:

- no internal handoff or status logs are included
- no public tunnel URLs, tokens, or local-only secrets are included
- no temporary screenshots, test artifacts, or logs are included
- README, changelog, and docs reflect the intended release state
- CI passes on the public repository

## Suggested Release Notes

Each release note should summarize:

- user-visible features
- bug fixes
- compatibility notes
- known limitations

## Packaging Notes

If packaged Windows builds are published, attach them to the GitHub Release instead of
committing build artifacts to the repository.
