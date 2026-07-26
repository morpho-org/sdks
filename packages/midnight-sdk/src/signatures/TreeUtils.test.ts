import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { createWalletClient, type Hex, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  chainId,
  createFixtures,
  group as staleGroup,
} from "../__test__/fixtures.js";
import type { MidnightApiFetch } from "../api/index.js";
import {
  InvalidMarketParameterError,
  InvalidTreeError,
  InvalidTypedDataSignatureError,
  MidnightMempoolValidationError,
} from "../errors.js";
import { type IOffer, Offer, type OfferStruct } from "../offers/index.js";
import { EcrecoverRatifierUtils } from "./EcrecoverRatifierUtils.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";
import { Payload } from "./Payload.js";
import { RatifierUtils } from "./RatifierUtils.js";
import { SetterRatifierUtils } from "./SetterRatifierUtils.js";
import { Tree } from "./Tree.js";
import { TreeUtils } from "./TreeUtils.js";

const root =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const zeroBytes32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const API_VALID_MATURITY = 1_767_279_600n;
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const { baseMarketParamsInput, baseOffer, baseOfferInput } = createFixtures({
  midnight: getChainAddress(ChainId.BaseMainnet, "midnight"),
  ecrecoverRatifier: getChainAddress(ChainId.BaseMainnet, "ecrecoverRatifier"),
});
const privateKey =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const midnightTestChain = {
  id: chainId,
  name: "Midnight Test",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost"] } },
} as const;

const emptyMarket = () => ({
  chainId: 0n,
  midnight: zeroAddress,
  loanToken: zeroAddress,
  collateralParams: [],
  maturity: 0n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});

const emptyOfferInput = (): IOffer => ({
  market: emptyMarket(),
  buy: false,
  maker: zeroAddress,
  start: 0n,
  expiry: 0n,
  tick: 0n,
  callback: zeroAddress,
  callbackData: "0x",
  receiverIfMakerIsSeller: zeroAddress,
  ratifier: zeroAddress,
  reduceOnly: false,
  maxUnits: 0n,
  maxAssets: 0n,
  continuousFeeCap: 0n,
});

const emptyOfferStruct = (): OfferStruct => ({
  market: emptyMarket(),
  buy: false,
  maker: zeroAddress,
  start: 0n,
  expiry: 0n,
  tick: 0n,
  group: zeroBytes32,
  callback: zeroAddress,
  callbackData: "0x",
  receiverIfMakerIsSeller: zeroAddress,
  ratifier: zeroAddress,
  reduceOnly: false,
  maxUnits: 0n,
  maxAssets: 0n,
  continuousFeeCap: 0n,
});

describe("Tree.create", () => {
  test("default", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);
    const groupOffer = group.offers[0]!;
    const tree = Tree.create([group]);

    expect(tree.offers).toHaveLength(1);
    expect(tree.offers[0]).toBe(groupOffer);
    expect(tree.offers[0]!.group).toBe(group.id);
    expect(tree.root).toBe(TreeUtils.buildRoot([group]));
    expect(tree.proof(0n)).toEqual(
      TreeUtils.buildProof({ tree, leafIndex: 0n }),
    );
  });

  test("behavior: standalone offers normalize caller-supplied group ids", () => {
    const offer = baseOffer({ group: staleGroup, maxAssets: 0n });
    const tree = Tree.create([offer]);
    const expectedGroup = GroupUtils.hash([offer]);

    expect(tree.offers).toHaveLength(1);
    expect(tree.offers[0]).not.toBe(offer);
    expect(tree.offers[0]!.group).toBe(expectedGroup);
    expect(tree.paddedOffers[0]!.group).toBe(expectedGroup);
    expect(tree.paddedOffers[0]!.group).not.toBe(staleGroup);
  });

  test("behavior: standalone and explicitly grouped singleton trees are identical", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const standaloneTree = Tree.create([offer]);
    const groupedTree = Tree.create([Group.create([offer])]);
    const expectedGroup = GroupUtils.hash([offer]);

    expect(standaloneTree.offers[0]!.group).toBe(expectedGroup);
    expect(groupedTree.offers[0]!.group).toBe(expectedGroup);
    expect(standaloneTree.leaves).toEqual(groupedTree.leaves);
    expect(standaloneTree.root).toBe(groupedTree.root);
  });

  test("behavior: wraps plain offer input", () => {
    const offer = baseOfferInput({ maxAssets: 0n });
    const tree = Tree.create([offer]);

    expect(tree.offers).toHaveLength(1);
    expect(tree.offers[0]).toBeInstanceOf(Offer);
    expect(tree.offers[0]).not.toBe(offer);
  });

  test("behavior: explicit plain groups override embedded offer groups", () => {
    const offer = baseOfferInput({ group: staleGroup, maxAssets: 0n });
    const expectedGroup = GroupUtils.hash([offer]);
    const tree = Tree.create([{ offers: [offer] }]);

    expect(tree.offers[0]!.group).toBe(expectedGroup);
    expect(tree.paddedOffers[0]!.group).toBe(expectedGroup);
    expect(tree.paddedOffers[0]!.group).not.toBe(staleGroup);
  });
});

