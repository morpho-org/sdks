# Deprecation and Migration

`@morpho-org/migration-sdk-viem` is deprecated with no replacement package.

Npm deprecation message:

```text
Deprecated: no replacement package. Migration SDK workflows are no longer a supported public SDK surface.
```

## Migration Path

There is no supported migration SDK replacement in `@morpho-org/morpho-sdk`.

The current consolidation keeps only low-level migration adapter ABI literals under `@morpho-org/morpho-sdk/abis`, such as the Aave, Compound, and Morpho Aave V3 optimizer migration adapter ABIs.

Consumers that still need migration flows are responsible for their own protocol-specific reads, approvals, debt unwinding, collateral movement, and bundle construction. Use `@morpho-org/morpho-sdk/bundler` only for the retained Bundler3 action encoding helpers.

Very light hardcoded example:

```ts
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { BundlerAction, type Action } from "@morpho-org/morpho-sdk/bundler";
import type { InputMarketParams } from "@morpho-org/morpho-sdk/types";

const chainId = 1;
const user = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const {
  bundler3: { generalAdapter1 },
} = getChainAddresses(chainId);

const targetMarket = {
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  oracle: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000000000000000000n,
} satisfies InputMarketParams;

const actions = [
  {
    type: "erc20TransferFrom",
    args: [targetMarket.collateralToken, 1_000000000000000000n, generalAdapter1],
  },
  {
    type: "morphoSupplyCollateral",
    args: [targetMarket, 1_000000000000000000n, user, []],
  },
  {
    type: "morphoBorrow",
    args: [targetMarket, 500_000000n, 0n, 505_000000n, user],
  },
] satisfies Action[];

const tx = BundlerAction.encodeBundle(chainId, actions);
```

## Not Retained

Migratable position fetchers, protocol-specific migratable position classes, migration transaction builders, migration address config, and migration transaction requirement types are not retained as a public SDK surface.
