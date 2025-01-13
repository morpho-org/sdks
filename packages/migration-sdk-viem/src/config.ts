import { type Address, ChainId } from "@morpho-org/blue-sdk";

import type { Abi } from "viem";
import {
  lendingPoolAbi,
  protocolDataProviderAbi as protocolDataProviderAbi_v2,
} from "./abis/aaveV2.abis.js";
import {
  poolAbi,
  protocolDataProviderAbi as protocolDataProviderAbi_v3,
} from "./abis/aaveV3.abis.js";
import { morphoAaveV3Abi } from "./abis/aaveV3Optimizer.abis.js";
import {
  cErc20Abi,
  cEtherAbi,
  comptrollerAbi,
} from "./abis/compoundV2.abis.js";
import { cometAbi } from "./abis/compoundV3.abis.js";
import { MigratableProtocol } from "./types/index.js";

interface Contract {
  abi: Abi;
  address: Address;
}

interface ProtocolMigrationContracts {
  [MigratableProtocol.aaveV3Optimizer]?: {
    morpho: Contract;
    poolDataProvider: Contract;
  };
  [MigratableProtocol.aaveV2]?: {
    protocolDataProvider: Contract;
    lendingPool: Contract;
  };
  [MigratableProtocol.aaveV3]?: {
    pool: Contract;
    protocolDataProvider: Contract;
  };
  [MigratableProtocol.compoundV3]?: Record<string, Contract>;
  [MigratableProtocol.compoundV2]?: Record<string, Contract> & {
    comptroller: Contract;
  };
}

export const MIGRATION_ADDRESSES = {
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
        abi: cErc20Abi,
      },
      mUsdc: {
        address: "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22",
        abi: cErc20Abi,
      },
      comptroller: {
        address: "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C",
        abi: comptrollerAbi,
      },
    },
  },
} as const satisfies {
  [id in ChainId]: ProtocolMigrationContracts;
};

export default MIGRATION_ADDRESSES as {
  [id in ChainId]: ProtocolMigrationContracts;
};
