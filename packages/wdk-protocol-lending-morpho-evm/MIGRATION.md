# Migrating to 4.0

Version 4 follows `@morpho-org/morpho-sdk` v9. Classic token approvals and vault-share approvals
are unlimited when the current allowance is below the required amount; sufficient existing
allowances are reused. The per-token approval caps and USDT-style zero-reset behavior remain.
Full-repay requirements now use the same unlimited approval behavior.

Remove `approvalAmount` from `RequirementOptions`. `ApprovalAmountLessThanSpendAmountError` is no
longer exported by this package. JavaScript callers that keep passing `approvalAmount` receive no
warning: the extra property is ignored and the SDK uses the unlimited approval behavior.
ERC-2612 token permits and Permit2 SignatureTransfer remain exact because the deployed bundles
pass the exact pull amount to the permit call. Vault-share permits authorize `maxUint256`.

`UnresolvedVaultWithdrawRequirementsError` now means the share allowance is below the SDK-derived
minimum. Larger leftover allowances satisfy the requirement; there is no upper allowance range.
The approval change also removes the former SDK share-burn ceiling. Asset-mode VaultBundlesV1
withdrawals, the asset-mode V1 `migrateToV2` source leg, and in-kind redemption have no on-chain
share-price or max-shares bound. With an unlimited share allowance, a share-price drop before
inclusion can burn more shares than quoted. Vault V2 `forceWithdraw` retains its
`minSharePriceE27` bound, shares-mode redemption uses a fixed share amount, and deposits and
migration destinations retain `maxSharePrice`.

# Migrating to 3.0

Version 3 follows `@morpho-org/blue-sdk-viem` v7 and `@morpho-org/morpho-sdk` v8: token
metadata reads now fail closed. Requirement resolution (`getRequirements` on prepared
handles and the `get*Requirements` methods) that reads ERC-20 metadata can now reject
with `UnknownTokenError` when a token's `decimals()` reverts, has no code, returns
undecodable data, or is out of range — previously the read silently defaulted to 0.
The same reads can also reject with `MalformedTokenMetadataError` when a token answers
`eip712Domain()` or a `bytes32` `name`/`symbol` retry with non-empty data that does not
decode; `name`, `symbol` and `eip712Domain` resolve to `undefined` only on revert or no code.
Unless `supportDeployless` is `false` — left unset, WDK reads use the SDK's
default deployless query — a query that reports malformed
`name()`/`symbol()`/`eip712Domain()` returndata throws `MalformedTokenMetadataError`
instead of falling back to direct reads: the query validates returndata more strictly
than viem's decoding (for example, it requires the `0x20` string offset).
When an ERC-20 funding permit is requested, requirement resolution falls back to
Permit2 or a classic approval if the token has neither `name()` nor an EIP-5267
domain.
Only direct `encodeErc20Permit`/`getPermitTypedData` callers see
`MissingPermitDomainNameError`. `UnknownTokenError`,
`MissingPermitDomainNameError` and `MalformedTokenMetadataError` are all
re-exported by `@morpho-org/wdk-protocol-lending-morpho-evm`. Transport and RPC errors (HTTP 429/503,
timeouts, JSON-RPC errors that are not revert-shaped) now propagate unchanged instead of returning
degraded metadata; a revert-shaped RPC error still reads as missing metadata.
With `useSimplePermit`, transport and RPC errors from the ERC-2612 `nonces()` probe now
propagate instead of falling back; only recognized contract reverts or undecodable
return data fall back to Permit2 or a classic approval.

Vault data reads performed by `supply`, `quoteSupply`, `prepareSupply`, `withdraw`,
`quoteWithdraw`, `prepareWithdraw`, `getVaultPosition`, and `getAccountData` can also
reject with `UnknownTokenError` when the vault share token's `decimals()` is unusable,
and with `MalformedTokenMetadataError` when its `eip712Domain()` or `bytes32`
`name`/`symbol` retry returns non-empty data that does not decode — including, unless
`supportDeployless` is `false`, when the deployless query reports malformed returndata,
in which case the read throws without falling back to direct reads.
Transport and RPC errors that are not revert-shaped from these reads also propagate
unchanged; a revert-shaped RPC error still reads as missing metadata.

Prepared `getRequirements()` calls and the WDK `get*Requirements()` methods can reject
with the re-exported `MissingContractCodeError` when a fixed bundles or protocol
contract has no code at its registered address. It also surfaces from `withdraw`
and `quoteWithdraw`, which resolve requirements internally. A prepared Vault V2
withdrawal's `submit()` and `quote()` do too when no share permit signature is supplied.

