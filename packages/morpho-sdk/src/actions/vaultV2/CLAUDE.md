# Vault V2 Operations

> Parent: [`src/actions/CLAUDE.md`](../CLAUDE.md)

Pure transaction builders for VaultV2 vault interactions. Each function validates inputs, encodes calldata, optionally appends metadata, and returns a deep-frozen `Transaction<TAction>`.

## Functions

### `vaultV2Deposit`

Builds a deposit transaction routed through the **bundler** (general adapter). Supports native token wrapping for wNative vaults.

| Param                       | Type      | Description                                                      |
| --------------------------- | --------- | ---------------------------------------------------------------- |
| `vault.chainId`             | `number`  | Chain ID (used to resolve bundler addresses)                     |
| `vault.address`             | `Address` | Vault contract address                                           |
| `vault.asset`               | `Address` | Underlying ERC20 token address                                   |
| `args.amount`               | `bigint?` | Amount of ERC-20 assets to deposit                               |
| `args.nativeAmount`         | `bigint?` | Amount of native token to wrap and deposit (wNative vaults only) |
| `args.maxSharePrice`        | `bigint`  | Max acceptable share price (slippage protection)                 |
| `args.recipient`            | `Address` | Receives the vault shares                                        |
| `args.requirementSignature` | optional  | Pre-signed permit/permit2 approval                               |
| `metadata`                  | optional  | Analytics metadata to append                                     |

At least one of `amount` or `nativeAmount` must be provided.

**Routing logic:**

- If `nativeAmount` is provided → `nativeTransfer` (native token → Bundler3 → GeneralAdapter1) + `wrapNative` actions are prepended. `tx.value` is set to `nativeAmount`.
- If `requirementSignature` is provided → `getRequirementsAction()` resolves the permit/permit2 bundler actions, then `erc4626Deposit`.
- If no signature → `erc20TransferFrom` to general adapter, then `erc4626Deposit`.
- The `erc4626Deposit` uses `totalAssets = amount + nativeAmount`.
- Actions are bundled atomically via `BundlerAction.encodeBundle()`.

**Validation:** Throws `NonPositiveAssetAmountError` if `amount < 0n`, `NonPositiveMaxSharePriceError` if `maxSharePrice <= 0n`, `NativeAmountOnNonWNativeVaultError` if vault asset is not wNative, `ChainWNativeMissingError` if chain has no configured wNative, `NegativeNativeAmountError` if `nativeAmount < 0n`, `ZeroDepositAmountError` if both amounts are zero.

**Security:** The general adapter enforces `maxSharePrice` on-chain. **Never bypass it** — vaults without dead deposit protection are vulnerable to inflation attacks.

**Returns:** `Readonly<Transaction<VaultV2DepositAction>>`

---

### `vaultV2Withdraw`

Builds a withdraw transaction as a **direct vault call** (no bundler).

| Param            | Type      | Description                     |
| ---------------- | --------- | ------------------------------- |
| `vault.address`  | `Address` | Vault contract address          |
| `args.assets`    | `bigint`  | Amount of assets to withdraw    |
| `args.recipient` | `Address` | Receives the withdrawn assets   |
| `args.onBehalf`  | `Address` | Address whose shares are burned |
| `metadata`       | optional  | Analytics metadata to append    |

**Validation:** Throws `NonPositiveAssetAmountError` if `assets <= 0n`.

**Why no bundler?** Withdraw has no inflation attack surface. Direct call avoids unnecessary approval overhead.

**Returns:** `Readonly<Transaction<VaultV2WithdrawAction>>`

---

### `vaultV2Redeem`

Builds a redeem transaction as a **direct vault call** (no bundler).

| Param            | Type      | Description                     |
| ---------------- | --------- | ------------------------------- |
| `vault.address`  | `Address` | Vault contract address          |
| `args.shares`    | `bigint`  | Amount of shares to redeem      |
| `args.recipient` | `Address` | Receives the redeemed assets    |
| `args.onBehalf`  | `Address` | Address whose shares are burned |
| `metadata`       | optional  | Analytics metadata to append    |

**Validation:** Throws `NonPositiveSharesAmountError` if `shares <= 0n`.

**Why no bundler?** Same rationale as withdraw — no attack surface.

**Returns:** `Readonly<Transaction<VaultV2RedeemAction>>`

