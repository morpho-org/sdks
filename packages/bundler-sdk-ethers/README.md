# @morpho-org/bundler-sdk-ethers

<a href="https://www.npmjs.com/package/@morpho-org/bundler-sdk-ethers">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/bundler-sdk-ethers?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/bundler-sdk-ethers?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/bundler-sdk-ethers/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/bundler-sdk-ethers?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/bundler-sdk-ethers?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/bundler-sdk-ethers">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/bundler-sdk-ethers?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/bundler-sdk-ethers?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

Ethers-based package that simplifies encoding bundles (ERC20 approvals, transfers, deposits, etc) to submit to the bundler onchain.

## Installation

```bash
npm install @morpho-org/bundler-sdk-ethers
```

```bash
yarn add @morpho-org/bundler-sdk-ethers
```

## Getting Started

Bundle a collateral supply and a borrow:

```typescript
import { BundlerAction } from "@morpho-org/bundler-sdk-ethers";

const collateral = 1_000000000000000000n;
const borrowedAssets = 1000_000000n;

const borrower = "0x...";
const marketParams = {
  collateralToken: "0x...",
  loanToken: "0x...",
  irm: "0x...",
  oracle: "0x...",
  lltv: 86_0000000000000000n,
};

await bundler
  .connect(supplier)
  .multicall([
    BundlerAction.transferFrom(marketParams.collateralToken, collateral),
    BundlerAction.morphoSupplyCollateral(
      marketParams,
      collateral,
      borrower,
      "0x"
    ),
    BundlerAction.morphoBorrow(
      marketParams,
      borrowedAssets,
      0n,
      borrower,
      borrower
    ),
  ]);
```

Bundle a permit2 signature approval and a ERC-4626 deposit:

```typescript
import { Signature } from "ethers";

import { BundlerAction } from "@morpho-org/bundler-sdk-ethers";

const permit2Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const permit2Config = {
  domain: {
    name: "Permit2",
    chainId: "0x1",
    verifyingContract: permit2Address,
  },
  types: {
    PermitSingle: [
      {
        name: "details",
        type: "PermitDetails",
      },
      {
        name: "spender",
        type: "address",
      },
      {
        name: "sigDeadline",
        type: "uint256",
      },
    ],
    PermitDetails: [
      {
        name: "token",
        type: "address",
      },
      {
        name: "amount",
        type: "uint160",
      },
      {
        name: "expiration",
        type: "uint48",
      },
      {
        name: "nonce",
        type: "uint48",
      },
    ],
  },
};

const assetAddress = "0x...";
const assets = 1000_000000n;

const supplier = "0x...";
const bundlerAddress = "0x...";
const permitSingle = {
  details: {
    token: assetAddress,
    amount: assets,
    nonce: 0n,
    expiration: 2n ** 48n - 1,
  },
  spender: bundlerAddress,
  sigDeadline: 2n ** 48n - 1,
};

await bundler
  .connect(supplier)
  .multicall([
    BundlerAction.approve2(
      permitSingle,
      Signature.from(
        await supplier.signTypedData(
          permit2Config.domain,
          permit2Config.types,
          permitSingle
        )
      ),
      false
    ),
    BundlerAction.transferFrom2(assetAddress, assets),
    BundlerAction.erc4626Deposit(erc4626Address, assets, 0, supplier),
  ]);
```
