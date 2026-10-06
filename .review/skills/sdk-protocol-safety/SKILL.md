---
name: sdk-protocol-safety
description: Protocol semantics and transaction safety in morpho-org/sdks-internal. Use when a change touches ABIs, addresses, typed data, operation routing, bundles, approvals, permits, signatures, chain or account checks, accounting or rounding math, LLTV or share-price limits, receipts or simulation. Checks that the SDK still models Morpho exactly and that a transaction moves funds and grants authority only as the caller intends. Not for public API shape or package boundaries (sdk-compatibility) or generic error handling (sdk-correctness).
---

# Protocol and transaction safety

Two questions, asked together: does the SDK's model of Morpho still match the
protocol, and is the transaction it builds safe to sign? A mistake here can
send funds to the wrong contract or grant authority to the wrong spender, so
check what is actually encoded, not what a name suggests.

Apply each section only when its condition holds.

## 1. Establish the protocol source of truth

**Applies when** the diff touches anything a later section covers.

1. List every protocol verb, ABI name, address constant, operation type,
   typed-data domain, share-price or slippage field, LLTV or accounting helper
   and adapter route the diff touches.
2. Read the pinned source for each before claiming a mismatch: the ABI exports
   (`packages/morpho-ts/src/abis.ts`, `packages/blue-sdk-viem/src/abis.ts`,
   `packages/morpho-sdk/src/abis.ts`, `packages/midnight-sdk/src/abis.ts`),
   address and constant registries, operation and action types, and the
   package `AGENTS.md` files, especially `packages/morpho-sdk/AGENTS.md`,
   `packages/morpho-sdk/src/actions/AGENTS.md` and `packages/blue-sdk/AGENTS.md`.
   Follow re-exports to the owner; a facade is not the source.
3. If the source you need isn't in the checkout, say so in the finding. Never
   state a protocol fact from memory.

## 2. ABI, address and calldata agreement

**Applies when** the diff changes a contract call, calldata encoding, an ABI,
an address or a typed-data shape.

- `functionName` and `args` match the pinned ABI: argument count, order,
  struct shape and width (a `uint128` where the ABI says `uint256` truncates),
  and `payable` versus nonpayable. A `value` on a nonpayable call, or none on a
  payable one, should fail in the encoder, not onchain.
- The `abi` and `address` of a call come from the same registry and chain.
  Building them dynamically without a `chainId` gate is a finding.
- One source per ABI, selector, typed-data shape, address and protocol list
  (§1). A copy, a runtime ABI fetch, or an edit to a generated ABI that
  bypasses the pinned source breaks the release contract (§7). So does
  updating constants in one package but not in a companion that consumes them.
- Selectors come from viem, not hand-written hex; a pinned literal carries a
  comment with its source signature.
- Encoders don't hardcode `gas`, `gasPrice` or `maxFeePerGas`. Runtime
  estimation is fine.

## 3. Routing and authority

**Applies when** the diff chooses a target contract, spender, operator,
adapter, bundle route or the order of bundled steps.

- The route matches the package docs: a fixed-bundle path isn't encoded as a
  direct call, and a direct vault or market call doesn't go through the wrong
  registered periphery.
- `to`, spender, operator and adapter are the registered contracts. Approval
  to a caller-supplied spender with no allowlist of known protocol contracts
  (`BlueBundlesV1`, `VaultBundlesV1`, `VaultExitBundlesV1`, MetaMorpho and so
  on) is critical. So is missing Morpho authorization on a BlueBundlesV1 path,
  or `forceDeallocate` aimed at the wrong adapter data shape.
- Entrypoint and step order hold across the whole flow: native funding,
  `BluePublicAllocator` calls, repay and withdraw sequencing, callback sender.
- Approvals: prefer exact amounts or Permit2 to an unbounded `approve` for a
  single-shot operation; a recovery path that issued a large approval revokes
  it.
- V1, V2 and Market terms stay distinct. Code that applies a Vault V2 adapter
  assumption to a Vault V1 (MetaMorpho) concept, or the reverse, is a finding.

## 4. Accounting and protocol invariants

**Applies when** the diff changes asset or share math, accrual, slippage
bounds, LLTV, repay or reallocation logic.

