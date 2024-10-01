import { maxUint256, parseEther, parseUnits } from "viem";

import {
  ChainId,
  ConstantWrappedToken,
  Holding,
  Market,
  MarketConfig,
  MarketParams,
  MathLib,
  NATIVE_ADDRESS,
  Position,
  SECONDS_PER_YEAR,
  Token,
  User,
  Vault,
  VaultConfig,
  unwrappedTokensMapping,
} from "@morpho-org/blue-sdk";
import { createRandomAddress } from "@morpho-org/morpho-test";

import { SimulationState } from "../../src";

export const createRandomMarket = (params: Partial<MarketParams> = {}) =>
  new MarketConfig({
    collateralToken: createRandomAddress(),
    loanToken: createRandomAddress(),
    oracle: createRandomAddress(),
    irm: createRandomAddress(),
    lltv: parseEther("0.80"),
    ...params,
  });

export const createRandomVault = (config: Partial<VaultConfig> = {}) =>
  new VaultConfig({
    asset: createRandomAddress(),
    decimals: 18,
    decimalsOffset: 0n,
    symbol: "TEST",
    name: "Test vault",
    address: createRandomAddress(),
    ...config,
  });

export const timestamp = 12345n;

export const userA = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
export const userB = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
export const userC = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";

export const tokenA = "0x1111111111111111111111111111111111111111";
export const tokenB = "0x2222222222222222222222222222222222222222";

unwrappedTokensMapping[ChainId.EthMainnet][tokenB] = tokenA;

export const marketA1 = new Market({
  config: createRandomMarket({ loanToken: tokenA }),
  totalBorrowAssets: parseUnits("10000", 6),
  totalBorrowShares: parseUnits("10000", 6 + 6),
  totalSupplyAssets: parseUnits("10750", 6),
  totalSupplyShares: parseUnits("10750", 6 + 6),
  lastUpdate: timestamp,
  fee: 0n,
  price: parseUnits("2", 36 + 6 - 18),
  rateAtTarget: parseEther("0.007") / SECONDS_PER_YEAR,
});
export const marketA2 = new Market({
  config: createRandomMarket({ loanToken: tokenA }),
  totalBorrowAssets: parseUnits("10000", 6),
  totalBorrowShares: parseUnits("10000", 6 + 6),
  totalSupplyAssets: parseUnits("20200", 6),
  totalSupplyShares: parseUnits("20200", 6 + 6),
  lastUpdate: timestamp,
  fee: 0n,
  price: parseUnits("3", 36 + 6 - 18),
  rateAtTarget: parseEther("0.05") / SECONDS_PER_YEAR,
});
export const marketA3 = new Market({
  config: createRandomMarket({ loanToken: tokenA }),
  totalBorrowAssets: parseUnits("5000", 6),
  totalBorrowShares: parseUnits("5000", 6 + 6),
  totalSupplyAssets: parseUnits("5300", 6),
  totalSupplyShares: parseUnits("5300", 6 + 6),
  lastUpdate: timestamp,
  fee: 0n,
  price: parseUnits("2.5", 36 + 6 - 18),
  rateAtTarget: parseEther("0.04") / SECONDS_PER_YEAR,
});
export const marketB1 = new Market({
  config: createRandomMarket({ loanToken: tokenB }),
  totalBorrowAssets: parseEther("10000"),
  totalBorrowShares: parseUnits("10000", 24),
  totalSupplyAssets: parseEther("20000"),
  totalSupplyShares: parseUnits("20000", 24),
  lastUpdate: timestamp,
  fee: 0n,
  price: parseUnits("3", 36),
  rateAtTarget: parseEther("0.05") / SECONDS_PER_YEAR,
});
export const marketB2 = new Market({
  config: createRandomMarket({ loanToken: tokenB }),
  totalBorrowAssets: parseEther("10000"),
  totalBorrowShares: parseUnits("10000", 24),
  totalSupplyAssets: parseEther("20000"),
  totalSupplyShares: parseUnits("20000", 24),
  lastUpdate: timestamp,
  fee: 0n,
  price: parseUnits("3", 36),
  rateAtTarget: parseEther("0.05") / SECONDS_PER_YEAR,
});
export const marketB3 = new Market({
  config: createRandomMarket({ collateralToken: tokenA, loanToken: tokenB }),
  totalBorrowAssets: parseEther("1400"),
  totalBorrowShares: parseUnits("1400", 24),
  totalSupplyAssets: parseEther("2000"),
  totalSupplyShares: parseUnits("2000", 24),
  lastUpdate: timestamp,
  fee: 0n,
  price: parseUnits("4", 36 + 12),
  rateAtTarget: parseEther("0.075") / SECONDS_PER_YEAR,
});

