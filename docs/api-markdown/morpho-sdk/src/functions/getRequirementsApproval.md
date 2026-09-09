[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getRequirementsApproval

# Function: getRequirementsApproval()

> **getRequirementsApproval**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>\>[]

Defined in: [packages/morpho-sdk/src/actions/requirements/getRequirementsApproval.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/getRequirementsApproval.ts#L50)

Computes classic ERC-20 approval transactions for a supported SDK spender, given the existing
allowance.

The spender is validated by [encodeErc20Approval](encodeErc20Approval.md). Supported spenders are the chain's
GeneralAdapter1, Permit2, Midnight, MidnightBundles, and VaultExitBundlesV1 addresses when
configured.

Returns an empty array when the allowance already covers `spendAmount`. When the token is in
`APPROVE_ONLY_ONCE_TOKENS` (e.g. USDT) and the existing allowance is non-zero, prepends a
`approve(spender, 0)` reset transaction to satisfy those tokens' allowance-must-be-zero rule
before re-approving.

## Parameters

### params

#### address

`` `0x${string}` ``

ERC-20 token address.

#### allowances

`bigint`

The user's current allowance of `address` for `spender`.

#### args

\{ `approvalAmount`: `bigint`; `spendAmount`: `bigint`; `spender`: `` `0x${string}` ``; \}

#### args.approvalAmount

`bigint`

The amount to approve (often equal to `spendAmount`, but
  may be `MAX_UINT_160` for Permit2 prerequisites).

#### args.spendAmount

`bigint`

The amount the bundle will actually pull.

#### args.spender

`` `0x${string}` ``

Address that will be granted the approval. Must be GeneralAdapter1,
  Permit2, Midnight, MidnightBundles, or VaultExitBundlesV1 for `chainId`.

#### chainId

`number`

The chain the transaction targets, used to resolve supported spenders
  and token approval caps.

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>\>[]

Up to two deep-frozen `Transaction<ERC20ApprovalAction>` entries: an optional reset
  followed by the new approval. Empty when no approval is needed.

## Throws

when `approvalAmount < spendAmount`.

## Throws

when `spender` is not a supported SDK spender for `chainId`.

## Example

```ts
import { getRequirementsApproval } from "@morpho-org/morpho-sdk";

const txs = getRequirementsApproval({
  address: USDC,
  chainId: 1,
  args: { approvalAmount: 1_000_000n, spendAmount: 1_000_000n, spender: generalAdapter1 },
  allowances: 0n,
});
// txs satisfies Readonly<Transaction<ERC20ApprovalAction>>[]
```
