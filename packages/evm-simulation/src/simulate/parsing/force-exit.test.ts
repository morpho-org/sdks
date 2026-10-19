import type { MarketId } from "@morpho-org/blue-sdk";
import { blueAbi, vaultV2Abi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
  parseAbiParameters,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidSimulationResponseError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import type { RawLog } from "../../types.js";
import { measureForceExit } from "./force-exit.js";

const owner: Address = "0x0000000000000000000000000000000000000001";
const vault: Address = "0x0000000000000000000000000000000000000002";
const morpho: Address = "0x0000000000000000000000000000000000000004";
const adapter: Address = "0x0000000000000000000000000000000000000005";
const other: Address = "0x0000000000000000000000000000000000000006";
const marketId =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId;
const otherMarket =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as MarketId;

const vaultWithdraw = (onBehalf: Address): RawLog => ({
  address: vault,
  topics: encodeEventTopics({
    abi: vaultV2Abi,
    eventName: "Withdraw",
    args: { sender: owner, receiver: owner, onBehalf },
  }).filter((topic): topic is Hex => typeof topic === "string"),
  data: encodeAbiParameters(
    parseAbiParameters("uint256 assets, uint256 shares"),
    [1000n, 500n],
  ),
});

const forceDeallocate = ({
  onBehalf,
  penaltyAssets,
  assets = 993n,
}: {
  readonly onBehalf: Address;
  readonly penaltyAssets: bigint;
  readonly assets?: bigint;
}): RawLog => ({
  address: vault,
  topics: encodeEventTopics({
    abi: vaultV2Abi,
    eventName: "ForceDeallocate",
    args: { sender: owner, onBehalf },
  }).filter((topic): topic is Hex => typeof topic === "string"),
  data: encodeAbiParameters(
    parseAbiParameters(
      "address adapter, uint256 assets, bytes32[] ids, uint256 penaltyAssets",
    ),
    [adapter, assets, [marketId], penaltyAssets],
  ),
});

const blueWithdraw = ({
  id = marketId,
  onBehalf = adapter,
  assets,
  emitter = morpho,
}: {
  readonly id?: MarketId;
  readonly onBehalf?: Address;
  readonly assets: bigint;
  readonly emitter?: Address;
}): RawLog => ({
  address: emitter,
  topics: encodeEventTopics({
    abi: blueAbi,
    eventName: "Withdraw",
    args: { id, onBehalf, receiver: vault },
  }).filter((topic): topic is Hex => typeof topic === "string"),
  data: encodeAbiParameters(
    parseAbiParameters("address caller, uint256 assets, uint256 shares"),
    [adapter, assets, 0n],
  ),
});

const measure = (
  logs: readonly (readonly RawLog[])[],
  options: {
    readonly account?: Address;
    readonly requireDeallocations?: boolean;
  } = {},
) =>
  measureForceExit({
    logs,
    vault,
    morpho,
    account: options.account ?? owner,
    operationType: "vaultV2ForceRedeem",
    requireDeallocations: options.requireDeallocations ?? true,
  });

describe("measureForceExit", () => {
  test("default: pairs the same-amount withdrawal and ignores a different-amount liquidity withdrawal", () => {
    expect(
      measure([
        [
          blueWithdraw({ assets: 993n }),
          blueWithdraw({ id: otherMarket, assets: 7n }),
          vaultWithdraw(owner),
          forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
        ],
      ]),
    ).toEqual({
      penalty: 7n,
      deallocations: [{ marketId, assets: 993n }],
    });
  });

  test("behavior: matches uppercase event topics", () => {
    const logs = [
      [
        vaultWithdraw(owner),
        blueWithdraw({ assets: 993n }),
        forceDeallocate({ onBehalf: owner, penaltyAssets: 7n }),
      ],
    ];
    const uppercaseTopics = logs.map((callLogs) =>
      callLogs.map((log) => ({
        ...log,
        topics: log.topics.map(
          (topic) => `0x${topic.slice(2).toUpperCase()}` as Hex,
        ),
      })),
    );
    expect(measure(uppercaseTopics)).toEqual(measure(logs));
  });

  test("behavior: penalty-only quotes allow an unpaired force deallocation", () => {
    const logs = [
      [
        vaultWithdraw(owner),
        forceDeallocate({ onBehalf: owner, penaltyAssets: 4n }),
      ],
    ];
    expect(measure(logs, { requireDeallocations: false })).toEqual({
      penalty: 4n,
      deallocations: [],
    });
    expect(() => measure(logs)).toThrow(SlippageCheckUnavailableError);
  });

  test("error: a positive penalty charged to another account", () => {
    expect(() =>
      measure(
        [
          [
            vaultWithdraw(owner),
            forceDeallocate({ onBehalf: other, penaltyAssets: 1n }),
          ],
        ],
        { requireDeallocations: false },
      ),
    ).toThrow(SlippageCheckUnavailableError);
  });

  test("behavior: ignores a zero-penalty force deallocation for another account", () => {
    expect(
      measure([
        [
          vaultWithdraw(owner),
          forceDeallocate({ onBehalf: other, penaltyAssets: 0n }),
        ],
      ]),
    ).toEqual({ penalty: 0n, deallocations: [] });
  });

  test("behavior: does not pair a Blue Withdraw after ForceDeallocate", () => {
    const logs = [
      [
        vaultWithdraw(owner),
        forceDeallocate({ onBehalf: owner, penaltyAssets: 1n, assets: 993n }),
        blueWithdraw({ assets: 993n }),
      ],
    ];
    expect(() => measure(logs, { requireDeallocations: true })).toThrow(
      SlippageCheckUnavailableError,
    );
    expect(measure(logs, { requireDeallocations: false })).toEqual({
      penalty: 1n,
      deallocations: [],
    });
  });

  test("behavior: account filtering applies to vault withdrawals and force deallocations", () => {
    expect(() =>
      measure([
        [
          vaultWithdraw(other),
          forceDeallocate({ onBehalf: owner, penaltyAssets: 4n }),
        ],
      ]),
    ).toThrow(SlippageCheckUnavailableError);

    expect(
      measure(
        [
          [
            vaultWithdraw(other),
            blueWithdraw({ assets: 5n }),
            forceDeallocate({
              onBehalf: owner,
              penaltyAssets: 0n,
              assets: 5n,
            }),
            blueWithdraw({ assets: 7n }),
            forceDeallocate({
              onBehalf: other,
              penaltyAssets: 3n,
              assets: 7n,
            }),
          ],
        ],
        { account: other },
      ),
    ).toEqual({
      penalty: 3n,
      deallocations: [{ marketId, assets: 7n }],
    });
  });

  test("behavior: sums force-exit penalties and deallocations in the same market", () => {
    expect(
      measure([
        [
          vaultWithdraw(owner),
          blueWithdraw({ assets: 12n }),
          forceDeallocate({
            onBehalf: owner,
            penaltyAssets: 3n,
            assets: 12n,
          }),
          blueWithdraw({ assets: 34n }),
          forceDeallocate({
            onBehalf: owner,
            penaltyAssets: 9n,
            assets: 34n,
          }),
        ],
      ]),
    ).toEqual({
      penalty: 12n,
      deallocations: [{ marketId, assets: 46n }],
    });
  });

  test("error: malformed vault Withdraw log", () => {
    expect(() =>
      measure([
        [
          { ...vaultWithdraw(owner), data: "0x12" },
          forceDeallocate({ onBehalf: owner, penaltyAssets: 1n }),
        ],
      ]),
    ).toThrow(InvalidSimulationResponseError);
  });

  test("error: malformed ForceDeallocate log", () => {
    expect(() =>
      measure([
        [
          vaultWithdraw(owner),
          {
            ...forceDeallocate({ onBehalf: owner, penaltyAssets: 1n }),
            data: "0x12",
          },
        ],
      ]),
    ).toThrow(InvalidSimulationResponseError);
  });

  test("error: malformed Blue Withdraw log", () => {
    expect(() =>
      measure([
        [
          vaultWithdraw(owner),
          { ...blueWithdraw({ assets: 993n }), data: "0x12" },
          forceDeallocate({ onBehalf: owner, penaltyAssets: 1n }),
        ],
      ]),
    ).toThrow(InvalidSimulationResponseError);
  });

  test("behavior: Blue withdrawals from a different user call cannot be paired", () => {
    expect(() =>
      measure([
        [vaultWithdraw(owner), blueWithdraw({ assets: 993n })],
        [
          vaultWithdraw(owner),
          forceDeallocate({ onBehalf: owner, penaltyAssets: 1n }),
        ],
      ]),
    ).toThrow(SlippageCheckUnavailableError);
  });
});
