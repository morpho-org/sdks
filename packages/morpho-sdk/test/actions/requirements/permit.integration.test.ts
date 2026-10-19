import { addressesRegistry } from "@morpho-org/blue-sdk";
import { getErpcForkUrl, spawnAnvil } from "@morpho-org/test";
import {
  createFaultProxy,
  expectFailClosed,
  fault,
} from "@morpho-org/test/chaos";
import { createClient, http, isHex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  encodeErc20Permit,
  isPermitSignature,
  isRequirementSignature,
  morphoViemExtension,
} from "../../../src/index.js";
import { KeyrockUsdcVaultV2 } from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";

describe("Permit", () => {
  test("should deposit USDC with permit version 2", async ({ client }) => {
    const amount = parseUnits("10", 6);

    await client.deal({
      erc20: KeyrockUsdcVaultV2.asset,
      amount,
    });

    const {
      vaults: {
        KeyrockUsdcVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { KeyrockUsdcVaultV2 },
      },
      actionFn: async () => {
        const morpho = client.extend(
          morphoViemExtension({ supportSignature: true }),
        ).morpho;

        const vault = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
        const vaultData = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });
        const requirements_1 = await deposit.getRequirements({
          useSimplePermit: true,
        });

        if (!isRequirementSignature(requirements_1[0])) {
          throw new Error("Requirement is not a signature requirement");
        }

        const requirementSignature = await requirements_1[0].sign(
          client,
          client.account.address,
        );

        if (!isPermitSignature(requirementSignature)) {
          throw new Error("Unexpected requirement signature");
        }

        expect(requirementSignature.args.owner).toEqual(client.account.address);
        expect(isHex(requirementSignature.args.signature)).toBe(true);
        expect(requirementSignature.args.signature.length).toBe(132);
        expect(requirementSignature.args.deadline).toBeGreaterThan(
          BigInt(Math.floor(Date.now() / 1000)),
        );

        const tx_1 = deposit.buildTx([requirementSignature]);

        await client.sendTransaction(tx_1);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
  });
});

describe("chaos: S6 token metadata", () => {
  const { usdc } = addressesRegistry[mainnet.id];
  const blueBundlesV1 = addressesRegistry[mainnet.id].bundles?.blueBundlesV1;
  if (blueBundlesV1 == null) throw new Error("BlueBundlesV1 is not registered");

  test("a 429 on the name() read fails closed before any Requirement", async () => {
    const anvil = await spawnAnvil({
      forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
      forkBlockNumber: 25_730_000n,
      chainId: mainnet.id,
    });
    // Fault only the name() read (selector 0x06fdde03); the unbatched client
    // sends each metadata read as its own request, so match is stable.
    const NAME_SELECTOR = "0x06fdde03";
    const proxy = await createFaultProxy({
      upstream: anvil.rpcUrl,
      faults: [
        {
          method: "eth_call",
          match: ({ params }) =>
            typeof (params as [{ data?: string }] | undefined)?.[0]?.data ===
              "string" &&
            (params as [{ data: string }])[0].data.startsWith(NAME_SELECTOR),
          fault: fault.status(429),
        },
      ],
    });
    try {
      const client = createClient({
        chain: mainnet,
        transport: http(proxy.url, { batch: undefined, retryCount: 0 }),
      });

      const error = await expectFailClosed(
        encodeErc20Permit(client, {
          token: usdc,
          owner: "0x0000000000000000000000000000000000000001",
          spender: blueBundlesV1,
          amount: 1_000_000n,
          chainId: mainnet.id,
          nonce: 0n,
          supportDeployless: false,
        }),
        "infra",
      );
      expect(error.name).not.toBe("UnknownTokenError");

      const ethCalls = proxy.log.filter((entry) => entry.method === "eth_call");
      const faulted = ethCalls.filter((call) => call.outcome === "status");
      expect(faulted).toHaveLength(1);
      // The other metadata reads were dispatched to the fork ("forwarded"
      // when their reply finalized, "pending" while still in flight).
      expect(
        ethCalls.filter(
          (call) => call.outcome === "forwarded" || call.outcome === "pending",
        ).length,
      ).toBeGreaterThanOrEqual(2);
      // Every call after the faulted name() read is redundant: the fetch must
      // have rejected before any downstream stage consumed it.
      expect(
        proxy.log.filter((entry) => entry.method === "eth_sendRawTransaction"),
      ).toHaveLength(0);
    } finally {
      await proxy.kill();
      await anvil.stopAndWait();
    }
  });
});
