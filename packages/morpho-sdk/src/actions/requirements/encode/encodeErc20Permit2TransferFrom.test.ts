import { addressesRegistry } from "@morpho-org/blue-sdk";
import { getPermit2TransferFromTypedData } from "@morpho-org/blue-sdk-viem";
import {
  ChainId,
  getChainAddress,
  UnknownAddressError,
} from "@morpho-org/morpho-ts";
import { createWalletClient, http, maxUint256, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NegativeInputError,
  NonPositiveInputError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../../types/index.js";
import { encodeErc20Permit2TransferFrom } from "./encodeErc20Permit2TransferFrom.js";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

describe("encodeErc20Permit2TransferFrom", () => {
  test("signs an exact uint256 SignatureTransfer for BlueBundlesV1", async () => {
    const { usdc, bundles } = addressesRegistry[mainnet.id];
    const spender = bundles?.blueBundlesV1;
    if (spender == null) throw new Error("BlueBundlesV1 is not registered");

    const requirement = encodeErc20Permit2TransferFrom({
      token: usdc,
      spender,
      amount: maxUint256,
      chainId: mainnet.id,
      nonce: maxUint256,
      deadline: maxUint256,
    });
    const signed = await requirement.sign(walletClient, account.address);

    expect(signed.action).toEqual({
      type: "permit2TransferFrom",
      args: { spender, amount: maxUint256, deadline: maxUint256 },
    });
    expect(signed.args.amount).toBe(maxUint256);
    expect(signed.args.nonce).toBe(maxUint256);
    expect("expiration" in signed.args).toBe(false);
    expect(Object.isFrozen(signed)).toBe(true);
    await expect(
      verifyTypedData({
        ...getPermit2TransferFromTypedData(
          {
            erc20: usdc,
            allowance: maxUint256,
            spender,
            nonce: maxUint256,
            deadline: maxUint256,
          },
          mainnet.id,
        ),
        address: account.address,
        signature: signed.args.signature,
      }),
    ).resolves.toBe(true);
  });

  const base = () => {
    const { usdc, bundles } = addressesRegistry[mainnet.id];
    const spender = bundles?.blueBundlesV1;
    if (spender == null) throw new Error("BlueBundlesV1 is not registered");
    return {
      token: usdc,
      spender,
      amount: 1_000_000n,
      chainId: mainnet.id,
      nonce: 0n,
      deadline: maxUint256,
    };
  };

  test("error: NegativeInputError when amount is negative", () => {
    expect(() =>
      encodeErc20Permit2TransferFrom({ ...base(), amount: -1n }),
    ).toThrow(NegativeInputError);
  });

  test("error: InputExceedsMaxError when amount exceeds uint256", () => {
    expect(() =>
      encodeErc20Permit2TransferFrom({ ...base(), amount: maxUint256 + 1n }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NegativeInputError when nonce is negative", () => {
    expect(() =>
      encodeErc20Permit2TransferFrom({ ...base(), nonce: -1n }),
    ).toThrow(NegativeInputError);
  });

  test("error: InputExceedsMaxError when nonce exceeds uint256", () => {
    expect(() =>
      encodeErc20Permit2TransferFrom({ ...base(), nonce: maxUint256 + 1n }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NonPositiveInputError when deadline is not positive", () => {
    expect(() =>
      encodeErc20Permit2TransferFrom({ ...base(), deadline: 0n }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: InputExceedsMaxError when deadline exceeds uint256", () => {
    expect(() =>
      encodeErc20Permit2TransferFrom({ ...base(), deadline: maxUint256 + 1n }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: ExpiredDeadlineError when deadline is in the past", () => {
    expect(() =>
      encodeErc20Permit2TransferFrom({ ...base(), deadline: 1n }),
    ).toThrow(ExpiredDeadlineError);
  });

  test("error: UnknownAddressError when the chain has no registered Permit2", () => {
    // HyperliquidMainnet registers BlueBundlesV1 but no canonical Permit2, so the SignatureTransfer
    // domain would sign a domain-less separator. The encoder must reject it before signing.
    const chainId = ChainId.HyperliquidMainnet;
    const spender = getChainAddress(chainId, "bundles.blueBundlesV1");
    expect(() =>
      encodeErc20Permit2TransferFrom({
        token: "0x0000000000000000000000000000000000000001",
        spender,
        amount: 1_000_000n,
        chainId,
        nonce: 0n,
        deadline: maxUint256,
      }),
    ).toThrow(UnknownAddressError);
  });

  test("error: UnsupportedErc20ApprovalSpenderError when spender is not BlueBundlesV1", () => {
    // Permit2 SignatureTransfer for a direct Blue write must name BlueBundlesV1; any other spender
    // (e.g. GeneralAdapter1) is rejected before signing.
    expect(() =>
      encodeErc20Permit2TransferFrom({
        ...base(),
        spender: "0x1111111111111111111111111111111111111111",
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });
});
