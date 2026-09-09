[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / getGeneralAdapterRequirementsPermit2

# Function: getGeneralAdapterRequirementsPermit2()

> **getGeneralAdapterRequirementsPermit2**(`params`): `Readonly`\<[`Bundler3TokenSignatureRequirement`](../type-aliases/Bundler3TokenSignatureRequirement.md) \| [`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>\>[]

Defined in: [packages/morpho-sdk/src/actions/requirements/generalAdapter/getGeneralAdapterRequirementsPermit2.ts:55](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/requirements/generalAdapter/getGeneralAdapterRequirementsPermit2.ts#L55)

Computes the Permit2 prerequisites for `GeneralAdapter1` to pull `amount` of `address`.

Emits two ordered prerequisites:

1. A classic ERC-20 approval to the Permit2 contract (infinite, if not already in place).
2. A Permit2 `Requirement` signed against `GeneralAdapter1`.

The Permit2 signature is always requested for the exact transfer amount when this path is
selected. Permit2 allowance signatures overwrite the existing allowance, so relying on
residual Permit2-managed allowance would make the final transfer path depend on stale state and
could leave allowance behind after a partial spend.

## Parameters

### params

#### address

`` `0x${string}` ``

ERC-20 token address.

#### args

\{ `amount`: `bigint`; \}

#### args.amount

`bigint`

Required token amount.

#### chainId

`number`

The chain the bundle targets.

#### erc20Allowances

`GeneralAdapterPermit2Erc20Allowances`

Current ERC-20 allowances keyed by spender contract name.

#### permit2

`` `0x${string}` ``

The Permit2 contract address for the chain.

#### permit2Nonce

`bigint`

Current Permit2 nonce for the token owner / token / GeneralAdapter1 tuple.

## Returns

`Readonly`\<[`Bundler3TokenSignatureRequirement`](../type-aliases/Bundler3TokenSignatureRequirement.md) \| [`Transaction`](../interfaces/Transaction.md)\<[`ERC20ApprovalAction`](../interfaces/ERC20ApprovalAction.md)\>\>[]

Ordered list of approval transactions and/or `Requirement` objects to satisfy before
  bundling.

## Throws

from the inner approval helper when its
  bookkeeping invariants break (should not happen with the values this function passes).

## Example

```ts
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { getGeneralAdapterRequirementsPermit2 } from "@morpho-org/morpho-sdk";

const { permit2 } = getChainAddresses(1);
if (!permit2) throw new Error("Permit2 not configured for this chain");
const requirements = getGeneralAdapterRequirementsPermit2({
  address: USDC,
  chainId: 1,
  permit2,
  args: { amount: 1_000_000n },
  erc20Allowances: { permit2: 0n },
  permit2Nonce: 0n,
});
// requirements satisfies (Readonly<Transaction<ERC20ApprovalAction> | Bundler3TokenSignatureRequirement>)[]
```
