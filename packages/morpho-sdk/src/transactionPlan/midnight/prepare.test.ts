import {
  Offer,
  Payload,
  PriceRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import { type Hex, padHex } from "viem";
import { base, mainnet } from "viem/chains";
import { afterEach, assert, describe, expect, test, vi } from "vitest";
import {
  midnightAddresses,
  midnightBaseOffer,
  midnightChainId,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import { validateMidnightMakerOfferStates } from "../../entities/midnight/publication.js";
import {
  ChainIdMismatchError,
  DuplicateMidnightGroupCancellationError,
  InvalidMidnightHexInputError,
  MidnightOfferMakerMismatchError,
  MidnightOfferRatifierMismatchError,
  MidnightReplacementGroupCancelledError,
} from "../../types/error.js";
import {
  getOffersDataInternal,
  parseGetOffersDataParams,
  parseMakeBorrowParams,
  parseMakeLendParams,
  parseMakeRepayParams,
  parseMakeWithdrawParams,
} from "./prepare.js";
import { fetchMidnightMakerOfferStatesBeforeDeadline } from "./publicationState.js";

vi.mock("./publicationState.js", () => ({
  fetchMidnightMakerOfferStatesBeforeDeadline: vi.fn(
    async (_params: unknown, chainCheck: () => Promise<void>) => {
      await chainCheck();
      return { states: [], now: 0n };
    },
  ),
}));
vi.mock("../../entities/midnight/publication.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../entities/midnight/publication.js")
  >()),
  validateMidnightMakerOfferStates: vi.fn(),
}));

const maturityAt15Utc = 1_767_279_600n;

const priceTree = (overrides: Parameters<typeof midnightBaseOffer>[0] = {}) =>
  Tree.create({
    type: "priceV1",
    entries: [
      {
        offer: Offer.create(
          midnightBaseOffer({
            market: { ...midnightMarket, maturity: maturityAt15Utc },
            expiry: maturityAt15Utc - 60n,
            ratifier: getChainAddress(midnightChainId, "priceRatifierV1"),
            ...overrides,
          }),
        ),
      },
    ],
  });

