[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getMidnightApprovalRequirements

# Function: getMidnightApprovalRequirements()

> **getMidnightApprovalRequirements**(`params`): `Promise`\<readonly `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>\>[]\>

Defined in: [packages/morpho-sdk/src/actions/requirements/midnight/getMidnightApprovalRequirements.ts:62](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/midnight/getMidnightApprovalRequirements.ts#L62)

Resolves classic ERC20 approval requirements for a Midnight spender.

Entity flows call this from `getRequirements()`. Direct low-level consumers
should call it before encoding a Midnight action that lets `Midnight` or
`MidnightBundles` pull ERC20 tokens from the user.

## Parameters

### params

[`GetMidnightApprovalRequirementsParams`](../interfaces/GetMidnightApprovalRequirementsParams.md)

## Returns

`Promise`\<readonly `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>\>[]\>

Approval transactions required for `spender` to pull `amount`.

## Throws

when the viem client is connected to another chain.

## Throws

when `amount < 0n`.

## Throws

when `spender` is not the chain's Midnight or MidnightBundles deployment.

## Example

```ts
import {
  getMidnightApprovalRequirements,
  midnightTakeLend,
} from "@morpho-org/morpho-sdk";

const approvals = await getMidnightApprovalRequirements({
  viemClient: client,
  chainId: 8453,
  token: loanToken,
  owner: user,
  spender: midnightBundles,
  amount: 1_000_000n,
});
if (approvals.length === 0) {
  const tx = midnightTakeLend(takeParams);
}
```
