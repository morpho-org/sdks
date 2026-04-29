# Test Suite

Instructions for working in the `test/` directory.

## Non-Negotiables

- **All flows must be tested.** Every VaultV2 operation (deposit, withdraw, redeem) must have full end-to-end test coverage, including requirements resolution (approval, permit, permit2).
- **Do not modify existing tests** without understanding what they validate and why.
- **Tests must pass before you stop.** Run `pnpm test` and fix any failure before considering work complete.
- **Never weaken assertions.** Do not replace strict assertions (`toStrictEqual`) with loose ones to make a test pass.

## Structure

| Directory   | Purpose                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `actions/`  | End-to-end tests for each VaultV2 action (deposit, withdraw, redeem, approval, permit, permit2)      |
| `helpers/`  | Shared test utilities — `invariants.ts` (state snapshot & validation), `vaultV2.ts` (vault creation) |
| `fixtures/` | Static test data (vault addresses, asset addresses)                                                  |
| `setup.ts`  | Vitest setup — creates forked mainnet client at pinned block                                         |
| `env.ts`    | Environment variable resolution for RPC URLs                                                         |

## Flows to Cover

Each action must test at minimum:

1. **Transaction building** — action produces the expected `Transaction` output (compare entity-built vs action-built).
2. **On-chain execution** — transaction executes on a forked mainnet and state changes match expectations.
3. **Invariant checks** — use `testInvariants()` to capture initial/final state and validate:
   - User balances change by the expected amounts.
   - Vault/Morpho balances are consistent.
   - Bundler3 balances remain unchanged (no funds stuck in intermediary contracts).
4. **Requirements** — approval, permit, and permit2 flows are each tested for actions that route through the bundler.

## Conventions

- Use `test` from `../setup` (forked mainnet client), not the raw `vitest` test runner.
- Use fixtures from `fixtures/` for vault addresses — do not hardcode addresses in test files.
- Use `testInvariants()` from `helpers/invariants` for all on-chain execution tests.
- Use `client.deal()` to set up token balances before executing actions.
- Keep tests focused: one behavior per test case.
- Test descriptions should clearly state the expected behavior (`"should deposit 1K USDC in vaultV2"`).
