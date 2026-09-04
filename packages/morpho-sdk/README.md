# @morpho-org/morpho-sdk

[![npm version](https://img.shields.io/npm/v/@morpho-org/morpho-sdk.svg)](https://www.npmjs.com/package/@morpho-org/morpho-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![CI](https://github.com/morpho-org/morpho-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/morpho-org/morpho-sdk/actions/workflows/ci.yml)

> 📖 **Full documentation → [docs.morpho.org/developers/sdks/morpho-sdk](https://docs.morpho.org/developers/sdks/morpho-sdk/)**

Build transactions for Morpho's **VaultV1** (MetaMorpho), **VaultV2**, **Blue**, and **Midnight** fixed-rate markets on every chain where Morpho is deployed. Custom deployments can be added with `registerCustomAddresses` from `@morpho-org/morpho-sdk/addresses`.

## Installation

```bash
pnpm add @morpho-org/morpho-sdk
```

Upgrading from v5? Read the [v5 → v6 migration guide](./MIGRATION-v5-to-v6.md) before updating Blue
write integrations.

## Actions

Each entity exposes a set of actions. Common vault writes call VaultBundlesV1, Blue writes call
BlueBundlesV1, and the remaining rows identify their destination.

| Entity | Actions | Route |
| --- | --- | --- |
| **VaultV1** (MetaMorpho) | `deposit`, `withdraw`, `redeem`, `migrateToV2` | VaultBundlesV1 |
| | `inKindRedeem` | VaultExitBundlesV1 |
| **VaultV2** | `deposit`, `withdraw`, `redeem` | VaultBundlesV1 |
| | `forceWithdraw`, `forceRedeem` | Vault multicall |
| | `inKindRedeem` | VaultExitBundlesV1 |
| **Blue** | `supply`, `withdraw`, `supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, `repayWithdrawCollateral`, `refinance` | BlueBundlesV1 |
| **Midnight** | `takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `repayWithdrawCollateral` | Midnight Bundles |
| | `makeLend`, `makeBorrow` | Midnight mempool |
| | `supplyCollateral`, `redeem`, `cancelOffer` | Direct call |

`VaultExitBundlesV1`, `VaultBundlesV1`, and `BlueBundlesV1` are registered on Ethereum, Base,
Arbitrum, Optimism, Polygon, World Chain, Unichain, HyperEVM, Katana, Monad, Stable, Tempo, and
Robinhood Chain. Custom deployments can still be configured with `registerCustomAddresses`.

## How it works

Actions that pull tokens or touch a position return `{ buildTx, getRequirements }`. All Blue
writes use this lazy shape while still encoding one direct BlueBundlesV1 call. Vault deposits use
it for token authorization. Vault exits use it too: VaultBundlesV1 burns `msg.sender`'s shares, so
they need a vault-share allowance equal to the derived share cap — an approval, or an ERC-2612
shares permit folded into the call when `supportSignature` is enabled. Vault `inKindRedeem`
additionally checks live Blue liquidity. Calling `buildTx()` directly skips those RPC-backed
pre-flight checks. `forceWithdraw` and `forceRedeem` remain direct Vault V2 multicalls without
prerequisites and return only `{ buildTx }`.

- **`getRequirements()`** — async; the on-chain prerequisites to satisfy first: ERC-20 approvals, permit / Permit2 signatures, Morpho authorization, or (for Midnight) operator authorization and offer-root signatures.
- **`buildTx(signatures?)`** — synchronous; the final, deep-frozen viem transaction. Pass any signatures collected from the requirements.

```typescript
const { buildTx, getRequirements } = await vault.deposit({ amount, userAddress });

const requirements = await getRequirements();
// Send each approval tx and collect each signature, then:
const tx = buildTx([permitSignature]);
```

Enable off-chain approvals (permit / Permit2) with `morphoViemExtension({ supportSignature: true })`.

### `userAddress` is the eventual submitter

`userAddress` must be the account that eventually signs and sends the transaction. A connected
builder account may prepare a direct bundles call for a different submitter; signature helpers
enforce the expected identity at `sign()`. VaultBundlesV1 and BlueBundlesV1 always operate on
`msg.sender`.

## Usage

```typescript
import {
  morphoViemExtension,
  isRequirementSignature,
} from "@morpho-org/morpho-sdk";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { mainnet } from "viem/chains";

// Reads on-chain state, extended with the `morpho` namespace.
const client = createPublicClient({ chain: mainnet, transport: http() }).extend(
  morphoViemExtension(),
);

// Signs permits and sends the approval / authorization transactions.
const walletClient = createWalletClient({
  account: "0xUser...",
  chain: mainnet,
  transport: custom(window.ethereum), // any EIP-1193 provider
});
```

Create an entity — every factory takes a chain ID as its last argument:

- `client.morpho.vaultV1(address, chainId)` / `client.morpho.vaultV2(address, chainId)`
- `client.morpho.blue(marketParams, chainId)`
- `client.morpho.midnight(chainId)`

### Vault deposit / withdraw

Deposit routes through VaultBundlesV1 and may require an approval or permit:

```typescript
const vault = client.morpho.vaultV2("0xVault...", 1);
const vaultData = await vault.getData();

const { buildTx, getRequirements } = await vault.deposit({
  amount: 1000000000000000000n,
  userAddress: "0xUser...",
  vaultData,
});
const requirements = await getRequirements();
const tx = buildTx([permitSignature]);
```

Withdraw is a VaultBundlesV1 call that burns the caller's shares, so it needs the exact share
allowance returned by `getRequirements()`:

```typescript
const { buildTx, getRequirements } = vault.withdraw({
  amount: 500000000000000000n,
  userAddress: "0xUser...",
});
// One approval transaction to send, or one shares permit to sign when
// `supportSignature: true`.
const requirements = await getRequirements();
const tx = buildTx([sharesPermitSignature]);
```

For wNative vaults, pass `nativeAmount` instead of `amount` to deposit native ETH (wrapped automatically).

### Blue: BlueBundlesV1 writes

```typescript
const market = client.morpho.blue(
  {
    loanToken: "0xLoan...",
    collateralToken: "0xCollateral...",
    oracle: "0xOracle...",
    irm: "0xIrm...",
    lltv: 860000000000000000n,
  },
  1,
);

const { buildTx, getRequirements } = market.supplyCollateralBorrow({
  userAddress: "0xUser...",
  collateralAssets: 1_000_000n,
  borrowAssets: 0n,
  deadline: 1_900_000_000n,
});

// Satisfy each BlueBundlesV1 approval or signature requirement, then pass every
// collected signature to buildTx.
const signatures = [];
for (const requirement of await getRequirements()) {
  if (isRequirementSignature(requirement)) {
    signatures.push(await requirement.sign(walletClient, "0xUser..."));
  } else {
    await walletClient.sendTransaction(requirement); // approval / authorization tx
  }
}

const tx = buildTx(signatures);
```

Set `borrowAssets` to a non-zero amount and provide `positionData` to combine collateral supply and
borrowing. That path may also require Morpho authorization for BlueBundlesV1. Optional
`reallocations` are Vault V2 only, and the LLTV buffer guards the resulting position against
instant liquidation. Blue writes do not accept `slippageTolerance`, `minSharePrice`, or
`maxSharePrice` because BlueBundlesV1 has no share-price-bound inputs.

> High-level Blue writes accept only `VaultV2BlueReallocation`. Vault V1 planning and explicit
> low-level Bundler3 composition remain available only as deprecated compatibility surfaces and
> will be removed in the next major.

### Midnight: take a fixed-rate offer

Protocol-specific names are qualified in shared facades, for example `fetchBluePosition` and `fetchMidnightPosition` from `@morpho-org/morpho-sdk/fetch`. Raw upstream names remain available under `/blue/{abis,addresses,constants,entities,errors,fetch,types,utils}` and `/midnight/{abis,constants,entities,errors,fetch,types,utils}`.

```typescript
const midnight = client.morpho.midnight(8453);
const marketData = await midnight.getMarketData(marketId);

const output = midnight.takeLend({
  accountAddress: lender,
  marketData,
  assets: 1_000_000n,
  minUnits: 900_000n,
  takeableOffers: quote.data.takeableOffers,
  deadline,
});

const requirements = await output.getRequirements();
const tx = output.buildTx();
```

See the [documentation](https://docs.morpho.org/developers/sdks/morpho-sdk/) for the full API:
native wrapping, Vault V2 BluePublicAllocator reallocations, borrow-position migration, vault V1 →
V2 migration, force withdraw/redeem, and Midnight maker flows.

## Architecture

```mermaid
graph LR
    MC["client.morpho<br/>(morphoViemExtension)"]

    MC -->|.vaultV1| MV1
    MC -->|.vaultV2| MV2
    MC -->|.blue| MM1
    MC -->|.midnight| MN1

    subgraph VaultV1 Flow
        MV1[MorphoVaultV1]
        MV1 --> V1D[vaultV1Deposit]
        MV1 --> V1W[vaultV1Withdraw]
        MV1 --> V1R[vaultV1Redeem]
        MV1 --> V1IKR[vaultV1InKindRedeem]
        MV1 --> V1M[vaultV1MigrateToV2]

        V1D --> VBV1[VaultBundlesV1]
        V1W --> VBV1
        V1R --> VBV1
        V1M --> VBV1
        V1IKR -->|direct call| VEB[VaultExitBundlesV1]
    end

    subgraph VaultV2 Flow
        MV2[MorphoVaultV2]
        MV2 --> V2D[vaultV2Deposit]
        MV2 --> V2W[vaultV2Withdraw]
        MV2 --> V2R[vaultV2Redeem]
        MV2 --> V2IKR[vaultV2InKindRedeem]
        MV2 --> V2FW[vaultV2ForceWithdraw]
        MV2 --> V2FR[vaultV2ForceRedeem]

        V2D --> VBV1
        V2W --> VBV1
        V2R --> VBV1
        V2IKR -->|direct call| VEB
        V2FW -->|multicall| V2C[VaultV2 Contract]
        V2FR -->|multicall| V2C
    end

    subgraph Blue Flow
        MM1[MorphoBlue]
        MM1 --> M1S[supply]
        MM1 --> M1SC[supplyCollateral]
        MM1 --> M1B[borrow]
        MM1 --> M1SCB[supplyCollateralBorrow]
        MM1 --> M1R[repay]
        MM1 --> M1WC[withdrawCollateral]
        MM1 --> M1RW[repayWithdrawCollateral]
        MM1 --> M1W[withdraw]
        MM1 --> M1M[refinance]

        M1S --> BBV1[BlueBundlesV1]
        M1SC --> BBV1
        M1B --> BBV1
        M1SCB --> BBV1
        M1R --> BBV1
        M1WC --> BBV1
        M1RW --> BBV1
        M1W --> BBV1
        M1M --> BBV1

        BBV1 -.->|reallocate / allocateFromIdle| BPA[Blue Public Allocator]
    end

    subgraph Midnight Flow
        MN1[MorphoMidnight]
        MN1 --> MNT[fixed-rate taker actions]
        MN1 --> MNM[maker offer submission]
        MN1 --> MNP[position actions]
        MNT --> MNB[MidnightBundles]
        MNM --> MNMP[Midnight mempool]
        MNP --> MNC[Midnight / MidnightBundles]
    end


    subgraph Shared
        REQ[getRequirements]
    end

    MV1 -.->|approval / permit| REQ
    MV2 -.->|approval / permit| REQ
    MM1 -.->|approval / permit / authorization| REQ
    MN1 -.->|approval / authorization / root signature or ratification| REQ

    style VBV1 fill:#e8f5e9,stroke:#4caf50
    style BBV1 fill:#e8f5e9,stroke:#4caf50
    style VEB fill:#fff3e0,stroke:#ff9800
    style V2C fill:#e3f2fd,stroke:#2196f3
    style REQ fill:#f3e5f5,stroke:#9c27b0
    style BPA fill:#fff9c4,stroke:#f9a825
```

## Development

Link this package to your app for local debugging:

```bash
# In this morpho-sdk project
pnpm run build:link
```

```bash
# In your other project
pnpm link @morpho-org/morpho-sdk
```

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