### `vaultV2ForceWithdraw`

Builds a force withdraw transaction using VaultV2's native **multicall**.

Encodes one or more `forceDeallocate` calls followed by a single `withdraw`, executed atomically via `multicall` on the VaultV2 contract.
This allows a user to free liquidity from adapters other than the liquidity adapter and withdraw the resulting assets in one transaction.

| Param                     | Type             | Description                                                      |
| ------------------------- | ---------------- | ---------------------------------------------------------------- |
| `vault.address`           | `Address`        | Vault contract address                                           |
| `args.deallocations`      | `Deallocation[]` | List of `{ adapter, marketParams?, assets }` to force-deallocate |
| `args.withdraw.assets`    | `bigint`         | Amount of assets to withdraw after deallocations                 |
| `args.withdraw.recipient` | `Address`        | Recipient of the withdrawn assets                                |
| `args.onBehalf`           | `Address`        | Address from which the penalty is taken (share owner)            |
| `metadata`                | optional         | Analytics metadata to append                                     |

**Validation:** Throws `EmptyDeallocationsError` if `deallocations` is empty. Throws `NonPositiveAssetAmountError` if `withdraw.assets <= 0n`.

**Deallocation data encoding:** When `marketParams` is provided (Morpho Market V1 adapter), the data is ABI-encoded from the `MarketParams`. When `marketParams` is omitted (e.g. Vault V1 adapter), empty bytes (`0x`) are passed.

**Penalty mechanism:** For each deallocation, a penalty (proportional to `forceDeallocatePenalty[adapter]`) is taken from `onBehalf` as a share burn. The withdrawn penalty assets are returned to the vault, so `totalAssets` and `totalSupply` decrease but the vault's actual controlled assets do not.

**Returns:** `Readonly<Transaction<VaultV2ForceWithdrawAction>>`

---

### `vaultV2ForceRedeem`

Builds a force redeem transaction using VaultV2's native **multicall**.

Encodes one or more `forceDeallocate` calls followed by a single `redeem`, executed atomically via `multicall` on the VaultV2 contract.
This is the share-based counterpart to `vaultV2ForceWithdraw`, useful for maximum withdrawal scenarios where specifying an exact asset amount is impractical.

| Param                   | Type             | Description                                                      |
| ----------------------- | ---------------- | ---------------------------------------------------------------- |
| `vault.address`         | `Address`        | Vault contract address                                           |
| `args.deallocations`    | `Deallocation[]` | List of `{ adapter, marketParams?, assets }` to force-deallocate |
| `args.redeem.shares`    | `bigint`         | Amount of shares to redeem after deallocations                   |
| `args.redeem.recipient` | `Address`        | Recipient of the redeemed assets                                 |
| `args.onBehalf`         | `Address`        | Address from which the penalty is taken (share owner)            |
| `metadata`              | optional         | Analytics metadata to append                                     |

**Validation:** Throws `EmptyDeallocationsError` if `deallocations` is empty. Throws `NonPositiveSharesAmountError` if `redeem.shares <= 0n`.

**Deallocation data encoding:** Same as `vaultV2ForceWithdraw` — when `marketParams` is provided (Morpho Market V1 adapter), the data is ABI-encoded from the `MarketParams`. When `marketParams` is omitted (e.g. Vault V1 adapter), empty bytes (`0x`) are passed.

**Liquidity constraint:** The total assets passed to `forceDeallocate` calls must be greater than or equal to the asset-equivalent of the redeemed shares. The caller should apply a buffer on the deallocated amounts to account the share-price drift between submission and execution.

**Penalty mechanism:** Same as `vaultV2ForceWithdraw` — for each deallocation, a penalty (proportional to `forceDeallocatePenalty[adapter]`) is taken from `onBehalf` as a share burn.

**Returns:** `Readonly<Transaction<VaultV2ForceRedeemAction>>`

---

## Common Pattern

All five functions follow the same structure:

1. **Validate** inputs (throw dedicated errors).
2. **Encode** calldata (`BundlerAction.encodeBundle` for deposit, `encodeFunctionData` + `multicall` for forceWithdraw/forceRedeem, `encodeFunctionData` for withdraw/redeem).
3. **Append metadata** if provided via `addTransactionMetadata`.
4. **Deep-freeze** and return `{ ...tx, action: { type, args } }`.
