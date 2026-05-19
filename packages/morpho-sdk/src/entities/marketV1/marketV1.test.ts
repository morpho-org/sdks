import { type Address, createPublicClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { CbbtcUsdcMarketV1 } from "../../../test/fixtures/marketV1.js";
import { test } from "../../../test/setup.js";
import { MorphoClient } from "../../client/index.js";

// Regression: the SDK no longer enforces builder = signer on MorphoMarketV1
// transaction builders. A divergent userAddress and a client with no connected
// account must still produce a valid tx.
describe("MorphoMarketV1 builder = signer freedom", () => {
  const OTHER_USER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  test("supplyCollateral: builds tx with userAddress different from client.account", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    const supplyCollateral = market.supplyCollateral({
      userAddress: OTHER_USER,
      amount: parseUnits("1", 18),
    });

    const tx = supplyCollateral.buildTx();
    expect(tx.action.args.onBehalf).toBe(OTHER_USER);
  });

  test("supplyCollateral: builds tx with public client (no account)", async ({
    client,
  }) => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(client.transport.url),
    });
    const morphoClient = new MorphoClient(publicClient);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);

    const supplyCollateral = market.supplyCollateral({
      userAddress: OTHER_USER,
      amount: parseUnits("1", 18),
    });

    const tx = supplyCollateral.buildTx();
    expect(tx.action.args.onBehalf).toBe(OTHER_USER);
  });
});
