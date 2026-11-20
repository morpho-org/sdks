import { describe, expect, test } from "vitest";
import { MidnightApi } from "../../src/api/index.js";

describe("MidnightApi live Router", () => {
  test("maps valid_until to bigint deadlines bounded by offer expiry", {
    tags: ["nightly"],
  }, async () => {
    const request = { signal: AbortSignal.timeout(30_000) };
    const books = await MidnightApi.fetchBooks({
      chainIds: [8453],
      sort: "-bid",
      limit: 20,
      request,
    });
    const book = books.data.find((candidate) => candidate.bids.length > 0);
    expect(
      book,
      "Live Base Router must have an active bids book",
    ).toBeDefined();

    const raw: { valid_until: number; offer: { tick: number } }[] = [];
    const takes = await MidnightApi.fetchBookTakeableOffers({
      marketId: book!.marketId,
      side: "bids",
      request,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        const body: { data: typeof raw } = await response.clone().json();
        raw.push(...body.data);
        return response;
      },
    });

    expect(takes.data.length).toBeGreaterThan(0);
    expect(takes.data).toHaveLength(raw.length);
    // The SDK stably re-sorts bids best first (descending tick); match that order.
    const rawDeadlines = raw
      .toSorted((a, b) => b.offer.tick - a.offer.tick)
      .map((take) => take.valid_until);
    for (const [index, take] of takes.data.entries()) {
      expect(typeof take.validUntil).toBe("bigint");
      expect(take.validUntil).toBe(BigInt(rawDeadlines[index]!));
      expect(take.validUntil).toBeGreaterThanOrEqual(0n);
      expect(take.validUntil).toBeLessThanOrEqual(take.offer.expiry);
    }
  });
});
