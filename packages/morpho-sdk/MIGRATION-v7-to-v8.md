# Migrating `@morpho-org/morpho-sdk` from v7 to v8

Version 8 makes token metadata and RPC-backed requirement reads fail closed.
These calls now throw typed errors instead of returning partial or default values.

## Token metadata fails closed

`@morpho-org/blue-sdk-viem` v7 token metadata reads now fail closed. The
re-exported `fetchToken` and its `Token.fetch` facades change behavior, and
requirement resolvers that encode ERC-2612 permits can reject earlier and more
precisely.

The same behavior reaches vault share-token reads through `fetchVaultConfig`,
`fetchVault`, `fetchVaultUser`, `fetchAccrualVault`, `fetchVaultV2` and
`fetchAccrualVaultV2`. `MorphoVaultV1.getData()`, `MorphoVaultV2.getData()` and
`MorphoBlue.getVaultV2BlueReallocationData()` also use these fetch paths. These
calls can throw `UnknownTokenError` for unusable share-token decimals,
`MalformedTokenMetadataError` when the share token's `eip712Domain()` or `bytes32`
`name`/`symbol` retry — or the deployless query result — is malformed, and
propagate transport or RPC errors from share-token metadata reads.

Import these classes from `@morpho-org/morpho-sdk/blue/errors`, or from
`@morpho-org/morpho-sdk/errors`, which exports `UnknownTokenError` as
`UnknownBlueTokenError`. The package root doesn't export them.

### Token fetches reject on missing decimals and transport failures

`fetchToken` throws `UnknownTokenError` when `decimals()` reverts, the address
has no code, the returned data cannot be decoded, or the value is outside
0–255. v7 returned `decimals: 0` in every one of these cases. Genuine
0-decimal tokens still resolve with `decimals: 0`.

Transport errors and JSON-RPC errors that are not revert-shaped now propagate
unchanged from any metadata read; a revert-shaped RPC error (a data-less
`-32000 "execution reverted"`, even on a 5xx response) still reads as the
method being absent. Only
`name`, `symbol` and `eip712Domain` resolve to `undefined`, and only when the
call reverts or the contract has no code; a `name`/`symbol` that does not
decode as `string` is retried as `bytes32`, and an undecodable `bytes32` retry
or `eip712Domain()` result throws `MalformedTokenMetadataError` — its `cause`
holds the viem decode error or the deployless query's revert when one exists,
while a `bytes32` retry returning data that is not exactly 32 bytes throws
with no `cause`. Transport errors propagate.
A deployless query that reports `decimals: 0` falls back to direct ERC-20
reads. With `deployless: true` or `"force"`, a query that reports malformed
`name()`/`symbol()`/`eip712Domain()` returndata throws
`MalformedTokenMetadataError` instead of falling back: the query is stricter
than viem's decoding (for example, it requires the `0x20` string offset), so a
token that direct reads accept can be rejected in the default mode.

### Permit requirements throw typed errors

`encodeErc20Permit` throws `MissingPermitDomainNameError` when the token
exposes neither `name()` nor an EIP-5267 domain, and `UnknownTokenError` on
absent or invalid `decimals()`. Requirement resolution handles the missing
domain case for ERC-20 funding permits by falling back to Permit2 or a classic
approval. Vault V1 share permits do not use this fallback: when an insufficient
share allowance requires a permit, `encodeVaultSharesPermit` and the
`withdraw`, `redeem`, `migrateToV2`, and `inKindRedeem` requirement paths throw
`MissingPermitDomainNameError` if the share token has neither `name()` nor an
EIP-5267 domain. Transport errors from metadata reads and `UnknownTokenError`
still reject. With
`useSimplePermit`, a transport or RPC error from the ERC-2612 `nonces()` probe
now propagates instead of falling back; only recognized contract reverts and
undecodable return data fall back to Permit2 or classic approval.

## Wrong-chain RPC fails closed

v8 checks the RPC's `eth_chainId` before allowance, nonce, or position reads.
Guarded `getRequirements()` flows first read `eth_getCode` for their registry
targets and probe `eth_chainId` when a target has no code, so a wrong-chain
endpoint still fails with `ChainIdMismatchError`. Vault V1 `inKindRedeem` and
Vault V2 `inKindRedeem` / `forceWithdraw` validate the client chain before
those code checks.

### Calls that can now throw `ChainIdMismatchError` for the RPC's chain

Each of these calls sends its own uncached `eth_chainId` request and throws
`ChainIdMismatchError(observed, expected)` when the RPC reports another chain.
The same class was already thrown when the client declared another chain or
none, so existing `instanceof ChainIdMismatchError` handling covers both
cases. Treat it as a configuration error: point the client's transport at an
RPC URL for the expected chain.

- Entity reads: `MorphoBlue.getMarketData`, `MorphoBlue.getPositionData`,
  `MorphoBlue.getVaultV2BlueReallocationData`, `MorphoVaultV1.getData`,
  `MorphoVaultV2.getData`, `MorphoMidnight.getMarketData`,
  `MorphoMidnight.getPositionData`, and `MorphoMidnight.supplyBlueMakeLend`.