describe("Tree.mempoolValidate", () => {
  test("default", async () => {
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const tree = Tree.create([
      baseOffer({
        market: {
          ...baseMarketParamsInput(),
          maturity: API_VALID_MATURITY,
        },
        expiry: API_VALID_MATURITY - 60n,
        maxUnits: 0n,
        maxAssets: 1_000n,
      }),
    ]);

    const result = await tree.mempoolValidate({
      chainId: 8453,
      apiUrl: "https://api.example/base/",
      fetch,
    });

    const call = calls[0]!;
    const body = JSON.parse(String(call.init?.body)) as Readonly<
      Record<string, unknown>
    >;
    expect(call.input).toBeInstanceOf(URL);
    const url = call.input as URL;
    const decoded = await Payload.decode(body.payload as Hex);

    expect(result.valid).toBe(true);
    expectTypeOf(result.valid).toEqualTypeOf<true>();
    expect(url.origin).toBe("https://api.example");
    expect(url.pathname).toBe("/base/mempool/validate");
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.ratifierData).toBe("0x");
  });

  test("behavior: ecrecover ratification validates final payload", async () => {
    const account = privateKeyToAccount(privateKey);
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const tree = Tree.create([
      baseOffer({
        maker: account.address,
        market: {
          ...baseMarketParamsInput(),
          maturity: API_VALID_MATURITY,
        },
        expiry: API_VALID_MATURITY - 60n,
        maxUnits: 0n,
        maxAssets: 1_000n,
      }),
    ]);
    const signature = await account.signTypedData(
      EcrecoverRatifierUtils.typedData({ tree, chainId: 8453n }),
    );

    await tree.mempoolValidate({
      chainId: 8453,
      fetch,
      ratification: {
        type: "ecrecover",
        account,
        signature,
      },
    });

    const body = JSON.parse(String(calls[0]!.init?.body)) as Readonly<
      Record<string, unknown>
    >;
    const decoded = await Payload.decode(body.payload as Hex);
    const ratifierData = EcrecoverRatifierUtils.decodeRatifierData(
      decoded[0]!.ratifierData,
    );

    expect(decoded[0]!.ratifierData).not.toBe("0x");
    expect(ratifierData.signature).toEqual(
      EcrecoverRatifierUtils.toSignature(signature),
    );
    expect(
      TreeUtils.verifyProof({
        offer: decoded[0]!.offer,
        root: ratifierData.root,
        leafIndex: ratifierData.leafIndex,
        proof: ratifierData.proof,
      }),
    ).toBe(true);
  });

  test("error: InvalidTypedDataSignatureError when ecrecover ratification signature is invalid", async () => {
    const account = privateKeyToAccount(privateKey);
    const fetch = vi.fn<MidnightApiFetch>();
    const tree = Tree.create([
      baseOffer({
        maker: account.address,
        market: {
          ...baseMarketParamsInput(),
          maturity: API_VALID_MATURITY,
        },
        expiry: API_VALID_MATURITY - 60n,
        maxUnits: 0n,
        maxAssets: 1_000n,
      }),
    ]);

    await expect(
      tree.mempoolValidate({
        chainId: 8453,
        fetch,
        ratification: {
          type: "ecrecover",
          account,
          signature: { v: 27, r: zeroBytes32, s: zeroBytes32 },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidTypedDataSignatureError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: MidnightMempoolValidationError", async () => {
    const fetch: MidnightApiFetch = async () =>
      new Response(
        JSON.stringify({ data: { issues: [{ rule: "offer_count" }] } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    const tree = Tree.create([
      baseOffer({
        market: {
          ...baseMarketParamsInput(),
          maturity: API_VALID_MATURITY,
        },
        expiry: API_VALID_MATURITY - 60n,
        maxUnits: 0n,
        maxAssets: 1_000n,
      }),
    ]);
    const result = tree.mempoolValidate({
      chainId: 8453,
      fetch,
    });

    await expect(result).rejects.toBeInstanceOf(MidnightMempoolValidationError);
    await expect(result).rejects.toMatchObject({
      issues: [{ rule: "offer_count" }],
    });
  });
});

describe("Tree.from", () => {
  test("default", () => {
    const tree = Tree.create([baseOffer({ maxAssets: 0n })]);

    expect(Tree.from(tree)).toBe(tree);
    expect(Tree.from([baseOfferInput({ maxAssets: 0n })])).toBeInstanceOf(Tree);
    expect(Tree.from(baseOfferInput({ maxAssets: 0n }))).toBeInstanceOf(Tree);
  });
});

describe("TreeUtils.mempoolValidate", () => {
  test("behavior: ecrecover ratification validates final payload from existing tree", async () => {
    const account = privateKeyToAccount(privateKey);
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const tree = Tree.create([
      baseOffer({
        maker: account.address,
        market: {
          ...baseMarketParamsInput(),
          maturity: API_VALID_MATURITY,
        },
        expiry: API_VALID_MATURITY - 60n,
        maxUnits: 0n,
        maxAssets: 1_000n,
      }),
    ]);
    const signature = await account.signTypedData(
      EcrecoverRatifierUtils.typedData({ tree, chainId: 8453n }),
    );

    await TreeUtils.mempoolValidate({
      chainId: 8453,
      tree,
      fetch,
      ratification: {
        type: "ecrecover",
        account,
        signature,
      },
    });

    const body = JSON.parse(String(calls[0]!.init?.body)) as Readonly<
      Record<string, unknown>
    >;
    const decoded = await Payload.decode(body.payload as Hex);
    const ratifierData = EcrecoverRatifierUtils.decodeRatifierData(
      decoded[0]!.ratifierData,
    );

    expect(decoded[0]!.ratifierData).not.toBe("0x");
    expect(ratifierData.signature).toEqual(
      EcrecoverRatifierUtils.toSignature(signature),
    );
    expect(ratifierData.root).toBe(tree.root);
  });

  test("behavior: ecrecover ratification can sign before API validation", async () => {
    const account = privateKeyToAccount(privateKey);
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const tree = Tree.create([
      baseOffer({
        maker: account.address,
        market: {
          ...baseMarketParamsInput(),
          maturity: API_VALID_MATURITY,
        },
        expiry: API_VALID_MATURITY - 60n,
        maxUnits: 0n,
        maxAssets: 1_000n,
      }),
    ]);

    await TreeUtils.mempoolValidate({
      chainId,
      tree,
      fetch,
      ratification: {
        type: "ecrecover",
        client: createWalletClient({
          account,
          chain: midnightTestChain,
          transport: http("http://localhost"),
        }),
        account,
      },
    });

    const body = JSON.parse(String(calls[0]!.init?.body)) as Readonly<
      Record<string, unknown>
    >;
    const decoded = await Payload.decode(body.payload as Hex);

    expect(decoded[0]!.ratifierData).not.toBe("0x");
  });

  test("behavior: setter ratification validates final payload from plain input", async () => {
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const offer = baseOfferInput({
      market: {
        ...baseMarketParamsInput(),
        maturity: API_VALID_MATURITY,
      },
      ratifier: setterRatifier,
      expiry: API_VALID_MATURITY - 60n,
      maxUnits: 0n,
      maxAssets: 1_000n,
    });

    await TreeUtils.mempoolValidate({
      chainId: 8453,
      tree: offer,
      fetch,
      ratification: { type: "setter" },
    });

    const body = JSON.parse(String(calls[0]!.init?.body)) as Readonly<
      Record<string, unknown>
    >;
    const decoded = await Payload.decode(body.payload as Hex);
    const ratifierData = SetterRatifierUtils.decodeRatifierData(
      decoded[0]!.ratifierData,
    );

    expect(decoded[0]!.ratifierData).not.toBe("0x");
    expect(
      TreeUtils.verifyProof({
        offer: decoded[0]!.offer,
        root: ratifierData.root,
        leafIndex: ratifierData.leafIndex,
        proof: ratifierData.proof,
      }),
    ).toBe(true);
  });

  test("behavior: no-ratification payload validation accepts a single plain offer", async () => {
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const offer = baseOfferInput({
      market: {
        ...baseMarketParamsInput(),
        maturity: API_VALID_MATURITY,
      },
      expiry: API_VALID_MATURITY - 60n,
      maxUnits: 0n,
      maxAssets: 1_000n,
    });

    await TreeUtils.mempoolValidate({
      chainId: 8453,
      tree: offer,
      fetch,
    });

    const body = JSON.parse(String(calls[0]!.init?.body)) as Readonly<
      Record<string, unknown>
    >;
    const decoded = await Payload.decode(body.payload as Hex);

    expect(decoded[0]!.offer.maker).toBe(offer.maker);
    expect(decoded[0]!.ratifierData).toBe("0x");
  });

  test("error: InvalidTreeError for empty plain input before API validation", async () => {
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await expect(
      TreeUtils.mempoolValidate({
        chainId: 8453,
        tree: [],
        fetch,
      }),
    ).rejects.toBeInstanceOf(InvalidTreeError);

    expect(calls).toHaveLength(0);
  });

  test("error: InvalidTreeError for duplicate plain input before API validation", async () => {
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const offer = baseOfferInput({
      market: {
        ...baseMarketParamsInput(),
        maturity: API_VALID_MATURITY,
      },
      expiry: API_VALID_MATURITY - 60n,
      maxUnits: 0n,
      maxAssets: 1_000n,
    });

    await expect(
      TreeUtils.mempoolValidate({
        chainId: 8453,
        tree: [offer, offer],
        fetch,
      }),
    ).rejects.toBeInstanceOf(InvalidTreeError);

    expect(calls).toHaveLength(0);
  });

  test("error: InvalidTreeError for duplicate ratified plain input before API validation", async () => {
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { issues: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const offer = baseOfferInput({
      market: {
        ...baseMarketParamsInput(),
        maturity: API_VALID_MATURITY,
      },
      ratifier: setterRatifier,
      expiry: API_VALID_MATURITY - 60n,
      maxUnits: 0n,
      maxAssets: 1_000n,
    });

    await expect(
      TreeUtils.mempoolValidate({
        chainId: 8453,
        tree: [offer, offer],
        fetch,
        ratification: { type: "setter" },
      }),
    ).rejects.toBeInstanceOf(InvalidTreeError);

    expect(calls).toHaveLength(0);
  });

  test("behavior: raw standalone offer passes group_identity validation", async () => {
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const offer = baseOfferInput({
      market: {
        ...baseMarketParamsInput(),
        maturity: API_VALID_MATURITY,
      },
      group: staleGroup,
      expiry: API_VALID_MATURITY - 60n,
      maxUnits: 0n,
      maxAssets: 1_000n,
    });
    const expectedGroup = GroupUtils.hash([offer]);
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      const body = JSON.parse(String(init?.body)) as Readonly<
        Record<string, unknown>
      >;
      const decoded = await Payload.decode(body.payload as Hex);
      const issues = decoded.every(
        (item) => item.offer.group === GroupUtils.hash([item.offer]),
      )
        ? []
        : [{ rule: "group_identity" }];

      return new Response(JSON.stringify({ data: { issues } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await TreeUtils.mempoolValidate({
      chainId: 8453,
      tree: [offer],
      fetch,
    });

    const body = JSON.parse(String(calls[0]!.init?.body)) as Readonly<
      Record<string, unknown>
    >;
    const decoded = await Payload.decode(body.payload as Hex);

    expect(decoded[0]!.offer.group).toBe(expectedGroup);
    expect(decoded[0]!.offer.group).not.toBe(staleGroup);
    expect(result).toEqual({ valid: true, issues: [] });
  });

  test("error: MidnightMempoolValidationError", async () => {
    const calls: {
      readonly input: Parameters<MidnightApiFetch>[0];
      readonly init: Parameters<MidnightApiFetch>[1];
    }[] = [];
    const fetch: MidnightApiFetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({ data: { issues: [{ rule: "tick_spacing" }] } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };
    const offer = baseOfferInput({
      market: {
        ...baseMarketParamsInput(),
        maturity: API_VALID_MATURITY,
      },
      group: staleGroup,
      expiry: API_VALID_MATURITY - 60n,
      maxUnits: 0n,
      maxAssets: 1_000n,
    });
    const expectedGroup = GroupUtils.hash([offer]);

    const result = TreeUtils.mempoolValidate({
      chainId: 8453,
      tree: [{ offers: [offer] }],
      fetch,
    });

    await expect(result).rejects.toBeInstanceOf(MidnightMempoolValidationError);
    await expect(result).rejects.toMatchObject({
      issues: [{ rule: "tick_spacing" }],
    });

    const body = JSON.parse(String(calls[0]!.init?.body)) as Readonly<
      Record<string, unknown>
    >;
    const decoded = await Payload.decode(body.payload as Hex);

    expect(body.chain_id).toBe(8453);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.offer.group).toBe(expectedGroup);
    expect(decoded[0]!.ratifierData).toBe("0x");
  });
});

describe("TreeUtils.buildDescriptor", () => {
  test("default", () => {
    const payload = TreeUtils.buildDescriptor([baseOffer({ maxAssets: 0n })]);

    expect(payload.height).toBe(0);
    expect(payload.root).toBe(
      "0xf26894e35339dea06aebcf09035fe62e768b2b8002c0db452ca255be4714ea9a",
    );
  });

  test("behavior: standalone input matches an explicit singleton group by default", () => {
    const offer = baseOffer({ group: staleGroup, maxAssets: 0n });
    const standalone = TreeUtils.buildDescriptor([offer]);
    const singleton = TreeUtils.buildDescriptor([{ offers: [offer] }]);

    expect(standalone.offers[0]!.group).toBe(GroupUtils.hash([offer]));
    expect(standalone.offers).toEqual(singleton.offers);
    expect(standalone.leaves).toEqual(singleton.leaves);
    expect(standalone.root).toBe(singleton.root);
  });

  test("behavior: proof for second leaf", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const tree = Tree.create(groups);
    const proof = TreeUtils.buildProof({
      tree,
      leafIndex: 1n,
    });

    expect(proof.proof).toHaveLength(1);
    expect(proof.root).toBe(TreeUtils.buildRoot(groups));
  });

  test("behavior: pads non-power-of-two batches", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
      baseOffer({ maxAssets: 0n, tick: 5_008n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const tree = Tree.create(groups);
    const payload = TreeUtils.buildDescriptor(groups);
    const proof = TreeUtils.buildProof({
      tree,
      leafIndex: 2n,
    });

    expect(payload.offers).toHaveLength(4);
    expect(payload.height).toBe(2);
    expect(payload.offers.slice(0, 3)).toEqual(
      groups.flatMap(GroupUtils.toStructs),
    );
    expect(payload.offers[3]).toEqual(emptyOfferStruct());
    expect(proof.proof).toHaveLength(2);
    expect(
      TreeUtils.verifyProof({
        offer: groups[2]!.offers[0]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
  });

  test("behavior: explicit plain groups encode the derived group id", () => {
    const offer = baseOfferInput({ group: staleGroup, maxAssets: 0n });
    const expectedGroup = GroupUtils.hash([offer]);
    const payload = TreeUtils.buildDescriptor([{ offers: [offer] }]);

    expect(payload.offers[0]!.group).toBe(expectedGroup);
    expect(payload.offers[0]!.group).not.toBe(staleGroup);
  });

  test("error: duplicate offer hash", () => {
    const offer = baseOffer({ maxAssets: 0n });

    expect(() => TreeUtils.buildDescriptor([offer, offer])).toThrow(
      InvalidTreeError,
    );
  });

  test("error: empty tree", () => {
    expect(() => TreeUtils.buildDescriptor([])).toThrow(InvalidTreeError);
  });

  test("error: invalid empty offer", () => {
    expect(() => TreeUtils.buildDescriptor([emptyOfferInput()])).toThrow(
      InvalidMarketParameterError,
    );
  });

  test("behavior: does not enforce router offer-count policy", () => {
    const groups = Array.from({ length: 257 }, (_, index) =>
      Group.create([baseOffer({ maxAssets: 0n, tick: BigInt(5_000 + index) })]),
    );

    const descriptor = TreeUtils.buildDescriptor(groups);

    expect(descriptor.offers).toHaveLength(512);
    expect(descriptor.height).toBe(9);
  });
});

describe("TreeUtils.buildProof", () => {
  test("error: InvalidTreeError for out-of-range leaf index", () => {
    const tree = Tree.create([baseOffer({ maxAssets: 0n })]);

    expect(() => TreeUtils.buildProof({ tree, leafIndex: 1n })).toThrow(
      InvalidTreeError,
    );
  });
});

describe("RatifierUtils.normalizeRatifierTree", () => {
  test("behavior: accepts grouped offer input", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);

    expect(
      RatifierUtils.normalizeRatifierTree({
        tree: [group],
        label: "Ecrecover",
      }).ratifier,
    ).toBe(offer.ratifier);
  });

  test("error: InvalidTreeError for malformed empty tree-like input", () => {
    expect(() =>
      RatifierUtils.normalizeRatifierTree({
        tree: {
          offers: [],
          paddedOffers: [],
          leaves: [],
          root: zeroBytes32,
          height: 0,
        },
        label: "Setter",
      }),
    ).toThrow(InvalidTreeError);
  });
});

describe("TreeUtils.verifyProof", () => {
  test("default", () => {
    const offers = [
      baseOffer({ maxAssets: 0n, tick: 5_000n }),
      baseOffer({ maxAssets: 0n, tick: 5_004n }),
    ];
    const groups = offers.map((offer) => Group.create([offer]));
    const tree = Tree.create(groups);
    const proof = TreeUtils.buildProof({
      tree,
      leafIndex: 1n,
    });

    expect(
      TreeUtils.verifyProof({
        offer: groups[1]!.offers[0]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
    expect(
      TreeUtils.verifyProof({
        offer: groups[1]!.offers[0]!,
        root: root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      TreeUtils.verifyProof({
        offer: groups[1]!.offers[0]!,
        root: proof.root,
        leafIndex: 0n,
        proof: proof.proof,
      }),
    ).toBe(false);
    expect(
      TreeUtils.verifyProof({
        offer: groups[1]!.offers[0]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: [root],
      }),
    ).toBe(false);
  });

  test("behavior: rejects out-of-range leaf index", () => {
    const offer = baseOffer({ maxAssets: 0n });
    const group = Group.create([offer]);
    const offerRoot = group.offers[0]!.hash;

    expect(
      TreeUtils.verifyProof({
        offer: group.offers[0]!,
        root: offerRoot,
        leafIndex: 1n,
        proof: [],
      }),
    ).toBe(false);
    expect(
      TreeUtils.verifyProof({
        offer: group.offers[0]!,
        root: offerRoot,
        leafIndex: -1n,
        proof: [],
      }),
    ).toBe(false);
  });

  test("behavior: verifies proofs for plain offer objects", () => {
    const offer = baseOfferInput({ maxAssets: 0n });
    const group = Group.create([offer]);
    const tree = Tree.create([group]);
    const proof = tree.proof(0n);

    expect(
      TreeUtils.verifyProof({
        offer: group.offers[0]!,
        root: proof.root,
        leafIndex: proof.leafIndex,
        proof: proof.proof,
      }),
    ).toBe(true);
  });
});
