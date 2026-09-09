[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getTokenRequirementActions

# Function: getTokenRequirementActions()

> **getTokenRequirementActions**(`__namedParameters`): `Action`[]

Defined in: [packages/morpho-sdk/src/actions/signatures/getTokenRequirementActions.ts:63](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/signatures/getTokenRequirementActions.ts#L63)

Encodes the bundler actions that pull the asset to `recipient`, optionally consuming a
pre-signed permit / permit2 requirement first.

Permit2 path emits `approve2` + `transferFrom2`; classic permit path emits `permit` +
`erc20TransferFrom`. When no signature is provided, the function emits a plain
`erc20TransferFrom` against an existing ERC-20 allowance.

The signed `asset` and `amount` must match the pulled `asset` and `amount` exactly, otherwise
the function throws so the caller does not silently spend a wider-than-expected approval.

## Parameters

### \_\_namedParameters

`GetTokenRequirementActionsParams`

## Returns

`Action`[]

Bundler `Action`s needed to pull the token.

## Throws

when the signed asset differs from `asset`.

## Throws

when the signed amount differs from `amount`.

## Throws

when `action.type === "permit2"` but `args.expiration` is missing.

## Example

```ts
import { createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getTokenRequirementActions } from "@morpho-org/morpho-sdk";

const walletClient = createWalletClient({
  chain: mainnet,
  transport: http(),
  account: borrower,
});

// `requirement` comes from a requirement helper; signing produces a `RequirementSignature`.
const requirementSignature = await requirement.sign(walletClient, borrower);

const actions = getTokenRequirementActions({
  asset: loanToken,
  amount: 1_000_000n,
  recipient: generalAdapter1,
  requirementSignature,
});
// actions satisfies Action[]
// - permit2 path: [{ type: "approve2", ... }, { type: "transferFrom2", ... }]
// - classic permit path: [{ type: "permit", ... }, { type: "erc20TransferFrom", ... }]
// - no signature: [{ type: "erc20TransferFrom", ... }]
```