Recognized WDK provider failures now arrive as typed viem errors: `RpcError` subclasses such as
`InvalidInputRpcError` and `LimitExceededRpcError` (with the original `RpcRequestError` in the
cause chain), plus `HttpRequestError` and `TimeoutError`, instead of `UnknownRpcError`. They follow
viem's retry rules.
Provider `AbortError` and `TimeoutError` DOMExceptions surface as viem `TimeoutError` with the
original exception in `cause`. Only when one of these rejects the EOA
`client.sendRawTransaction()` call during an operation method or `prepared.submit()` is it wrapped
as `UnconfirmedBroadcastError`.
During an EOA send, `UnconfirmedBroadcastError` means delivery may have succeeded after a status-less
network error such as `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `ENOTFOUND` or
`EAI_AGAIN`, `UND_ERR_*`, ethers `NETWORK_ERROR` or `TIMEOUT`, a provider `AbortError`/`TimeoutError`
DOMException, gateway status 502/504/524, or a failed reconciliation lookup. JSON-RPC and
HTTP-status send rejections are reconciled for every provider: if lookup finds the transaction, the
send resolves with the local hash; if the lookup fails, it throws `UnconfirmedBroadcastError`.
Other send errors are also reconciled when a failover provider is configured with retries enabled;
when `retries` is unset, WDK uses its default retry count of 3. A single provider or a failover
provider configured with `retries: 0` does not enable this path, so those other send errors are
re-thrown. If lookup succeeds but finds no transaction, a failover provider with retries enabled
produces `UnconfirmedBroadcastError`; otherwise WDK rethrows the original send error. Before
retrying after `UnconfirmedBroadcastError`,
look up its `hash` or rebroadcast its `serializedTransaction`. Handle `InvalidTransactionHashError`
when a wallet returns a malformed hash; for EOA sends its `eoa` field carries the local `localHash`
and `serializedTransaction` to look up before retrying.
Both errors extend `Error`, not viem `BaseError`, so `instanceof BaseError` checks on send failures
no longer match.

No input shapes changed; update error handling around requirement resolution
(`getRequirements` and `get*Requirements`), vault supply, withdrawal, and position reads, and
submissions (operation methods and `prepared.submit()`).

# Migrating to 2.0

Version 2 routes Morpho Blue writes through `BlueBundlesV1` and migrates vault deposits and withdrawals through `VaultBundlesV1`.

## Vault supply migration

Version 2 removes the Bundler3/GeneralAdapter1 vault deposit route and
`getSupplyRequirements`. The standard WDK `supply` and `quoteSupply` methods now use
VaultBundlesV1 with `MorphoExclusiveSupplyOptions` and existing token approvals or native
funding. Signed deposits use `prepareSupply`. The exported `MorphoSupplyOptions`,
`MorphoErc20SupplyOptions`, `MorphoNativeSupplyOptions`, and
`ApprovalOrSignatureRequirement` compatibility types are removed.
Bundler3-routed supply inputs and option-level requirement signatures are no longer accepted;
use the prepared VaultBundlesV1 handle instead.

Use `MorphoExclusiveSupplyOptions` with `prepareSupply`, then call the same handle's
`getRequirements`, `submit`, and `quote`. Every vault deposit uses VaultBundlesV1,
exclusive ERC-20 or native funding, and ERC-2612 or Permit2 SignatureTransfer permits.
Existing GeneralAdapter1 approvals and Permit2 AllowanceTransfer signatures cannot fund
these deposits. There is no Bundler3 fallback.

## Required changes

- Replace Vault V1 borrow reallocations with `VaultV2BlueReallocation` values on `MorphoBorrowOptions.reallocations`.
- Replace `MorphoBorrowWithVaultV2ReallocationsOptions` with `MorphoBorrowOptions`. The specialized opt-in type and the package's Vault V1 reallocation re-exports were removed.
- Remove `slippageTolerance` from `MorphoBorrowOptions`, `MorphoRepayOptions`, and Blue collateral-supply inputs. Constructor-level and vault-supply slippage settings now apply only to Morpho Vault V2 flows because BlueBundlesV1 has no Bundler3 share-price bounds.
- Call `getWithdrawCollateralRequirements` before `withdrawCollateral`. Send the returned authorization transaction, or sign the requirement and pass its result as `requirementSignature`.
- Use `MorphoCollateralSupplyOptions` for Blue collateral methods and `MorphoExclusiveSupplyOptions` for prepared vault deposits. Both successor types accept either `amount` or `nativeAmount`, never both. Mixing the funding keys throws `MixedBundlesFundingError` (exported by `@morpho-org/morpho-sdk`) for `prepareSupply` and `MixedBlueCollateralFundingError` (exported by this package) for Blue collateral.
- Migrate from `getSupplyRequirements(options)` to `prepareSupply(options)`. The returned handle carries `getRequirements(requirementOptions?)`, `submit(requirementSignature?, config?)`, and `quote(requirementSignature?, config?)` over one SDK action. Pass the signed permit to that same handle's `submit` or `quote`. Option-level vault `requirementSignature` is no longer accepted.
- When adopting `prepareSupply`, approve `VaultBundlesV1` instead of GeneralAdapter1. Existing GeneralAdapter1 allowances no longer fund vault deposits.
- Prepared vault deposits expire after two hours and enforce the signed permit's deadline; `slippageTolerance` still bounds `maxSharePrice`.
- Prepared supply methods recheck the live provider chain on every call. Handle `ChainIdMismatchError`, re-exported by this package, if the wallet switches away from the configured vault chain.
- Permit2 SignatureTransfer nonces are resolved automatically (lowest unused nonce) by token `get*Requirements` calls and the prepared deposit's `getRequirements`. Pass an explicit unused `permit2Nonce` only when concurrent flows for one owner must partition nonces.
- Use `prepareWithdraw` for vault withdrawals. VaultBundlesV1 burns the account's vault shares, so the withdrawal now needs a vault-share allowance between the SDK's derived share cap and that cap divided by `1 - slippageTolerance` — a prerequisite version 1 withdrawals did not have. `withdraw(options)` resolves that requirement before submitting and throws the new `UnresolvedVaultWithdrawRequirementsError` unless such an allowance is already in place.
- Recreate cached vault-share approvals. The new spender is VaultBundlesV1, and an allowance outside that range — including a larger leftover approval — is replaced rather than reused, so the per-withdrawal cap holds.
- Constructor-level `slippageTolerance` now also bounds vault withdrawals: it widens the derived share cap the same way it widens the vault-deposit share-price bound.
- Recreate cached approvals and Morpho authorizations for Blue writes. Their spender and authorization target is now BlueBundlesV1 instead of GeneralAdapter1.
- Blue writes now expire after two hours instead of using an unbounded deadline; signed calls preserve the requirement signature's deadline.
- With signatures disabled, `getRepayRequirements({ amount: "max" })` may return the token's
  reusable maximum approval; the later BlueBundlesV1 transaction still uses a bounded funding cap
  and refunds excess.

## Deprecation-window exception

`BlueApprovalOrSignatureRequirement` and the Bundler3-routed input shapes were deprecated only during
the 2.0.0 prerelease and are removed without a published deprecation window. This is the one-time
lifecycle deviation recorded in
[`ADR-2026-09-17`](../../docs/adrs/ADR-2026-09-17-remove-bundler3-primitives-without-deprecation.md).
Stay on 1.x if an integration still depends on those inputs.

## TypeScript output changes

- Prepared-handle `getRequirements()` returns a readonly array. Treat it as an immutable result instead of
  pushing requirements into it.
- `RequirementApproval` and `RequirementAuthorization` are readonly transactions.
- `RequirementSignatureRequest<TSignature>` is now generic. Prepared vault and Blue token requirements use
  `BundlesTokenRequirementSignature` (renamed from `BlueBundlesV1TokenRequirementSignature`),
  and Blue authorization requirements use
  `AuthorizationRequirementSignature`.
- Use `BundlesApprovalOrSignatureRequirement` for prepared vault deposits and Blue token-funded writes, and
  `AuthorizationOrSignatureRequirement` for Blue borrow or withdrawal authorization.
- Remove imports of `BlueApprovalOrSignatureRequirement`; use
  `BundlesApprovalOrSignatureRequirement` instead.
- `requirementSignature` is correspondingly narrowed on `MorphoCollateralSupplyOptions`,
  `MorphoBorrowOptions`, `MorphoRepayOptions`, and the new `MorphoWithdrawCollateralOptions`.
  Vault token and share signatures are passed to `PreparedMorphoSupply.submit` / `.quote`
  and `PreparedMorphoWithdraw.submit` / `.quote`, respectively, as the first argument.

## Borrow reallocations

Before:

```ts
import type {
  MorphoBorrowWithVaultV2ReallocationsOptions,
  VaultReallocation,
} from "@morpho-org/wdk-protocol-lending-morpho-evm";
```

After:

```ts
import type {
  MorphoBorrowOptions,
  VaultV2BlueReallocation,
} from "@morpho-org/wdk-protocol-lending-morpho-evm";

