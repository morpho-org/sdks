---
name: test-coverage
kind: baseline
focus: Missing or weak tests in `packages/<pkg>/test/` for changes in `packages/<pkg>/src/`.
---

# Test Coverage Analyzer

Focus: missing or weak tests in `packages/<pkg>/test/` for changes in `packages/<pkg>/src/`.

Prompt must include:

- New public exports without a corresponding test file under `packages/<pkg>/test/`
- New code paths inside existing exports without test cases (branches, error paths, edge cases like zero/MAX_UINT256/negative bigints)
- Removed or modified public exports without tests updated
- Onchain code paths (any code calling `viem`/`wagmi` actions) — confirm there's at least one test that exercises the path against a fork or mock
- Snapshot or schema tests updated when generated outputs change
