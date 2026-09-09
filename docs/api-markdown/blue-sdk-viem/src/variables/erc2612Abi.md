[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / erc2612Abi

# Variable: erc2612Abi

> `const` **erc2612Abi**: readonly \[\{ `inputs`: readonly \[\]; `name`: `"DOMAIN_SEPARATOR"`; `outputs`: readonly \[\{ `internalType`: `"bytes32"`; `name`: `""`; `type`: `"bytes32"`; \}\]; `stateMutability`: `"view"`; `type`: `"function"`; \}, \{ `inputs`: readonly \[\{ `internalType`: `"address"`; `name`: `"owner"`; `type`: `"address"`; \}\]; `name`: `"nonces"`; `outputs`: readonly \[\{ `internalType`: `"uint256"`; `name`: `""`; `type`: `"uint256"`; \}\]; `stateMutability`: `"view"`; `type`: `"function"`; \}, \{ `inputs`: readonly \[\{ `internalType`: `"address"`; `name`: `"owner"`; `type`: `"address"`; \}, \{ `internalType`: `"address"`; `name`: `"spender"`; `type`: `"address"`; \}, \{ `internalType`: `"uint256"`; `name`: `"value"`; `type`: `"uint256"`; \}, \{ `internalType`: `"uint256"`; `name`: `"deadline"`; `type`: `"uint256"`; \}, \{ `internalType`: `"uint8"`; `name`: `"v"`; `type`: `"uint8"`; \}, \{ `internalType`: `"bytes32"`; `name`: `"r"`; `type`: `"bytes32"`; \}, \{ `internalType`: `"bytes32"`; `name`: `"s"`; `type`: `"bytes32"`; \}\]; `name`: `"permit"`; `outputs`: readonly \[\]; `stateMutability`: `"nonpayable"`; `type`: `"function"`; \}\]

Defined in: [packages/morpho-ts/src/abis.ts:6](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/abis.ts#L6)

ERC-2612 permit ABI fragment used for nonce reads and permit calldata.
