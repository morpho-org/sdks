import { metaMorphoAbi, vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  decodeFunctionResult,
  encodeFunctionData,
  erc4626Abi,
  isAddressEqual,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { simulate } from "../../src/index.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 26_356_434n,
});

for (const [version, vault, feeRecipient] of [
  [
    "V2",
    "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145",
    "0xbA75546ACD56b3a9142f94F179b03970eE4283Fd",
  ],
  [
    "V1",
    "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
    "0x255c7705e8BB334DfCae438197f7C4297988085a",
  ],
] as const) {
  for (const method of ["withdraw", "redeem"] as const) {
    test(`vault${version} ${method} counts fee shares in the fee recipient's exact burn`, async ({
      client,
    }) => {
      const onchainRecipient =
        version === "V2"
          ? await client.readContract({
              address: vault,
              abi: vaultV2Abi,
              functionName: "performanceFeeRecipient",
            })
          : await client.readContract({
              address: vault,
              abi: metaMorphoAbi,
              functionName: "feeRecipient",
            });
      expect(isAddressEqual(onchainRecipient, feeRecipient)).toBe(true);

      await client.increaseTime({ seconds: 3600 });
      await client.mine({ blocks: 1 });
      const assets = 100_000_000n;
      const shares = 100_000_000_000_000_000_000n;
      const result = await simulate(
        {
          timeoutMs: 30_000,
          chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
        },
        {
          chainId: 1,
          transactions: [
            {
              from: feeRecipient,
              to: vault,
              data: encodeFunctionData({
                abi: erc4626Abi,
                functionName: "previewWithdraw",
                args: [assets],
              }),
            },
            {
              from: feeRecipient,
              to: vault,
              data: encodeFunctionData({
                abi: erc4626Abi,
                functionName: method,
                args: [
                  method === "withdraw" ? assets : shares,
                  feeRecipient,
                  feeRecipient,
                ],
              }),
            },
          ],
          limits: {
            operations: [
              method === "withdraw"
                ? { type: `vault${version}Withdraw`, vault, inputs: { assets } }
                : { type: `vault${version}Redeem`, vault, inputs: { shares } },
            ],
          },
        },
      );

      const expectedShares =
        method === "withdraw"
          ? decodeFunctionResult({
              abi: erc4626Abi,
              functionName: "previewWithdraw",
              data: result.calls[0]!.returnData,
            })
          : shares;
      const checked = result.verification.operations[0]!.checkedLimits;
      expect(checked.fieldChecks?.sharesBurned).toBe("exact");
      expect(checked.quote.sharesBurned).toBe(expectedShares);
      const feeMint = result.transfers.find(
        (transfer) =>
          isAddressEqual(transfer.token, vault) &&
          isAddressEqual(transfer.from, zeroAddress) &&
          isAddressEqual(transfer.to, feeRecipient),
      );
      expect(feeMint?.amount).toBeGreaterThan(0n);
      const burn = result.transfers.find(
        (transfer) =>
          isAddressEqual(transfer.token, vault) &&
          isAddressEqual(transfer.from, feeRecipient) &&
          isAddressEqual(transfer.to, zeroAddress),
      );
      expect(burn?.amount).toBe(expectedShares);
    });
  }
}
