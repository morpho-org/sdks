# Vault V1 (MetaMorpho) Operations

> Parent: [`src/actions/CLAUDE.md`](../CLAUDE.md)

Pure transaction builders for VaultV1 (MetaMorpho) vault interactions. Each function validates inputs, encodes calldata, optionally appends metadata, and returns a deep-frozen `Transaction<TAction>`.

## Functions

### `vaultV1Deposit`

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

**Native wrapping flow:** When `nativeAmount` is provided, the bundler prepends `nativeTransfer` (token native → Bundler3 → GeneralAdapter1) + `wrapNative` (wNative wrapping) before the `erc4626Deposit` action. `tx.value` is set to `nativeAmount`. Validates that `vault.asset` matches the chain's `wNative` address.

**Routing logic:** Same as VaultV2 — bundler with `erc4626Deposit`. Never bypass the general adapter.

**Returns:** `Readonly<Transaction<VaultV1DepositAction>>`

---

### `vaultV1Withdraw`

Builds a withdraw transaction as a **direct vault call** (no bundler). Uses `metaMorphoAbi`.

| Param            | Type      | Description                     |
| ---------------- | --------- | ------------------------------- |
| `vault.address`  | `Address` | Vault contract address          |
| `args.assets`    | `bigint`  | Amount of assets to withdraw    |
| `args.recipient` | `Address` | Receives the withdrawn assets   |
| `args.onBehalf`  | `Address` | Address whose shares are burned |
| `metadata`       | optional  | Analytics metadata to append    |

**Returns:** `Readonly<Transaction<VaultV1WithdrawAction>>`

---

### `vaultV1Redeem`

Builds a redeem transaction as a **direct vault call** (no bundler). Uses `metaMorphoAbi`.

| Param            | Type      | Description                     |
| ---------------- | --------- | ------------------------------- |
| `vault.address`  | `Address` | Vault contract address          |
| `args.shares`    | `bigint`  | Amount of shares to redeem      |
| `args.recipient` | `Address` | Receives the redeemed assets    |
| `args.onBehalf`  | `Address` | Address whose shares are burned |
| `metadata`       | optional  | Analytics metadata to append    |

**Returns:** `Readonly<Transaction<VaultV1RedeemAction>>`

---

## Common Pattern

All three functions follow the same structure:

1. **Validate** inputs (throw dedicated errors).
2. **Encode** calldata (`BundlerAction.encodeBundle` for deposit, `encodeFunctionData` for withdraw/redeem).
3. **Append metadata** if provided via `addTransactionMetadata`.
4. **Deep-freeze** and return `{ ...tx, action: { type, args } }`.
