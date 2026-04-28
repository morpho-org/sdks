import { type Address, type Hex, createClient, custom } from "viem";
import { describe, expect, test, vi } from "vitest";
import { ActionBundleRequirements } from "../src/ActionBundle.js";

describe("ActionBundleRequirements", () => {
  test("uses the active JSON-RPC account when signing without an explicit account", async () => {
    const staleAccount = {
      address: "0x1111111111111111111111111111111111111111" as Address,
      type: "json-rpc" as const,
    };
    const activeAccount = "0x2222222222222222222222222222222222222222";
    const client = createClient({
      account: staleAccount,
      transport: custom({
        async request({ method }) {
          if (method === "eth_accounts") return [activeAccount];

          throw new Error(`Unexpected RPC method: ${method}`);
        },
      }),
    });
    const sign = vi.fn(async (_client, account) => account.address as Hex);
    const requirements = new ActionBundleRequirements(
      [],
      [{ action: {} as never, sign }],
    );

    await expect(requirements.sign(client)).resolves.toEqual([activeAccount]);
    expect(sign).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ address: activeAccount }),
    );
  });
});
