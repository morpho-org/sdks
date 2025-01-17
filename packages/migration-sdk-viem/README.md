# @morpho-org/migration-sdk-viem

<a href="https://www.npmjs.com/package/@morpho-org/migration-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/migration-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/migration-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/migration-sdk-viem/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/migration-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/migration-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/migration-sdk-viem">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/migration-sdk-viem?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/migration-sdk-viem?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Viem-based extension of `@morpho-org/bundler-sdk-viem` that exports utilities to build migration bundles to migrate lending positions (on aave, compound, morpho-aaveV3-optimizer, ...) to the morpho protocol.

## Installation

```bash
npm install @morpho-org/migration-sdk-viem
```

```bash
yarn add @morpho-org/migration-sdk-viem
```

## `MigratableSupplyPosition`

An abstraction representing a supply position that can be migrated between protocols. Each protocol has its own specific implementation, derived from this base class:

- `MigratableSupplyPosition_AaveV2`
- `MigratableSupplyPosition_AaveV3`
- `MigratableSupplyPosition_CompoundV2`
- `MigratableSupplyPosition_CompoundV3`
- `MigratableSupplyPosition_AaveV3Optimizer`

### Features

- Encapsulates the details of a supply position.
- Abstracts the logic to generate migration transactions.
- Supports specifying protocol, user, and migration constraints.

### Creating an Instance

```typescript
import { ChainId, Address } from "@morpho-org/blue-sdk";
import { 
    MigratableSupplyPosition_AaveV2,
    IMigratableSupplyPosition_AaveV2
    } from "@morpho-org/migration-sdk-viem";

const positionConfig: IMigratableSupplyPosition_AaveV2 = {
  chainId: 1,
  user: "0x123...abc",
  loanToken: "0xabc...123",
  supply: BigInt(1000),
  supplyApy: 2.5,
  max: {
    value: BigInt(2000),
    limiter: "none",
  },
  aToken: "0x1234...5435",
  nonce: 0n,
};

const customPosition = new MigratableSupplyPosition_AaveV2(positionConfig);
```

### Building a migration bundle

```typescript
const migrationArgs = {
  amount: BigInt(500),
  minShares: BigInt(50),
  vault: "0xvault...address",
};

const migrationBundle = customPosition.getMigrationTx(
  migrationArgs,
  positionConfig.chainId,
  true,
);

console.log("Migration Transaction:", migrationBundle);

for(const txRequirement of migrationBundle.requirements.txs) {
  await sendTransaction(client, txRequirement.tx);
}

for(const signatureRequirement of migrationBundle.requirements.signatures) {
  await signatureRequirement.sign(client);
}

await sendTransaction(client, migrationBundle.tx());
```

The obtained bundle is made of:
- `actions`: The list of actions being performed by the bundler contract.
- `requirements`: The list of requirements that should be fullfilled for the tx to succeed. It is made of:
  - `txs`: The list of transactions that should be executed before the main bundle.
    - `type`: action performed (approval, ...)
    - `args`: arguments used in the transaction
    - `tx`: encoded transaction
  - `signatures`: The list of signatures that have to be signed before the execution of the bundle.
    - `action.type`: action performed (approval, ...)
    - `action.args`: arguments used in the signature
    - `sign(client)`: function to encode, request the signature and save the result
- `tx()`: This function returns the final encoded transaction, ready to be executed.

---

### API Reference

#### `MigratableSupplyPosition.Args`
Arguments required for executing a migration transaction:
- `amount`: The amount to migrate.
- `minShares`: The minimum vault shares expected after migration.
- `vault`: The address of the vault to migrate to.

#### `IMigratableSupplyPosition`
Interface for a migratable supply position:
- `chainId`: The chain ID.
- `protocol`: The protocol.
- `user`: The user's address.
- `loanToken`: The loan token address.
- `supply`: The supply amount.
- `supplyApy`: The supply APY.
- `max`: Migration limit and limiter.

#### `IMigratableSupplyPosition_AaveV2`
The `IMigratableSupplyPosition_AaveV2` interface extends the base `IMigratableSupplyPosition` interface, adding properties specific to the Aave V2 protocol:
- `aToken`: `Address` - The address of the aToken associated with the user's supply position in the Aave V2 protocol.
- `nonce`: `bigint` - The EIP-2612 nonce of the user for the specified aToken.

#### `IMigratableSupplyPosition_AaveV3`
The `IMigratableSupplyPosition_AaveV3` interface extends the base `IMigratableSupplyPosition` interface, adding properties specific to the Aave V3 protocol:
- `aToken`: `Address` - The address of the aToken associated with the user's supply position in the Aave V3 protocol.
- `nonce`: `bigint` - The EIP-2612 nonce of the user for the specified aToken.

