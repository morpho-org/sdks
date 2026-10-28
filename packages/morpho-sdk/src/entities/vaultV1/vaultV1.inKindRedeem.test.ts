import {
  addressesRegistry,
  getChainAddress,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { blueAbi, erc2612Abi, metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Address, erc20Abi, maxUint256, serializeSignature } from "viem";
import { arc, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_BUNDLER,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV1Data,
  secondInKindMarketParams,
} from "../../../test/fixtures/inKindRedeem.js";
import {
  signerAddress,
  signerWalletClient,
} from "../../../test/helpers/signer.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  type ActionRequirement,
  BundlesPermitMismatchError,
  ChainIdMismatchError,
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InputExceedsMaxError,
  InsufficientBlueBalanceForInKindRedeemError,
  isPermitSignature,
  isRequirementApproval,
  isRequirementSignature,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type RequirementSignature,
  VaultAddressMismatchError,
  VaultIsBlueFeeRecipientError,
  VaultMorphoMismatchError,
} from "../../types/index.js";

const answerWrongChain = (handle: ReturnType<typeof createMockClient>) =>
  handle.request.mockImplementation(async ({ method }) => {
    if (method === "eth_chainId") return "0x2105";
    throw new Error(`unexpected ${method}`);
  });

const blue = addressesRegistry[mainnet.id].blue;

const mockV1Requirements = (
  handle: ReturnType<typeof createMockClient>,
  params: {
    allowance: bigint;
    blueBalance?: bigint;
    morpho?: Address;
    blueFeeRecipient?: Address;
    vault?: Address;
    asset?: Address;
    blue?: Address;
  },
) => {
  const vault = params.vault ?? IN_KIND_VAULT;
  const blueAddress = params.blue ?? blue;
  mockRead(handle, {
    address: vault,
    abi: erc20Abi,
    functionName: "allowance",
    result: params.allowance,
  });
  mockRead(handle, {
    address: vault,
    abi: erc2612Abi,
    functionName: "nonces",
    result: 7n,
  });
  mockRead(handle, {
    address: params.asset ?? IN_KIND_ASSET,
    abi: erc20Abi,
    functionName: "balanceOf",
    result: params.blueBalance ?? 1_000n,
  });
  mockRead(handle, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "MORPHO",
    result: params.morpho ?? blueAddress,
  });
  mockRead(handle, {
    address: blueAddress,
    abi: blueAbi,
    functionName: "feeRecipient",
    result: params.blueFeeRecipient ?? IN_KIND_USER,
  });
};

const expectInKindAllowanceThreshold = async (
  makeExit: (
    allowance: bigint,
    supportSignature: boolean,
  ) => {
    getRequirements: () => Promise<readonly ActionRequirement[]>;
    buildTx: (signatures?: readonly RequirementSignature[]) => unknown;
  },
  minimum: bigint,
) => {
  expect(await makeExit(minimum, false).getRequirements()).toEqual([]);

  const belowMinimum = makeExit(minimum - 1n, false);
  const requirements = await belowMinimum.getRequirements();
  expect(requirements).toHaveLength(1);
  const [approval] = requirements;
  if (!approval || !isRequirementApproval(approval)) {
    throw new Error("Expected an ERC-20 approval requirement");
  }
  expect(approval.action.args.amount).toBe(maxUint256);

  const permitExit = makeExit(minimum - 1n, true);
  const [requirement] = await permitExit.getRequirements();
  if (
    !isRequirementSignature(requirement) ||
    requirement.action.type !== "permit"
  ) {
    throw new Error("Expected a share permit requirement");
  }
  const signed = await requirement.sign(signerWalletClient, signerAddress);
  if (!isPermitSignature(signed)) {
    throw new Error("Expected an ERC-2612 permit signature");
  }
  const undersizedPermit: PermitRequirementSignature = {
    ...signed,
    args: { ...signed.args, amount: minimum - 1n },
    action: {
      ...signed.action,
      args: { ...signed.action.args, amount: minimum - 1n },
    },
  };

  expect(() => permitExit.buildTx([undersizedPermit])).toThrow(
    BundlesPermitMismatchError,
  );
};

