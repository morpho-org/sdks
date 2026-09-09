[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / encodeErc20Approval

# Function: encodeErc20Approval()

> **encodeErc20Approval**(`params`): [`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>

Defined in: [packages/morpho-sdk/src/actions/requirements/encode/encodeErc20Approval.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/encode/encodeErc20Approval.ts#L43)

Encodes a deep-frozen ERC-20 approval transaction for a supported SDK spender.

Caps `amount` at the per-chain, per-token maximum from `MAX_TOKEN_APPROVALS` (defaults to
`maxUint256`). Used by [getRequirementsApproval](getRequirementsApproval.md) and [getGeneralAdapterRequirementsPermit2](getGeneralAdapterRequirementsPermit2.md).

## Parameters

### params

`EncodeErc20ApprovalParams`

Encoding parameters.

## Returns

[`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>

A deep-frozen `Transaction<ERC20ApprovalAction>` with the capped approval amount.

## Throws

when `spender` is not a supported SDK spender for `chainId`.

## Example

```ts
import { encodeErc20Approval } from "@morpho-org/morpho-sdk";

const tx = encodeErc20Approval({
  token: USDC,
  spender: generalAdapter1,
  amount: 1_000_000n,
  chainId: 1,
});
// tx satisfies Readonly<Transaction<ERC20ApprovalAction>>
```
