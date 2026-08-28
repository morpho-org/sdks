import { MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import { type Address, erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  encodeReadResult,
  IN_KIND_BUNDLER,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV2Data,
  mockMulticallResults,
  secondInKindMarketParams,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  AdapterNotPartOfVaultError,
  ChainIdMismatchError,
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InKindRedeemRequiresSingleAdapterError,
  InKindRedeemZeroDeallocationError,
  InsufficientBlueBalanceForInKindRedeemError,
  NonPositiveInputError,
  UnsupportedInKindAdapterError,
  VaultAddressMismatchError,
} from "../../types/index.js";

const mockV2Requirements = (
  handle: ReturnType<typeof createMockClient>,
  params: {
    allowance?: bigint;
    blueBalance?: bigint;
  } = {},
) => {
  mockMulticallResults(handle, [
    encodeReadResult({
      abi: erc20Abi,
      functionName: "allowance",
      result: params.allowance ?? 0n,
    }),
    encodeReadResult({
      abi: erc2612Abi,
      functionName: "nonces",
      result: 9n,
    }),
    encodeReadResult({
      abi: erc20Abi,
      functionName: "balanceOf",
      result: params.blueBalance ?? 1_000n,
    }),
  ]);
};

describe("MorphoVaultV2.inKindRedeem", () => {
  test("default", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const exit = vault.inKindRedeem({
      amount: 500n,
      marketParamsList: [inKindMarketParams],
      vaultData: inKindVaultV2Data({ penalty: 20_000_000_000_000_000n }),
      userAddress: IN_KIND_USER,
    });

    expect(exit.buildTx().action.type).toBe("vaultV2InKindRedeem");
  });

  test("behavior: tolerates a market lastUpdate ahead of the caller's clock", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, { allowance: 0n, blueBalance: 1_000n });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);

    // A vault market accrued in a block whose timestamp leads the caller's clock
    // (now < lastUpdate): a bare `accrueInterest(now)` throws `InvalidInterestAccrual`
    // while building `assetsByMarket`.
    const exit = vault.inKindRedeem({
      amount: 500n,
      marketParamsList: [inKindMarketParams],
      vaultData: inKindVaultV2Data({
        penalty: 20_000_000_000_000_000n,
        marketLastUpdate: Time.timestamp() + Time.s.from.h(1n),
      }),
      userAddress: IN_KIND_USER,
    });

    const [approval] = await exit.getRequirements();
    expect(approval?.action.type).toBe("erc20Approval");
    expect(exit.buildTx().action.type).toBe("vaultV2InKindRedeem");
  });

  test("behavior: snapshots the ordered market params", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const marketParams = new MarketParams(inKindMarketParams);
    const marketParamsList = [marketParams];
    const loanToken = marketParams.loanToken;
    const exit = vault.inKindRedeem({
      amount: 500n,
      marketParamsList,
      vaultData: inKindVaultV2Data(),
      userAddress: IN_KIND_USER,
    });
    (
      marketParams as unknown as {
        loanToken: Address;
      }
    ).loanToken = "0x0000000000000000000000000000000000001999";
    marketParamsList.length = 0;

    const tx = exit.buildTx();
    expect(tx.action.args.marketParamsList).toHaveLength(1);
    expect(tx.action.args.marketParamsList[0]?.loanToken).toBe(loanToken);
  });

  test("error: duplicate markets do not double-count coverage", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);

    expect(() =>
      vault.inKindRedeem({
        amount: 1_500n,
        marketParamsList: [inKindMarketParams, inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedeemCoverageError);
  });

  test("behavior: subtracts idle assets before validating market coverage", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);

    const exit = vault.inKindRedeem({
      amount: 1_500n,
      marketParamsList: [inKindMarketParams],
      vaultData: inKindVaultV2Data({ assetBalance: 500n }),
      userAddress: IN_KIND_USER,
    });

    expect(exit.buildTx().action.args.amount).toBe(1_500n);
  });

  test("error: includes idle assets in the maximum exit amount", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    let thrown: unknown;

    try {
      vault.inKindRedeem({
        amount: 63n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data({
          assetBalance: 10n,
          supplyShares: 50_000_000n,
          penalty: 20_000_000_000_000_000n,
        }),
        userAddress: IN_KIND_USER,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InKindRedeemCoverageError);
    expect(thrown).toMatchObject({ maxExitAssets: 62n });
  });

  test.each([
    {
      supplyShares: 0n,
      amount: 2n,
      covered: 0n,
      maxExitAssets: 0n,
    },
    {
      supplyShares: 1_000_000n,
      amount: 3n,
      covered: 1n,
      maxExitAssets: 2n,
    },
    {
      supplyShares: 50_000_000n,
      amount: 53n,
      covered: 50n,
      maxExitAssets: 52n,
    },
  ])(
    "error: reports the exact max exit for $covered covered assets",
    ({ supplyShares, amount, covered, maxExitAssets }) => {
      const handle = createMockClient(mainnet);
      const vault = handle.client
        .extend(morphoViemExtension())
        .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
      let thrown: unknown;

      try {
        vault.inKindRedeem({
          amount,
          marketParamsList: [inKindMarketParams],
          vaultData: inKindVaultV2Data({
            supplyShares,
            penalty: 20_000_000_000_000_000n,
          }),
          userAddress: IN_KIND_USER,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(InKindRedeemCoverageError);
      if (!(thrown instanceof InKindRedeemCoverageError)) return;
      expect(thrown.covered).toBe(covered);
      expect(thrown.maxExitAssets).toBe(maxExitAssets);
    },
  );

  test("error: InKindRedeemRequiresSingleAdapterError", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);

    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data({ adapters: "empty" }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedeemRequiresSingleAdapterError);
  });

  test("error: validates chain and vault snapshot address", () => {
    const handle = createMockClient(mainnet);
    const wrongChainVault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id + 1);
    expect(() =>
      wrongChainVault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(ChainIdMismatchError);

    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data({
          address: "0x0000000000000000000000000000000000001999",
        }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(VaultAddressMismatchError);
  });

  test("error: validates amount, market list, and deadline", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 0n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(EmptyMarketParamsListError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
        deadline: 1n,
      }),
    ).toThrow(ExpiredDeadlineError);
  });

  test("error: ExpiredDeadlineError when deadline expires before requirements", async () => {
    const now = 1_800_000_000n;
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const exit = withChainTimestamp(now, () =>
      vault.inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
        deadline: now + 1n,
      }),
    );
    const requirements = withChainTimestamp(now + 1n, () =>
      exit.getRequirements(),
    );

    await expect(requirements).rejects.toBeInstanceOf(ExpiredDeadlineError);
  });

  test("error: InKindRedeemZeroDeallocationError", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data({
          penalty: 20_000_000_000_000_000n,
        }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedeemZeroDeallocationError);
  });

  test("error: validates the adapter override and implementation", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
        adapter: "0x0000000000000000000000000000000000001999",
      }),
    ).toThrow(AdapterNotPartOfVaultError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data({ adapters: "legacy" }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(UnsupportedInKindAdapterError);
  });

  test("behavior: treats markets absent from the adapter snapshot as zero", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const unknownMarket = new MarketParams({
      ...inKindMarketParams,
      collateralToken: "0x0000000000000000000000000000000000001999",
    });

    const exit = vault.inKindRedeem({
      amount: 500n,
      marketParamsList: [unknownMarket, inKindMarketParams],
      vaultData: inKindVaultV2Data(),
      userAddress: IN_KIND_USER,
    });

    expect(
      exit
        .buildTx()
        .action.args.marketParamsList.map(
          ({ collateralToken }) => collateralToken,
        ),
    ).toEqual([
      unknownMarket.collateralToken,
      inKindMarketParams.collateralToken,
    ]);
  });

  test("behavior: default approve path uses the bounded share amount", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle);
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const [approval] = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(approval?.action).toEqual({
      type: "erc20Approval",
      args: { spender: IN_KIND_BUNDLER, amount: 501n },
    });
  });

  test("behavior: a greater bounded allowance needs no authorization", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, { allowance: 1_000n });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const requirements = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });

  test("behavior: allows an idle-only exit without markets or Blue callbacks", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, {
      blueBalance: 0n,
    });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const exit = vault.inKindRedeem({
      amount: 500n,
      marketParamsList: [],
      vaultData: inKindVaultV2Data({ assetBalance: 500n }),
      userAddress: IN_KIND_USER,
    });

    await expect(exit.getRequirements()).resolves.toHaveLength(1);
    expect(exit.buildTx().action.args.marketParamsList).toEqual([]);
  });

  test("behavior: signature path emits a bounded V2 permit", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle);
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const [requirement] = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirement?.action).toMatchObject({
      type: "permit",
      args: { spender: IN_KIND_BUNDLER, amount: 501n },
    });
  });

  test("behavior: allowance includes separately rounded penalty burns", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle);
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const [approval] = await vault
      .inKindRedeem({
        amount: 3n,
        marketParamsList: [inKindMarketParams, secondInKindMarketParams],
        vaultData: inKindVaultV2Data({
          additionalMarket: true,
          penalty: 20_000_000_000_000_000n,
          supplyShares: 1_000_000n,
          totalAssets: 501n,
        }),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(approval?.action).toMatchObject({ args: { amount: 6n } });
  });

  test("behavior: current preview bounds interest-driven share-price growth", async () => {
    const now = 1_800_000_000n;
    const totalAssets = 1_000_000_000_000_000_000n;
    const amount = totalAssets / 2n;
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, { blueBalance: totalAssets });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const [approval] = await withChainTimestamp(now, () =>
      vault
        .inKindRedeem({
          amount,
          marketParamsList: [inKindMarketParams],
          vaultData: inKindVaultV2Data({
            marketTotalAssets: totalAssets,
            marketTotalSupplyShares: totalAssets,
            supplyShares: totalAssets,
            rateAtTarget: MathLib.WAD / Time.s.from.y(1n),
            maxRate: MathLib.WAD / Time.s.from.y(1n),
          }),
          userAddress: IN_KIND_USER,
        })
        .getRequirements(),
    );

    expect(approval?.action).toMatchObject({ args: { amount: amount + 1n } });
  });

  test("behavior: deadline preview bounds management-fee dilution", async () => {
    const now = 1_800_000_000n;
    const deadline = now + Time.s.from.h(4n);
    const totalAssets = 1_000_000_000_000_000_000n;
    const amount = totalAssets / 2n;
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, { blueBalance: totalAssets });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const vaultData = inKindVaultV2Data({
      marketTotalAssets: totalAssets,
      marketTotalSupplyShares: totalAssets,
      supplyShares: totalAssets,
      managementFee: 50_000_000_000_000_000n / Time.s.from.y(1n),
    });
    const [approval] = await withChainTimestamp(now, () =>
      vault
        .inKindRedeem({
          amount,
          marketParamsList: [inKindMarketParams],
          vaultData,
          userAddress: IN_KIND_USER,
          deadline,
        })
        .getRequirements(),
    );

    const approvalAmount =
      approval?.action.type === "erc20Approval"
        ? approval.action.args.amount
        : 0n;
    const { vault: deadlineVault } = vaultData.accrueInterest(deadline);
    expect(approvalAmount).toBe(
      deadlineVault.toShares(amount, "Up") + deadlineVault.toShares(1n, "Up"),
    );
  });

  test("error: InsufficientBlueBalanceForInKindRedeemError", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, { blueBalance: 499n });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const requirements = vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    await expect(requirements).rejects.toBeInstanceOf(
      InsufficientBlueBalanceForInKindRedeemError,
    );
  });

  test("behavior: Blue balance covers the peak market chunk instead of the total", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, {
      allowance: 1_502n,
      blueBalance: 1_000n,
    });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const requirements = await vault
      .inKindRedeem({
        amount: 1_500n,
        marketParamsList: [inKindMarketParams, secondInKindMarketParams],
        vaultData: inKindVaultV2Data({ additionalMarket: true }),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });

  test("behavior: exact bounded allowance returns no authorization", async () => {
    const handle = createMockClient(mainnet);
    mockV2Requirements(handle, { allowance: 501n });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const requirements = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV2Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });
});
