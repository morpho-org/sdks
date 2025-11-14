# Adding a New Chain to Morpho SDKs

This guide provides step-by-step instructions for adding a new blockchain to the Morpho SDK. Follow these steps carefully to ensure proper integration.

## Step-by-Step Guide

### 1. Add Chain ID to the Enum

**File:** `packages/blue-sdk/src/chain.ts`

Add your new chain ID to the `ChainId` enum:

```typescript
export enum ChainId {
  // ... existing chains
  YourNewChain = 12345, // Replace with actual chain ID
}
```

### 2. Add Chain Metadata

**File:** `packages/blue-sdk/src/chain.ts`

Add your chain's metadata to the `CHAIN_METADATA` object:

```typescript
[ChainId.YourNewChain]: {
  name: "Your Chain Name",
  id: ChainId.YourNewChain,
  nativeCurrency: {
    name: "Native Token Name",
    symbol: "SYMBOL",
    decimals: 18
  },
  explorerUrl: "https://explorer.yourchain.com",
  identifier: "yourchain",
},
```

### 3. Add Contract Addresses

**File:** `packages/blue-sdk/src/addresses.ts`

Add your chain's contract addresses to the `_addressesRegistry` mapping:

```typescript
[ChainId.YourNewChain]: {
  morpho: "0x...", // Morpho protocol address
  bundler3: {
    bundler3: "0x...",
    generalAdapter1: "0x...",
  },
  adaptiveCurveIrm: "0x...",
  publicAllocator: "0x...",
  metaMorphoFactory: "0x...",
  chainlinkOracleFactory: "0x...",
  preLiquidationFactory: "0x...",
  wNative: "0x...", // Wrapped native token address
  // Add other required addresses as needed
  // If USDC is provided, it must implement permit version 2
},
```

Remember to register the USDC address if it supports ERC-2612 permit version 2, otherwise the signature will default to permit version 1 (if `hasSimplePermit` is set to true).
Also make sure to add the Permit2 contract (if available) to enable transactional flows using Permit2, otherwise the approval will default to the classic erc20 approval.

### 4. Add Deployment Blocks

**File:** `packages/blue-sdk/src/addresses.ts`

Add deployment block numbers to the `_deployments` mapping:

```typescript
[ChainId.YourNewChain]: {
  morpho: 12345678n,
  bundler3: {
    bundler3: 12345679n,
    generalAdapter1: 12345680n,
  },
  adaptiveCurveIrm: 12345681n,
  publicAllocator: 12345682n,
  metaMorphoFactory: 12345683n,
  chainlinkOracleFactory: 12345684n,
  preLiquidationFactory: 12345685n,
  wNative: 12345686n,
  // Add deployment blocks for all contracts
},
```

### 5. Add Unwrapped Token Mapping

**File:** `packages/blue-sdk/src/addresses.ts`

Add the wrapped native token mapping to `_unwrappedTokensMapping`:

```typescript
[ChainId.YourNewChain]: {
  [_addressesRegistry[ChainId.YourNewChain].wNative]: NATIVE_ADDRESS,
  // Add other unwrapped token mappings if needed
},
```

### 6. Update Liquidation SDK

**File:** `packages/liquidation-sdk-viem/src/addresses.ts`

#### 6.1 Add Midas Mapping (if applicable)

Add an empty object if you don't have Midas information:

```typescript
[ChainId.YourNewChain]: {},
```

#### 6.2 Add PreLiquidation Factory Config

Add the preLiquidation factory configuration:

```typescript
[ChainId.YourNewChain]: {
  address: addressesRegistry[ChainId.YourNewChain].preLiquidationFactory,
  startBlock: 12345685n, // Same as deployment block
},
```

## Verification Checklist

Before submitting your changes, ensure:

- [ ] Chain ID is unique and correctly formatted
- [ ] All contract addresses are valid and checksummed
- [ ] Deployment blocks are accurate
- [ ] Native currency information is correct
- [ ] Explorer URL is functional
- [ ] No duplicate entries exist
- [ ] All required contracts are included
- [ ] Wrapped native token mapping is correct