describe.sequential("maker offer preparation with a plain viem client", () => {
  afterEach(() => vi.restoreAllMocks());

  test("[INV-05] error: ChainIdMismatchError when the plain client declares another chain, before any RPC", () => {
    const handle = createMockClient(mainnet);

    expect(() =>
      parseGetOffersDataParams(
        { accountAddress: midnightAddresses.maker, offers: priceTree() },
        { client: handle.client, chainId: base.id },
      ),
    ).toThrow(ChainIdMismatchError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("error: rejects an offer naming another maker before any RPC", () => {
    const handle = createMockClient(base);

    expect(() =>
      parseGetOffersDataParams(
        {
          accountAddress: midnightAddresses.maker,
          offers: priceTree({ maker: midnightAddresses.taker }),
        },
        { client: handle.client, chainId: base.id },
      ),
    ).toThrow(MidnightOfferMakerMismatchError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("error: rejects an offer naming another ratifier before any RPC", () => {
    const handle = createMockClient(base);

    expect(() =>
      parseGetOffersDataParams(
        {
          accountAddress: midnightAddresses.maker,
          offers: priceTree({
            ratifier: getChainAddress(base.id, "rateRatifierV1"),
          }),
        },
        { client: handle.client, chainId: base.id },
      ),
    ).toThrow(MidnightOfferRatifierMismatchError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("behavior: validation: false skips the mempool API and returns the ratified payload", async () => {
    const handle = createMockClient(base);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("unexpected fetch"));
    const tree = priceTree();
    const context = { client: handle.client, chainId: base.id };

    const data = await getOffersDataInternal(
      parseGetOffersDataParams(
        {
          accountAddress: midnightAddresses.maker,
          offers: tree,
          validation: false,
        },
        context,
      ),
      context,
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).toHaveBeenCalledWith(
      { client: handle.client, chainId: base.id, tree: data.tree },
      expect.any(Function),
    );
    expect(validateMidnightMakerOfferStates).toHaveBeenCalledOnce();
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
    expect(data).toMatchObject({
      accountAddress: midnightAddresses.maker,
      groups: tree.offers.map(({ group }) => group),
      ratifierType: "priceV1",
      ratifier: getChainAddress(base.id, "priceRatifierV1"),
      payload: await Payload.encode(PriceRatifierV1.ratify({ tree })),
    });
    expect(data.tree.root).toBe(tree.root);
  });

  test.sequential("behavior: passes the fetched states, pinned timestamp and market-creation clock to offer validation", async () => {
    vi.mocked(validateMidnightMakerOfferStates).mockClear();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("unexpected fetch"));
    const handle = createMockClient(base);
    const states = [{ offer: "sentinel" }] as unknown as Awaited<
      ReturnType<typeof fetchMidnightMakerOfferStatesBeforeDeadline>
    >["states"];
    const fetchStates = vi.mocked(fetchMidnightMakerOfferStatesBeforeDeadline);
    const fetchDefault = fetchStates.getMockImplementation();
    assert(fetchDefault);
    fetchStates.mockImplementationOnce(async (...args) => ({
      ...(await fetchDefault(...args)),
      states,
      now: 1_234n,
    }));
    const context = { client: handle.client, chainId: base.id };

    const data = await getOffersDataInternal(
      parseGetOffersDataParams(
        {
          accountAddress: midnightAddresses.maker,
          offers: priceTree(),
          validation: false,
        },
        context,
      ),
      { ...context, marketCreationTime: "now" },
    );

    expect(validateMidnightMakerOfferStates).toHaveBeenCalledExactlyOnceWith({
      tree: data.tree,
      states,
      now: 1_234n,
      marketCreationTime: "now",
    });
    expect(
      vi.mocked(validateMidnightMakerOfferStates).mock.calls[0]?.[0].states,
    ).toBe(states);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("plan-side maker constructors", () => {
  const borrowTree = () =>
    priceTree({ buy: false, expiry: maturityAt15Utc - 60n });
  const borrow = (
    cancellations: readonly { group: Hex; maxConsumed: bigint }[],
  ) => {
    const handle = createMockClient(base);
    return {
      handle,
      parsed: parseMakeBorrowParams(
        {
          accountAddress: midnightAddresses.maker,
          offers: borrowTree(),
          cancellations,
          deadline: 1_500n,
          now: 1_000n,
        },
        { client: handle.client, chainId: base.id },
      ),
    };
  };

  test.each([
    [[{ group: "0x12" as Hex, maxConsumed: 0n }], InvalidMidnightHexInputError],
    [
      [
        { group: padHex("0x12", { size: 32 }), maxConsumed: 0n },
        { group: padHex("0x12", { size: 32 }), maxConsumed: 1n },
      ],
      DuplicateMidnightGroupCancellationError,
    ],
    [
      [{ group: borrowTree().offers[0]!.group, maxConsumed: 0n }],
      MidnightReplacementGroupCancelledError,
    ],
  ] as const)(
    "error: parseMakeBorrowParams rejects malformed cancellations before any RPC (%#)",
    async (cancellations, error) => {
      const { handle, parsed } = borrow(cancellations);
      await expect(parsed).rejects.toBeInstanceOf(error);
      expect(handle.request).not.toHaveBeenCalled();
    },
  );

  test("error: parseMakeLendParams rejects a malformed cancellation before any RPC", async () => {
    const handle = createMockClient(base);
    await expect(
      parseMakeLendParams(
        {
          accountAddress: midnightAddresses.maker,
          offers: priceTree({ buy: true }),
          loanToken: midnightAddresses.loanToken,
          loanAssets: 1n,
          cancellations: [{ group: "0x12", maxConsumed: 0n }],
          deadline: 1_500n,
          now: 1_000n,
        },
        { client: handle.client, chainId: base.id },
      ),
    ).rejects.toBeInstanceOf(InvalidMidnightHexInputError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("error: parseMakeWithdrawParams rejects a malformed cancellation before any RPC", async () => {
    const handle = createMockClient(base);
    await expect(
      parseMakeWithdrawParams(
        {
          accountAddress: midnightAddresses.maker,
          offers: priceTree({ buy: false, reduceOnly: true }),
          cancellations: [{ group: "0x12", maxConsumed: 0n }],
          deadline: 1_500n,
          now: 1_000n,
        },
        { client: handle.client, chainId: base.id },
      ),
    ).rejects.toBeInstanceOf(InvalidMidnightHexInputError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("error: parseMakeRepayParams rejects a malformed cancellation before any RPC", async () => {
    const handle = createMockClient(base);
    await expect(
      parseMakeRepayParams(
        {
          accountAddress: midnightAddresses.maker,
          offers: priceTree({ buy: true, reduceOnly: true }),
          loanToken: midnightAddresses.loanToken,
          loanAssets: 1n,
          cancellations: [{ group: "0x12", maxConsumed: 0n }],
          deadline: 1_500n,
          now: 1_000n,
        },
        { client: handle.client, chainId: base.id },
      ),
    ).rejects.toBeInstanceOf(InvalidMidnightHexInputError);
    expect(handle.request).not.toHaveBeenCalled();
  });
});