#### `IMigratableSupplyPosition_AaveV3Optimizer`
The `IMigratableSupplyPosition_AaveV3Optimizer` interface extends the base `IMigratableSupplyPosition` interface, adding properties specific to the Aave V3 Optimizer protocol:
- `isBundlerManaging`: `boolean` - Weather the aaveV3Optimizer bundler is authorized to manage user's positions on the protocol.
- `nonce`: `bigint` - The user's nonce on the protocol (used for manager authorization with signatures).

#### `IMigratableSupplyPosition_CompoundV2`
The `IMigratableSupplyPosition_CompoundV2` interface extends the base `IMigratableSupplyPosition` interface, adding properties specific to the Compound V2 protocol:
- `bundlerAllowance`: `bigint` - The allowance of the compoundV2 bundler over user's CTokens.
- `cToken`: `Address` - The address of the cToken associated with the user's supply position in the Compound V2 protocol.
- `cTokenBalance`: `bigint` - The user's cToken balance

#### `IMigratableSupplyPosition_CompoundV3`
The `IMigratableSupplyPosition_CompoundV3` interface extends the base `IMigratableSupplyPosition` interface, adding properties specific to the Compound V3 protocol:
- `nonce`: `bigint` - The user's nonce on the protocol (used for manager authorization with signatures).
- `cometAddress`: `Address` - The address of the comet instance associated with the user's supply position in the Compound V3 protocol.
- `cometName`: `string` - The name of the comet instance associated with the user's supply position in the Compound V3 protocol.


## `fetchMigratablePositions`
A utility function to fetch migratable positions for a user across various DeFi protocols.

### Features

- Supports multiple DeFi protocols:
  - Aave V2
  - Aave V3
  - Aave V3 Optimizer
  - Compound V2
  - Compound V3
- Allows filtering by protocol.
- Fetches data using a configurable blockchain client.

### Usage

```typescript
import { fetchMigratablePositions, MigratableProtocol } from "@morpho-org/migration-sdk-viem";
import { Client } from "viem";

const user = "0x123...abc"; // Replace with the user's address
const client = new Client({}); // Replace with a properly configured client

const positions = await fetchMigratablePositions(user, client, {
protocols: [MigratableProtocol.aaveV2, MigratableProtocol.compoundV3],
});

console.log("Fetched positions:", positions);
```

#### Parameters

##### `user` (required)
The address of the user whose positions you want to fetch.

##### `client` (required)
An instance of the blockchain client to interact with.

##### `options` (optional)
- `parameters`: Optional additional fetch parameters.
- `protocols`: A list of protocols to fetch data from. Defaults to all supported protocols.

#### Return Value

The function returns a promise that resolves to a map where keys are protocols and values are arrays of `MigratablePosition` objects.

---

### Example Output

```json
{
  "aaveV2": [MigratablePosition(...), ...],
  "compoundV3": [MigratablePosition(...), ...],
}
```

---

### Supported Protocols

- Aave V2
- Aave V3
- Aave V3 Optimizer
- Compound V2
- Compound V3

## `MigratableBorrowPosition_Blue`

A class representing a migratable borrow position on Morpho Blue, enabling the migration of collateral and debt between markets.

> [!Note]
> Borrow positions on Morpho Blue are not fetched when calling `fetchMigratablePositions` since they're internal to the protocol and can easily be built from an `AccrualPosition`.

## Features

- Supports migration of collateral and borrow amounts between markets.
- Handles slippage tolerance for both source and destination markets.
- Compatible with bundler operations for batched transaction execution.

## Usage

### Creating an Instance

```ts
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem"
import { MigratableBorrowPosition_Blue } from "@morpho-org/migration-sdk-viem"

const { market, ...position } = await fetchAccrualPosition(client, user, marketId);

const borrowPosition = new MigratableBorrowPosition_Blue({
  market
  position
});
```

---

### Generating Migration Operations

```ts
import { ChainId } from "@morpho-org/blue-sdk";

const migrationArgs = {
  marketTo: "0x...newMarketId",
  collateralAmount: position.collateral / 2n,
  borrowAmount: position.borrowAssets / 2n,
};

const operations = borrowPosition.getMigrationOperations(migrationArgs, ChainId.EthMainnet);

console.log("Generated Migration Operations:", operations);
```

The obtained operation is a `Blue_SupplyCollateral` operation with callbacks and can thus be processed as a normal operation using `@morpho-org/bundler-sdk-viem`

---

### API Reference

#### `MigratableBorrowPosition_Blue.Args`
- `marketTo`: The target market ID for migration.
- `collateralAmount`: The amount of collateral to supply during migration.
- `borrowAmount`: The amount of debt to migrate.
- `slippageFrom`: Slippage tolerance for the source market (optional).
- `slippageTo`: Slippage tolerance for the destination market (optional).

#### `IMigratableBorrowPosition_Blue`
- `market`: The current market associated with the borrow position.
- `position`: Includes:
    - `borrowShares`: The borrow shares of the user.
    - `user`: The user's address.
    - `collateral`: The user's collateral balance.
    