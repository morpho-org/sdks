# Calldata verifier

- Production source imports morpho-sdk ABIs only, from `@morpho-org/morpho-sdk/abis`; never import builders, actions, entities or plans there. Test files may use morpho-sdk builders to generate fixtures.
- Import ABIs and addresses from the packages that own them; never copy, redefine or move them.
- Allowed dependencies: `morpho-ts`, `blue-sdk-viem`, `midnight-sdk`, `morpho-sdk` (ABIs only), `viem` (peer), `@noble/curves` (P-256 proof verification), and `fflate` (synchronous gunzip of Midnight maker payloads). No Effect, no API client, no new dependency without review.
- Pure and synchronous: no network, RPC, file or clock access.
- Check only what calldata and intent can prove with local ABIs and registries. Document checks that need onchain state as out of scope and leave them to EVM simulation; never substitute an assumption for a state check.
- Fail closed: unknown contract, unknown selector, extra call or undecodable nested call throws. Never skip a call. Accept dynamic addresses only where a rule authorizes their role.
- One public entry point, `verifyCalldata`, with typed errors. No result object, no options that disable checks.
- Names follow the Actions API: action ids (`vault_v2.deposit`), snake_case fields, `chain_id`.
- Adding or modifying an Actions API action, including its corresponding SDK action or transaction builder, must update the verifier in the same PR: add or update the verification rule, README, and no-fork unit tests covering valid and tampered calldata. Add an intent type for a new action; update an existing intent type only when the action's request fields change. No per-endpoint branches in the rules.
- Every rule has a passing test and a tampered test; every action has an e2e fixture.
- Public API changes ship a changeset; breaking changes need a major and an explicit reason.