- Asset/share conversions round in the protocol's direction and read current
  total assets and supply.
- Blue accrual follows the timestamp contract in `packages/blue-sdk/AGENTS.md`:
  an earlier or equal timestamp preserves market and position state and skips
  IRM projection; Vault V2 returns zero fees at or before its own
  `lastUpdate`. Nested markets that are newer are never rewound, and past
  timestamps aren't rejected. Vault V1 loss and fee reconciliation, and the
  unsupported-IRM errors for rate queries, stay intact.
- Share-price bounds sit where `packages/morpho-sdk/AGENTS.md` puts them and
  point the right way: `maxSharePrice` on vault deposits and the
  `migrateToV2` destination, `minSharePriceE27` on Vault V2 `forceWithdraw`.
  The documented route keeps its inflation-attack guard. BlueBundlesV1 Blue
  writes take no share-price bounds or `slippageTolerance` by design; their
  absence there is not a finding.
- LLTV, LLTV buffer, `WAD` and `ORACLE_PRICE_SCALE` math keeps its units; a
  scaled value is never compared with an unscaled one.
- Repay: share repay where the protocol requires it, an upper-bound transfer,
  and over-repayment handled as the protocol expects.
- Reallocation penalties are counted in proceeds and destination debt, never
  added to native `tx.value`.

## 5. Chain, account and signatures

**Applies when** the diff signs, sends or builds a transaction, permit or
typed-data signature, or threads a `chainId` or account through a flow.

- Every path that produces a `Transaction`, signed permit or typed-data
  signature checks that `client.chain.id` is the expected chain before
  encoding (§5). Trusting the caller's client without that check is critical.
- The account that signs is the account whose funds move; `client.account` is
  checked against the expected signer.
- A permit signed on one chain can't be submitted on another: a `chainId`
  threaded through a multi-step flow is checked against the destination.
- Typed-data domains (`name`, `version`, `chainId`, `verifyingContract`) are
  pinned protocol values, never caller input, and match the protocol
  constants.
- Permit nonces are read from the current onchain nonce and not reused across
  retries. Deadlines come from chain time or are padded; a deadline under five
  minutes from local `Date.now()` is a finding.

## 6. Action purity and onchain async

**Applies when** the diff changes an action, an encoder, or code that waits
for or sequences transactions.

- Actions are pure synchronous encoders (§1, §2 rule 3): no `readContract`,
  network, clock, randomness or signing, and no `async`. State reads belong in
  entities. Documented async requirement resolvers in `actions/requirements`
  are the exception.
- A returned hash isn't treated as mined: downstream state reads wait for
  `waitForTransactionReceipt`. Returning a hash or descriptor deliberately is
  not that mistake.
- One signer's writes aren't fanned out with `Promise.all` when nonce order
  matters, and a success callback doesn't start another write before the
  pending one settles.
- For simulation, check what counts as success: in `evm-simulation`,
  `SimulationRevertedError` is a bundle failure, not a pass.

## Severity

- **Critical:** the wrong `to`, spender or operator can move funds or grant
  authority; ABI or typed-data drift yields valid signatures for the wrong
  domain; accounting drift builds a transaction that looks safe but breaks an
  invariant; `chainId` unchecked before signing or sending; a permit usable
  across chains; calldata that mis-encodes amounts.
- **High:** wrong calldata that will probably revert; a lost share-price or
  LLTV-buffer check; step order that changes meaning; a missing pinned ABI or
  address update; a hash used as mined; a permit nonce not read from chain; a
  deadline under five minutes; hardcoded gas; an action that reads state or is
  async.
- **Medium:** protocol terms or docs that will mislead; a duplicated source
  that doesn't yet change output; a new protocol term missing from the nearest
  `AGENTS.md` glossary; an unbounded approval where an exact one would do; a
  selector literal without its signature.
- **Low:** naming nits that change no encoded output.

## Report

Each finding names the encoded value or flow step, the pinned source it
disagrees with, and what a caller loses: funds, authority, or a revert. Say
whether you read the source or are inferring, and keep protocol redesigns out
unless the diff already changes that surface. If nothing in scope survives,
report nothing.