describe("MorphoVaultV1.inKindRedeem", () => {
  test("error: InputExceedsMaxError before exposing requirements", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
        deadline: maxUint256 + 1n,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("default: builds the V1 action from distinct market coverage", () => {
    const now = 1_800_000_000n;
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const vaultData = withChainTimestamp(now, () =>
      inKindVaultV1Data({ additionalMarket: true }),
    );
    const exit = withChainTimestamp(now + 1n, () =>
      vault.inKindRedeem({
        amount: 1_500n,
        marketParamsList: [inKindMarketParams, secondInKindMarketParams],
        vaultData,
        userAddress: IN_KIND_USER,
      }),
    );

    expect(exit.buildTx().action.type).toBe("vaultV1InKindRedeem");
  });

  test("error: duplicate markets do not double-count coverage", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    let thrown: unknown;

    try {
      vault.inKindRedeem({
        amount: 1_500n,
        marketParamsList: [inKindMarketParams, inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InKindRedeemCoverageError);
    expect(thrown).toMatchObject({
      required: 1_500n,
      covered: 1_000n,
      maxExitAssets: 1_000n,
    });
  });

  test("error: preserves raw order when a duplicate precedes distinct coverage", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);

    expect(() =>
      vault.inKindRedeem({
        amount: 1_500n,
        marketParamsList: [
          inKindMarketParams,
          inKindMarketParams,
          secondInKindMarketParams,
        ],
        vaultData: inKindVaultV1Data({ additionalMarket: true }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedeemCoverageError);
  });

  test("behavior: snapshots the ordered market params", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const marketParams = new MarketParams(inKindMarketParams);
    const marketParamsList = [marketParams];
    const loanToken = marketParams.loanToken;
    const exit = vault.inKindRedeem({
      amount: 500n,
      marketParamsList,
      vaultData: inKindVaultV1Data(),
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

  test("error: InKindRedeemCoverageError prevents array exhaustion", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);

    expect(() =>
      vault.inKindRedeem({
        amount: 1_001n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedeemCoverageError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data({ enabled: false }),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(InKindRedeemCoverageError);
  });

  test("behavior: skips zero-share markets before accruing interest", () => {
    const now = 1_800_000_000n;
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const vaultData = withChainTimestamp(now, () =>
      inKindVaultV1Data({ supplyShares: 0n }),
    );
    vaultData.allocations.get(
      inKindMarketParams.id,
    )!.position.market.rateAtTarget = undefined;

    expect(() =>
      withChainTimestamp(now + 1n, () =>
        vault.inKindRedeem({
          amount: 1n,
          marketParamsList: [inKindMarketParams],
          vaultData,
          userAddress: IN_KIND_USER,
        }),
      ),
    ).toThrow(InKindRedeemCoverageError);
  });

  test("error: validates client chain and vault snapshot address", () => {
    const handle = createMockClient(mainnet);
    const wrongChainVault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id + 1);
    expect(() =>
      wrongChainVault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(ChainIdMismatchError);

    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data({
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
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    expect(() =>
      vault.inKindRedeem({
        amount: 0n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      }),
    ).toThrow(EmptyMarketParamsListError);
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
        deadline: 1n,
      }),
    ).toThrow(ExpiredDeadlineError);
  });

  // Security invariant (root AGENTS.md §5): the action rejects an out-of-`uint256` deadline, so the
  // handle must too. Without this the documented `getRequirements()`-before-`buildTx()` flow could
  // walk a caller through a vault-share approval or permit for a deadline `buildTx()` cannot encode.
  test("error: InputExceedsMaxError for a deadline above uint256", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);

    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
        deadline: maxUint256 + 1n,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NonPositiveInputError for a zero deadline", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);

    // The contracts read `0` as "unset" rather than "expired", so the shared guard classifies it as
    // a non-positive input instead of reaching the `ExpiredDeadlineError` staleness check.
    expect(() =>
      vault.inKindRedeem({
        amount: 1n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
        deadline: 0n,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: ExpiredDeadlineError when deadline expires before requirements", async () => {
    const now = 1_800_000_000n;
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const exit = withChainTimestamp(now, () =>
      vault.inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
        deadline: now + 1n,
      }),
    );
    const requirements = withChainTimestamp(now + 1n, () =>
      exit.getRequirements(),
    );

    await expect(requirements).rejects.toBeInstanceOf(ExpiredDeadlineError);
  });

  test("behavior: default approve path uses an unlimited share approval", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: 0n });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const [approval] = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(approval?.action).toEqual({
      type: "erc20Approval",
      args: { spender: IN_KIND_BUNDLER, amount: maxUint256 },
    });
  });

  test("behavior: resolves requirements on a chain without viem multicall3 (Arc)", async () => {
    expect(arc.contracts?.multicall3).toBeUndefined();
    const arcBlue = getChainAddress(arc.id, "blue");
    const arcBundler = getChainAddress(arc.id, "bundles.vaultExitBundlesV1");
    const handle = createMockClient(arc);
    mockV1Requirements(handle, { allowance: 0n, blue: arcBlue });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV1(IN_KIND_VAULT, arc.id);
    const [approval] = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(approval?.action).toEqual({
      type: "erc20Approval",
      args: { spender: arcBundler, amount: maxUint256 },
    });
    expect(handle.request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
    ]);
  });

  test("behavior: allowance threshold includes pending V1 performance fee shares", async () => {
    const makeExit = (allowance: bigint, supportSignature: boolean) => {
      const handle = createMockClient(mainnet);
      mockV1Requirements(handle, { allowance });
      const vault = handle.client
        .extend(morphoViemExtension({ supportSignature }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      return vault.inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data({
          fee: MathLib.WAD / 10n,
          lastTotalAssets: 900n,
        }),
        userAddress: signerAddress,
      });
    };

    await expectInKindAllowanceThreshold(makeExit, 506n);
  });

  test("behavior: reuses an allowance above the required shares", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: 1_000n });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });

  test("behavior: reuses a larger allowance when signatures are supported", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: 1_000n });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });

  test.each(["spender", "amount", "deadline"] as const)(
    "error: BundlesPermitMismatchError for a different %s",
    async (field) => {
      const handle = createMockClient(mainnet);
      mockV1Requirements(handle, { allowance: 0n });
      const vault = handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
      const exit = vault.inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
        deadline: 1_900_000_000n,
      });
      const [requirement] = await exit.getRequirements();
      if (requirement?.action.type !== "permit") {
        throw new Error("Expected a permit requirement");
      }
      const permit: PermitRequirementSignature = {
        args: {
          owner: IN_KIND_USER,
          nonce: 7n,
          asset: IN_KIND_VAULT,
          signature: serializeSignature({
            r: `0x${"11".repeat(32)}`,
            s: `0x${"22".repeat(32)}`,
            yParity: 1,
          }),
          amount: requirement.action.args.amount,
          deadline: requirement.action.args.deadline,
        },
        action: requirement.action,
      };
      const mismatchedPermit: PermitRequirementSignature = {
        ...permit,
        args: {
          ...permit.args,
          amount: field === "amount" ? 499n : permit.args.amount,
          deadline:
            field === "deadline" ? 1_900_000_001n : permit.args.deadline,
        },
        action: {
          ...permit.action,
          args: {
            ...permit.action.args,
            spender:
              field === "spender" ? IN_KIND_USER : permit.action.args.spender,
            amount: field === "amount" ? 499n : permit.action.args.amount,
            deadline:
              field === "deadline"
                ? 1_900_000_001n
                : permit.action.args.deadline,
          },
        },
      };

      let thrown: unknown;
      try {
        exit.buildTx([mismatchedPermit]);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(BundlesPermitMismatchError);
      expect(thrown).toMatchObject({ field });
    },
  );

  test("behavior: signature path emits an unlimited V1 permit", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: 0n });
    const vault = handle.client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const [requirement] = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirement?.action).toMatchObject({
      type: "permit",
      args: { spender: IN_KIND_BUNDLER, amount: maxUint256 },
    });
  });

  test("behavior: a signature prepared on one handle finalizes on a fresh handle", async () => {
    const makeVault = () => {
      const handle = createMockClient(mainnet);
      mockV1Requirements(handle, { allowance: 0n });
      return handle.client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    };
    const params = {
      amount: 500n,
      marketParamsList: [inKindMarketParams],
      vaultData: inKindVaultV1Data(),
      userAddress: signerAddress,
      deadline: 1_900_000_000n,
    };
    const exitA = makeVault().inKindRedeem(params);
    const [requirement] = await exitA.getRequirements();
    if (
      !isRequirementSignature(requirement) ||
      requirement.action.type !== "permit"
    ) {
      throw new Error("Expected a permit requirement");
    }
    const permit = await requirement.sign(signerWalletClient, signerAddress);

    const exitB = makeVault().inKindRedeem(params);
    expect(exitB.buildTx([permit])).toEqual(exitA.buildTx([permit]));
  });

  test("behavior: a sufficient allowance needs no authorization", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: 501n });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = await vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });

  test("error: InsufficientBlueBalanceForInKindRedeemError", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, { allowance: 500n, blueBalance: 499n });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    await expect(requirements).rejects.toBeInstanceOf(
      InsufficientBlueBalanceForInKindRedeemError,
    );
  });

  test("error: VaultMorphoMismatchError", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, {
      allowance: 500n,
      morpho: "0x0000000000000000000000000000000000001999",
    });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    await expect(requirements).rejects.toBeInstanceOf(VaultMorphoMismatchError);
  });

  test("error: VaultIsBlueFeeRecipientError", async () => {
    const handle = createMockClient(mainnet);
    mockV1Requirements(handle, {
      allowance: 500n,
      blueFeeRecipient: IN_KIND_VAULT,
    });
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const requirements = vault
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      })
      .getRequirements();

    await expect(requirements).rejects.toBeInstanceOf(
      VaultIsBlueFeeRecipientError,
    );
  });
  test("[INV-05] error: ChainIdMismatchError when the RPC reports another chain via eth_chainId", async () => {
    const handle = createMockClient(mainnet);
    const exit = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
      .inKindRedeem({
        amount: 500n,
        marketParamsList: [inKindMarketParams],
        vaultData: inKindVaultV1Data(),
        userAddress: IN_KIND_USER,
      });
    answerWrongChain(handle);
    await expect(exit.getRequirements()).rejects.toBeInstanceOf(
      ChainIdMismatchError,
    );
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });
});
