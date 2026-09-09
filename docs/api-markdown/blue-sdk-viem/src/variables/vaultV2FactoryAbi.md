[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / vaultV2FactoryAbi

# Variable: vaultV2FactoryAbi

> `const` **vaultV2FactoryAbi**: readonly \[\{ `inputs`: readonly \[\{ `internalType`: `"address"`; `name`: `"owner"`; `type`: `"address"`; \}, \{ `internalType`: `"address"`; `name`: `"asset"`; `type`: `"address"`; \}, \{ `internalType`: `"bytes32"`; `name`: `"salt"`; `type`: `"bytes32"`; \}\]; `name`: `"createVaultV2"`; `outputs`: readonly \[\{ `internalType`: `"address"`; `name`: `""`; `type`: `"address"`; \}\]; `stateMutability`: `"nonpayable"`; `type`: `"function"`; \}, \{ `inputs`: readonly \[\{ `internalType`: `"address"`; `name`: `"account"`; `type`: `"address"`; \}\]; `name`: `"isVaultV2"`; `outputs`: readonly \[\{ `internalType`: `"bool"`; `name`: `""`; `type`: `"bool"`; \}\]; `stateMutability`: `"view"`; `type`: `"function"`; \}, \{ `inputs`: readonly \[\{ `internalType`: `"address"`; `name`: `"owner"`; `type`: `"address"`; \}, \{ `internalType`: `"address"`; `name`: `"asset"`; `type`: `"address"`; \}, \{ `internalType`: `"bytes32"`; `name`: `"salt"`; `type`: `"bytes32"`; \}\]; `name`: `"vaultV2"`; `outputs`: readonly \[\{ `internalType`: `"address"`; `name`: `""`; `type`: `"address"`; \}\]; `stateMutability`: `"view"`; `type`: `"function"`; \}, \{ `anonymous`: `false`; `inputs`: readonly \[\{ `indexed`: `true`; `internalType`: `"address"`; `name`: `"owner"`; `type`: `"address"`; \}, \{ `indexed`: `true`; `internalType`: `"address"`; `name`: `"asset"`; `type`: `"address"`; \}, \{ `indexed`: `false`; `internalType`: `"bytes32"`; `name`: `"salt"`; `type`: `"bytes32"`; \}, \{ `indexed`: `true`; `internalType`: `"address"`; `name`: `"newVaultV2"`; `type`: `"address"`; \}\]; `name`: `"CreateVaultV2"`; `type`: `"event"`; \}\]

Defined in: [packages/morpho-ts/src/abis.ts:9190](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/abis.ts#L9190)

VaultV2 factory ABI used to verify VaultV2 factory membership.
