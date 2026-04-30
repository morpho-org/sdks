# Requirements — Approval Resolution

> Parent: [`src/actions/CLAUDE.md`](../CLAUDE.md)

Resolves what token approvals a user needs before depositing into a vault. The result is either a classic approval transaction or a signature-based requirement (permit / permit2).

## Decision Tree

```
getRequirements(viemClient, params)
  │
  ├─ supportSignature: false
  │     └─► getRequirementsApproval()  →  Transaction<ERC20ApprovalAction>[]
  │
  └─ supportSignature: true
        │
        ├─ token supports EIP-2612 AND useSimplePermit
        │     └─► getRequirementsPermit()  →  Requirement[] (with sign())
        │
        ├─ permit2 contract exists on chain
        │     └─► getRequirementsPermit2() →  (Transaction | Requirement)[]
        │
        └─ fallback
              └─► getRequirementsApproval()  →  Transaction<ERC20ApprovalAction>[]
```

## Functions

### `getRequirements` (orchestrator)

Entry point. Fetches on-chain holding data (`fetchHolding`) then delegates to the correct strategy.

| Param               | Type      | Description                                                                |
| ------------------- | --------- | -------------------------------------------------------------------------- |
| `viemClient`        | `Client`  | Connected viem client (must match `chainId`)                               |
| `address`           | `Address` | ERC20 token address                                                        |
| `chainId`           | `number`  | Target chain ID                                                            |
| `args.amount`       | `bigint`  | Required token amount                                                      |
| `args.from`         | `Address` | Account granting approval                                                  |
| `supportSignature`  | `boolean` | Enable signature-based flows                                               |
| `supportDeployless` | optional  | Use deployless mode for on-chain reads                                     |
| `useSimplePermit`   | optional  | Prefer EIP-2612 permit when available (only with `supportSignature: true`) |

**Validation:** Throws `ChainIdMismatchError` if `viemClient.chain.id !== chainId`.

---

### `getRequirementsApproval`

Classic `approve()` transaction. Checks current allowance against required spend amount.

- If allowance is sufficient → returns `[]`.
- If token is in `APPROVE_ONLY_ONCE_TOKENS` and has a non-zero allowance → prepends a reset-to-zero approval before the actual approval.
- Validates `approvalAmount >= spendAmount` (throws `ApprovalAmountLessThanSpendAmountError`).

**Returns:** `Readonly<Transaction<ERC20ApprovalAction>>[]`

---

### `getRequirementsPermit`

EIP-2612 permit signature. Checks general adapter allowance.

- If allowance is sufficient → returns `[]`.
- Otherwise → builds a `Requirement` with a `sign()` method that produces a `PermitAction`.

**Returns:** `Requirement[]` — each has an async `sign(client, userAddress)` method.

---

### `getRequirementsPermit2`

Uniswap Permit2 flow. Two-step:

1. **ERC20 → Permit2 allowance:** If insufficient, adds a classic `approve()` tx for infinite amount (`MAX_UINT_160`).
2. **Permit2 → General Adapter allowance:** If insufficient or expiring within 4 hours, adds a `Requirement` with a `sign()` method for permit2 signature.

**Returns:** `Readonly<(Transaction<ERC20ApprovalAction> | Requirement)>[]`

---

### `getRequirementsAction`

Converts a pre-signed `requirementSignature` into bundler `Action[]` for use inside `vaultV2Deposit`.

- `permit` type → `permit` + `erc20TransferFrom` actions.
- `permit2` type → `approve2` + `transferFrom2` actions.

**Returns:** `Action[]` (bundler-compatible)

## Sub-Layer

| Path      | Role                                               | Docs                                   |
| --------- | -------------------------------------------------- | -------------------------------------- |
| `encode/` | Low-level calldata encoders for each approval type | [`encode/AGENTS.md`](encode/AGENTS.md) |