export const vaultA = createRandomVault({
  address: "0x000000000000000000000000000000000000000A",
  asset: tokenA,
  decimalsOffset: 12n,
});
export const vaultB = createRandomVault({
  address: "0x000000000000000000000000000000000000000b",
  asset: tokenB,
});
export const vaultC = createRandomVault({
  address: "0x000000000000000000000000000000000000000C",
  asset: tokenA,
});

export const blueFixture = {
  global: {
    feeRecipient: createRandomAddress(),
  },
  users: {
    [userA]: new User({
      address: userA,
      isBundlerAuthorized: false,
      morphoNonce: 0n,
    }),
    [userB]: new User({
      address: userB,
      isBundlerAuthorized: false,
      morphoNonce: 0n,
    }),
    [userC]: new User({
      address: userC,
      isBundlerAuthorized: false,
      morphoNonce: 0n,
    }),
  },
  markets: {
    [marketA1.id]: marketA1,
    [marketA2.id]: marketA2,
    [marketA3.id]: marketA3,
    [marketB1.id]: marketB1,
    [marketB2.id]: marketB2,
    [marketB3.id]: marketB3,
  },
  tokens: {
    [tokenA]: new Token({
      address: tokenA,
      decimals: 6,
      symbol: "TAB",
      name: "Token A loan",
    }),
    [tokenB]: new Token({
      address: tokenB,
      decimals: 18,
      symbol: "TBB",
      name: "Token B loan",
    }),
    [marketA1.config.collateralToken]: new Token({
      address: marketA1.config.collateralToken,
      decimals: 18,
      symbol: "TAC",
      name: "Token A collateral",
    }),
    [marketA2.config.collateralToken]: new Token({
      address: marketA2.config.collateralToken,
      decimals: 18,
      symbol: "TBC",
      name: "Token B collateral",
    }),
    [marketB1.config.collateralToken]: new Token({
      address: marketB1.config.collateralToken,
      decimals: 18,
      symbol: "TBC",
      name: "Token B collateral",
    }),
    [marketB2.config.collateralToken]: new Token({
      address: marketB2.config.collateralToken,
      decimals: 18,
      symbol: "TBC",
      name: "Token B collateral",
    }),
    [vaultA.address]: new Token({
      address: vaultA.address,
      decimals: 18,
      symbol: "MMA",
      name: "MetaMorpho A",
    }),
    [vaultB.address]: new Token({
      address: vaultB.address,
      decimals: 18,
      symbol: "MMB",
      name: "MetaMorpho B",
    }),
    [vaultA.address]: new Token({
      address: vaultA.address,
      decimals: 18,
      symbol: "MMA",
      name: "MetaMorpho A",
    }),
    [vaultB.address]: new Token({
      address: vaultB.address,
      decimals: 18,
      symbol: "MMB",
      name: "MetaMorpho B",
    }),
  },
  positions: {
    [userA]: {
      [marketA1.id]: new Position({
        user: userA,
        marketId: marketA1.id,
        supplyShares: parseUnits("10", 6 + 6),
        borrowShares: 0n,
        collateral: 0n,
      }),
      [marketA2.id]: new Position({
        user: userA,
        marketId: marketA2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: parseUnits("10", 6 + 6),
      }),
      [marketA3.id]: new Position({
        user: userA,
        marketId: marketA3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB1.id]: new Position({
        user: userA,
        marketId: marketB1.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: parseUnits("10", 24),
      }),
      [marketB2.id]: new Position({
        user: userA,
        marketId: marketB2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: parseUnits("10", 24),
      }),
      [marketB3.id]: new Position({
        user: userA,
        marketId: marketB3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
    },
    [userB]: {
      [marketA1.id]: new Position({
        user: userB,
        marketId: marketA1.id,
        borrowShares: parseUnits("10", 6 + 6),
        collateral: parseEther("50000"),
        supplyShares: 0n,
      }),
      [marketA2.id]: new Position({
        user: userB,
        marketId: marketA2.id,
        borrowShares: parseUnits("5", 6 + 6),
        collateral: parseEther("40000"),
        supplyShares: 0n,
      }),
      [marketA3.id]: new Position({
        user: userA,
        marketId: marketA3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB1.id]: new Position({
        user: userB,
        marketId: marketB1.id,
        borrowShares: parseUnits("5", 24),
        collateral: parseEther("40000"),
        supplyShares: 0n,
      }),
      [marketB2.id]: new Position({
        user: userB,
        marketId: marketB2.id,
        borrowShares: parseUnits("5", 24),
        collateral: parseEther("40000"),
        supplyShares: 0n,
      }),
      [marketB3.id]: new Position({
        user: userB,
        marketId: marketB3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
    },
    [userC]: {
      [marketA1.id]: new Position({
        user: userC,
        marketId: marketA1.id,
        borrowShares: parseUnits("30", 6 + 6),
        collateral: parseEther("10"),
        supplyShares: 0n,
      }),
      [marketA2.id]: new Position({
        user: userC,
        marketId: marketA2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketA3.id]: new Position({
        user: userC,
        marketId: marketA3.id,
        borrowShares: 0n,
        collateral: parseEther("1000"),
        supplyShares: 0n,
      }),
      [marketB1.id]: new Position({
        user: userC,
        marketId: marketB1.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB2.id]: new Position({
        user: userC,
        marketId: marketB2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB3.id]: new Position({
        user: userC,
        marketId: marketB3.id,
        borrowShares: parseUnits("100", 24),
        collateral: parseUnits("500", 6),
        supplyShares: 0n,
      }),
    },
    [vaultA.address]: {
      [marketA1.id]: new Position({
        user: vaultA.address,
        marketId: marketA1.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: parseUnits("1000", 6 + 6),
      }),
      [marketA2.id]: new Position({
        user: vaultA.address,
        marketId: marketA2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: parseUnits("400", 6 + 6),
      }),
      [marketA3.id]: new Position({
        user: vaultA.address,
        marketId: marketA3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB1.id]: new Position({
        user: vaultA.address,
        marketId: marketB1.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB2.id]: new Position({
        user: vaultA.address,
        marketId: marketB2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB3.id]: new Position({
        user: vaultA.address,
        marketId: marketB3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
    },
    [vaultB.address]: {
      [marketA1.id]: new Position({
        user: vaultB.address,
        marketId: marketA1.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketA2.id]: new Position({
        user: vaultB.address,
        marketId: marketA2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketA3.id]: new Position({
        user: vaultB.address,
        marketId: marketA3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB1.id]: new Position({
        user: vaultB.address,
        marketId: marketB1.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB2.id]: new Position({
        user: vaultB.address,
        marketId: marketB2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB3.id]: new Position({
        user: vaultB.address,
        marketId: marketB3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
    },
    [vaultC.address]: {
      [marketA1.id]: new Position({
        user: vaultC.address,
        marketId: marketA1.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: parseUnits("500", 6 + 6),
      }),
      [marketA2.id]: new Position({
        user: vaultC.address,
        marketId: marketA2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: parseUnits("200", 6 + 6),
      }),
      [marketA3.id]: new Position({
        user: userA,
        marketId: marketA3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: parseUnits("1000", 6 + 6),
      }),
      [marketB1.id]: new Position({
        user: vaultC.address,
        marketId: marketB1.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB2.id]: new Position({
        user: vaultC.address,
        marketId: marketB2.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
      [marketB3.id]: new Position({
        user: vaultC.address,
        marketId: marketB3.id,
        borrowShares: 0n,
        collateral: 0n,
        supplyShares: 0n,
      }),
    },
  },
  holdings: {
    [userA]: {
      [NATIVE_ADDRESS]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userA,
        token: NATIVE_ADDRESS,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [tokenA]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userA,
        token: tokenA,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: parseUnits("1000", 6),
            expiration: MathLib.MAX_UINT_48,
            nonce: 1n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
      [tokenB]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userA,
        token: tokenB,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketA1.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userA,
        token: marketA1.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketA2.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userA,
        token: marketA2.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketB1.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userA,
        token: marketB1.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketB2.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userA,
        token: marketB2.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [vaultA.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userA,
        token: vaultA.address,
        balance: parseUnits("800", 18),
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
      [vaultB.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userA,
        token: vaultB.address,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
      [vaultC.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userA,
        token: vaultC.address,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
    },
    [userB]: {
      [NATIVE_ADDRESS]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userB,
        token: NATIVE_ADDRESS,
        balance: parseEther("0.05"),
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [tokenA]: new Holding({
        erc20Allowances: {
          morpho: parseUnits("800", 6),
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userB,
        token: tokenA,
        balance: parseUnits("1200", 6),
        permit2Allowances: {
          morpho: {
            amount: parseUnits("800", 6),
            expiration: MathLib.MAX_UINT_48,
            nonce: 1n,
          },
          bundler: {
            amount: parseUnits("800", 6),
            expiration: MathLib.MAX_UINT_48,
            nonce: 1n,
          },
        },
        erc2612Nonce: 0n,
      }),
      [tokenB]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userB,
        token: tokenB,
        balance: parseEther("6789"),
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketA1.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userB,
        token: marketA1.config.collateralToken,
        balance: parseEther("1000"),
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketA2.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userB,
        token: marketA2.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketB1.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userB,
        token: marketB1.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketB2.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userB,
        token: marketB2.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [vaultA.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userB,
        token: vaultA.address,
        balance: parseUnits("200", 18),
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
      [vaultB.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userB,
        token: vaultB.address,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
      [vaultC.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userB,
        token: vaultC.address,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
    },
    [userC]: {
      [NATIVE_ADDRESS]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userC,
        token: NATIVE_ADDRESS,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [tokenA]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userC,
        token: tokenA,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
      [tokenB]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userC,
        token: tokenB,
        balance: parseEther("6789"),
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketA1.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userC,
        token: marketA1.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketA2.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userC,
        token: marketA2.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketB1.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userC,
        token: marketB1.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [marketB2.config.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          bundler: maxUint256,
        },
        user: userC,
        token: marketB2.config.collateralToken,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
      }),
      [vaultA.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userC,
        token: vaultA.address,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
      [vaultB.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userC,
        token: vaultB.address,
        balance: 0n,
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
      [vaultC.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          bundler: 0n,
        },
        user: userC,
        token: vaultC.address,
        balance: parseEther("15000"),
        permit2Allowances: {
          morpho: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          bundler: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        },
        erc2612Nonce: 0n,
      }),
    },
  },
} as const;

export const metaMorphoFixture = {
  vaults: {
    [vaultA.address]: new Vault({
      config: vaultA,
      curator: createRandomAddress(),
      fee: 0n,
      feeRecipient: createRandomAddress(),
      owner: createRandomAddress(),
      guardian: createRandomAddress(),
      pendingGuardian: { validAt: 0n, value: createRandomAddress() },
      pendingOwner: createRandomAddress(),
      pendingTimelock: { validAt: 0n, value: 0n },
      skimRecipient: createRandomAddress(),
      supplyQueue: [marketA1.id, marketA2.id],
      withdrawQueue: [marketA2.id, marketA1.id],
      timelock: 0n,
      publicAllocatorConfig: {
        fee: parseEther("0.005"),
        accruedFee: 0n,
        admin: createRandomAddress(),
      },
      totalSupply: parseUnits("1400", 18),
      totalAssets: parseUnits("1400", 6),
      lastTotalAssets: parseUnits("1400", 6),
    }),
    [vaultB.address]: new Vault({
      config: vaultB,
      curator: createRandomAddress(),
      fee: 0n,
      feeRecipient: createRandomAddress(),
      owner: createRandomAddress(),
      guardian: createRandomAddress(),
      pendingGuardian: { validAt: 0n, value: createRandomAddress() },
      pendingOwner: createRandomAddress(),
      pendingTimelock: { validAt: 0n, value: 0n },
      skimRecipient: createRandomAddress(),
      supplyQueue: [marketB1.id, marketB2.id],
      withdrawQueue: [marketB2.id, marketB1.id],
      timelock: 0n,
      totalSupply: 0n,
      totalAssets: 0n,
      lastTotalAssets: 0n,
    }),
    [vaultC.address]: new Vault({
      config: vaultC,
      curator: createRandomAddress(),
      fee: 0n,
      feeRecipient: createRandomAddress(),
      owner: createRandomAddress(),
      guardian: createRandomAddress(),
      pendingGuardian: { validAt: 0n, value: createRandomAddress() },
      pendingOwner: createRandomAddress(),
      pendingTimelock: { validAt: 0n, value: 0n },
      skimRecipient: createRandomAddress(),
      supplyQueue: [marketA1.id, marketA2.id, marketA3.id],
      withdrawQueue: [marketA3.id, marketA2.id, marketA1.id],
      timelock: 0n,
      publicAllocatorConfig: {
        fee: parseEther("0.001"),
        accruedFee: 0n,
        admin: createRandomAddress(),
      },
      totalSupply: parseUnits("1700", 18),
      totalAssets: parseUnits("1700", 6),
      lastTotalAssets: parseUnits("1700", 6),
    }),
  },
  vaultMarketConfigs: {
    [vaultA.address]: {
      [marketA1.id]: {
        vault: vaultA.address,
        marketId: marketA1.id,
        cap: parseUnits("1010", 6),
        pendingCap: { validAt: 0n, value: 0n },
        removableAt: 0n,
        enabled: true,
        publicAllocatorConfig: {
          vault: vaultA.address,
          marketId: marketA1.id,
          maxIn: 0n,
          maxOut: parseUnits("100", 6),
        },
      },
      [marketA2.id]: {
        vault: vaultA.address,
        marketId: marketA2.id,
        cap: parseUnits("500", 6),
        pendingCap: { validAt: 0n, value: 0n },
        removableAt: 0n,
        enabled: true,
        publicAllocatorConfig: {
          vault: vaultA.address,
          marketId: marketA2.id,
          maxIn: parseUnits("40", 6),
          maxOut: 0n,
        },
      },
    },
    [vaultB.address]: {
      [marketB1.id]: {
        vault: vaultB.address,
        marketId: marketB1.id,
        cap: parseUnits("100", 18),
        pendingCap: { validAt: 0n, value: 0n },
        removableAt: 0n,
        enabled: true,
        publicAllocatorConfig: {
          vault: vaultB.address,
          marketId: marketB1.id,
          maxIn: 0n,
          maxOut: 0n,
        },
      },
      [marketB2.id]: {
        vault: vaultB.address,
        marketId: marketB2.id,
        cap: parseUnits("100", 18),
        pendingCap: { validAt: 0n, value: 0n },
        removableAt: 0n,
        enabled: true,
        publicAllocatorConfig: {
          vault: vaultB.address,
          marketId: marketB2.id,
          maxIn: 0n,
          maxOut: 0n,
        },
      },
    },
    [vaultC.address]: {
      [marketA1.id]: {
        vault: vaultC.address,
        marketId: marketA1.id,
        cap: parseUnits("900", 6),
        pendingCap: { validAt: 0n, value: 0n },
        removableAt: 0n,
        enabled: true,
        publicAllocatorConfig: {
          vault: vaultC.address,
          marketId: marketA1.id,
          maxIn: parseUnits("350", 6),
          maxOut: parseUnits("350", 6),
        },
      },
      [marketA2.id]: {
        vault: vaultC.address,
        marketId: marketA2.id,
        cap: parseUnits("400", 6),
        pendingCap: { validAt: 0n, value: 0n },
        removableAt: 0n,
        enabled: true,
        publicAllocatorConfig: {
          vault: vaultC.address,
          marketId: marketA2.id,
          maxIn: parseUnits("200", 6),
          maxOut: parseUnits("200", 6),
        },
      },
      [marketA3.id]: {
        vault: vaultC.address,
        marketId: marketA3.id,
        cap: parseUnits("1100", 6),
        pendingCap: { validAt: 0n, value: 0n },
        removableAt: 0n,
        enabled: true,
        publicAllocatorConfig: {
          vault: vaultC.address,
          marketId: marketA3.id,
          maxIn: parseUnits("400", 6),
          maxOut: parseUnits("400", 6),
        },
      },
    },
  },
  vaultUsers: {
    [vaultA.address]: {
      [userA]: {
        vault: vaultA.address,
        user: userA,
        isAllocator: false,
        allowance: maxUint256,
      },
      [userB]: {
        vault: vaultA.address,
        user: userB,
        isAllocator: false,
        allowance: maxUint256,
      },
    },
    [vaultB.address]: {
      [userA]: {
        vault: vaultB.address,
        user: userA,
        isAllocator: false,
        allowance: maxUint256,
      },
      [userB]: {
        vault: vaultB.address,
        user: userB,
        isAllocator: false,
        allowance: 0n,
      },
    },
    [vaultC.address]: {
      [userA]: {
        vault: vaultC.address,
        user: userA,
        isAllocator: false,
        allowance: maxUint256,
      },
      [userB]: {
        vault: vaultC.address,
        user: userB,
        isAllocator: false,
        allowance: maxUint256,
      },
    },
  },
} as const;

export const dataFixture = new SimulationState({
  chainId: ChainId.EthMainnet,
  block: { number: 1n, timestamp },
  ...blueFixture,
  ...metaMorphoFixture,
});

export const wrapFixtures = new SimulationState({
  chainId: ChainId.EthMainnet,
  block: { number: 1n, timestamp },
  ...blueFixture,
  tokens: {
    ...blueFixture.tokens,
    [tokenB]: new ConstantWrappedToken(
      blueFixture.tokens[tokenB]!,
      tokenA,
      blueFixture.tokens[tokenA]!.decimals,
    ),
  },
  ...metaMorphoFixture,
});
