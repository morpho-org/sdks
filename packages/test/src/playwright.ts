import { test } from "@playwright/test";
import { type Chain, formatUnits, http } from "viem";
import { type AnvilArgs, spawnAnvil } from "./anvil.js";
import { type AnvilTestClient, createAnvilTestClient } from "./client.js";
import { createAnvilFailureCleanupError } from "./errors.js";

/** Fixtures exposed by a Playwright test created with {@link createViemTest}. */
export interface PlaywrightTestContext<chain extends Chain = Chain> {
  /** An Anvil-backed viem client configured for the selected chain. */
  readonly client: AnvilTestClient<chain>;
}

/**
 * Creates a Playwright test API backed by an isolated Anvil process.
 *
 * @param chain - Chain used to configure the viem client and default fork.
 * @param parameters - Optional Anvil startup and fork parameters.
 * @returns A Playwright test API with an Anvil-backed `client` fixture.
 * @throws {AnvilStartupError} When the fixture cannot start Anvil.
 * @throws {AnvilProcessError} When Anvil exits unexpectedly.
 * @throws {AnvilCleanupError} When fixture or process cleanup fails.
 * @example
 * ```ts
 * import { createViemTest } from "@morpho-org/test/playwright";
 * import { mainnet } from "viem/chains";
 *
 * export const test = createViemTest(mainnet, {
 *   forkUrl: "https://<your-mainnet-rpc>",
 *   forkBlockNumber: 19_530_000,
 * });
 * ```
 */
export const createViemTest = <chain extends Chain>(
  chain: chain,
  parameters: AnvilArgs = {},
) => {
  const anvilParameters: AnvilArgs = {
    ...parameters,
    forkChainId: parameters.forkChainId ?? chain.id,
    forkUrl: parameters.forkUrl ?? chain.rpcUrls.default.http[0],
    autoImpersonate: parameters.autoImpersonate ?? true,
    order: parameters.order ?? "fifo",
    stepsTracing: parameters.stepsTracing ?? true,
    gasPrice: parameters.gasPrice ?? 0n,
    blockBaseFeePerGas: parameters.blockBaseFeePerGas ?? 0n,
  };

  return test.extend<PlaywrightTestContext<chain>>({
    // biome-ignore lint/correctness/noEmptyPattern: required by playwright at runtime
    client: async ({}, use) => {
      const { rpcUrl, stopAndWait } = await spawnAnvil(anvilParameters);
      let fixtureFailed = false;
      let fixtureFailure: unknown;
      let cleanupFailed = false;
      let cleanupFailure: unknown;

      try {
        const client = createAnvilTestClient(http(rpcUrl), chain);

        // Make block timestamp 100% predictable.
        await client.setBlockTimestampInterval({ interval: 1 });

        await use(client);
      } catch (error) {
        fixtureFailed = true;
        fixtureFailure = error;
      }

      try {
        await stopAndWait();
      } catch (error) {
        cleanupFailed = true;
        cleanupFailure = error;
      }

      if (fixtureFailed && cleanupFailed)
        throw createAnvilFailureCleanupError({
          cleanupError: cleanupFailure,
          failure: fixtureFailure,
          message:
            "The Playwright fixture failed and Anvil cleanup also failed. Inspect both failures and stop the process manually before retrying.",
          summary: "Playwright fixture and Anvil cleanup both failed.",
        });
      if (fixtureFailed) throw fixtureFailure;
      if (cleanupFailed) throw cleanupFailure;
    },
  });
};

/** Playwright assertions with exact bigint comparisons at a decimal tolerance. */
export const expect = test.expect.extend({
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  toApproxEqual(
    received: bigint,
    expected: bigint,
    numDigits = 2,
    decimals = 18,
  ) {
    const assertionName = "toApproxEqual";

    const difference =
      received >= expected ? received - expected : expected - received;
    const tolerance = 10 ** -numDigits / 2;
    let pass = tolerance === Infinity;
    if (Number.isFinite(tolerance) && tolerance > 0) {
      // Scale the decimal tolerance rather than rounding either bigint to Number.
      const [coefficient, exponent] = tolerance.toExponential().split("e");
      const [whole, fraction = ""] = coefficient!.split(".");
      const threshold = BigInt(whole! + fraction);
      const scale = decimals + Number(exponent) - fraction.length;
      pass =
        scale >= 0
          ? difference < threshold * 10n ** BigInt(scale)
          : difference * 10n ** BigInt(-scale) < threshold;
    }

    return {
      message: () => {
        return `${this.utils.matcherHint(assertionName, undefined, undefined, {
          isNot: this.isNot,
        })}

Expected: ${this.utils.printExpected(formatUnits(expected, decimals))}
Received: ${this.utils.printReceived(formatUnits(received, decimals))}

Expected precision:  ${numDigits}
Expected difference: ${this.isNot ? ">=" : "<"} ${this.utils.printExpected(tolerance)}
Received difference: ${this.utils.printReceived(formatUnits(difference, decimals))}`;
      },
      pass,
      name: assertionName,
      expected,
      actual: received,
    };
  },
});
