import {
  type Address,
  maxUint256,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";

import {
  ChainId,
  ConstantWrappedToken,
  Holding,
  Market,
  MathLib,
  NATIVE_ADDRESS,
  Position,
  SECONDS_PER_YEAR,
  Token,
  User,
  Vault,
  VaultV2,
  VaultV2MorphoVaultV1Adapter,
  registerCustomAddresses,
} from "@morpho-org/blue-sdk";
import { randomMarket, randomVault } from "@morpho-org/morpho-test";
import { randomAddress } from "@morpho-org/test";
import _merge from "lodash.merge";

import { SimulationState } from "../src/index.js";

export const timestamp = 12345n;

export const userA = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
export const userB = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
export const userC = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";

export const tokenA = "0x1111111111111111111111111111111111111111";
export const tokenB = "0x2222222222222222222222222222222222222222";

registerCustomAddresses({
  unwrappedTokens: {
    [ChainId.EthMainnet]: {
      [tokenB]: tokenA,
    },
  },
});

const emptyHolding = (user: Address, token: Address) =>
  new Holding({
    erc20Allowances: {
      morpho: 0n,
      permit2: 0n,
      "bundler3.generalAdapter1": 0n,
    },
    user,
    token,
    balance: 0n,
    permit2BundlerAllowance: {
      amount: 0n,
      expiration: 0n,
      nonce: 0n,
    },
    erc2612Nonce: 0n,
  });

export const marketA1 = new Market({
  params: randomMarket({ loanToken: tokenA }),
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
  params: randomMarket({ loanToken: tokenA }),
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
  params: randomMarket({ loanToken: tokenA }),
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
  params: randomMarket({ loanToken: tokenB }),
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
  params: randomMarket({ loanToken: tokenB }),
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
  params: randomMarket({ collateralToken: tokenA, loanToken: tokenB }),
  totalBorrowAssets: parseEther("1400"),
  totalBorrowShares: parseUnits("1400", 24),
  totalSupplyAssets: parseEther("2000"),
  totalSupplyShares: parseUnits("2000", 24),
  lastUpdate: timestamp,
  fee: 0n,
  price: parseUnits("4", 36 + 12),
  rateAtTarget: parseEther("0.075") / SECONDS_PER_YEAR,
});

export const vaultA = randomVault({
  address: "0x000000000000000000000000000000000000000A",
  asset: tokenA,
  decimalsOffset: 12n,
});
export const vaultB = randomVault({
  address: "0x000000000000000000000000000000000000000b",
  asset: tokenB,
});
export const vaultC = randomVault({
  address: "0x000000000000000000000000000000000000000C",
  asset: tokenA,
});

export const blueFixture = {
  global: {
    feeRecipient: randomAddress(),
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
    [marketA1.params.collateralToken]: new Token({
      address: marketA1.params.collateralToken,
      decimals: 18,
      symbol: "TAC",
      name: "Token A collateral",
    }),
    [marketA2.params.collateralToken]: new Token({
      address: marketA2.params.collateralToken,
      decimals: 18,
      symbol: "TBC",
      name: "Token B collateral",
    }),
    [marketB1.params.collateralToken]: new Token({
      address: marketB1.params.collateralToken,
      decimals: 18,
      symbol: "TBC",
      name: "Token B collateral",
    }),
    [marketB2.params.collateralToken]: new Token({
      address: marketB2.params.collateralToken,
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
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userA,
        token: NATIVE_ADDRESS,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [tokenA]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userA,
        token: tokenA,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: parseUnits("1000", 6),
          expiration: MathLib.MAX_UINT_48,
          nonce: 1n,
        },
        erc2612Nonce: 0n,
      }),
      [tokenB]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userA,
        token: tokenB,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userA,
        token: marketA1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userA,
        token: marketA2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userA,
        token: marketB1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userA,
        token: marketB2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [vaultA.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userA,
        token: vaultA.address,
        balance: parseUnits("800", 18),
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultB.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userA,
        token: vaultB.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultC.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userA,
        token: vaultC.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
    },
    [userB]: {
      [NATIVE_ADDRESS]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userB,
        token: NATIVE_ADDRESS,
        balance: parseEther("0.05"),
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [tokenA]: new Holding({
        erc20Allowances: {
          morpho: parseUnits("800", 6),
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userB,
        token: tokenA,
        balance: parseUnits("1200", 6),
        permit2BundlerAllowance: {
          amount: parseUnits("800", 6),
          expiration: MathLib.MAX_UINT_48,
          nonce: 1n,
        },
        erc2612Nonce: 0n,
      }),
      [tokenB]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userB,
        token: tokenB,
        balance: parseEther("6789"),
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userB,
        token: marketA1.params.collateralToken,
        balance: parseEther("1000"),
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userB,
        token: marketA2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userB,
        token: marketB1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userB,
        token: marketB2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [vaultA.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userB,
        token: vaultA.address,
        balance: parseUnits("200", 18),
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultB.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userB,
        token: vaultB.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultC.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userB,
        token: vaultC.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
    },
    [userC]: {
      [NATIVE_ADDRESS]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userC,
        token: NATIVE_ADDRESS,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [tokenA]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userC,
        token: tokenA,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [tokenB]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userC,
        token: tokenB,
        balance: parseEther("6789"),
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userC,
        token: marketA1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userC,
        token: marketA2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userC,
        token: marketB1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: userC,
        token: marketB2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [vaultA.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userC,
        token: vaultA.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultB.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userC,
        token: vaultB.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultC.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: userC,
        token: vaultC.address,
        balance: parseEther("30000"),
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
    },
    [vaultA.address]: {
      [NATIVE_ADDRESS]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: vaultA.address,
        token: NATIVE_ADDRESS,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [tokenA]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: vaultA.address,
        token: tokenA,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [tokenB]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultA.address,
        token: tokenB,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultA.address,
        token: marketA1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultA.address,
        token: marketA2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultA.address,
        token: marketB1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultA.address,
        token: marketB2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [vaultA.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultA.address,
        token: vaultA.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultB.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultA.address,
        token: vaultB.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultC.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultA.address,
        token: vaultC.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
    },
    [vaultB.address]: {
      [NATIVE_ADDRESS]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: vaultB.address,
        token: NATIVE_ADDRESS,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [tokenA]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultB.address,
        token: tokenA,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [tokenB]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: vaultB.address,
        token: tokenB,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultB.address,
        token: marketA1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultB.address,
        token: marketA2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultB.address,
        token: marketB1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultB.address,
        token: marketB2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [vaultA.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultB.address,
        token: vaultA.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultB.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultB.address,
        token: vaultB.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultC.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultB.address,
        token: vaultC.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
    },
    [vaultC.address]: {
      [NATIVE_ADDRESS]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: vaultC.address,
        token: NATIVE_ADDRESS,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [tokenA]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: vaultC.address,
        token: tokenA,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [tokenB]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultC.address,
        token: tokenB,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: maxUint256,
          permit2: maxUint256,
          "bundler3.generalAdapter1": maxUint256,
        },
        user: vaultC.address,
        token: marketA1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketA2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultC.address,
        token: marketA2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB1.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultC.address,
        token: marketB1.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [marketB2.params.collateralToken]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultC.address,
        token: marketB2.params.collateralToken,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
      }),
      [vaultA.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultC.address,
        token: vaultA.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultB.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultC.address,
        token: vaultB.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
      [vaultC.address]: new Holding({
        erc20Allowances: {
          morpho: 0n,
          permit2: 0n,
          "bundler3.generalAdapter1": 0n,
        },
        user: vaultC.address,
        token: vaultC.address,
        balance: 0n,
        permit2BundlerAllowance: {
          amount: 0n,
          expiration: 0n,
          nonce: 0n,
        },
        erc2612Nonce: 0n,
      }),
    },
  },
} as const;

export const metaMorphoFixture = {
  vaults: {
    [vaultA.address]: new Vault({
      ...vaultA,
      curator: randomAddress(),
      fee: 0n,
      feeRecipient: randomAddress(),
      owner: randomAddress(),
      guardian: randomAddress(),
      pendingGuardian: { validAt: 0n, value: randomAddress() },
      pendingOwner: randomAddress(),
      pendingTimelock: { validAt: 0n, value: 0n },
      skimRecipient: randomAddress(),
      supplyQueue: [marketA1.id, marketA2.id],
      withdrawQueue: [marketA2.id, marketA1.id],
      timelock: 0n,
      publicAllocatorConfig: {
        fee: parseEther("0.005"),
        accruedFee: 0n,
        admin: randomAddress(),
      },
      totalSupply: parseUnits("1400", 18),
      totalAssets: parseUnits("1400", 6),
      lastTotalAssets: parseUnits("1400", 6),
    }),
    [vaultB.address]: new Vault({
      ...vaultB,
      curator: randomAddress(),
      fee: 0n,
      feeRecipient: randomAddress(),
      owner: randomAddress(),
      guardian: randomAddress(),
      pendingGuardian: { validAt: 0n, value: randomAddress() },
      pendingOwner: randomAddress(),
      pendingTimelock: { validAt: 0n, value: 0n },
      skimRecipient: randomAddress(),
      supplyQueue: [marketB1.id, marketB2.id],
      withdrawQueue: [marketB2.id, marketB1.id],
      timelock: 0n,
      totalSupply: 0n,
      totalAssets: 0n,
      lastTotalAssets: 0n,
    }),
    [vaultC.address]: new Vault({
      ...vaultC,
      curator: randomAddress(),
      fee: 0n,
      feeRecipient: randomAddress(),
      owner: randomAddress(),
      guardian: randomAddress(),
      pendingGuardian: { validAt: 0n, value: randomAddress() },
      pendingOwner: randomAddress(),
      pendingTimelock: { validAt: 0n, value: 0n },
      skimRecipient: randomAddress(),
      supplyQueue: [marketA1.id, marketA2.id, marketA3.id],
      withdrawQueue: [marketA3.id, marketA2.id, marketA1.id],
      timelock: 0n,
      publicAllocatorConfig: {
        fee: parseEther("0.001"),
        accruedFee: 0n,
        admin: randomAddress(),
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

export const vaultV2MorphoVaultV1AdapterA = new VaultV2MorphoVaultV1Adapter({
  morphoVaultV1: vaultA.address,
  address: "0x2a0000000000000000000000000000000000000a",
  parentVault: "0x200000000000000000000000000000000000000A",
  adapterId: "0x1",
  skimRecipient: zeroAddress,
});
export const vaultV2A = new VaultV2({
  asset: tokenA,
  adapters: [vaultV2MorphoVaultV1AdapterA.address],
  address: "0x200000000000000000000000000000000000000A",
  totalAssets: 0n,
  totalSupply: 0n,
  performanceFee: 0n,
  managementFee: 0n,
  performanceFeeRecipient: zeroAddress,
  managementFeeRecipient: zeroAddress,
  virtualShares: 10n ** BigInt(18 - blueFixture.tokens[tokenA].decimals),
  lastUpdate: timestamp,
  maxRate: 0n,
  liquidityAdapter: vaultV2MorphoVaultV1AdapterA.address,
  decimals: 18,
  symbol: "VAULTV2A",
  name: "Vault V2 A",
});
export const vaultV2B = new VaultV2({
  asset: tokenB,
  adapters: [],
  address: "0x200000000000000000000000000000000000000B",
  totalAssets: 0n,
  totalSupply: 0n,
  performanceFee: 0n,
  managementFee: 0n,
  performanceFeeRecipient: zeroAddress,
  managementFeeRecipient: zeroAddress,
  virtualShares: 10n ** BigInt(18 - blueFixture.tokens[tokenB].decimals),
  lastUpdate: timestamp,
  maxRate: 0n,
  liquidityAdapter: zeroAddress,
  decimals: 18,
  symbol: "VAULTV2B",
  name: "Vault V2 B",
});

export const v2Fixture = {
  vaultV2Adapters: {
    [vaultV2MorphoVaultV1AdapterA.address]: vaultV2MorphoVaultV1AdapterA,
  },
  vaultV2s: {
    [vaultV2A.address]: vaultV2A,
    [vaultV2B.address]: vaultV2B,
  },
  tokens: {
    [vaultV2A.address]: new Token(vaultV2A),
    [vaultV2B.address]: new Token(vaultV2B),
  },
  holdings: {
    [vaultV2A.address]: {
      [tokenA]: emptyHolding(vaultV2A.address, tokenA),
    },
    [vaultV2B.address]: {
      [tokenB]: emptyHolding(vaultV2B.address, tokenB),
    },
    [vaultV2MorphoVaultV1AdapterA.address]: {
      [vaultA.address]: emptyHolding(
        vaultV2MorphoVaultV1AdapterA.address,
        vaultA.address,
      ),
    },
    [userA]: {
      [vaultV2A.address]: emptyHolding(userA, vaultV2A.address),
      [vaultV2B.address]: emptyHolding(userA, vaultV2B.address),
    },
    [userB]: {
      [vaultV2A.address]: emptyHolding(userB, vaultV2A.address),
      [vaultV2B.address]: emptyHolding(userB, vaultV2B.address),
    },
  },
};

export const dataFixture = new SimulationState({
  chainId: ChainId.EthMainnet,
  block: { number: 1n, timestamp },
  ..._merge(blueFixture, metaMorphoFixture, v2Fixture),
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
