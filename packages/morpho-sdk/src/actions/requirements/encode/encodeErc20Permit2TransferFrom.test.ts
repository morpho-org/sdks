import { addressesRegistry } from "@morpho-org/blue-sdk";
import { getPermit2TransferFromTypedData } from "@morpho-org/blue-sdk-viem";
import { createWalletClient, http, maxUint256, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
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
});
