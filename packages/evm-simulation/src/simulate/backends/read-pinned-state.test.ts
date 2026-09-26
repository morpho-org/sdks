import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Address, erc20Abi, getAddress, isAddressEqual } from "viem";
import { mainnet } from "viem/chains";
import type { DecodedOperation } from "../../domain/operations.js";
import type { DecodedBundle } from "../../domain/stages.js";
import { ExternalServiceError } from "../../errors.js";
import { readPinnedInputs } from "./read-pinned-state.js";

const addresses = getChainAddresses(1);
const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const VAULT: Address = getAddress("0x1111111111111111111111111111111111111111");
const BUNDLE = addresses.bundles!.vaultBundlesV1!;

const depositOp = (): DecodedOperation =>
  ({
    type: "vaultV1Deposit",
    transactionIndex: 0,
    callPath: [],
    chainId: 1,
    deployment: BUNDLE,
    owner: OWNER,
    route: "vaultBundlesV1",
    vault: VAULT,
    asset: TOKEN,
    receiver: OWNER,
    deadline: 1_800_000_000n,
    referralFee: { rateWad: 0n, recipient: OWNER },
    tokenSignature: { type: "none" },
    maxSharePriceE27: 0n,
    funding: { type: "erc20", token: TOKEN, assets: 1_000_000n },
  }) as DecodedOperation;

const bundle = (): DecodedBundle =>
  ({
    request: { chainId: 1, mode: "final", authorizations: [] },
    owner: OWNER,
    operations: [depositOp()],
  }) as unknown as DecodedBundle;

const pinnedBlock = {
  number: 24_000_000n,
  hash: `0x${"ab".repeat(32)}` as `0x${string}`,
  timestamp: 1_700_000_000n,
};

describe("readPinnedInputs", () => {
  test("default: reads balances and allowances at the pinned block", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 7n,
    });
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const inputs = await readPinnedInputs({
      client: handle.client,
      bundle: bundle(),
      pinnedBlock,
    });
    // Funding-token pulls on the owner, receivers and bundle contracts.
    const balanceCalls = handle.request.mock.calls.filter(
      (c) =>
        c[0].method === "eth_call" &&
        isAddressEqual(
          (c[0].params as { to?: Address }[])[0]?.to ?? TOKEN,
          TOKEN,
        ),
    );
    expect(balanceCalls.length).toBeGreaterThan(0);
    for (const call of handle.request.mock.calls) {
      if (call[0].method === "eth_call") {
        expect(call[0].params?.[1]).toBe("0x16e3600");
      }
    }
    const walletEntry = inputs.before.wallet.find(
      (w) => w.account === OWNER && w.token === TOKEN,
    );
    expect(walletEntry?.assets).toBe(7n);
    const allowance = inputs.before.permissions.find(
      (p) => p.type === "erc20Allowance" && p.spender === BUNDLE,
    );
    expect(allowance).toMatchObject({ amount: 0n });
    expect(Object.isFrozen(inputs.before)).toBe(true);
  });

  test("error: ExternalServiceError when a pinned read throws", async () => {
    const handle = createMockClient(mainnet);
    await expect(
      readPinnedInputs({
        client: handle.client,
        bundle: bundle(),
        pinnedBlock,
      }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