- `getRequirements()` on action outputs that read on-chain state, including
  Vault V1 `inKindRedeem` and Vault V2 `forceWithdraw` / `inKindRedeem`.
- Exported resolvers: `getBundlesTokenRequirements`, `getUnusedPermit2Nonce`,
  `getBlueAuthorizationRequirement`, `getMidnightApprovalRequirements`,
  `getMidnightAuthorizationRequirement` and `encodeErc20Permit`.

### Calls that can now throw viem errors from `eth_chainId`

These calls can also throw a `viem.BaseError` (for example `HttpRequestError`
or `TimeoutError`) when the `eth_chainId` request itself fails. Handle it like
any other transport error from the call.

### Not detected

An RPC that answers `eth_chainId` with the expected chain while serving another
chain's state is not detected (see `THREAT_MODEL.md`, RPC).

## Missing contract code fails closed

Blue, VaultV1 and VaultV2 prepared `getRequirements()` calls now throw
`MissingContractCodeError` when a registered bundles or protocol target has no
code. `simulate()` rejects calldata transactions to code-less addresses before
`eth_simulateV1`. These checks normally read target code before other
requirements; VaultV1 `inKindRedeem` and VaultV2 `inKindRedeem` /
`forceWithdraw` first validate the client chain with `eth_chainId`.

Every guarded Blue, VaultV1 and VaultV2 `getRequirements()` call checks each
distinct registered target with one `eth_getCode` request before its other
requirement reads, after any `eth_chainId` validation noted above. This also
applies to native-funded `MorphoBlue.supply`, the native-only legs of
`repayWithdrawCollateral` and `supplyCollateralBorrow`, and native-funded
VaultV1 and VaultV2 deposits; in v7 these paths returned no requirements
without RPC reads.

The remaining requirement reads of VaultV1 `inKindRedeem`, VaultV2
`inKindRedeem` and VaultV2 `forceWithdraw` are unchanged from v7 and follow the
client's `batch.multicall` setting. They now run after the `eth_chainId`
validation and the `eth_getCode` checks.

### Calls that can now throw viem errors from `eth_getCode`

A failed `eth_getCode` request rejects `getRequirements()` with the underlying
`viem.BaseError` (for example, `HttpRequestError` or `TimeoutError`). Handle it
like any other transport error from the call.

## Midnight taker health checks

Midnight `takeBorrow`, `supplyCollateralTakeBorrow`, `takeRepayWithdrawCollateral`, and
`repayWithdrawCollateral` now require caller-supplied `positionData` and `collateralPrices` to
validate the position after the operation using the SDK's fixed `DEFAULT_LLTV_BUFFER` (0.5%), the
same buffer used by Blue flows.

Get `positionData` from
`midnight.getPositionData({ marketId: marketData.id, accountAddress })`. For each collateral index,
read `price()` from the oracle at `marketData.params.collateralParams[i].oracle` with viem's
`readContract`. Prices use `ORACLE_PRICE_SCALE` and must be in the same index order as the market's
collateral parameters. `takeBorrow` and `supplyCollateralTakeBorrow` always need prices, because
debt after a borrow is always positive. `takeRepayWithdrawCollateral` and
`repayWithdrawCollateral` need prices only when `collateralWithdrawals` is non-empty and the SDK's
conservative post-operation debt is positive. For these two methods, pass `collateralPrices: []`
when there is no collateral withdrawal, including a partial repayment that leaves debt, or when the
conservative post-operation debt is zero, such as after a `full` repay, a repayment units target
covering `positionData.debt`, or `minUnits` / `repay.assets` covering it. For example:

```ts
midnight.takeBorrow({
  marketData,
  positionData,
  collateralPrices,
  target,
  // ...
});
```

The methods can throw:

- `BorrowExceedsSafeLtvError` when a borrow exceeds the buffered maximum debt.
- `WithdrawMakesPositionUnhealthyError` when a withdrawal leaves debt above the buffered maximum.
- `WithdrawExceedsCollateralError` when a withdrawal exceeds the position's collateral.
- `MissingMarketPriceError` when held collateral has no supplied oracle price.
- `UnknownCollateralIndexError` when a supplied collateral index is not configured on the market.
- `AccrualPositionUserMismatchError` when `positionData.user` differs from `accountAddress`.
- `MarketIdMismatchError` when `positionData.marketId` differs from `marketData.id`.

## Midnight `takeWithdraw` rejects a zero receiver

`midnightTakeWithdraw` and `MorphoMidnight.takeWithdraw` throw
`MidnightZeroReceiverError` (with `field: "receiver"`) when `receiver` is the
zero address. v7 built a transaction that sent the withdrawn loan assets to
`0x0`, burning them. The entity method defaults `receiver` to `accountAddress`,
so only an explicit `0x0` throws. Pass the address that should receive the
withdrawn assets.

Import `MidnightZeroReceiverError` from `@morpho-org/morpho-sdk`.

## Midnight receivers reject contracts that cannot forward funds

