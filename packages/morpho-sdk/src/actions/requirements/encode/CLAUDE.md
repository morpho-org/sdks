# Encode — Low-Level Calldata Encoders

> Parent: [`src/actions/requirements/CLAUDE.md`](../CLAUDE.md)

Leaf-level functions that produce the final transaction or requirement objects for each approval type. Called by the `getRequirements*` functions above.

## Functions

### `encodeErc20Approval`

Encodes a classic ERC20 `approve(spender, amount)` call.

| Param     | Type      | Description                                                       |
| --------- | --------- | ----------------------------------------------------------------- |
| `token`   | `Address` | ERC20 token to approve                                            |
| `spender` | `Address` | Contract receiving the allowance                                  |
| `amount`  | `bigint`  | Approval amount (capped by `MAX_TOKEN_APPROVALS` per chain/token) |
| `chainId` | `number`  | Chain ID (used for per-token approval caps)                       |

**Behavior:**

- Caps the amount to `min(amount, MAX_TOKEN_APPROVALS[chainId][token] ?? maxUint256)`.
- Encodes via `encodeFunctionData` with standard `erc20Abi`.
- Returns a deep-frozen `Transaction<ERC20ApprovalAction>`.

**Returns:** `Transaction<ERC20ApprovalAction>` (synchronous, pure)

---

### `encodeErc20Permit`

Builds a `Requirement` for EIP-2612 permit signature.

| Param               | Type      | Description                                        |
| ------------------- | --------- | -------------------------------------------------- |
| `viemClient`        | `Client`  | Connected viem client (must match `chainId`)       |
| `token`             | `Address` | ERC20 token with EIP-2612 support                  |
| `spender`           | `Address` | Contract receiving the allowance (general adapter) |
| `amount`            | `bigint`  | Permit amount                                      |
| `chainId`           | `number`  | Chain ID                                           |
| `nonce`             | `bigint`  | EIP-2612 nonce for the owner                       |
| `supportDeployless` | optional  | Use deployless mode for `fetchToken`               |

**Behavior:**

- Fetches token metadata on-chain (`fetchToken`).
- Sets a 2-hour deadline from current timestamp.
- Returns a `Requirement` with an async `sign(client, userAddress)` method that:
  1. Signs EIP-712 typed data via `signTypedData`.
  2. Verifies the signature via `verifyTypedData`.
  3. Returns a deep-frozen `{ args, action }` (type `PermitAction`).

**Validation:** Throws `ChainIdMismatchError`, `MissingClientPropertyError`, `AddressMismatchError`.

**Returns:** `Promise<Requirement>` (async due to on-chain fetch)

---

### `encodeErc20Permit2`

Builds a `Requirement` for Uniswap Permit2 signature.

| Param        | Type      | Description                                         |
| ------------ | --------- | --------------------------------------------------- |
| `token`      | `Address` | ERC20 token address                                 |
| `amount`     | `bigint`  | Permit2 allowance amount                            |
| `chainId`    | `number`  | Chain ID (resolves general adapter address)         |
| `nonce`      | `bigint`  | Permit2 nonce                                       |
| `expiration` | `bigint`  | Allowance expiration (`MAX_UINT_48` for indefinite) |

**Behavior:**

- Spender is always `generalAdapter1` — **never permit any other address** (prevents signature misuse).
- Sets a 2-hour signature deadline.
- Returns a `Requirement` with an async `sign(client, userAddress)` method that:
  1. Signs Permit2 EIP-712 typed data.
  2. Verifies the signature.
  3. Returns a deep-frozen `{ args, action }` (type `Permit2Action`).

**Validation:** Throws `MissingClientPropertyError`, `AddressMismatchError`.

**Returns:** `Requirement` (synchronous — signing is deferred to `sign()`)

## Common Patterns

- All returned objects are `deepFreeze`-d.
- Signatures use 2-hour deadlines (`Time.s.from.h(2n)`).
- `sign()` methods always verify the signature after signing for safety.
- Custom error classes for every failure case.
