import type {
  RequirementSignature,
  VaultReallocation,
  VaultV2BlueReallocation,
} from "@morpho-org/morpho-sdk";
import * as viem from "viem";
import { beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import type {
  MorphoBorrowOptions,
  MorphoBorrowWithVaultV2ReallocationsOptions,
  RequirementApproval,
  RequirementAuthorization,
  RequirementSignatureRequest,
} from "./morpho-protocol-evm.js";

const SEED =
  "cook voyage document eight skate token alien guide drink uncle term abuse";
const ADDRESS = "0x405005C7c4422390F4B334F64Cf20E0b767131d0";
const TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const COLLATERAL = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const VAULT = "0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11";
const MARKET_ID =
  "0xe7e9694b754c4d4f7e21faf7223f6fa71abaeb10296a4c43a54a7977149687d2";
const MARKET_PARAMS = {
  loanToken: TOKEN,
  collateralToken: COLLATERAL,
  oracle: "0x76b2242ea5BE1FCBBF4206EA09601EA5aB22Af4d",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860000000000000000n,
} as const;

const SUPPLY_TX = {
  to: "0x0000000000000000000000000000000000000001",
  value: 0n,
  data: "0x01",
};
const WITHDRAW_TX = {
  to: "0x0000000000000000000000000000000000000002",
  value: 0n,
  data: "0x02",
};
const BORROW_TX = {
  to: "0x0000000000000000000000000000000000000003",
  value: 0n,
  data: "0x03",
};
const REPAY_TX = {
  to: "0x0000000000000000000000000000000000000004",
  value: 0n,
  data: "0x04",
};
const SUPPLY_COLLATERAL_TX = {
  to: "0x0000000000000000000000000000000000000005",
  value: 0n,
  data: "0x05",
};
const WITHDRAW_COLLATERAL_TX = {
  to: "0x0000000000000000000000000000000000000006",
  value: 0n,
  data: "0x06",
};

const vaultData = {
  address: VAULT,
  asset: TOKEN,
  toAssets: vi.fn((shares: bigint) => shares),
  toShares: vi.fn((assets: bigint) => assets),
};

const positionData = {
  supplyShares: 11n,
  borrowShares: 22n,
  borrowAssets: 33n,
  collateral: 44n,
};

const supplyAction = {
  getRequirements: vi
    .fn()
    .mockResolvedValue([{ action: { type: "erc20Approval" } }]),
  buildTx: vi.fn().mockReturnValue(SUPPLY_TX),
};
const withdrawAction = {
  buildTx: vi.fn().mockReturnValue(WITHDRAW_TX),
};
const borrowAction = {
  getRequirements: vi
    .fn()
    .mockResolvedValue([{ action: { type: "blueAuthorization" } }]),
  buildTx: vi.fn().mockReturnValue(BORROW_TX),
};
const repayAction = {
  getRequirements: vi
    .fn()
    .mockResolvedValue([{ action: { type: "erc20Approval" } }]),
  buildTx: vi.fn().mockReturnValue(REPAY_TX),
};
const supplyCollateralAction = {
  getRequirements: vi
    .fn()
    .mockResolvedValue([{ action: { type: "erc20Approval" } }]),
  buildTx: vi.fn().mockReturnValue(SUPPLY_COLLATERAL_TX),
};
const withdrawCollateralAction = {
  buildTx: vi.fn().mockReturnValue(WITHDRAW_COLLATERAL_TX),
};

const vaultV2Entity = {
  getData: vi.fn().mockResolvedValue(vaultData),
  deposit: vi.fn().mockReturnValue(supplyAction),
  withdraw: vi.fn().mockReturnValue(withdrawAction),
};

const marketEntity = {
  getPositionData: vi.fn().mockResolvedValue(positionData),
  supplyCollateral: vi.fn().mockReturnValue(supplyCollateralAction),
  borrow: vi.fn().mockReturnValue(borrowAction),
  repay: vi.fn().mockReturnValue(repayAction),
  withdrawCollateral: vi.fn().mockReturnValue(withdrawCollateralAction),
};

const vaultV2Mock = vi.fn().mockReturnValue(vaultV2Entity);
const blueMock = vi.fn().mockReturnValue(marketEntity);
const morphoNamespaceMock = {
  vaultV2: vaultV2Mock,
  blue: blueMock,
};
// The SDK is now consumed via `client.extend(morphoViemExtension(...)).morpho`,
// so the extended viem client exposes the morpho namespace directly.
const morphoExtendMock = vi
  .fn()
  .mockReturnValue({ morpho: morphoNamespaceMock });
const morphoViemExtensionMock = vi.fn().mockReturnValue("morpho-extension");
const fetchMarketMock = vi.fn();
const mockGetChainId = vi.fn().mockResolvedValue(1);
const readContractMock = vi.fn().mockResolvedValue(123n);
const extendMock = vi.fn().mockReturnValue({
  account: { address: ADDRESS },
  chain: { id: 1 },
  getChainId: mockGetChainId,
  readContract: readContractMock,
  extend: morphoExtendMock,
});
const createClientMock = vi.fn().mockReturnValue({ extend: extendMock });

const { ChainIdMismatchError } = await vi.importActual<
  typeof import("@morpho-org/morpho-sdk")
>("@morpho-org/morpho-sdk");

vi.doMock("@morpho-org/morpho-sdk", () => ({
  ChainIdMismatchError,
  morphoViemExtension: morphoViemExtensionMock,
}));

vi.doMock("@morpho-org/blue-sdk-viem", () => ({
  fetchMarket: fetchMarketMock,
}));

vi.doMock("viem", () => ({
  ...viem,
  createClient: createClientMock,
}));

const { MarketParams } = await import("@morpho-org/blue-sdk");
const { WalletAccountEvm, WalletAccountReadOnlyEvm } = await import(
  "@tetherto/wdk-wallet-evm"
);
const { WalletAccountEvmErc4337 } = await import(
  "@tetherto/wdk-wallet-evm-erc-4337"
);
const { default: MorphoProtocolEvm } = await import("./morpho-protocol-evm.js");

describe.sequential("MorphoProtocolEvm", () => {
  let account: InstanceType<typeof WalletAccountEvm>;
  let protocol: InstanceType<typeof MorphoProtocolEvm>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMarketMock.mockResolvedValue({
      params: new MarketParams(MARKET_PARAMS),
    });
    mockGetChainId.mockResolvedValue(1);
    readContractMock.mockResolvedValue(123n);

    account = new WalletAccountEvm(SEED, "0'/0/0", {
      provider: "https://dummy-rpc-url.com",
    });
    account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
    protocol = new MorphoProtocolEvm(account, {
      chainId: 1,
      earnVaultAddress: VAULT,
      borrowMarketParams: MARKET_PARAMS,
    });
  });

  describe("supply", () => {
    test("should build a vault deposit with morpho-sdk and send it", async () => {
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-supply-hash", fee: 12_345n });

      const result = await protocol.supply({ token: TOKEN, amount: 100_000n });

      expect(morphoViemExtensionMock).toHaveBeenCalledWith({
        supportSignature: false,
        supportDeployless: undefined,
        metadata: undefined,
      });
      // The viem client is extended with the morpho namespace via morphoViemExtension's output.
      expect(morphoExtendMock).toHaveBeenCalledWith("morpho-extension");
      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith({
        amount: 100_000n,
        nativeAmount: undefined,
        userAddress: ADDRESS,
        vaultData,
        slippageTolerance: undefined,
      });
      expect(account.sendTransaction).toHaveBeenCalledWith(SUPPLY_TX);
      expect(result).toEqual({ hash: "dummy-supply-hash", fee: 12_345n });
    });

    test("should return supply requirements from morpho-sdk", async () => {
      const requirementOptions = { useSimplePermit: true };
      const requirements = await protocol.getSupplyRequirements(
        { token: TOKEN, amount: 100_000n },
        requirementOptions,
      );

      expect(requirements).toEqual([{ action: { type: "erc20Approval" } }]);
      expect(supplyAction.getRequirements).toHaveBeenCalledWith(
        requirementOptions,
      );
    });

    test("should use vaultV2 when an explicit vault is configured", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
      });

      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-supply-hash", fee: 12_345n });

      await protocol.supply({ token: TOKEN, amount: 100_000n });

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
    });

    test("should default explicit vault configuration to Morpho Vault V2", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
      });

      await protocol.getVaultPosition();

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
    });

    test("should copy options instead of keeping the caller reference", async () => {
      const mutableParams = { ...MARKET_PARAMS } as {
        loanToken: string;
        collateralToken: string;
        oracle: string;
        irm: string;
        lltv: bigint;
      };
      const options = {
        chainId: 1,
        earnVaultAddress: VAULT as string,
        borrowMarketParams: mutableParams,
      };
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(
        account,
        options as unknown as ConstructorParameters<
          typeof MorphoProtocolEvm
        >[1],
      );
      options.earnVaultAddress = "0x0000000000000000000000000000000000000001";
      mutableParams.loanToken = COLLATERAL;

      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-supply-hash", fee: 12_345n });

      await protocol.supply({ token: TOKEN, amount: 100_000n });

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100_000n,
        }),
      );
    });

    test("should build a native-only vault deposit", async () => {
      vaultV2Entity.getData.mockResolvedValueOnce({
        ...vaultData,
        asset: COLLATERAL,
      });

      account.getTokenBalance = vi.fn();
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-supply-hash", fee: 12_345n });

      await protocol.supply({ token: COLLATERAL, nativeAmount: 100_000n });

      expect(account.getTokenBalance).not.toHaveBeenCalled();
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith({
        amount: 0n,
        nativeAmount: 100_000n,
        userAddress: ADDRESS,
        vaultData: expect.objectContaining({ asset: COLLATERAL }),
        slippageTolerance: undefined,
      });
    });

    test("should reject zero deposit amount across erc20 and native sources", async () => {
      await expect(
        protocol.supply({ token: TOKEN, amount: 0n }),
      ).rejects.toThrow(
        "'amount' or 'nativeAmount' should be greater than zero.",
      );
    });

    test("should use vaultV2 when the selected preset is configured", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        presets: { earn: "sky-money-usdt-savings" },
        borrowMarketParams: MARKET_PARAMS,
      });

      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-supply-hash", fee: 12_345n });

      await protocol.supply({ token: TOKEN, amount: 100_000n });

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
    });

    test("should reject earn presets on the wrong chain", async () => {
      mockGetChainId.mockResolvedValue(8453);
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        presets: { earn: "sky-money-usdt-savings" },
        borrowMarketParams: MARKET_PARAMS,
      });

      await expect(protocol.getVaultPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
    });

    test("should throw if 'token' is invalid", async () => {
      await expect(
        protocol.supply({ token: "invalid-token-address", amount: 100_000n }),
      ).rejects.toThrow("'token' must be a valid address.");
    });

    test("should throw if 'amount' and 'nativeAmount' are zero", async () => {
      await expect(
        protocol.supply({ token: TOKEN, amount: 0n }),
      ).rejects.toThrow(
        "'amount' or 'nativeAmount' should be greater than zero.",
      );
    });

    test("should reject 'amount' numbers above Number.MAX_SAFE_INTEGER", async () => {
      await expect(
        protocol.supply({
          token: TOKEN,
          amount: Number.MAX_SAFE_INTEGER + 1,
        }),
      ).rejects.toThrow(
        "'amount' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.",
      );
    });

    test("should reject 'nativeAmount' numbers above Number.MAX_SAFE_INTEGER", async () => {
      await expect(
        protocol.supply({
          token: TOKEN,
          nativeAmount: Number.MAX_SAFE_INTEGER + 1,
        }),
      ).rejects.toThrow(
        "'nativeAmount' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.",
      );
    });

    test("should require chainId with explicit Morpho targets", () => {
      expect(
        () =>
          new MorphoProtocolEvm(account, {
            earnVaultAddress: VAULT,
            borrowMarketParams: MARKET_PARAMS,
          }),
      ).toThrow(
        "'chainId' must be configured when using explicit Morpho targets.",
      );
    });
  });

  describe("quoteSupply", () => {
    test("should quote a vault deposit transaction", async () => {
      account.quoteSendTransaction = vi
        .fn()
        .mockResolvedValue({ fee: 12_345n });

      const result = await protocol.quoteSupply({
        token: TOKEN,
        amount: 100_000n,
      });

      expect(account.quoteSendTransaction).toHaveBeenCalledWith(SUPPLY_TX);
      expect(result).toEqual({ fee: 12_345n });
    });
  });

  describe("withdraw", () => {
    test("should build a vault withdraw with morpho-sdk and send it", async () => {
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-withdraw-hash", fee: 12_345n });

      const result = await protocol.withdraw({
        token: TOKEN,
        amount: 100_000n,
      });

      expect(vaultV2Entity.withdraw).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
      });
      expect(account.sendTransaction).toHaveBeenCalledWith(WITHDRAW_TX);
      expect(result).toEqual({ hash: "dummy-withdraw-hash", fee: 12_345n });
    });

    test("should throw if 'to' is not the wallet address", async () => {
      await expect(
        protocol.withdraw({
          token: TOKEN,
          amount: 100_000n,
          to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        }),
      ).rejects.toThrow(
        "'to' must equal the wallet account address for Morpho vault withdrawals.",
      );
    });
  });

  describe("borrow", () => {
    test("types: borrow reallocations require replayable arrays", () => {
      expectTypeOf<
        NonNullable<MorphoBorrowOptions["reallocations"]>
      >().toEqualTypeOf<readonly VaultReallocation[]>();
      expectTypeOf<
        MorphoBorrowWithVaultV2ReallocationsOptions["reallocations"]
      >().toEqualTypeOf<readonly VaultV2BlueReallocation[]>();
    });

    test("should build a market borrow with morpho-sdk and send it", async () => {
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-borrow-hash", fee: 12_345n });

      const result = await protocol.borrow({ token: TOKEN, amount: 100_000n });

      expect(blueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          loanToken: TOKEN,
          collateralToken: COLLATERAL,
        }),
        1,
      );
      expect(marketEntity.getPositionData).toHaveBeenCalledWith(ADDRESS);
      expect(marketEntity.borrow).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
        positionData,
        slippageTolerance: undefined,
        reallocations: undefined,
      });
      expect(account.sendTransaction).toHaveBeenCalledWith(BORROW_TX);
      expect(result).toEqual({ hash: "dummy-borrow-hash", fee: 12_345n });
    });

    test("should forward Vault V2 BluePublicAllocator reallocations", async () => {
      const reallocation = {
        vault: VAULT,
        from: { type: "idle" },
        to: {
          adapter: "0x0000000000000000000000000000000000000020",
        },
        assets: 50_000n,
        penalty: 1n,
      } satisfies VaultV2BlueReallocation;

      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-v2-borrow-hash", fee: 12_345n });

      await protocol.borrow({
        token: TOKEN,
        amount: 100_000n,
        reallocations: [reallocation],
      });

      expect(marketEntity.borrow).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
        positionData,
        slippageTolerance: undefined,
        reallocations: [reallocation],
      });
    });

    test("should fetch market params when only borrowMarketId is configured", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketId: MARKET_ID,
      });

      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-borrow-hash", fee: 12_345n });

      await protocol.borrow({ token: TOKEN, amount: 100_000n });

      expect(fetchMarketMock).toHaveBeenCalledWith(
        MARKET_ID,
        expect.any(Object),
        {
          chainId: 1,
          deployless: undefined,
        },
      );
    });

    test("should reject borrow presets on the wrong chain", async () => {
      mockGetChainId.mockResolvedValue(8453);
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        presets: { borrow: "wsteth" },
      });

      await expect(
        protocol.borrow({ token: TOKEN, amount: 100_000n }),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
      expect(fetchMarketMock).not.toHaveBeenCalled();
    });

    test("should return borrow requirements from morpho-sdk", async () => {
      const options = {
        token: TOKEN,
        amount: 100_000n,
      } satisfies MorphoBorrowOptions;
      const promise = protocol.getBorrowRequirements(options);
      expectTypeOf(promise).toEqualTypeOf<
        Promise<(RequirementAuthorization | RequirementSignatureRequest)[]>
      >();
      const requirements = await promise;

      expect(requirements).toEqual([{ action: { type: "blueAuthorization" } }]);
      expect(borrowAction.getRequirements).toHaveBeenCalled();
    });

    test("types: Vault V2 borrow requirements opt into approval results", async () => {
      const options = {
        token: TOKEN,
        amount: 100_000n,
        reallocations: [
          {
            vault: VAULT,
            from: { type: "idle" },
            to: {
              adapter: "0x0000000000000000000000000000000000000020",
            },
            assets: 50_000n,
            penalty: 1n,
          },
        ],
      } satisfies MorphoBorrowWithVaultV2ReallocationsOptions;

      const promise = protocol.getBorrowRequirements(options);
      expectTypeOf(promise).toEqualTypeOf<
        Promise<
          (
            | RequirementApproval
            | RequirementAuthorization
            | RequirementSignatureRequest
          )[]
        >
      >();
      await promise;
    });

    test("should build the borrow without signatures by default", async () => {
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-borrow-hash", fee: 12_345n });

      await protocol.borrow({ token: TOKEN, amount: 100_000n });

      expect(borrowAction.buildTx).toHaveBeenCalledWith(undefined);
    });

    test("should fold a signed authorization into the bundle when provided", async () => {
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-borrow-hash", fee: 12_345n });
      const requirementSignature = {
        action: { type: "authorization" },
      } as unknown as RequirementSignature;

      await protocol.borrow({
        token: TOKEN,
        amount: 100_000n,
        requirementSignature,
      });

      expect(borrowAction.buildTx).toHaveBeenCalledWith([requirementSignature]);
    });

    test("should throw if 'onBehalfOf' differs from the wallet address", async () => {
      await expect(
        protocol.borrow({
          token: TOKEN,
          amount: 100_000n,
          onBehalfOf: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        }),
      ).rejects.toThrow(
        "'onBehalfOf' must equal the wallet account address for Morpho SDK-backed operations.",
      );
    });

    test("should reject 'amount' numbers above Number.MAX_SAFE_INTEGER", async () => {
      await expect(
        protocol.borrow({
          token: TOKEN,
          amount: Number.MAX_SAFE_INTEGER + 1,
        }),
      ).rejects.toThrow(
        "'amount' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.",
      );
    });
  });

  describe("repay", () => {
    test("should build a max repay by shares with morpho-sdk", async () => {
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-repay-hash", fee: 12_345n });

      const result = await protocol.repay({ token: TOKEN, amount: "max" });

      expect(marketEntity.repay).toHaveBeenCalledWith({
        shares: 22n,
        userAddress: ADDRESS,
        positionData,
        slippageTolerance: undefined,
      });
      expect(account.sendTransaction).toHaveBeenCalledWith(REPAY_TX);
      expect(result).toEqual({ hash: "dummy-repay-hash", fee: 12_345n });
    });

    test("should build an asset repay with morpho-sdk after balance check", async () => {
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-repay-hash", fee: 12_345n });

      await protocol.repay({ token: TOKEN, amount: 100_000n });

      expect(account.getTokenBalance).toHaveBeenCalledWith(TOKEN);
      expect(marketEntity.repay).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
        positionData,
        slippageTolerance: undefined,
      });
    });

    test("should pass requirement options to morpho-sdk repay requirements", async () => {
      const requirementOptions = { useSimplePermit: true };
      const requirements = await protocol.getRepayRequirements(
        { token: TOKEN, amount: 100_000n },
        requirementOptions,
      );

      expect(requirements).toEqual([{ action: { type: "erc20Approval" } }]);
      expect(repayAction.getRequirements).toHaveBeenCalledWith(
        requirementOptions,
      );
    });
  });

  describe("collateral", () => {
    test("should build a supply collateral transaction with morpho-sdk", async () => {
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-collateral-hash", fee: 12_345n });

      const result = await protocol.supplyCollateral({
        token: COLLATERAL,
        amount: 100_000n,
      });

      expect(marketEntity.supplyCollateral).toHaveBeenCalledWith({
        amount: 100_000n,
        nativeAmount: undefined,
        userAddress: ADDRESS,
      });
      expect(account.sendTransaction).toHaveBeenCalledWith(
        SUPPLY_COLLATERAL_TX,
      );
      expect(result).toEqual({ hash: "dummy-collateral-hash", fee: 12_345n });
    });

    test("should build a native-only supply collateral transaction", async () => {
      account.getTokenBalance = vi.fn();
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-collateral-hash", fee: 12_345n });

      await protocol.supplyCollateral({
        token: COLLATERAL,
        nativeAmount: 100_000n,
      });

      expect(account.getTokenBalance).not.toHaveBeenCalled();
      expect(marketEntity.supplyCollateral).toHaveBeenCalledWith({
        amount: 0n,
        nativeAmount: 100_000n,
        userAddress: ADDRESS,
      });
    });

    test("should build a withdraw collateral transaction with morpho-sdk", async () => {
      account.sendTransaction = vi.fn().mockResolvedValue({
        hash: "dummy-withdraw-collateral-hash",
        fee: 12_345n,
      });

      const result = await protocol.withdrawCollateral({
        token: COLLATERAL,
        amount: 100_000n,
      });

      expect(marketEntity.withdrawCollateral).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
        positionData,
      });
      expect(account.sendTransaction).toHaveBeenCalledWith(
        WITHDRAW_COLLATERAL_TX,
      );
      expect(result).toEqual({
        hash: "dummy-withdraw-collateral-hash",
        fee: 12_345n,
      });
    });

    test("should pass requirement options to morpho-sdk supply collateral requirements", async () => {
      const requirementOptions = { useSimplePermit: true };
      const requirements = await protocol.getSupplyCollateralRequirements(
        { token: COLLATERAL, amount: 100_000n },
        requirementOptions,
      );

      expect(requirements).toEqual([{ action: { type: "erc20Approval" } }]);
      expect(supplyCollateralAction.getRequirements).toHaveBeenCalledWith(
        requirementOptions,
      );
    });
  });

  describe("erc-4337", () => {
    test("should send through an erc-4337 account with config", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local account shadowing the suite default
      const account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 1,
        provider: "https://dummy-rpc-url.com",
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-user-operation-hash", fee: 12_345n });

      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
      });

      const config = { paymasterToken: { address: TOKEN } };
      const result = await protocol.supply(
        { token: TOKEN, amount: 100_000n },
        config,
      );

      expect(account.sendTransaction).toHaveBeenCalledWith(SUPPLY_TX, config);
      expect(result).toEqual({
        hash: "dummy-user-operation-hash",
        fee: 12_345n,
      });
    });

    test("snapshots native value before resolving chain state", async () => {
      const observedChain = Promise.withResolvers<number>();
      mockGetChainId.mockImplementationOnce(() => observedChain.promise);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-supply-hash", fee: 12_345n });
      const options = { token: TOKEN, nativeAmount: 100_000n };

      const result = protocol.supply(options);
      options.nativeAmount = 200_000n;
      observedChain.resolve(1);
      await result;

      expect(vaultV2Entity.deposit).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 0n, nativeAmount: 100_000n }),
      );
    });
  });

  describe("read methods", () => {
    test("preserves provider-array failover attempts", async () => {
      const attempts: string[] = [];
      const providers = ["A", "B"].map((label) => ({
        request: vi.fn(async () => {
          attempts.push(label);
          throw new Error(label);
        }),
      }));
      const fallbackAccount = new WalletAccountReadOnlyEvm(ADDRESS, {
        provider: providers,
        retries: 3,
        chainId: 1,
      });
      fallbackAccount.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      const fallbackProtocol = new MorphoProtocolEvm(fallbackAccount, {
        chainId: 1,
        borrowMarketParams: MARKET_PARAMS,
      });

      await fallbackProtocol.getMarketPosition();

      const clientConfig = createClientMock.mock.calls[0]?.[0] as {
        transport: viem.Transport;
      };
      const transport = clientConfig.transport({ retryCount: 0 });
      await expect(
        transport.request({ method: "eth_chainId" }),
      ).rejects.toThrow();
      expect(attempts).toEqual(["A", "B", "A", "B"]);
    });

    test("should return vault position data", async () => {
      const result = await protocol.getVaultPosition();

      expect(readContractMock).toHaveBeenCalledWith({
        address: VAULT,
        abi: viem.erc4626Abi,
        functionName: "balanceOf",
        args: [ADDRESS],
      });
      expect(result).toEqual({
        shares: 123n,
        assets: 123n,
        vaultAddress: VAULT,
      });
    });

    test("should return market position data", async () => {
      const result = await protocol.getMarketPosition();

      expect(result).toEqual({
        supplyShares: 11n,
        borrowShares: 22n,
        borrowAssets: 33n,
        collateral: 44n,
        marketId: new MarketParams(MARKET_PARAMS).id,
      });
    });

    test("should invalidate chain-bound caches when the provider chain changes", async () => {
      await protocol.getMarketPosition();
      expect(blueMock).toHaveBeenCalledWith(expect.any(Object), 1);

      mockGetChainId.mockResolvedValue(8453);

      await expect(protocol.getMarketPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      expect(blueMock).toHaveBeenCalledTimes(1);

      mockGetChainId.mockResolvedValue(1);
      await protocol.getMarketPosition();
      expect(blueMock).toHaveBeenCalledTimes(2);
      expect(morphoViemExtensionMock).toHaveBeenCalledTimes(2);
    });

    test("shares one context across same-chain operations completing out of order", async () => {
      const first = Promise.withResolvers<number>();
      const second = Promise.withResolvers<number>();
      mockGetChainId
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);

      const firstPosition = protocol.getMarketPosition();
      const secondPosition = protocol.getMarketPosition();
      second.resolve(1);
      await expect(secondPosition).resolves.toEqual(
        expect.objectContaining({ marketId: expect.any(String) }),
      );
      first.resolve(1);
      await expect(firstPosition).resolves.toEqual(
        expect.objectContaining({ marketId: expect.any(String) }),
      );
    });

    test("waits for a newer same-chain observation when the older resolves first", async () => {
      const first = Promise.withResolvers<number>();
      const second = Promise.withResolvers<number>();
      mockGetChainId
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);

      const firstPosition = protocol.getMarketPosition();
      const secondPosition = protocol.getMarketPosition();
      first.resolve(1);
      second.resolve(1);

      await expect(firstPosition).resolves.toEqual(
        expect.objectContaining({ marketId: expect.any(String) }),
      );
      await expect(secondPosition).resolves.toEqual(
        expect.objectContaining({ marketId: expect.any(String) }),
      );
    });

    test("rejects conflicting chain observations completing out of order", async () => {
      const first = Promise.withResolvers<number>();
      const second = Promise.withResolvers<number>();
      mockGetChainId
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);

      const firstPosition = protocol.getMarketPosition();
      const secondPosition = protocol.getMarketPosition();
      second.resolve(8453);
      await expect(secondPosition).rejects.toBeInstanceOf(ChainIdMismatchError);
      first.resolve(1);
      await expect(firstPosition).rejects.toBeInstanceOf(ChainIdMismatchError);
    });

    test("rejects dispatch while a newer chain observation is pending", async () => {
      const dispatchChain = Promise.withResolvers<number>();
      const newerChain = Promise.withResolvers<number>();
      mockGetChainId
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockImplementationOnce(() => dispatchChain.promise)
        .mockImplementationOnce(() => newerChain.promise);
      account.sendTransaction = vi.fn();

      const supply = protocol.supply({ token: TOKEN, nativeAmount: 100_000n });
      await vi.waitFor(() => expect(mockGetChainId).toHaveBeenCalledTimes(3));
      const position = protocol.getMarketPosition();
      await vi.waitFor(() => expect(mockGetChainId).toHaveBeenCalledTimes(4));

      dispatchChain.resolve(1);
      await Promise.resolve();
      expect(account.sendTransaction).not.toHaveBeenCalled();

      newerChain.resolve(8453);
      await expect(supply).rejects.toBeInstanceOf(ChainIdMismatchError);
      await expect(position).rejects.toBeInstanceOf(ChainIdMismatchError);
    });

    test("does not cache market data resolved after a chain switch", async () => {
      const fetchedMarket = Promise.withResolvers<{
        params: InstanceType<typeof MarketParams>;
      }>();
      fetchMarketMock.mockImplementationOnce(() => fetchedMarket.promise);
      const marketIdProtocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketId: MARKET_ID,
      });

      const stalePosition = marketIdProtocol.getMarketPosition();
      await vi.waitFor(() => expect(fetchMarketMock).toHaveBeenCalledOnce());
      mockGetChainId.mockResolvedValue(8453);
      await expect(marketIdProtocol.getVaultPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      fetchedMarket.resolve({ params: new MarketParams(MARKET_PARAMS) });
      await expect(stalePosition).rejects.toBeInstanceOf(ChainIdMismatchError);

      mockGetChainId.mockResolvedValue(1);
      await marketIdProtocol.getMarketPosition();
      expect(fetchMarketMock).toHaveBeenCalledTimes(2);
    });

    test("invalidates same-chain caches after an observed switch away and back", async () => {
      await protocol.getMarketPosition();
      const priorChainReads = mockGetChainId.mock.calls.length;
      const switchedChain = Promise.withResolvers<number>();
      const returnedChain = Promise.withResolvers<number>();
      mockGetChainId
        .mockImplementationOnce(() => switchedChain.promise)
        .mockImplementationOnce(() => returnedChain.promise);

      const switchedPosition = protocol.getMarketPosition();
      const returnedPosition = protocol.getMarketPosition();
      await vi.waitFor(() =>
        expect(mockGetChainId).toHaveBeenCalledTimes(priorChainReads + 2),
      );
      returnedChain.resolve(1);
      await expect(returnedPosition).resolves.toEqual(
        expect.objectContaining({ marketId: expect.any(String) }),
      );
      switchedChain.resolve(8453);
      await expect(switchedPosition).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );

      const cachedEntities = blueMock.mock.calls.length;
      await protocol.getMarketPosition();
      expect(blueMock).toHaveBeenCalledTimes(cachedEntities + 1);
    });

    test("rechecks the chain immediately before native-value dispatch", async () => {
      mockGetChainId
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(8453);
      account.sendTransaction = vi.fn();

      await expect(
        protocol.supply({ token: TOKEN, nativeAmount: 100_000n }),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
      expect(account.sendTransaction).not.toHaveBeenCalled();
    });

    test("rejects a quote when its completion crosses chains", async () => {
      mockGetChainId
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(8453);
      account.quoteSendTransaction = vi
        .fn()
        .mockResolvedValue({ fee: 12_345n });

      await expect(
        protocol.quoteSupply({ token: TOKEN, amount: 100_000n }),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
    });

    test("rejects requirements resolved after another operation observes a switch", async () => {
      const requirementResult =
        Promise.withResolvers<{ action: { type: string } }[]>();
      supplyAction.getRequirements.mockImplementationOnce(
        () => requirementResult.promise,
      );
      const requirements = protocol.getSupplyRequirements({
        token: TOKEN,
        amount: 100_000n,
      });
      await vi.waitFor(() =>
        expect(supplyAction.getRequirements).toHaveBeenCalledOnce(),
      );

      mockGetChainId.mockResolvedValue(8453);
      await expect(protocol.getMarketPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      requirementResult.resolve([{ action: { type: "erc20Approval" } }]);
      await expect(requirements).rejects.toBeInstanceOf(ChainIdMismatchError);
    });

    test("shares one chain context across account-data reads", async () => {
      const vaultChain = Promise.withResolvers<number>();
      const marketChain = Promise.withResolvers<number>();
      mockGetChainId
        .mockResolvedValueOnce(1)
        .mockImplementationOnce(() => vaultChain.promise)
        .mockImplementationOnce(() => marketChain.promise);

      const accountData = protocol.getAccountData();
      await vi.waitFor(() => expect(mockGetChainId).toHaveBeenCalledTimes(3));
      vaultChain.resolve(1);
      marketChain.resolve(1);

      await expect(accountData).resolves.toEqual(
        expect.objectContaining({
          vaultAddress: VAULT,
          marketId: new MarketParams(MARKET_PARAMS).id,
        }),
      );
    });
  });

  describe("erc-4337 chain binding", () => {
    test("rejects a cached account chain before resolving entities", async () => {
      const erc4337Account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 8453,
        provider: "https://dummy-rpc-url.com",
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      erc4337Account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      (erc4337Account as unknown as { _chainId: bigint | undefined })._chainId =
        1n;
      mockGetChainId.mockResolvedValue(8453);
      const erc4337Protocol = new MorphoProtocolEvm(erc4337Account, {
        chainId: 8453,
        borrowMarketParams: MARKET_PARAMS,
      });

      await expect(erc4337Protocol.getMarketPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      expect(blueMock).not.toHaveBeenCalled();
    });

    test("requires a fresh account after an observed chain switch", async () => {
      const erc4337Account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 1,
        provider: "https://dummy-rpc-url.com",
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      erc4337Account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      (erc4337Account as unknown as { _chainId: bigint | undefined })._chainId =
        1n;
      const erc4337Protocol = new MorphoProtocolEvm(erc4337Account, {
        chainId: 1,
        borrowMarketParams: MARKET_PARAMS,
      });

      await erc4337Protocol.getMarketPosition();
      mockGetChainId.mockResolvedValue(8453);
      await expect(erc4337Protocol.getMarketPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      mockGetChainId.mockResolvedValue(1);
      await expect(erc4337Protocol.getMarketPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );

      const freshAccount = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 1,
        provider: "https://dummy-rpc-url.com",
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      freshAccount.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      const freshProtocol = new MorphoProtocolEvm(freshAccount, {
        chainId: 1,
        borrowMarketParams: MARKET_PARAMS,
      });
      await expect(freshProtocol.getMarketPosition()).resolves.toEqual(
        expect.objectContaining({ marketId: expect.any(String) }),
      );
    });
  });

  describe("read-only accounts", () => {
    test("should reject write methods", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local account shadowing the suite default
      const account = new WalletAccountReadOnlyEvm(ADDRESS, {
        provider: "https://dummy-rpc-url.com",
      });
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
      });

      await expect(
        protocol.supply({ token: TOKEN, amount: 100_000n }),
      ).rejects.toThrow(
        "The 'supply(options)' method requires the protocol to be initialized with a non read-only account.",
      );
    });
  });
});
