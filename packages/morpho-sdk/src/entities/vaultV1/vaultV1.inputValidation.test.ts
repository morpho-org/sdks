import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { morphoViemExtension } from "../../client/index.js";
import { NonPositiveInputError } from "../../types/index.js";

describe("MorphoVaultV1 deposit input validation", () => {
  test("error: NonPositiveInputError for zero total assets", () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    }).extend(morphoViemExtension());
    const vault = client.morpho.vaultV1(
      SteakhouseUsdcVaultV1.address,
      mainnet.id,
    );

    let error: unknown;
    try {
      vault.deposit({
        amount: 0n,
        userAddress: SteakhouseUsdcVaultV1.address,
        vaultData: { address: SteakhouseUsdcVaultV1.address } as never,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(NonPositiveInputError);
    expect(error).toMatchObject({ field: "amount", value: 0n });
  });
});