const options = {
  token: loanToken,
  amount: 1_000_000n,
  reallocations,
} satisfies MorphoBorrowOptions;
```

## Vault withdrawal share requirements

```ts
const prepared = await morpho.prepareWithdraw({ token, amount: 1_000_000n });
const requirements = await prepared.getRequirements();

const requirement = requirements[0];
if (requirement && "sign" in requirement) {
  const requirementSignature = await requirement.sign(walletClient, userAddress);
  const quote = await prepared.quote(requirementSignature); // { fee: bigint }
  await prepared.submit(requirementSignature);
} else {
  for (const transaction of requirements) {
    if ("to" in transaction) {
      const result = await account.sendTransaction({
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
      });
      await publicClient.waitForTransactionReceipt({ hash: result.hash });
    }
  }
  const quote = await prepared.quote(); // { fee: bigint }
  await prepared.submit();
}
```

`getRequirements()` re-validates the withdrawal deadline on every call, so a prepared withdrawal
reused after its deadline throws `ExpiredDeadlineError` instead of returning stale prerequisites.

The share allowance is the only cap on how many shares the exit burns, so `withdraw(options)`
resolves the same requirement before submitting and throws
`UnresolvedVaultWithdrawRequirementsError` when one is outstanding — including when a leftover
allowance above that range would let a share-price loss burn past the derived cap.

`quoteWithdraw(options)` and unsigned `prepared.quote()` also check the share allowance
before estimating gas and throw `UnresolvedVaultWithdrawRequirementsError` when it is outstanding.
For a first withdrawal, satisfy the requirements and quote through the same prepared handle as
shown above, so the quote uses the approved share cap or the corresponding signed permit.
All three prepared methods (`getRequirements`, `quote`, and `submit`) re-read the provider chain
before using the captured action and throw `ChainIdMismatchError` after a switch away from the
configured vault chain.

## Collateral withdrawal authorization

```ts
const options = {
  token: collateralToken,
  amount: 1_000_000n,
};
const requirements = await morpho.getWithdrawCollateralRequirements(options);

