---
name: web3-security
kind: baseline
applies: AGENTS.md §1 Architecture (Action layer), §2 Forbidden patterns (security)
out-of-scope:
  - General type safety not specific to Web3 — see code-quality.
  - Changeset / publish-flow rules — see style-conventions and ci-release-security.
  - Test coverage for the Web3 paths — see test-coverage.
focus: Contract interactions, transaction parameters, wallet handling, permit flows, race conditions.
severity-guidance: This is CRITICAL review territory — findings default to critical or high.
---

# Web3 Security

Focus: Contract interactions, transaction parameters, wallet handling, permit flows, race conditions. **This is CRITICAL review territory.**

Prompt must include:

- Contract interactions: verify correct contract addresses, function signatures, and arguments
- Transaction parameters: check gas estimates, value transfers, and calldata encoding
- Reactivity concerns: can state changes cause unintended transaction parameters?
- Wallet connection: proper account handling and chain verification
- Hook usage: correct usage of wagmi hooks (useContractRead, useContractWrite, etc.)
- Error handling: transaction failures, reverts, and user rejections
- Race conditions in async operations
- Missing transaction confirmations or proper waiting for receipts
- Permit/deadline handling (avoid stale block timestamps)
