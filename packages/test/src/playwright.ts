import { type TestInfo, test } from "@playwright/test";
import { http, type Chain, formatUnits } from "viem";
import { type AnvilArgs, spawnAnvil } from "./anvil";
import { type AnvilTestClient, createAnvilTestClient } from "./client";

export interface PlaywrightTestContext<chain extends Chain = Chain> {
  client: AnvilTestClient<chain>;
}

const attachLogToPlaywright = (testInfo: TestInfo) => {
  const anvilLogs: string[] = [];

  const attachLog = (message: string) => {
    anvilLogs.push(message);
  };

  const onClose = (message: string) => {
    attachLog(message);

    testInfo.attach("Anvil Logs", {
      body: anvilLogs.join("\n"),
      contentType: "text/plain",
    });
  };

  return {
    onMessage: attachLog,
    onError: attachLog,
    onClose: onClose,
  };
};

/**
 * Creates a Playwright test that spawns an Anvil instance and injects a test client.
 *
 * @param chain - The chain to use.
 * @param parameters - The parameters to pass to the Anvil instance.
 * @param attachedAnvilLogs - Whether to attach the Anvil logs to the test that can be seen in the Playwright report (attachments tabs).
 */
export const createViemTest = <chain extends Chain>(
  chain: chain,
  parameters: AnvilArgs = {},
  attachAnvilLogs = false,
) => {
  parameters.forkChainId ??= chain?.id;
  parameters.forkUrl ??= chain?.rpcUrls.default.http[0];
  parameters.autoImpersonate ??= true;
  parameters.order ??= "fifo";
  parameters.stepsTracing ??= true;

  parameters.gasPrice ??= 0n;
  parameters.blockBaseFeePerGas ??= 0n;

  return test.extend<PlaywrightTestContext<chain>>({
    // biome-ignore lint/correctness/noEmptyPattern: required by playwright at runtime
    client: async ({}, use, testInfo) => {
      const { rpcUrl, stop } = await spawnAnvil(
        parameters,
        test.info().workerIndex,
        attachAnvilLogs ? attachLogToPlaywright(testInfo) : undefined,
      );

      const client = createAnvilTestClient(http(rpcUrl), chain);

      // Make block timestamp 100% predictable.
      await client.setBlockTimestampInterval({ interval: 1 });

      await use(client);

      await stop();
    },
  });
};

export const expect = test.expect.extend({
  toApproxEqual(
    received: bigint,
    expected: bigint,
    numDigits = 2,
    decimals = 18,
  ) {
    const assertionName = "toApproxEqual";

    const receivedNumber = Number(formatUnits(received, decimals));
    const expectedNumber = Number(formatUnits(expected, decimals));

    let pass: boolean;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    let matcherResult: any;
    try {
      test.expect(receivedNumber).toBeCloseTo(expectedNumber, numDigits);
      pass = true;
    } catch (error) {
      // @ts-expect-error
      matcherResult = error.matcherResult;
      pass = false;
    }

    return {
      message: () => {
        return `${this.utils.matcherHint(assertionName, undefined, undefined, {
          isNot: this.isNot,
        })}

Expected: ${this.utils.printExpected(expectedNumber)}
Received: ${this.utils.printReceived(receivedNumber)}

Expected precision:  ${numDigits}
Expected difference: ${this.isNot ? ">=" : "<"} ${this.utils.printExpected(10 ** -numDigits / 2)}
Received difference: ${this.utils.printReceived(Math.abs(receivedNumber - expectedNumber))}`;
      },
      pass,
      name: assertionName,
      expected,
      actual: matcherResult?.actual,
    };
  },
});
