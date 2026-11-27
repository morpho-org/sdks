# @morpho-org/morpho-sdk

[![npm version](https://img.shields.io/npm/v/@morpho-org/morpho-sdk.svg)](https://www.npmjs.com/package/@morpho-org/morpho-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![CI](https://github.com/morpho-org/morpho-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/morpho-org/morpho-sdk/actions/workflows/ci.yml)

> 📖 **Full documentation → [docs.morpho.org/developers/sdks/morpho-sdk](https://docs.morpho.org/developers/sdks/morpho-sdk/)**

Build transactions for Morpho's **Midnight** fixed-rate markets, **Blue** markets, **VaultV2**, and **VaultV1** (MetaMorpho) on chains with the required protocol and periphery deployments. Custom deployments can be added with `registerCustomAddresses` from `@morpho-org/morpho-sdk/addresses`.

## Installation

```bash
npm install @morpho-org/morpho-sdk
```

Read [Dead-share validators](./DEAD-SHARE-PROTECTION.md) for the exported checks. Builders do not
enforce the dead-deposit rule; integrators should validate their snapshot before building.
Snapshot-free Blue `supply` remains deprecated.

Upgrading? Read the [v9 → v10 migration guide](./MIGRATION-v9-to-v10.md). Older guides:
[v8 → v9](./MIGRATION-v8-to-v9.md), [v7 → v8](./MIGRATION-v7-to-v8.md),
[v6 → v7](./MIGRATION-v6-to-v7.md), [v5 → v6](./MIGRATION-v5-to-v6.md).

## Actions

Each entity exposes a set of actions. Midnight takes and makes call MidnightBundlesV2, Blue writes
call BlueBundlesV1, common vault writes call VaultBundlesV1, and the remaining rows identify their
destination.

| Entity | Actions | Route |
| --- | --- | --- |
| **Midnight** | `takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `takeRepayWithdrawCollateral`, `repayWithdrawCollateral`, `takeWithdraw` | MidnightBundlesV2 (every chain with a registered `midnightBundlesV2`) |
| | `supplyCollateral` | Midnight Core; ERC-20 only, no wrapping |
| | `supplyCollateralWithNative` | MidnightBundlesV2 `midnightBundlesV2CancelAndMake`; wraps a positive `nativeAmount` into registered wNative (unavailable on chains without one, such as Alpen), requires a `deadline`, and uses bundle approval and Midnight authorization |
| | `withdrawCollateral`, `redeem` | Direct Midnight call |
| | `supplyCollateralBatch`, `withdrawCollateralBatch` | Midnight multicall |
| | `cancelOffers` | Direct call for one group (`setConsumed`), Midnight multicall for several; every Midnight chain |
| | `makeLend`, `makeBorrow`, `makeWithdraw`, `makeRepay`, `supplyCollateralMakeBorrow`, `supplyBlueMakeLend` | MidnightBundlesV2 (every chain with a registered `midnightBundlesV2`) |
| **Blue** | `supply`, `withdraw`, `supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, `repayWithdrawCollateral`, `refinance` | BlueBundlesV1 |
| | `withdrawBuyCallback` | Morpho Blue (direct `withdraw` for a BlueBuyCallback's owner) |
| **VaultV2** | `deposit`, `withdraw`, `redeem` | VaultBundlesV1 |
| | `forceWithdraw` | VaultExitBundlesV1 |
| | `forceRedeem` | Vault multicall |
| | `inKindRedeem` | VaultExitBundlesV1 |
| **VaultV1** (MetaMorpho) | `deposit`, `withdraw`, `redeem`, `migrateToV2` | VaultBundlesV1 |
| | `inKindRedeem` | VaultExitBundlesV1 |

`makeBorrow` publishes without collateral; `supplyCollateralMakeBorrow` requires collateral and
supplies it in the same transaction.

`makeWithdraw` publishes reduce-only sell offers for lend limit exits. `makeRepay` publishes
reduce-only buy offers for borrow limit exits; its `loanAssets` input only sets the
minimum Midnight allowance that `getRequirements()` checks (the approval it returns is
unlimited), while the signed offer caps bound fills.
Both preserve the supplied offer tree and use `midnightCancelAndMake`; neither executes a fill
or withdraws collateral during publication. Send their approval/authorization requirements first,
then call `buildTx()` without a separate root signature.

`VaultExitBundlesV1`, `VaultBundlesV1`, and `BlueBundlesV1` are registered on Ethereum, Base,
Arbitrum, Optimism, Polygon, World Chain, Unichain, HyperEVM, Katana, Monad, Stable, Tempo,
Robinhood Chain, Arc, X Layer, and Alpen. Alpen has no registered Vault V1 factory, wrapped-native
token, or Permit2; native-token funding is not enabled there. Custom deployments can still be
configured with `registerCustomAddresses`.

## How it works

Actions that pull tokens or touch a position return `{ buildTx, getRequirements }`. All Blue
writes use this lazy shape while still encoding one direct BlueBundlesV1 call, except
`withdrawBuyCallback`, which encodes one direct Morpho Blue `withdraw`. Vault deposits,
`withdraw`, and `redeem` use the same shape for token or vault-share authorization to
VaultBundlesV1. Vault `inKindRedeem` and `forceWithdraw` use it so callers can await
`getRequirements()` to check share authorization to VaultExitBundlesV1 — and, for `inKindRedeem`,
live Blue liquidity — before invoking `buildTx()`. Calling `buildTx()` directly skips those
RPC-backed pre-flight checks. `forceRedeem` remains a direct Vault V2 multicall without
prerequisites.

- **`getRequirements()`** — async; the on-chain prerequisites to satisfy first: ERC-20 approvals, ERC-2612 permit signatures, Morpho authorization, or (for Midnight) operator authorization.
- **`buildTx(signatures?)`** — synchronous; the final, deep-frozen viem transaction. Pass any signatures collected from the requirements.

Every transaction carries `tx.action` — typed metadata describing the encoded call (`type` plus
the normalized `args`, including `referralFeeAssets`: the exact referral-fee amount the
BlueBundlesV1 call charges, where derivable; it is omitted in exact-shares mode
(`blueWithdraw`, `blueRepay` and `blueRepayWithdrawCollateral` with a shares input),
where the underlying amount is resolved at execution. On the repay actions it is set
only for an exact-assets repay (`repayAssets > 0n`), so it is also omitted when
`blueRepayWithdrawCollateral` has no repay leg).
`@morpho-org/evm-simulation`'s `toSimulationLimits` consumes this metadata
for quote-based limits. For operations covered by `OperationInputs`, prefer
independently chosen `inputs` in `simulate()` limits rather than bounds derived
from action metadata. Refinance, in-kind redeems, force exits and Midnight
operations still require quotes.

```typescript
const vaultData = await vault.getData();
const { buildTx, getRequirements } = vault.deposit({ amount, userAddress, vaultData });

const requirements = await getRequirements();
// Send each approval tx and collect each signature, then:
const tx = buildTx([permitSignature]);
```

Enable off-chain approvals (ERC-2612 permits) with `morphoViemExtension({ supportSignature: true })`. Pass `getRequirements({ useSimplePermit: false })` to force direct ERC-20 approvals; unsupported tokens also fall back to direct approvals.

Token funding checks the bundles allowance first on every route. If it already covers the amount,
no token requirement is returned and ERC-2612 support is not probed.

### `userAddress` is the eventual submitter

`userAddress` must be the account that eventually signs and sends the transaction. A connected
builder account may prepare a direct bundles call for a different submitter; signature helpers
enforce the expected identity at `sign()`. VaultBundlesV1 and BlueBundlesV1 always operate on
`msg.sender`.

## Usage

```typescript
import {
  morphoViemExtension,
  isRequirementSignature,
} from "@morpho-org/morpho-sdk";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { mainnet } from "viem/chains";

// Reads on-chain state, extended with the `morpho` namespace.
const client = createPublicClient({ chain: mainnet, transport: http() }).extend(
  morphoViemExtension(),
);

// Signs permits and sends the approval / authorization transactions.
const walletClient = createWalletClient({
  account: "0xUser...",
  chain: mainnet,
  transport: custom(window.ethereum), // any EIP-1193 provider
});
```

Create an entity — every factory takes a chain ID as its last argument:

- `client.morpho.midnight(chainId)`
- `client.morpho.blue(marketParams, chainId)`
- `client.morpho.vaultV2(address, chainId)` / `client.morpho.vaultV1(address, chainId)`

### Vault deposit / withdraw

Deposit calls VaultBundlesV1 and may require an approval or permit. ERC-20 approvals and ERC-2612
permits authorize VaultBundlesV1.

```typescript
const vault = client.morpho.vaultV2("0xVault...", 1);
const vaultData = await vault.getData();
const { buildTx, getRequirements } = vault.deposit({
  amount: 1000000000000000000n,
  userAddress: "0xUser...",
  vaultData,
});
const requirements = await getRequirements();
const tx = buildTx([permitSignature]);
```

Withdraw is a VaultBundlesV1 call that burns the caller's shares. Any existing allowance at or
above the required share amount is reused; otherwise, `getRequirements()` returns an unlimited
approval or permit:

```typescript
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type EIP1193Provider,
} from "viem";
import { mainnet } from "viem/chains";

async function withdrawUsdc(provider: EIP1193Provider, supportSignature = false) {
  const client = createPublicClient({ chain: mainnet, transport: http() }).extend(
    morphoViemExtension({ supportSignature }),
  );
  const walletClient = createWalletClient({ chain: mainnet, transport: custom(provider) });
  const [userAddress] = await walletClient.requestAddresses();
  if (!userAddress) throw new Error("Connect a wallet account before withdrawing.");
  const vault = client.morpho.vaultV2("0x04422053aDDbc9bB2759b248B574e3FCA76Bc145", mainnet.id);
  const vaultData = await vault.getData();
  const withdrawal = vault.withdraw({ amount: 500_000n, userAddress, vaultData });
  const requirements = await withdrawal.getRequirements();
  const requirement = requirements[0];

  if (requirement && "sign" in requirement) {
    // With signature support enabled, sign the vault-share permit for this handle.
    const signedPermit = await requirement.sign(walletClient, userAddress);
    return walletClient.sendTransaction({
      ...withdrawal.buildTx([signedPermit]),
      account: userAddress,
    });
  }

  for (const approval of requirements) {
    if ("to" in approval) {
      const hash = await walletClient.sendTransaction({ ...approval, account: userAddress });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The share approval reverted.");
    }
  }
  // Approval is confirmed, or the required allowance was already satisfied.
  return walletClient.sendTransaction({ ...withdrawal.buildTx(), account: userAddress });
}
// await withdrawUsdc(provider) returns the withdrawal transaction hash.
// Pass true as the second argument to use a signed share permit instead of an approval.
```

For wNative vaults, pass `nativeAmount` instead of `amount`. The transaction sends that amount as
`tx.value` to VaultBundlesV1, which wraps it internally; native deposits require no token permit.

### Midnight: take a fixed-rate offer

```typescript
const midnight = client.morpho.midnight(8453);
const marketData = await midnight.getMarketData(marketId);

const output = midnight.takeLend({
  accountAddress: lender,
  marketData,
  target: { type: "assets", assets: 1_000_000n, minUnits: 900_000n },
  takeableOffers: quote.data.takeableOffers,
  maxContinuousFee: maxUint256,
  deadline,
});

const requirements = await output.getRequirements();
const tx = output.buildTx();
```

### Midnight: collateral batches

`supplyCollateralBatch` and `withdrawCollateralBatch` move several collaterals of one position in
one transaction: a Midnight core `multicall` of direct `supplyCollateral` or `withdrawCollateral`
calls that reverts as a whole. Pass one entry per collateral index; duplicates throw
`DuplicateMidnightCollateralIndexError`, unlike the bundle flows, which sum them.

A supply batch returns one unlimited Midnight approval per collateral token whose allowance is
below that token's total:

```typescript
const supply = midnight.supplyCollateralBatch({
  accountAddress: user,
  marketData,
  collateralSupplies: [
    { collateralIndex: 0n, assets: 1_000_000n },
    { collateralIndex: 1n, assets: 2_000_000_000_000_000_000n },
  ],
});

for (const approval of await supply.getRequirements()) {
  const hash = await walletClient.sendTransaction({ ...approval, account: user });
  await client.waitForTransactionReceipt({ hash });
}
await walletClient.sendTransaction({ ...supply.buildTx(), account: user });
```

A withdraw batch checks every entry against `positionData` and, when the position has debt, checks
the remaining collateral against the LLTV buffer using `collateralPrices`. `maxUint256` withdraws
that index's whole balance. It needs no requirements:

```typescript
import { blueOracleAbi } from "@morpho-org/morpho-sdk/abis";
import { maxUint256 } from "viem";

const positionData = await midnight.getPositionData({ marketId, accountAddress: user });
const collateralPrices = await Promise.all(
  marketData.params.collateralParams.map(({ oracle }) =>
    client.readContract({ address: oracle, abi: blueOracleAbi, functionName: "price" }),
  ),
);

const withdrawal = midnight.withdrawCollateralBatch({
  accountAddress: user,
  marketData,
  positionData,
  collateralPrices,
  collateralWithdrawals: [
    { collateralIndex: 0n, assets: 500_000n },
    { collateralIndex: 1n, assets: maxUint256 },
  ],
  receiver: user,
});
await walletClient.sendTransaction({ ...withdrawal.buildTx(), account: user });
```

### Blue: BlueBundlesV1 writes

```typescript
const market = client.morpho.blue(
  {
    loanToken: "0xLoan...",
    collateralToken: "0xCollateral...",
    oracle: "0xOracle...",
    irm: "0xIrm...",
    lltv: 860000000000000000n,
  },
  1,
);

const { buildTx, getRequirements } = market.supplyCollateralBorrow({
  userAddress: "0xUser...",
  collateralAssets: 1_000_000n,
  borrowAssets: 0n,
  deadline: 1_900_000_000n,
});

// Satisfy each BlueBundlesV1 approval or signature requirement, then pass every
// collected signature to buildTx.
const signatures = [];
for (const requirement of await getRequirements()) {
  if (isRequirementSignature(requirement)) {
    signatures.push(await requirement.sign(walletClient, "0xUser..."));
  } else {
    await walletClient.sendTransaction(requirement); // approval / authorization tx
  }
}

const tx = buildTx(signatures);
```

Set `borrowAssets` to a non-zero amount and provide `positionData` to combine collateral supply and
borrowing. That path may also require Morpho authorization for BlueBundlesV1. Optional
`reallocations` are Vault V2 only, and the LLTV buffer guards the resulting position against
instant liquidation. Blue writes do not accept `slippageTolerance`, `minSharePrice`, or
`maxSharePrice` because BlueBundlesV1 has no share-price-bound inputs.

### TransactionPlan: sign and verify permits

> **Beta:** TransactionPlan is experimental; breaking changes may ship in minor releases.
> Existing entity flows remain the recommended stable path during the shadow-mode rollout.

Preparers emit stored format `version: 2`. Parsing rejects a version that is missing or not a safe integer
with `InvalidTransactionPlanError` and any other safe-integer version with `UnsupportedTransactionPlanVersionError`.

Prepare a Vault V2 deposit, withdrawal, force-withdraw or exact-share redemption plan, or a Vault V1 deposit or withdrawal plan with
`prepareVaultV1Deposit` or `prepareVaultV1Withdraw` and a `fetchAccrualVault` snapshot, then sign its pending requests with your wallet.
Deposit and withdrawal preparers take `assets`; redemption takes `shares`. Stored operation inputs
use the same names, except native-funded deposits store `nativeAssets` instead of `assets`.
Stored ERC-20 approval inputs likewise use `assets` for underlying-token approvals or `shares`
for vault-share approvals. See the [TransactionPlan format notes](./src/transactionPlan/README.md).
Pass the caller-fetched `AccrualVault` (V1) or `AccrualVaultV2` (V2) once as `vault` for deposits,
and the matching snapshot as `vault` for withdrawals;
the contract address comes from `vault.address`. Only deposit preparation accepts `deployless`.

V1 and V2 deposits share preparation and validation; use `assets` for either preparer and
`nativeAssets` in stored native funding. The snapshot is not retained in the stored plan.

V1 and V2 withdrawal plans also share preparation and validation: both prepare and store gross
`assets`, alongside the stored `requiredShareAllowance` quote. Neither accepts a slippage override.

`prepareVaultV1Redeem` prepares a Vault V1 exact-share redemption. Its required `shareToken: Token`
supplies the vault address and share-permit domain metadata; no accrual snapshot is required.

V1 and V2 redemptions both prepare and store exact `shares`. Their shared authorization resolver
also serves ordinary withdrawals: chain checks, code checks and requirements run concurrently,
while the requirements helper checks the RPC chain before allowance or nonce reads.

Migration plans take exactly one of `assets` or `shares`, store `vault: sourceVault` and derived
`maxSharePrice`, and translate that bound to the entity/ABI `maxSharePriceVaultV2` argument.
Pass the caller-fetched source and target snapshots once each, as `sourceVault: AccrualVault` and
`targetVault: AccrualVaultV2`. Their assets must match and their addresses must differ.

`applySignatures(plan, signatures)` synchronously verifies every supplied signature before attaching
it, without a client or RPC. It validates all requests against their actions, including permit/action
deadline agreement, rejects unknown or duplicate input IDs, and recovers the permit owner from the
EIP-712 typed-data hash. The domain
binds the signature to its chain. Only low-s ECDSA permits encodable as `v/r/s` are supported
(64-byte compact or 65-byte serialized signatures, stored in serialized form). Contract wallets
should use `supportSignature: false` for direct approvals: deployed bundles do not consume
arbitrary ERC-1271 or ERC-6492 signatures.

`parseTransactionPlan` revives bigint tags and validates supported versions/actions, field shapes
and uint256 ranges, unique IDs, references, action chain/account agreement and permit consistency,
including requests with existing signatures. It allows extra keys. Malformed JSON, shapes or
references throw `InvalidTransactionPlanError` with a JSON `path` and `reason`; unsupported versions
and action types retain their dedicated errors. Serialization remains unchecked. Parsing verifies
stored signatures against their expected signers offline and rejects signatures from the wrong
signer. Midnight maker publications, `midnightSupplyCollateralTakeBorrow` and
`midnightTakeRepayWithdrawCollateral` also rerun their builders' static input checks on restore, so
a stored recipe that fails those checks throws `InvalidTransactionPlanError` there. Building can
still fail on a restored plan: deployment lookups such as the Midnight bundle address run only in
`buildTransactions`. Parsing uses no clock or RPC and does not check expiry, live state or other
action-layer business constraints. A successful parse does not prove intent or protect unsigned
fields, so integrators must still protect stored plans.

Supported action types are `erc20Approval`, `morphoAuthorization`, `blueSupply`,
`blueSupplyCollateral`, `blueBorrow`, `blueSupplyCollateralBorrow`, `blueRepay`, `blueWithdraw`,
`blueWithdrawCollateral`, `blueWithdrawBuyCallback`, `blueRepayWithdrawCollateral`, `blueRefinance`, `vaultV1Deposit`, `vaultV1Withdraw`,
`vaultV1Redeem`, `vaultV1InKindRedeem`, `vaultV1MigrateToV2`,
`vaultV2Deposit`, `vaultV2Withdraw`, `vaultV2Redeem`,
`vaultV2ForceWithdraw`, `vaultV2ForceRedeem`, `vaultV2InKindRedeem`, `midnightAuthorization`,
`midnightTakeLend`, `midnightTakeBorrow`, `midnightSupplyCollateralTakeBorrow`, `midnightTakeWithdraw`, `midnightTakeRepayWithdrawCollateral`, `midnightSupplyCollateral`, `midnightSupplyCollateralWithNative`, `midnightSupplyCollateralBatch`, `midnightWithdrawCollateral`, `midnightWithdrawCollateralBatch`, `midnightRedeem`, `midnightCancelOffers`, `midnightRepayWithdrawCollateral`, `midnightMakeBorrow`, `midnightMakeLend`, `midnightMakeWithdraw`, `midnightMakeRepay`, `midnightSupplyCollateralMakeBorrow` and `midnightSupplyBlueMakeLend`. Builders return plain `Readonly<Transaction>` objects without step metadata.

| Prepare function | Operation |
| --- | --- |
| `prepareBlueSupply` | Supply loan assets to a Blue market |
| `prepareBlueSupplyCollateral` | Supply collateral to a Blue market without borrowing |
| `prepareBlueBorrow` | Borrow from a Blue market against existing collateral |
| `prepareBlueSupplyCollateralBorrow` | Supply collateral, borrow, or perform both atomically on Blue |
| `prepareBlueRepay` | Repay Blue debt by assets or shares |
| `prepareBlueWithdraw` | Withdraw supplied loan assets from a Blue market |
| `prepareBlueWithdrawCollateral` | Withdraw collateral from a Blue market |
| `prepareBlueWithdrawBuyCallback` | Withdraw a BlueBuyCallback's whole supply position to its owner |
| `prepareBlueRepayWithdrawCollateral` | Repay, withdraw collateral, or perform both atomically on Blue |
| `prepareBlueRefinance` | Move a Blue borrow position to another market |
| `prepareMidnightTakeLend` | Lend at a fixed rate on Midnight by taking caller-quoted borrow offers |
| `prepareMidnightSupplyCollateral` | Supply the selected collateral directly to a Midnight market |
| `prepareMidnightSupplyCollateralBatch` | Supply several collaterals atomically to a Midnight market |
| `prepareMidnightSupplyCollateralWithNative` | Supply wNative collateral to a Midnight market, funded partly or fully with native ETH |
| `prepareMidnightRedeem` | Redeem credit from a caller-fetched Midnight position |
| `prepareMidnightWithdrawCollateral` | Withdraw one collateral directly from a caller-fetched Midnight position |
| `prepareMidnightWithdrawCollateralBatch` | Withdraw several collaterals atomically from a caller-fetched Midnight position |
| `prepareMidnightTakeBorrow` | Borrow from lend-side Midnight offers against an existing position |
| `prepareMidnightSupplyCollateralTakeBorrow` | Supply collateral and borrow from lend-side Midnight offers atomically |
| `prepareMidnightMakeBorrow` | Publish resting Midnight borrow offers without supplying collateral |
| `prepareMidnightSupplyCollateralMakeBorrow` | Supply collateral and publish resting Midnight borrow offers atomically |
| `prepareMidnightMakeLend` | Publish resting Midnight lend offers funded by the maker when filled |
| `prepareMidnightSupplyBlueMakeLend` | Supply loan assets to the maker's BlueBuyCallback and publish resting Midnight lend offers atomically |
| `prepareMidnightMakeWithdraw` | Publish resting Midnight reduce-only sell offers against existing credit |
| `prepareMidnightMakeRepay` | Publish resting Midnight reduce-only buy offers against existing debt |
| `prepareMidnightTakeWithdraw` | Withdraw Midnight credit using lend-side offers without opening debt |
| `prepareMidnightTakeRepayWithdrawCollateral` | Repay Midnight debt by taking borrow offers, optionally repaying the rest directly and withdrawing collateral |
| `prepareMidnightCancelOffers` | Cancel Midnight offer groups in full with a direct Midnight call |
| `prepareMidnightRepayWithdrawCollateral` | Repay Midnight debt directly or withdraw collateral without filling offers |
| `prepareVaultV2Deposit` | Deposit assets into Vault V2 |
| `prepareVaultV2Withdraw` | Withdraw assets from Vault V2 |
| `prepareVaultV2Redeem` | Redeem an exact number of Vault V2 shares |
| `prepareVaultV2ForceWithdraw` | Force-withdraw a penalty-inclusive asset amount from Vault V2 |
| `prepareVaultV2ForceRedeem` | Force-deallocate and redeem an exact number of Vault V2 shares |
| `prepareVaultV2InKindRedeem` | Exit a penalty-inclusive asset amount from Vault V2 in kind (idle assets and Blue supply positions) |
| `prepareVaultV1Deposit` | Deposit assets into Vault V1 |
| `prepareVaultV1Withdraw` | Withdraw assets from Vault V1 |
| `prepareVaultV1Redeem` | Redeem an exact number of Vault V1 shares |
| `prepareVaultV1InKindRedeem` | Redeem Vault V1 shares in kind |
| `prepareVaultV1MigrateToV2` | Migrate exclusive `assets` or `shares` from Vault V1 into Vault V2 |

`prepareBlueSupply` takes a caller-fetched market snapshot. With insufficient ERC-20 allowance,
it requests an unlimited approval or an exact-amount ERC-2612 permit for BlueBundlesV1.
Native funding is available only when the loan token is the chain's wrapped native token (wNative)
and requires neither an approval nor a permit. Like deposit preparers, supply preparation takes
`assets` with `funding: { type: "native" }`; the stored supply action retains gross `assets` and
records the native funding as `nativeAssets`.

`prepareBlueSupplyCollateral` takes a caller-fetched market snapshot and `collateralAssets`.
With insufficient ERC-20 allowance, it requests an unlimited approval or an exact-amount ERC-2612
permit for BlueBundlesV1. Native funding is available only for wNative collateral, needs neither
approval nor permit, and stores `nativeAssets` equal to `collateralAssets`.

`prepareMidnightSupplyCollateralBatch` supplies a nonempty ordered list of `collateralSupplies`, one
per index, in one Midnight core multicall. For each token whose allowance is below that token's total,
it adds the approval steps to Midnight core that the token requires (usually one unlimited approval,
possibly a reset to zero first or a capped amount). It needs no authorization or signature request;
`expiresAt` is not an on-chain deadline.

`prepareMidnightSupplyCollateralWithNative` supplies `collateralAssets` of the wNative collateral at
`collateralIndex` through MidnightBundlesV2. A positive `nativeAmount`, at most `collateralAssets`, is
sent as transaction value and wrapped to the account; the bundle then pulls the full
`collateralAssets` as wNative, so the wallet's own wNative balance covers only
`collateralAssets - nativeAmount`. It adds an unlimited wNative approval to MidnightBundlesV2 when the
allowance is below `collateralAssets`, and a Midnight authorization of the bundle when it is missing.
Unlike the entity, it takes no `reservedCollateralAssets`, so the allowance check keeps no reserve
for a later maker operation. Simulate the whole sequence before asking the wallet for either
permission. It needs no signature requests, and `expiresAt` is the on-chain bundle deadline.

`prepareBlueWithdrawBuyCallback` takes the callback's market and position snapshots and
`callbackAddress`; `account` must be the callback's owner. It fixes every supply share in the
snapshot on one `blueWithdrawBuyCallback` step, a direct Morpho Blue `withdraw` with no approval,
authorization or signature request. Preparation rejects a callback the registered factory did not
create, another owner, or a revoked Blue authorization. It takes no referral fee, `supportSignature`
or `deployless`, and `expiresAt` is plan metadata only. Those checks run only at preparation:
`parseTransactionPlan` and `buildTransactions` are offline, and the built `withdraw` pays
`plan.account`. Restore only plans from a trusted source, send only from `plan.account` (reject a
plan whose `account` is not the connected wallet), and simulate before sending. The step withdraws
the snapshot's share count, not the position at send time: shares added later stay in the callback,
and a smaller position makes the withdrawal revert.

`prepareMidnightRedeem` takes a caller-fetched `positionData: AccrualPosition` bound to the
plan account and market. It fixes explicit `units` or defaults to the accrued face value.
`receiver` defaults to the account. This direct withdrawal needs no approvals or signature
requests, and `expiresAt` is plan metadata, not an on-chain deadline.

`prepareMidnightWithdrawCollateral` takes the sender's market and position snapshots from one
block, plus `collateralPrices` when the position has debt. It applies the entity
`withdrawCollateral` checks: `assets: maxUint256` withdraws the snapshot balance at
`collateralIndex`, and the remaining collateral must cover the debt at LLTV minus
`DEFAULT_LLTV_BUFFER`. `receiver` defaults to the account. The direct Midnight call needs no
approvals, authorizations or signature requests, and `expiresAt` is not an on-chain deadline.
`prepareMidnightWithdrawCollateralBatch` does the same for a nonempty ordered list of
`collateralWithdrawals`, one per index, in one Midnight core multicall to a shared `receiver`.

To withdraw credit into lend offers instead, fetch the owner-bound position at the reference
block and request a quote on the bid side. Pass the offers from `quote.data.takeableOffers`;
if the quote is empty, preparation throws `EmptyMidnightTakeableOffersError`.

```ts
import { buildTransactions, prepareMidnightTakeWithdraw, type TransactionPlan } from "@morpho-org/morpho-sdk";
import { fetchMidnightAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
import { MidnightApi } from "@morpho-org/morpho-sdk/midnight-api";
import { type Address, type Hash, createPublicClient, http } from "viem";
import { base } from "viem/chains";

async function prepareWithdrawal(account: Address, marketId: Hash) {
  const client = createPublicClient({ chain: base, transport: http() });
  const block = await client.getBlock();
  const positionData = await fetchMidnightAccrualPosition(client, {
    marketId,
    user: account,
    blockNumber: block.number,
  });
  const marketData = positionData.market;
  const assets = 1_000_000n;
  const maxUnits = 1_100_000n;
  // Quote the unit ceiling: fees come out of the proceeds, so fills sized to the net
  // assets could not deliver them.
  const quote = await new MidnightApi().fetchBookQuote({
    marketId,
    side: "bids",
    units: maxUnits,
    taker: account,
  });
  const plan: TransactionPlan = await prepareMidnightTakeWithdraw(client, {
    chainId: base.id,
    account,
    marketData,
    positionData,
    now: block.timestamp,
    target: { type: "assets", assets, maxUnits },
    takeableOffers: quote.data.takeableOffers,
  });
  // Simulate, then send in order from plan.account on plan.chainId.
  return buildTransactions(plan);
}
```

`prepareMidnightMakeBorrow` publishes caller-created PriceRatifierV1 or RateRatifierV1 sell offers
without supplying collateral or borrowing immediately. It needs no token approval or root
signature. See the [TransactionPlan guide](src/transactionPlan/README.md#midnight-maker-borrow-offers)
for a tree example, offline restoration, and which authorizations persist.

`prepareMidnightMakeLend` publishes caller-created buy offers without moving loan tokens.
Midnight core pulls the maker's tokens when someone fills the offers, so the plan may add a
core token approval for the offered and reserved budget. It never approves the bundle to spend
tokens or uses native ETH. See the [TransactionPlan guide](src/transactionPlan/README.md#midnight-maker-lend-offers)
for a tree example and the lifetime of the approval and grants.

`prepareMidnightMakeWithdraw` publishes caller-created PriceRatifierV1 or RateRatifierV1
reduce-only sell offers against existing maker credit. It does not withdraw funds or
decrease credit on publication. See the [TransactionPlan guide](src/transactionPlan/README.md#midnight-maker-withdrawal-offers)
for a tree example, offline restoration, and which authorizations persist.

`prepareMidnightMakeRepay` publishes caller-created PriceRatifierV1 or RateRatifierV1
reduce-only buy offers against existing maker debt. It may add a core token approval for
later fills but does not repay debt or move tokens on publication. See the
[TransactionPlan guide](src/transactionPlan/README.md#midnight-maker-repayment-offers)
for a tree example, offline restoration, and which approvals and authorizations persist.

`prepareMidnightSupplyCollateralMakeBorrow` supplies collateral and activates the maker's
PriceRatifierV1 or RateRatifierV1 sell-offer root in one bundle. It does not fill an offer,
create debt, or disburse loan assets. Collateral indexes are zero-based positions
in ascending collateral token address order. See the [TransactionPlan guide](src/transactionPlan/README.md#midnight-collateral-backed-maker-borrow-offers)
for a tree example, wrapped-native funding, and which approvals and authorizations persist.

`prepareMidnightSupplyBlueMakeLend` parks loan assets on Blue for the maker's BlueBuyCallback
and activates the maker's lend-offer root in the same bundle, without filling an offer. See
the [TransactionPlan guide](src/transactionPlan/README.md#midnight-blue-backed-maker-lend-offers)
for the callback-bound tree, offline restoration, and persistent approvals and authorizations.

`prepareMidnightRepayWithdrawCollateral` takes the sender's market and position snapshots from
the same block.
Use `repay: { type: "assets", assets }` for an exact repayment (zero for a collateral-only
withdrawal), or `repay: { type: "full", maxBuyerAssets }` to close the debt under a finite cap.
Both amounts are in the loan token's smallest units. Withdrawals are optional and go to the
sender unless you set `collateralReceiver`. There are no offer fills, referral fees, or signature
requests. The bundle requires allowance for the full pull even if you provide `nativeAmount`
in wei for a wrapped-native loan, plus a standalone authorization if not already granted.
If allowance is insufficient, the plan requests an unlimited (`maxUint256`, subject to
`MAX_TOKEN_APPROVALS`) ERC-20 approval to MidnightBundlesV2. Once granted, the approval does
not expire with the plan.
See the [TransactionPlan guide](src/transactionPlan/README.md#midnight-repayment-and-collateral-withdrawal)
for a repayment example, collateral indexes, oracle prices, and expiry defaults.

`prepareMidnightCancelOffers` takes `account` and a nonempty list of distinct 32-byte `groups`,
fixed on one `midnightCancelOffers` step with no approvals, authorization or signature requests.
One group builds a bare Midnight `setConsumed(group, maxUint128, account)`; two or more build one
Midnight core `multicall`. It never targets MidnightBundlesV2, and `account` or a Midnight-authorized
operator must send it. `expiresAt` is plan metadata only, not an onchain deadline.

`prepareVaultV2ForceRedeem` takes `vaultAddress` and top-level `shares`, with no snapshot.
Caller-supplied `deallocations[].assets` and `shares` are fixed on one `vaultV2ForceRedeem` step
with no approvals or signature requests. It accepts neither `supportSignature` nor `deployless`.
`expiresAt` is plan metadata only, not an onchain deadline.

`prepareVaultV2Deposit` and `prepareVaultV2Withdraw` take one `vault: AccrualVaultV2` snapshot.
`prepareVaultV1MigrateToV2` takes `sourceVault: AccrualVault` and `targetVault: AccrualVaultV2` snapshots.

Preparers with token authorization default to `supportSignature: false`. With `true`, ERC-2612 tokens use permits and other
tokens fall back to direct approval; no Permit2 or fetch requests are generated. Callers fetch
snapshots before preparation. Builders return plain SDK transactions without step IDs or kinds.

When existing allowance is insufficient, withdrawal, redemption and migration plans request an unlimited (`maxUint256`)
ERC-2612 vault-share permit or direct share approval. The quote's `requiredShareAllowance` remains
the minimum needed for that exit; later exits reuse sufficient allowance without a
new signature. Deposit asset permits must instead sign the exact pull amount, not an unlimited
value. Finite format-2 withdrawal permits that cover the quoted minimum allowance remain valid;
this finite-permit compatibility does not apply to force-withdraw plans.

Deposit and migration plans accept `slippageTolerance`, which sets their on-chain maximum share price.
`vaultV1Withdraw` and `vaultV2Withdraw` plans do not accept it: the share-allowance quote uses `DEFAULT_SLIPPAGE_TOLERANCE`
internally, but these ordinary withdrawals have no on-chain share-price or maximum-shares bound. A price drop
before inclusion can burn more shares than quoted.

`vaultV1InKindRedeem` and `vaultV2InKindRedeem` are also asset-denominated, with no on-chain share-price or maximum-shares
bound. A price drop before inclusion can burn more shares than quoted.
Each preparer takes one caller-fetched `vault` snapshot (`AccrualVault` for V1, `AccrualVaultV2`
for V2) and no `deployless` option.
V1 and V2 prepare and stored in-kind quantities use `assets`; builders translate to the stable entity/ABI
`amount`. Share approvals store `shares`, while ERC-2612 typed data retains `value`.

Use `prepareVaultV2ForceWithdraw` with one caller-fetched `vault: AccrualVaultV2` snapshot for a
penalty-inclusive asset exit; it accepts no `deployless` option. Prepare and stored `assets`
include the penalty. Optional `slippageTolerance` derives the stored on-chain `minSharePriceE27`
floor from the snapshot, using the entity default when omitted; plans accept no raw floor override.
Share allowances and permits target VaultExitBundlesV1, and any permit
must be unlimited (`maxUint256`).

`prepareVaultV2ForceRedeem` takes `vaultAddress`, top-level `shares`, and ordered deallocations
with `assets`. It creates a native vault multicall with no `supportSignature` or `deployless`
option. Stored inputs retain `vault` and `redeem.shares`; the entity method is unchanged.

Use `prepareVaultV2Redeem(client, { shareToken, chainId, account, shares, supportSignature })`
to burn exactly `shares`; pass the account's share balance for a full redemption.
`supportSignature` defaults to `false` (direct approval); `true` uses an ERC-2612 share
permit when allowance is insufficient. No Permit2 is used. Exact-share redemption needs
no quote: `shareToken: Token` is required, but an address-only `new Token({ address })` is sufficient.
An accrual snapshot also satisfies `Token`. Redemption sets no minimum assets received and accepts
neither `slippageTolerance` nor `deployless`.
Plans are serializable data; `buildTransaction` and `buildTransactions` return plain
frozen SDK transactions without step `id` or `kind` fields.

```typescript
import {
  buildTransactions,
  getPendingSignatureRequests,
  applySignatures,
  type TransactionPlan,
} from "@morpho-org/morpho-sdk";
import type { WalletClient } from "viem";
import { signTypedData } from "viem/actions";

async function finalize(wallet: WalletClient, plan: TransactionPlan) {
  const signatures = await Promise.all(
    getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
      id,
      signature: await signTypedData(wallet, { ...typedData, account: plan.account }),
    })),
  );
  return buildTransactions(applySignatures(plan, signatures));
}
```

Parsing, inspection and builders reverify stored signatures offline against their requests and
actions. Permits bind owner, token, spender, value, nonce, deadline and chain; Morpho authorizations
bind owner, authorized address, nonce, deadline and chain, not operation amounts, markets or referral
fees/recipients. Integrators must protect those unsigned fields and check that the plan matches their
intent. Empty signature input still validates all requests and returns the original plan; omitted
IDs retain their existing signatures. Supplied IDs can replace invalid stored signatures, but every
replacement is verified.

### Import paths

Protocol-specific names are qualified in shared facades, for example `fetchBluePosition` and `fetchMidnightPosition` from `@morpho-org/morpho-sdk/fetch`. Canonical raw upstream names remain available under `/blue/{abis,addresses,constants,entities,errors,fetch,types,utils}` and `/midnight/{abis,constants,entities,errors,fetch,types,utils}`.

See the [documentation](https://docs.morpho.org/developers/sdks/morpho-sdk/) for the full API:
native wrapping, Vault V2 BluePublicAllocator reallocations, borrow-position migration, vault V1 →
V2 migration, force withdraw/redeem, and Midnight maker flows.

## Architecture

```mermaid
graph LR
    MC["client.morpho<br/>(morphoViemExtension)"]

    MC -->|.midnight| MN1
    MC -->|.blue| MM1
    MC -->|.vaultV2| MV2
    MC -->|.vaultV1| MV1

    subgraph VaultV1 Flow
        MV1[MorphoVaultV1]
        MV1 --> V1D[vaultV1Deposit]
        MV1 --> V1W[vaultV1Withdraw]
        MV1 --> V1R[vaultV1Redeem]
        MV1 --> V1IKR[vaultV1InKindRedeem]
        MV1 --> V1M[vaultV1MigrateToV2]

        V1D --> VBV1[VaultBundlesV1]
        V1W --> VBV1
        V1R --> VBV1
        V1M --> VBV1
        V1IKR -->|direct call| VEB[VaultExitBundlesV1]
    end

    subgraph VaultV2 Flow
        MV2[MorphoVaultV2]
        MV2 --> V2D[vaultV2Deposit]
        MV2 --> V2W[vaultV2Withdraw]
        MV2 --> V2R[vaultV2Redeem]
        MV2 --> V2IKR[vaultV2InKindRedeem]
        MV2 --> V2FW[vaultV2ForceWithdraw]
        MV2 --> V2FR[vaultV2ForceRedeem]

        V2D --> VBV1
        V2W --> VBV1
        V2R --> VBV1
        V2IKR -->|direct call| VEB
        V2FW -->|direct call| VEB
        V2FR -->|multicall| V2C[VaultV2 Contract]
    end

    subgraph Midnight Flow
        MN1[MorphoMidnight]
        MN1 --> MNT[fixed-rate taker actions]
        MN1 --> MNM[maker offer submission]
        MN1 --> MNR[repayWithdrawCollateral]
        MN1 --> MNP[ERC-20 collateral supply / redeem]
        MN1 --> MNS[native collateral supply]
        MN1 --> MNCB[collateral batches]
        MNT --> MNB2[MidnightBundlesV2]
        MNM --> MNB2
        MNR --> MNB2
        MNS --> MNB2
        MNP --> MNC[Midnight]
        MNCB -->|multicall| MNC
    end

    subgraph Blue Flow
        MM1[MorphoBlue]
        MM1 --> M1S[supply]
        MM1 --> M1SC[supplyCollateral]
        MM1 --> M1B[borrow]
        MM1 --> M1SCB[supplyCollateralBorrow]
        MM1 --> M1R[repay]
        MM1 --> M1WC[withdrawCollateral]
        MM1 --> M1RW[repayWithdrawCollateral]
        MM1 --> M1W[withdraw]
        MM1 --> M1M[refinance]
        MM1 --> M1WBC[withdrawBuyCallback]

        M1S --> BBV1[BlueBundlesV1]
        M1SC --> BBV1
        M1B --> BBV1
        M1SCB --> BBV1
        M1R --> BBV1
        M1WC --> BBV1
        M1RW --> BBV1
        M1W --> BBV1
        M1M --> BBV1

        M1WBC -->|direct call| MB[Morpho Blue]
        BBV1 -.->|reallocate / allocateFromIdle| BPA[Blue Public Allocator]
    end


    subgraph Shared
        REQ[getRequirements]
    end

    MV1 -.->|approval / permit| REQ
    MV2 -.->|approval / permit| REQ
    MM1 -.->|approval / permit / authorization| REQ
    MN1 -.->|approval / authorization| REQ

    style VBV1 fill:#e8f5e9,stroke:#4caf50
    style BBV1 fill:#e8f5e9,stroke:#4caf50
    style VEB fill:#fff3e0,stroke:#ff9800
    style V2C fill:#e3f2fd,stroke:#2196f3
    style REQ fill:#f3e5f5,stroke:#9c27b0
    style BPA fill:#fff9c4,stroke:#f9a825
```

## Development

Link this package to your app for local debugging:

```bash
# In this morpho-sdk project
bun run build
bun link
```

```bash
# In your other project
bun link @morpho-org/morpho-sdk
```

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
