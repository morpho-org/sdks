[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [evm-simulation/src](../README.md) / SimulationAuthorization

# Type Alias: SimulationAuthorization

> **SimulationAuthorization** = \{ `transaction`: [`SimulationTransaction`](../interfaces/SimulationTransaction.md); `type`: `"approval"`; \} \| \{ `amount?`: `bigint`; `spender`: `Address`; `token`: `Address`; `type`: `"signature"`; \}

Defined in: [packages/evm-simulation/src/types.ts:70](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/evm-simulation/src/types.ts#L70)

How the caller expresses a token authorization that must be in place before the
main transactions run. The package decides HOW to simulate each one:
- "approval" → prepend tx as-is
- "signature" → today: encode approve(spender, amount); future: ecrecover override?

## Union Members

### Type Literal

\{ `transaction`: [`SimulationTransaction`](../interfaces/SimulationTransaction.md); `type`: `"approval"`; \}

***

### Type Literal

\{ `amount?`: `bigint`; `spender`: `Address`; `token`: `Address`; `type`: `"signature"`; \}

#### amount?

> `optional` **amount?**: `bigint`

Defaults to maxUint256. Caller can set explicit amount for tokens that don't support max approval.

#### spender

> **spender**: `Address`

#### token

> **token**: `Address`

#### type

> **type**: `"signature"`
