import { UnknownAddressError } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import { createPublicClient, createWalletClient, http, maxUint256 } from "viem";
import { fraxtal, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { inKindVaultV2Data } from "../../../test/fixtures/inKindRedeem.js";
import { KeyrockUsdcVaultV2 } from "../../../test/fixtures/vaultV2.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import { MAX_SLIPPAGE_TOLERANCE } from "../../helpers/constant.js";
import {
  ExcessiveSlippageToleranceError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";

describe("MorphoVaultV2 deposit input validation", () => {
  test.each(["amount", "nativeAmount"] as const)(
    "error: InputExceedsMaxError before preparing requirements for oversized %s",
    (field) => {
      const client = createPublicClient({
        chain: mainnet,
        transport: http("https://rpc.example"),
      }).extend(morphoViemExtension());
      const vault = client.morpho.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );
      const value = maxUint256 + 1n;
      const funding =
        field === "nativeAmount" ? { nativeAmount: value } : { amount: value };
      expect(() =>
        vault.deposit({
          ...funding,
          userAddress: KeyrockUsdcVaultV2.address,
          vaultData: inKindVaultV2Data({ address: KeyrockUsdcVaultV2.address }),
        }),
      ).toThrow(InputExceedsMaxError);
    },
  );

  test("error: NonPositiveInputError for zero total assets", () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    }).extend(morphoViemExtension());
    const vault = client.morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

    let error: unknown;
    try {
      vault.deposit({
        amount: 0n,
        userAddress: KeyrockUsdcVaultV2.address,
        vaultData: { address: KeyrockUsdcVaultV2.address } as never,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(NonPositiveInputError);
    expect(error).toMatchObject({ field: "amount", value: 0n });
  });

  test("behavior: a connected builder can prepare for a different submitter", () => {
    const builder = "0x0000000000000000000000000000000000000001";
    const submitter = "0x0000000000000000000000000000000000000002";
    const client = createWalletClient({
      account: builder,
      chain: mainnet,
      transport: http("https://rpc.example"),
    }).extend(morphoViemExtension());
    const vault = client.morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

    const action = vault.deposit({
      amount: 100n,
      userAddress: submitter,
      vaultData: inKindVaultV2Data({
        address: KeyrockUsdcVaultV2.address,
      }),
    });

    expect(action).toBeDefined();
  });
});

describe("MorphoVaultV2 withdraw input validation", () => {
  const now = 1_900_000_000n;

  test.each([
    {
      label: "zero amount",
      params: { amount: 0n },
      error: NonPositiveInputError,
    },
    {
      label: "negative amount",
      params: { amount: -1n },
      error: NonPositiveInputError,
    },
    {
      label: "oversized amount",
      params: { amount: maxUint256 + 1n },
      error: InputExceedsMaxError,
    },
    {
      label: "deadline at creation",
      params: { deadline: now },
      error: ExpiredDeadlineError,
    },
    {
      label: "past deadline",
      params: { deadline: now - 1n },
      error: ExpiredDeadlineError,
    },
    {
      label: "oversized deadline",
      params: { deadline: maxUint256 + 1n },
      error: InputExceedsMaxError,
    },
    {
      label: "negative slippage",
      params: { slippageTolerance: -1n },
      error: NegativeInputError,
    },
    {
      label: "excessive slippage",
      params: { slippageTolerance: MAX_SLIPPAGE_TOLERANCE + 1n },
      error: ExcessiveSlippageToleranceError,
    },
  ])(
    "error: $error.name for $label before any RPC read",
    ({ params, error }) => {
      const handle = createMockClient(mainnet);
      const vault = handle.client
        .extend(morphoViemExtension())
        .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

      expect(() =>
        withChainTimestamp(now, () =>
          vault.withdraw({
            amount: 1n,
            userAddress: KeyrockUsdcVaultV2.address,
            ...params,
          }),
        ),
      ).toThrow(error);
      expect(handle.request).not.toHaveBeenCalled();
    },
  );

  test("error: UnknownAddressError when VaultBundlesV1 is unregistered", () => {
    const handle = createMockClient(fraxtal);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, fraxtal.id);

    expect(() =>
      vault.withdraw({
        amount: 1n,
        userAddress: KeyrockUsdcVaultV2.address,
      }),
    ).toThrow(UnknownAddressError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("behavior: accepts uint256 and slippage boundaries without RPC reads", () => {
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

    for (const slippageTolerance of [0n, MAX_SLIPPAGE_TOLERANCE]) {
      const action = vault.withdraw({
        amount: maxUint256,
        userAddress: KeyrockUsdcVaultV2.address,
        slippageTolerance,
      });
      expect(action.buildTx().action.args.amount).toBe(maxUint256);
    }
    expect(handle.request).not.toHaveBeenCalled();
  });
});
