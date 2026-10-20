import { addressesRegistry } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { classifyError, expectFailClosed } from "@morpho-org/test/chaos";
import {
  type Address,
  createWalletClient,
  custom,
  type TypedDataDefinition,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { getBundlesTokenPermit } from "./actions/bundles/common.js";
import { resolveBundlesTokenRequirements } from "./actions/bundles/resolveBundlesTokenRequirements.js";
import { encodeErc20Permit2SignatureTransfer } from "./actions/requirements/encode/index.js";
import { signAndVerifyTypedData } from "./helpers/signAndVerifyTypedData.js";
import { validateRequirementSpender } from "./helpers/validateRequirementSpender.js";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  DepositSpenderMismatchError,
  type Erc2612RequirementSignature,
  ExpiredDeadlineError,
  InvalidSignatureError,
  Permit2SignatureTransferNonceAlreadyUsedError,
  UnsupportedErc20ApprovalSpenderError,
} from "./types/index.js";

const owner = privateKeyToAccount(`0x${"01".padStart(64, "0")}`);
const forger = privateKeyToAccount(`0x${"02".padStart(64, "0")}`);
const vaultBundles = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
const { usdc } = addressesRegistry[mainnet.id];
const typedData = {
  domain: {
    name: "Morpho Test",
    version: "1",
    chainId: mainnet.id,
    verifyingContract: "0x0000000000000000000000000000000000000001",
  },
  types: { Message: [{ name: "value", type: "uint256" }] },
  primaryType: "Message",
  message: { value: 1n },
} as const satisfies TypedDataDefinition<Record<string, unknown>, "Message">;

/** A JSON-RPC wallet whose signature requests cross the transport, so the log shows each one. */
const jsonRpcWallet = ({
  address,
  signer = owner,
  chain = mainnet,
}: {
  address: Address;
  signer?: typeof owner;
  chain?: typeof mainnet | typeof base;
}) => {
  const requests: string[] = [];
  const client = createWalletClient({
    account: address,
    chain,
    transport: custom({
      request: async ({ method }) => {
        requests.push(method);
        if (method === "eth_signTypedData_v4")
          return signer.signTypedData(typedData);
        throw new Error(`unexpected RPC ${method}`);
      },
    }),
  });
  return { client, requests };
};

/** Asserts `run` fails as `category` without returning an artifact. */
const failClosed = async (
  run: () => unknown,
  category: "auth" | "chain",
): Promise<Error> => {
  let artifact: unknown;
  const error = await expectFailClosed(
    Promise.resolve().then(async () => {
      artifact = await run();
      return artifact;
    }),
    category,
  );
  expect(artifact).toBeUndefined();
  return error;
};

describe("chaos: S11 invalid authorization", () => {
  test("[INV-06] a wallet account other than userAddress is rejected before signing", async () => {
    const { client, requests } = jsonRpcWallet({ address: forger.address });
    const error = await failClosed(
      () =>
        signAndVerifyTypedData({
          client,
          userAddress: owner.address,
          typedData,
        }),
      "auth",
    );
    expect(error).toBeInstanceOf(AddressMismatchError);
    expect(requests).toEqual([]);
  });

  test("[INV-06] a signature that does not recover to userAddress yields no signature", async () => {
    const { client, requests } = jsonRpcWallet({
      address: owner.address,
      signer: forger,
    });
    const error = await failClosed(
      () =>
        signAndVerifyTypedData({
          client,
          userAddress: owner.address,
          typedData,
        }),
      "auth",
    );
    expect(error).toBeInstanceOf(InvalidSignatureError);
    expect(requests).toEqual(["eth_signTypedData_v4"]);
  });

  test("a typed-data domain for another chain is rejected before signing", async () => {
    const { client, requests } = jsonRpcWallet({
      address: owner.address,
      chain: base,
    });
    const error = await failClosed(
      () =>
        signAndVerifyTypedData({
          client,
          userAddress: owner.address,
          typedData,
        }),
      "chain",
    );
    expect(error).toBeInstanceOf(ChainIdMismatchError);
    expect(classifyError(error)).not.toBe("infra");
    expect(requests).toEqual([]);
  });

  test("[INV-06] an approval spender outside the allowed bundles is rejected", async () => {
    const error = await failClosed(
      () =>
        validateRequirementSpender({
          chainId: mainnet.id,
          spender: getChainAddress(mainnet.id, "bundles.blueBundlesV1"),
          allowed: ["vaultBundlesV1"],
        }),
      "auth",
    );
    expect(error).toBeInstanceOf(UnsupportedErc20ApprovalSpenderError);
  });

  test("[INV-06] a permit signed for another spender yields no bundle permit", async () => {
    const permit = {
      args: {
        owner: owner.address,
        asset: usdc,
        amount: 7n,
        nonce: 0n,
        deadline: 1_900_000_000n,
        signature: await owner.signTypedData(typedData),
      },
      action: {
        type: "permit",
        args: {
          spender: zeroAddress,
          amount: 7n,
          deadline: 1_900_000_000n,
          nonce: 0n,
        },
      },
    } satisfies Erc2612RequirementSignature;
    const error = await failClosed(
      () =>
        getBundlesTokenPermit({
          userAddress: owner.address,
          token: usdc,
          spender: vaultBundles,
          amount: 7n,
          requirementSignature: permit,
        }),
      "auth",
    );
    expect(error).toBeInstanceOf(DepositSpenderMismatchError);
  });

  test("an already-expired deadline yields no signature requirement", async () => {
    const error = await failClosed(
      () =>
        encodeErc20Permit2SignatureTransfer({
          token: usdc,
          spender: vaultBundles,
          amount: 1n,
          chainId: mainnet.id,
          nonce: 0n,
          deadline: 1n,
        }),
      "auth",
    );
    expect(error).toBeInstanceOf(ExpiredDeadlineError);
  });

  test("a consumed Permit2 nonce yields no signature requirement", async () => {
    const error = await failClosed(
      () =>
        resolveBundlesTokenRequirements({
          token: usdc,
          spender: vaultBundles,
          owner: owner.address,
          chainId: mainnet.id,
          amount: 1n,
          deadline: 1_900_000_000n,
          state: {
            type: "permit2SignatureTransfer",
            permit2Allowance: 1n,
            permit2Nonce: 3n,
            nonceBitmap: 1n << 3n,
          },
        }),
      "auth",
    );
    expect(error).toBeInstanceOf(Permit2SignatureTransferNonceAlreadyUsedError);
  });
});
