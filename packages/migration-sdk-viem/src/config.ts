import {
  type Address,
  ChainId,
  registerCustomAddresses,
} from "@morpho-org/blue-sdk";

import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Abi } from "viem";
import {
  addressesProviderAbi as addressesProviderAbi_v2,
  lendingPoolAbi,
  protocolDataProviderAbi as protocolDataProviderAbi_v2,
} from "./abis/aaveV2.js";
import {
  addressesProviderAbi as addressesProviderAbi_v3,
  poolAbi,
  protocolDataProviderAbi as protocolDataProviderAbi_v3,
} from "./abis/aaveV3.js";
import { morphoAaveV3Abi } from "./abis/aaveV3Optimizer.js";
import {
  cErc20Abi,
  cEtherAbi,
  comptrollerAbi,
  type crossChainCErc20Abi,
  mErc20Abi,
} from "./abis/compoundV2.js";
import { cometAbi } from "./abis/compoundV3.js";
import { MigratableProtocol } from "./types/index.js";

declare module "@morpho-org/blue-sdk" {
  interface ChainAddresses {
    aaveV3Optimizer?: Address;
    cEth?: Address;
  }
}

registerCustomAddresses({
  addresses: {
    [ChainId.EthMainnet]: {
      aaveV3Optimizer: "0x33333aea097c193e66081E930c33020272b33333",
      cEth: "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5",
    },
  },
});

interface Contract<abi extends Abi> {
  abi: abi;
  address: Address;
}

export interface ProtocolMigrationContracts {
  [MigratableProtocol.aaveV3Optimizer]: {
    morpho: Contract<typeof morphoAaveV3Abi>;
    poolDataProvider: Contract<typeof protocolDataProviderAbi_v3>;
  } | null;
  [MigratableProtocol.aaveV2]: {
    protocolDataProvider: Contract<typeof protocolDataProviderAbi_v2>;
    lendingPool: Contract<typeof lendingPoolAbi>;
    addressesProvider: Contract<typeof addressesProviderAbi_v2>;
  } | null;
  [MigratableProtocol.aaveV3]: {
    pool: Contract<typeof poolAbi>;
    protocolDataProvider: Contract<typeof protocolDataProviderAbi_v3>;
    addressesProvider: Contract<typeof addressesProviderAbi_v3>;
  } | null;
  [MigratableProtocol.compoundV3]: Record<
    string,
    Contract<typeof cometAbi>
  > | null;
  [MigratableProtocol.compoundV2]:
    | (Record<string, Contract<typeof crossChainCErc20Abi>> & {
        comptroller: Contract<typeof comptrollerAbi>;
      })
    | null;
}

export const migrationAddressesRegistry = {
  [ChainId.EthMainnet]: {
    [MigratableProtocol.aaveV3Optimizer]: {
      morpho: {
        address: "0x33333aea097c193e66081E930c33020272b33333",
        abi: morphoAaveV3Abi,
      },
      poolDataProvider: {
        address: "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3",
        abi: protocolDataProviderAbi_v3,
      },
    },
    [MigratableProtocol.aaveV2]: {
      protocolDataProvider: {
        address: "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d",
        abi: protocolDataProviderAbi_v2,
      },
      lendingPool: {
        address: "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9",
        abi: lendingPoolAbi,
      },
      addressesProvider: {
        address: "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
        abi: addressesProviderAbi_v2,
      },
    },
    [MigratableProtocol.aaveV3]: {
      pool: {
        address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
        abi: poolAbi,
      },
      protocolDataProvider: {
        address: "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3",
        abi: protocolDataProviderAbi_v3,
      },
      addressesProvider: {
        address: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
        abi: addressesProviderAbi_v3,
      },
    },
    [MigratableProtocol.compoundV3]: {
      usdc: {
        address: "0xc3d688B66703497DAA19211EEdff47f25384cdc3",
        abi: cometAbi,
      },
      weth: {
        address: "0xA17581A9E3356d9A858b789D68B4d866e593aE94",
        abi: cometAbi,
      },
    },
    [MigratableProtocol.compoundV2]: {
      cEth: {
        address: "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5",
        abi: cEtherAbi,
      },
      cUsdc: {
        address: "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
        abi: cErc20Abi,
      },
      comptroller: {
        address: "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B",
        abi: comptrollerAbi,
      },
    },
  },
  [ChainId.BaseMainnet]: {
    [MigratableProtocol.aaveV3]: {
      pool: {
        address: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
        abi: poolAbi,
      },
      protocolDataProvider: {
        address: "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac",
        abi: protocolDataProviderAbi_v3,
      },
      addressesProvider: {
        address: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
        abi: addressesProviderAbi_v3,
      },
    },
    [MigratableProtocol.compoundV3]: {
      usdc: {
        address: "0xb125E6687d4313864e53df431d5425969c15Eb2F",
        abi: cometAbi,
      },
      weth: {
        address: "0x46e6b214b524310239732D51387075E0e70970bf",
        abi: cometAbi,
      },
    },
    [MigratableProtocol.compoundV2]: {
      mWeth: {
        address: "0x628ff693426583D9a7FB391E54366292F509D457",
        abi: mErc20Abi,
      },
      mUsdc: {
        address: "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22",
        abi: mErc20Abi,
      },
      comptroller: {
        address: "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C",
        abi: comptrollerAbi,
      },
    },
    [MigratableProtocol.aaveV2]: null,
    [MigratableProtocol.aaveV3Optimizer]: null,
  },
  [ChainId.ArbitrumMainnet]: {
    [MigratableProtocol.aaveV3]: {
      pool: {
        address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        abi: poolAbi,
      },
      protocolDataProvider: {
        address: "0x14496b405D62c24F91f04Cda1c69Dc526D56fDE5",
        abi: protocolDataProviderAbi_v3,
      },
      addressesProvider: {
        address: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
        abi: addressesProviderAbi_v3,
      },
    },
    [MigratableProtocol.compoundV3]: null,
    [MigratableProtocol.compoundV2]: null,
    [MigratableProtocol.aaveV2]: null,
    [MigratableProtocol.aaveV3Optimizer]: null,
  },
} as const;

export const migrationAddresses =
  migrationAddressesRegistry as unknown as Record<
    number,
    ProtocolMigrationContracts
  >;

// prevent manual update of addresses
deepFreeze(migrationAddresses);