const requirement = requirements[0];
if (requirement && "sign" in requirement) {
  const requirementSignature = await requirement.sign(walletClient, userAddress);
  await morpho.withdrawCollateral({ ...options, requirementSignature });
} else {
  for (const transaction of requirements) {
    if ("to" in transaction) {
      const result = await account.sendTransaction({
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
      });
      await publicClient.waitForTransactionReceipt({ hash: result.hash });
    }
  }
  await morpho.withdrawCollateral(options);
}
```

## Vault deposits

Before (Bundler3 requirements and option-level signatures removed in 2.0):

```ts
const options = { token: vaultAsset, amount: 1_000_000n };
const requirements = await morpho.getSupplyRequirements(options);

let requirementSignature;
for (const requirement of requirements) {
  if ("sign" in requirement) {
    requirementSignature = await requirement.sign(walletClient, userAddress);
  } else {
    const result = await account.sendTransaction({
      to: requirement.to,
      value: requirement.value,
      data: requirement.data,
    });
    await publicClient.waitForTransactionReceipt({ hash: result.hash });
  }
}
await morpho.supply({ ...options, requirementSignature });
```

After:

```ts
const prepared = await morpho.prepareSupply({ token: vaultAsset, amount: 1_000_000n });
const requirements = await prepared.getRequirements();

let requirementSignature;
for (const requirement of requirements) {
  if ("sign" in requirement) {
    requirementSignature = await requirement.sign(walletClient, userAddress);
  } else {
    const result = await account.sendTransaction({
      to: requirement.to,
      value: requirement.value,
      data: requirement.data,
    });
    await publicClient.waitForTransactionReceipt({ hash: result.hash });
  }
}

await prepared.submit(requirementSignature);
```

`prepareSupply` resolves the vault and its share price once, and each handle only accepts the
signature produced by its own `getRequirements`. Reuse one handle across resolution and
submission: passing a signature from a different handle throws `BundlesPermitMismatchError`.

`repay({ amount: "max" })` now uses BlueBundlesV1's saturated full-repay mode, so it closes the live remaining debt even if the borrow-share balance decreases before execution.