The Midnight take, repay-withdraw and redeem flows throw
`MidnightContractReceiverError` when a receiver is a contract that would keep
the assets permanently. v7 built these transactions, and the assets were lost
once they executed. The check covers:

- `receiver` on `takeBorrow`, `supplyCollateralTakeBorrow`, `takeWithdraw` and
  `redeem`;
- `collateralReceiver` on `takeRepayWithdrawCollateral` and
  `repayWithdrawCollateral`, when collateral withdrawals are requested;
- `referralFeeRecipient` on `takeLend`, `takeBorrow`,
  `supplyCollateralTakeBorrow`, `takeWithdraw` and
  `takeRepayWithdrawCollateral`, when `referralFeePct` is positive.

It applies to the `MorphoMidnight` entity methods and to their `midnight*`
builders (`midnightTakeBorrow`, `midnightRedeem`, and so on). A receiver is
rejected when it is one of the chain's Midnight protocol contracts
(`midnight`, `midnightBundlesV2`, `midnightBlueBuyCallbackFactory`,
`midnightMempool`, `ecrecoverRatifier`, `ecrecoverAuthorizer`,
`setterRatifier`, `priceRatifierV1`, `rateRatifierV1`), the market's loan
token, or one of its collateral tokens. The error's `field`, `receiver` and
`contract` properties name the rejected input. Pass an account that can hold
or forward the assets.

### `redeem` rejects a zero receiver and throws on the method call

`midnightRedeem` and `MorphoMidnight.redeem` also throw
`MidnightZeroReceiverError` (with `field: "receiver"`) when `receiver` is the
zero address. When `receiver` is omitted it defaults to the position owner, so
only an explicit `0x0` throws.

In v7, `MorphoMidnight.redeem` built its transaction inside `buildTx()`. v8
builds it when `redeem()` is called, so the receiver errors, and any other
error from `midnightRedeem`, now throw from `redeem()` itself. Move a `try`
that wraps only `buildTx()` so it also wraps the `redeem()` call:

```ts
// v7
const output = midnight.redeem({ accountAddress, positionData, receiver });
try {
  const tx = output.buildTx();
} catch (error) {
  // ...
}

// v8
try {
  const output = midnight.redeem({ accountAddress, positionData, receiver });
  const tx = output.buildTx();
} catch (error) {
  // ...
}
```

## Midnight `MidnightZeroReceiverError.field` adds `"collateralReceiver"`

`midnightRepayWithdrawCollateral`, `midnightTakeRepayWithdrawCollateral`,
`MorphoMidnight.repayWithdrawCollateral` and
`MorphoMidnight.takeRepayWithdrawCollateral` throw `MidnightZeroReceiverError`
with `field: "collateralReceiver"` when collateral withdrawals are requested
and `collateralReceiver` is the zero address. v7 built a transaction that sent
the collateral to `0x0`. Calls without collateral withdrawals still accept a
zero `collateralReceiver`.

The type of `MidnightZeroReceiverError.field` widens from `"receiver"` to
`"receiver" | "collateralReceiver"`. An exhaustive `switch` on `field` no
longer compiles until it handles `"collateralReceiver"`:

```ts
if (error instanceof MidnightZeroReceiverError) {
  switch (error.field) {
    case "receiver":
      // ...
      break;
    case "collateralReceiver":
      // ...
      break;
  }
}
```

## Midnight referral fees are capped at 10%

`takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `takeWithdraw` and
`takeRepayWithdrawCollateral`, as entity methods and as `midnight*` builders,
throw `MidnightReferralFeePctExceededError` when `referralFeePct` is above 10%
(`WAD / 10n`). v7 accepted any fee the contract accepts, which is any value
below `WAD`. The cap is enforced only by the SDK; the contract does not
enforce it. `MidnightReferralFeePctExceededError` extends
`InputExceedsMaxError`, so existing `instanceof InputExceedsMaxError` handling
also catches it. Lower `referralFeePct` to 10% or less.

## Midnight maker deadlines throw `ExpiredDeadlineError`

`makeLend`, `makeBorrow`, `supplyBlueMakeLend`, `makeWithdraw`, `makeRepay`,
`supplyCollateralMakeBorrow`, `repayWithdrawCollateral` and `cancelOffers`
throw `ExpiredDeadlineError` when `deadline` is at or before the local clock
(`Time.timestamp()`), before any API read. v7 built a transaction that
reverted on-chain with `DeadlinePassed()`. `maxUint256` still means no expiry.

A zero or negative `deadline` on these methods now throws
`ExpiredDeadlineError` instead of `NonPositiveInputError`. Code that catches
`NonPositiveInputError` to detect a bad deadline must catch
`ExpiredDeadlineError` instead; its `deadline` and `timestamp` properties hold
the rejected deadline and the time it was checked against. The `midnight*`
transaction builders stay clock-free and do not run this check.

Import `MidnightContractReceiverError`, `MidnightZeroReceiverError`,
`MidnightReferralFeePctExceededError`, `InputExceedsMaxError` and
`ExpiredDeadlineError` from `@morpho-org/morpho-sdk`.
