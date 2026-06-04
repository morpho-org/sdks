import { deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseSignature,
} from "viem";
import { ecrecoverRatifierAbi, setterRatifierAbi } from "../abis.js";
import { EIP712_DOMAIN_TYPEHASH, OFFER_TYPEHASH } from "../constants.js";
import {
  InvalidOfferTreeError,
  InvalidOfferTreeHeightError,
} from "../errors.js";
import { MarketUtils } from "../market/index.js";
import {
  type BuildOfferGroupParams,
  type IOffer,
  Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";
import type { BigIntish, MidnightCall } from "../types.js";
import type { Item as PayloadItem } from "./Payload.js";

const offerTreeTypeHashes = [
  "0x2b9ee710e1977dfc5778fe18c905ccc1d9e144baf3ba83be732d4da65ecb73e3",
  "0x3cc16189b92a85898f1d5c6e87282c8ded7c1c93b2323d5e85ae10c5f4b2b220",
  "0x6de37d3e570afa293a8107d4b6b1d9547616c04f42164d009c89194787b2ffa6",
  "0xba3ea2ddfbf40a906fcd1b9506dbd344c062e8dcba8b5c902ceb13339f45a358",
  "0xe5faa865e93bc1b7b8fdf91980f54682d649683b014edd6c54b642f5a0c96977",
  "0xeda50f61dd2a827c6ff9fbfcd54335628dcaa78aaa4f2d118c60886219cdce2b",
  "0x54e2c9cc40cdc0e9ad530cf2be298f952f57af2b18b02f88274a9bbab359d23a",
  "0xc9d81859d60d6b21c688f4be93ca83e3be222728bb156ef5f4cf497f879f1e29",
  "0xd59b0c4544e0c60c8611eab0aaa402575f14ee784d22289c5d57f48c422a62d6",
  "0xccad21701f34f08bb8398a3dbc77e20e4c9c424930f3a8b31485bf059e2bdb20",
  "0x8a42dfb49807647bfc49c906aef322aa0239d40e4cb675761e141bc7bfa530da",
  "0x2adc0d948b2e3ecb642661590d2eec36d4e71e9acf382deb6574371800caf198",
  "0xf5845dfaed016de272342f346346a49d4b1694f622144d420558a38e46ac9dad",
  "0x3d7df854e6294bf433b64bbb8d0a82fa875a87b45b0016db27fc5752e54126ad",
  "0x72a991a101708716ff427c524404ab44f4d4d1f4e7e76c0ae8b967222164b348",
  "0x762c88fc52cf78a54401d247790f1bdb619d51d3458d1415c20d1422197cecc4",
  "0x8ede2209e94c8d5f8379d733dc8712b71a3888c1c4b70f3d6b22285f70bf4286",
  "0x425b18f07b3ac2f641977d2c294590565dd40b5d8414610568dca64628399975",
  "0x7e7d98718c0180e882e5963b9bd49810096912c273dfa38d8afdd6d39fde86ec",
  "0x8d35d491a29d846489e19688efff3c4cc7dbd54458058d49b30294074539f0b9",
  "0x824e385eea1953bcbc783bf900b18aa6fba129b6908765e986cf0968b491ec4f",
] as const;

const offerHashParams = [
  { name: "typehash", type: "bytes32" },
  { name: "marketHash", type: "bytes32" },
  { name: "buy", type: "bool" },
  { name: "maker", type: "address" },
  { name: "start", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "tick", type: "uint256" },
  { name: "group", type: "bytes32" },
  { name: "callback", type: "address" },
  { name: "callbackDataHash", type: "bytes32" },
  { name: "receiverIfMakerIsSeller", type: "address" },
  { name: "ratifier", type: "address" },
  { name: "reduceOnly", type: "bool" },
  { name: "maxUnits", type: "uint256" },
  { name: "maxAssets", type: "uint256" },
] as const;

const signatureAbi = [
  {
    type: "tuple",
    components: [
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
  },
  { name: "root", type: "bytes32" },
  { name: "leafIndex", type: "uint256" },
  { name: "proof", type: "bytes32[]" },
] as const;

const setterRatifierDataAbi = [
  { name: "root", type: "bytes32" },
  { name: "leafIndex", type: "uint256" },
  { name: "proof", type: "bytes32[]" },
] as const;

const domainSeparatorAbi = [
  { name: "typehash", type: "bytes32" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

const treeStructHashAbi = [
  { name: "typehash", type: "bytes32" },
  { name: "root", type: "bytes32" },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const EMPTY_OFFER_STRUCT: OfferStruct = {
  market: {
    loanToken: ZERO_ADDRESS,
    collateralParams: [],
    maturity: 0n,
    rcfThreshold: 0n,
    enterGate: ZERO_ADDRESS,
    liquidatorGate: ZERO_ADDRESS,
  },
  buy: false,
  maker: ZERO_ADDRESS,
  start: 0n,
  expiry: 0n,
  tick: 0n,
  group: ZERO_BYTES32,
  callback: ZERO_ADDRESS,
  callbackData: "0x",
  receiverIfMakerIsSeller: ZERO_ADDRESS,
  ratifier: ZERO_ADDRESS,
  reduceOnly: false,
  maxUnits: 0n,
  maxAssets: 0n,
};

const buildTreeValue = (offers: readonly OfferStruct[]): unknown => {
  if (offers.length === 1) return offers[0]!;
  const mid = offers.length / 2;
  return [
    buildTreeValue(offers.slice(0, mid)),
    buildTreeValue(offers.slice(mid)),
  ];
};

const typedDataTypes = {
  EIP712Domain: [
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  CollateralParams: [
    { name: "token", type: "address" },
    { name: "lltv", type: "uint256" },
    { name: "maxLif", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
  Market: [
    { name: "loanToken", type: "address" },
    { name: "collateralParams", type: "CollateralParams[]" },
    { name: "maturity", type: "uint256" },
    { name: "rcfThreshold", type: "uint256" },
    { name: "enterGate", type: "address" },
    { name: "liquidatorGate", type: "address" },
  ],
  Offer: [
    { name: "market", type: "Market" },
    { name: "buy", type: "bool" },
    { name: "maker", type: "address" },
    { name: "start", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "tick", type: "uint256" },
    { name: "group", type: "bytes32" },
    { name: "callback", type: "address" },
    { name: "callbackData", type: "bytes" },
    { name: "receiverIfMakerIsSeller", type: "address" },
    { name: "ratifier", type: "address" },
    { name: "reduceOnly", type: "bool" },
    { name: "maxUnits", type: "uint256" },
    { name: "maxAssets", type: "uint256" },
  ],
} as const;

function isOfferList(
  params: GroupCreateParams,
): params is readonly (IOffer | Offer)[] {
  return Array.isArray(params);
}

function hashOfferStruct(offerStruct: OfferStruct) {
  return keccak256(
    encodeAbiParameters(offerHashParams, [
      OFFER_TYPEHASH,
      MarketUtils.hashMarket(offerStruct.market),
      offerStruct.buy,
      offerStruct.maker,
      offerStruct.start,
      offerStruct.expiry,
      offerStruct.tick,
      offerStruct.group,
      offerStruct.callback,
      keccak256(offerStruct.callbackData),
      offerStruct.receiverIfMakerIsSeller,
      offerStruct.ratifier,
      offerStruct.reduceOnly,
      offerStruct.maxUnits,
      offerStruct.maxAssets,
    ]),
  );
}

function isEmptyOfferStruct(offer: OfferStruct): boolean {
  return (
    offer.market.loanToken === ZERO_ADDRESS &&
    offer.market.collateralParams.length === 0 &&
    offer.market.maturity === 0n &&
    offer.market.rcfThreshold === 0n &&
    offer.market.enterGate === ZERO_ADDRESS &&
    offer.market.liquidatorGate === ZERO_ADDRESS &&
    offer.buy === false &&
    offer.maker === ZERO_ADDRESS &&
    offer.start === 0n &&
    offer.expiry === 0n &&
    offer.tick === 0n &&
    offer.group === ZERO_BYTES32 &&
    offer.callback === ZERO_ADDRESS &&
    offer.callbackData === "0x" &&
    offer.receiverIfMakerIsSeller === ZERO_ADDRESS &&
    offer.ratifier === ZERO_ADDRESS &&
    offer.reduceOnly === false &&
    offer.maxUnits === 0n &&
    offer.maxAssets === 0n
  );
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function padOfferStructs(offers: readonly OfferStruct[]): OfferStruct[] {
  if (isPowerOfTwo(offers.length)) return [...offers];
  const paddedLength = nextPowerOfTwo(offers.length);

  return [
    ...offers,
    ...Array.from(
      { length: paddedLength - offers.length },
      () => EMPTY_OFFER_STRUCT,
    ),
  ];
}

function assertLeafOffers(offers: readonly OfferStruct[]): void {
  const seen = new Set<Hex>();
  for (const offer of offers) {
    if (isEmptyOfferStruct(offer)) continue;

    const leafHash = hashOfferStruct(offer);
    if (seen.has(leafHash)) {
      throw new InvalidOfferTreeError(
        `Duplicate offer hash "${leafHash}" in offer tree.`,
      );
    }
    seen.add(leafHash);
  }

  if (seen.size === 0) {
    throw new InvalidOfferTreeError("Offer tree must not be empty.");
  }
}

/**
 * Signature tuple accepted by EcrecoverRatifier.
 *
 * @example
 * ```ts
 * import type { EcrecoverSignature } from "@morpho-org/midnight-sdk";
 *
 * const signature = {} as EcrecoverSignature;
 * console.log(signature.v);
 * ```
 */
export interface EcrecoverSignature {
  /** Recovery id. */
  readonly v: number;
  /** Signature `r` value. */
  readonly r: Hex;
  /** Signature `s` value. */
  readonly s: Hex;
}

/**
 * Offer tree descriptor.
 *
 * @example
 * ```ts
 * import type { OfferTreeDescriptor } from "@morpho-org/midnight-sdk";
 *
 * const tree = {} as OfferTreeDescriptor;
 * console.log(tree.root);
 * ```
 */
export interface OfferTreeDescriptor {
  /** Offer structs in leaf order, including trailing empty padding. */
  readonly offers: readonly OfferStruct[];
  /** Leaf hashes for the padded offer tree. */
  readonly leaves: readonly Hex[];
  /** Merkle root. */
  readonly root: Hex;
  /** Tree height. */
  readonly height: number;
}

/**
 * Merkle proof descriptor for one offer leaf.
 *
 * @example
 * ```ts
 * import type { OfferTreeProof } from "@morpho-org/midnight-sdk";
 *
 * const proof = {} as OfferTreeProof;
 * console.log(proof.leafIndex);
 * ```
 */
export interface OfferTreeProof {
  /** Merkle root. */
  readonly root: Hex;
  /** Leaf index in the offer tree. */
  readonly leafIndex: bigint;
  /** Sibling hashes from leaf to root. */
  readonly proof: readonly Hex[];
}

/**
 * Decoded EcrecoverRatifier ratifier data.
 *
 * @example
 * ```ts
 * import type { DecodedEcrecoverRatifierData } from "@morpho-org/midnight-sdk";
 *
 * const decoded = {} as DecodedEcrecoverRatifierData;
 * console.log(decoded.signature.v);
 * ```
 */
export interface DecodedEcrecoverRatifierData extends OfferTreeProof {
  /** Ecrecover signature tuple. */
  readonly signature: EcrecoverSignature;
}

/**
 * Decoded SetterRatifier ratifier data.
 *
 * @example
 * ```ts
 * import type { DecodedSetterRatifierData } from "@morpho-org/midnight-sdk";
 *
 * const decoded = {} as DecodedSetterRatifierData;
 * console.log(decoded.root);
 * ```
 */
export interface DecodedSetterRatifierData extends OfferTreeProof {}

/**
 * Ecrecover typed-data descriptor returned to signing code.
 *
 * @example
 * ```ts
 * import type { EcrecoverRatificationTypedData } from "@morpho-org/midnight-sdk";
 *
 * const typedData = {} as EcrecoverRatificationTypedData;
 * console.log(typedData.primaryType);
 * ```
 */
export interface EcrecoverRatificationTypedData {
  /** EIP-712 domain. */
  readonly domain: {
    readonly chainId: bigint;
    readonly verifyingContract: Address;
  };
  /** EIP-712 type map. */
  readonly types: typeof typedDataTypes & {
    readonly OfferTree: readonly [
      { readonly name: "offerTree"; readonly type: string },
    ];
  };
  /** Primary typed-data type. */
  readonly primaryType: "OfferTree";
  /** Typed-data message. */
  readonly message: {
    readonly offerTree: unknown;
  };
}

/**
 * Input accepted by {@link Group.create}.
 *
 * @example
 * ```ts
 * import type { GroupCreateParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as GroupCreateParams;
 * console.log(Array.isArray(params));
 * ```
 */
export type GroupCreateParams =
  | readonly (IOffer | Offer)[]
  | BuildOfferGroupParams;

/**
 * Input accepted by {@link Tree.create}.
 *
 * @example
 * ```ts
 * import type { TreeCreateParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as TreeCreateParams;
 * console.log(params.groups.length);
 * ```
 */
export interface TreeCreateParams {
  /** Offer groups committed to the tree, in leaf order. */
  readonly groups: readonly (Group | GroupCreateParams)[];
}

/**
 * Plain or class tree input accepted by higher-level helpers.
 *
 * @example
 * ```ts
 * import type { TreeInput } from "@morpho-org/midnight-sdk";
 *
 * const tree = {} as TreeInput;
 * console.log(tree);
 * ```
 */
export type TreeInput = Tree | TreeCreateParams;

/**
 * Hex or tuple signature accepted by {@link EcrecoverRatifier}.
 *
 * @example
 * ```ts
 * import type { EcrecoverSignatureInput } from "@morpho-org/midnight-sdk";
 *
 * const signature = "0x" as EcrecoverSignatureInput;
 * console.log(signature);
 * ```
 */
export type EcrecoverSignatureInput = Hex | EcrecoverSignature;

/**
 * Signing callback accepted by {@link EcrecoverRatifier.ratify}.
 *
 * @example
 * ```ts
 * import type { EcrecoverSignTypedData } from "@morpho-org/midnight-sdk";
 *
 * const signTypedData: EcrecoverSignTypedData = () => "0x";
 * console.log(signTypedData);
 * ```
 */
export type EcrecoverSignTypedData = (
  typedData: EcrecoverRatificationTypedData,
) => Hex | Promise<Hex>;

/**
 * Parameters for {@link EcrecoverRatifier.typedData}.
 *
 * @example
 * ```ts
 * import type { EcrecoverRatifierTypedDataParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as EcrecoverRatifierTypedDataParams;
 * console.log(params.chainId);
 * ```
 */
export interface EcrecoverRatifierTypedDataParams {
  /** Offer tree being ratified. */
  readonly tree: TreeInput;
  /** Chain id used by the EIP-712 domain. */
  readonly chainId: BigIntish;
  /** EcrecoverRatifier contract address used by the EIP-712 domain. */
  readonly verifyingContract: Address | string;
}

/**
 * Parameters for {@link EcrecoverRatifier.ratify}.
 *
 * @example
 * ```ts
 * import type { EcrecoverRatifierRatifyParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as EcrecoverRatifierRatifyParams;
 * console.log(params.tree);
 * ```
 */
export type EcrecoverRatifierRatifyParams =
  | (EcrecoverRatifierTypedDataParams & {
      /** Callback that signs the typed data built from `tree`. */
      readonly signTypedData: EcrecoverSignTypedData;
      /** Omit when the SDK should request the signature through `signTypedData`. */
      readonly signature?: undefined;
    })
  | {
      /** Offer tree being ratified. */
      readonly tree: TreeInput;
      /** Precomputed signature for this tree root. */
      readonly signature: EcrecoverSignatureInput;
      /** Omit when a precomputed signature is supplied. */
      readonly signTypedData?: undefined;
      /** Omit when a precomputed signature is supplied. */
      readonly chainId?: undefined;
      /** Omit when a precomputed signature is supplied. */
      readonly verifyingContract?: undefined;
    };

/**
 * Parameters for one EcrecoverRatifier ratifier-data value.
 *
 * @example
 * ```ts
 * import type { EcrecoverRatifierDataParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as EcrecoverRatifierDataParams;
 * console.log(params.leafIndex);
 * ```
 */
export interface EcrecoverRatifierDataParams {
  /** Offer tree that produced the proof. */
  readonly tree: TreeInput;
  /** Leaf index to prove. */
  readonly leafIndex: BigIntish;
  /** Ecrecover signature for the tree root. */
  readonly signature: EcrecoverSignatureInput;
}

/**
 * Parameters for one SetterRatifier ratifier-data value.
 *
 * @example
 * ```ts
 * import type { SetterRatifierDataParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as SetterRatifierDataParams;
 * console.log(params.leafIndex);
 * ```
 */
export interface SetterRatifierDataParams {
  /** Offer tree that produced the proof. */
  readonly tree: TreeInput;
  /** Leaf index to prove. */
  readonly leafIndex: BigIntish;
}

/**
 * Protocol offer group with one shared consumption group id.
 *
 * @example
 * ```ts
 * import { Group } from "@morpho-org/midnight-sdk";
 *
 * const group = Group.create([{} as never]);
 * console.log(group.offers.length);
 * ```
 */
export class Group {
  /** Offers in this protocol group. */
  public readonly offers: readonly Offer[];

  private constructor(offers: readonly Offer[]) {
    this.offers = [...offers];
  }

  /**
   * Creates a protocol-valid offer group.
   *
   * @param params - Existing offers, or offer builder parameters sharing one group id.
   * @returns Group instance.
   * @throws InvalidOfferGroupError when group mechanics are invalid.
   * @throws MissingOfferGroupError when builder params omit both `group` and `getRandomValues`.
   * @example
   * ```ts
   * import { Group } from "@morpho-org/midnight-sdk";
   *
   * const group = Group.create([{} as never]);
   * console.log(group.offers.length);
   * ```
   */
  public static create(params: GroupCreateParams): Group {
    const offers = isOfferList(params)
      ? OfferUtils.validateOfferGroup({ offers: params })
      : OfferUtils.buildOfferGroup(params);

    return new Group(offers);
  }

  /**
   * Returns a group instance from class or plain input.
   *
   * @param group - Group class or creation input.
   * @returns Group instance.
   * @example
   * ```ts
   * import { Group } from "@morpho-org/midnight-sdk";
   *
   * const group = Group.from([{} as never]);
   * console.log(group.offers.length);
   * ```
   */
  public static from(group: Group | GroupCreateParams): Group {
    return group instanceof Group ? group : Group.create(group);
  }
}

/**
 * Offer Merkle tree used by Midnight ratifiers.
 *
 * @example
 * ```ts
 * import { Group, Tree } from "@morpho-org/midnight-sdk";
 *
 * const tree = Tree.create({ groups: [Group.create([{} as never])] });
 * console.log(tree.root);
 * ```
 */
export class Tree {
  /** Groups committed to the tree. */
  public readonly groups: readonly Group[];

  /** Non-padding offers in leaf order. */
  public readonly offers: readonly Offer[];

  /** ABI-compatible offers in leaf order, including protocol-zero padding. */
  public readonly paddedOffers: readonly OfferStruct[];

  /** Leaf hashes for `paddedOffers`. */
  public readonly leaves: readonly Hex[];

  /** Merkle root. */
  public readonly root: Hex;

  /** Tree height. */
  public readonly height: number;

  private constructor(groups: readonly Group[]) {
    this.groups = [...groups];
    this.offers = groups.flatMap((group) => group.offers);

    const descriptor = OfferTreeUtils.buildOfferTreeDescriptor(this.offers);
    this.paddedOffers = descriptor.offers;
    this.leaves = descriptor.leaves;
    this.root = descriptor.root;
    this.height = descriptor.height;
  }

  /**
   * Creates an offer tree from validated groups.
   *
   * @param params - Tree creation parameters.
   * @returns Tree instance.
   * @throws InvalidOfferTreeError when the tree is empty, all padding, or duplicated.
   * @throws InvalidOfferTreeHeightError when the resulting height is unsupported.
   * @example
   * ```ts
   * import { Group, Tree } from "@morpho-org/midnight-sdk";
   *
   * const tree = Tree.create({ groups: [Group.create([{} as never])] });
   * console.log(tree.height);
   * ```
   */
  public static create(params: TreeCreateParams): Tree {
    return new Tree(params.groups.map((group) => Group.from(group)));
  }

  /**
   * Returns a tree instance from class or plain input.
   *
   * @param tree - Tree class or creation input.
   * @returns Tree instance.
   * @example
   * ```ts
   * import { Tree } from "@morpho-org/midnight-sdk";
   *
   * const tree = Tree.from({ groups: [[{} as never]] });
   * console.log(tree.root);
   * ```
   */
  public static from(tree: TreeInput): Tree {
    return tree instanceof Tree ? tree : Tree.create(tree);
  }

  /**
   * Builds a Merkle proof for one leaf.
   *
   * @param leafIndex - Leaf index to prove.
   * @returns Offer tree proof.
   * @throws InvalidOfferTreeError when the leaf index is out of range.
   * @example
   * ```ts
   * import { Tree } from "@morpho-org/midnight-sdk";
   *
   * const proof = Tree.from({ groups: [[{} as never]] }).proof(0n);
   * console.log(proof.root);
   * ```
   */
  public proof(leafIndex: BigIntish): OfferTreeProof {
    return OfferTreeUtils.buildOfferTreeProof({
      offers: this.offers,
      leafIndex,
    });
  }
}

/**
 * EcrecoverRatifier helpers that produce ratifier data from a tree.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
 *
 * const items = await EcrecoverRatifier.ratify({
 *   tree: { groups: [[{} as never]] },
 *   signature: {
 *     v: 27,
 *     r: "0x0000000000000000000000000000000000000000000000000000000000000000",
 *     s: "0x0000000000000000000000000000000000000000000000000000000000000000",
 *   },
 * });
 * console.log(items.length);
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Mirrors router DX with a behavior-bearing class API.
export class EcrecoverRatifier {
  /**
   * Builds the EIP-712 typed data for a tree.
   *
   * @param params - Typed-data parameters.
   * @returns EIP-712 typed-data descriptor.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const typedData = EcrecoverRatifier.typedData({
   *   tree: { groups: [[{} as never]] },
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   * });
   * console.log(typedData.primaryType);
   * ```
   */
  public static typedData(
    params: EcrecoverRatifierTypedDataParams,
  ): EcrecoverRatificationTypedData {
    const tree = Tree.from(params.tree);

    return OfferTreeUtils.buildEcrecoverRatificationTypedData({
      offers: tree.offers,
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    });
  }

  /**
   * Builds one ratifier-data value for a tree leaf.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded EcrecoverRatifier data.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const data = EcrecoverRatifier.ratifierData({} as never);
   * console.log(data);
   * ```
   */
  public static ratifierData(params: EcrecoverRatifierDataParams): Hex {
    const tree = Tree.from(params.tree);
    const proof = tree.proof(params.leafIndex);

    return OfferTreeUtils.encodeEcrecoverRatifierData({
      signature: normalizeEcrecoverSignature(params.signature),
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
    });
  }

  /**
   * Signs or consumes a tree signature and returns payload-ready items.
   *
   * The returned items are independent of the mempool wire codec. Call
   * `Payload.encode(items)` only at the publication edge.
   *
   * @param params - Ratification parameters.
   * @returns Items containing each offer and its ratifier data.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const items = await EcrecoverRatifier.ratify({
   *   tree: { groups: [[{} as never]] },
   *   signature: {
   *     v: 27,
   *     r: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *     s: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   },
   * });
   * console.log(items[0]?.ratifierData);
   * ```
   */
  public static async ratify(
    params: EcrecoverRatifierRatifyParams,
  ): Promise<readonly PayloadItem[]> {
    const tree = Tree.from(params.tree);
    const signature =
      params.signature != null
        ? normalizeEcrecoverSignature(params.signature)
        : normalizeEcrecoverSignature(
            await params.signTypedData(
              EcrecoverRatifier.typedData({
                tree,
                chainId: params.chainId,
                verifyingContract: params.verifyingContract,
              }),
            ),
          );

    return tree.offers.map((offer, leafIndex) => ({
      offer,
      ratifierData: EcrecoverRatifier.ratifierData({
        tree,
        leafIndex,
        signature,
      }),
    }));
  }

  /**
   * Decodes EcrecoverRatifier data.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded ratifier data.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const decoded = EcrecoverRatifier.decodeRatifierData("0x" as never);
   * console.log(decoded.root);
   * ```
   */
  public static decodeRatifierData(data: Hex): DecodedEcrecoverRatifierData {
    return OfferTreeUtils.decodeEcrecoverRatifierData(data);
  }

  /**
   * Builds an EcrecoverRatifier root-cancellation call.
   *
   * @param params - Cancellation parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { EcrecoverRatifier } from "@morpho-org/midnight-sdk";
   *
   * const call = EcrecoverRatifier.cancelRoot({} as never);
   * console.log(call.to);
   * ```
   */
  public static cancelRoot(params: {
    readonly ecrecoverRatifier: Address | string;
    readonly maker: Address | string;
    readonly root: Hex;
  }): MidnightCall {
    return OfferTreeUtils.buildEcrecoverRootCancellationCall(params);
  }
}

/**
 * SetterRatifier helpers that produce ratifier data from a tree.
 *
 * @example
 * ```ts
 * import { SetterRatifier } from "@morpho-org/midnight-sdk";
 *
 * const items = SetterRatifier.ratify({ tree: { groups: [[{} as never]] } });
 * console.log(items.length);
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Mirrors router DX with a behavior-bearing class API.
export class SetterRatifier {
  /**
   * Builds one ratifier-data value for a tree leaf.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded SetterRatifier data.
   * @example
   * ```ts
   * import { SetterRatifier } from "@morpho-org/midnight-sdk";
   *
   * const data = SetterRatifier.ratifierData({} as never);
   * console.log(data);
   * ```
   */
  public static ratifierData(params: SetterRatifierDataParams): Hex {
    const tree = Tree.from(params.tree);
    const proof = tree.proof(params.leafIndex);

    return OfferTreeUtils.encodeSetterRatifierData({
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
    });
  }

  /**
   * Returns payload-ready items after a Setter root has been approved.
   *
   * The returned items are independent of the mempool wire codec. Call
   * `Payload.encode(items)` only at the publication edge.
   *
   * @param params - Tree to ratify.
   * @returns Items containing each offer and its ratifier data.
   * @example
   * ```ts
   * import { SetterRatifier } from "@morpho-org/midnight-sdk";
   *
   * const items = SetterRatifier.ratify({ tree: { groups: [[{} as never]] } });
   * console.log(items[0]?.ratifierData);
   * ```
   */
  public static ratify(params: {
    readonly tree: TreeInput;
  }): readonly PayloadItem[] {
    const tree = Tree.from(params.tree);

    return tree.offers.map((offer, leafIndex) => ({
      offer,
      ratifierData: SetterRatifier.ratifierData({ tree, leafIndex }),
    }));
  }

  /**
   * Decodes SetterRatifier data.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded ratifier data.
   * @example
   * ```ts
   * import { SetterRatifier } from "@morpho-org/midnight-sdk";
   *
   * const decoded = SetterRatifier.decodeRatifierData("0x" as never);
   * console.log(decoded.root);
   * ```
   */
  public static decodeRatifierData(data: Hex): DecodedSetterRatifierData {
    return OfferTreeUtils.decodeSetterRatifierData(data);
  }

  /**
   * Builds a SetterRatifier root-approval call.
   *
   * @param params - Root approval parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { SetterRatifier } from "@morpho-org/midnight-sdk";
   *
   * const call = SetterRatifier.approveRoot({} as never);
   * console.log(call.to);
   * ```
   */
  public static approveRoot(params: {
    readonly setterRatifier: Address | string;
    readonly maker: Address | string;
    readonly root: Hex;
    readonly newIsRootRatified?: boolean;
  }): MidnightCall {
    return OfferTreeUtils.buildSetterRootApprovalCall(params);
  }
}

function normalizeEcrecoverSignature(
  signature: EcrecoverSignatureInput,
): EcrecoverSignature {
  if (typeof signature !== "string") return signature;

  const parsed = parseSignature(signature);
  return {
    v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
    r: parsed.r,
    s: parsed.s,
  };
}

/**
 * Utilities for Midnight offer trees, ratifier data, and root calls.
 *
 * @example
 * ```ts
 * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof OfferTreeUtils.hashNode);
 * ```
 */
export namespace OfferTreeUtils {
  /**
   * Returns the HashLib offer-tree typehash for a tree height.
   *
   * @param height - Tree height.
   * @returns OfferTree typehash.
   * @throws InvalidOfferTreeHeightError when height exceeds 20.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(OfferTreeUtils.offerTreeTypeHash(0));
   * ```
   */
  export function offerTreeTypeHash(height: number) {
    const typehash = offerTreeTypeHashes[height];
    if (typehash == null) throw new InvalidOfferTreeHeightError(height);

    return typehash;
  }

  /**
   * Computes the HashLib offer struct hash.
   *
   * @param offer - Offer to hash.
   * @returns Offer hash.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const hash = OfferTreeUtils.hashOffer({} as never);
   * console.log(hash);
   * ```
   */
  export function hashOffer(offer: IOffer | Offer) {
    const offerStruct = Offer.from(offer).toStruct();

    return hashOfferStruct(offerStruct);
  }

  /**
   * Computes HashLib node hash from left and right child hashes.
   *
   * @param left - Left child hash.
   * @param right - Right child hash.
   * @returns Node hash.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const root = OfferTreeUtils.hashNode(
   *   "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   "0x0000000000000000000000000000000000000000000000000000000000000000",
   * );
   * console.log(root);
   * ```
   */
  export function hashNode(left: Hex, right: Hex) {
    return keccak256(concat([left as Hex, right as Hex]));
  }

  /**
   * Builds an offer tree and Merkle root. Non-power-of-two batches are
   * padded with protocol-zero offers at the highest leaf indices.
   *
   * @param offers - Offers in leaf order.
   * @returns Offer tree descriptor.
   * @throws InvalidOfferTreeError when the offer count is empty, all padding, or duplicated.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const tree = OfferTreeUtils.buildOfferTreeDescriptor([{} as never]);
   * console.log(tree.root);
   * ```
   */
  export function buildOfferTreeDescriptor(
    offers: readonly (IOffer | Offer)[],
  ): OfferTreeDescriptor {
    if (offers.length === 0) {
      throw new InvalidOfferTreeError("Offer tree must not be empty.");
    }

    const offerStructs = padOfferStructs(
      offers.map((offer) => Offer.from(offer).toStruct()),
    );
    assertLeafOffers(offerStructs);

    const height = Math.log2(offerStructs.length);
    if (height > 20) throw new InvalidOfferTreeHeightError(height);

    let level = offerStructs.map(hashOfferStruct);
    const leaves = [...level];

    while (level.length > 1) {
      const next: Hex[] = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(hashNode(level[i]!, level[i + 1]!));
      }
      level = next;
    }

    return deepFreeze({
      offers: offerStructs,
      leaves,
      root: level[0]!,
      height,
    });
  }

  /**
   * Builds only the offer-tree root.
   *
   * @param offers - Offers in leaf order.
   * @returns Merkle root.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const root = OfferTreeUtils.buildOfferTreeRoot([{} as never]);
   * console.log(root);
   * ```
   */
  export function buildOfferTreeRoot(offers: readonly (IOffer | Offer)[]) {
    return buildOfferTreeDescriptor(offers).root;
  }

  /**
   * Builds a Merkle proof for one offer.
   *
   * @param params - Proof parameters.
   * @returns Proof descriptor.
   * @throws InvalidOfferTreeError when leaf index is out of range.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const proof = OfferTreeUtils.buildOfferTreeProof({ offers: [{} as never], leafIndex: 0n });
   * console.log(proof.proof.length);
   * ```
   */
  export function buildOfferTreeProof(params: {
    readonly offers: readonly (IOffer | Offer)[];
    readonly leafIndex: BigIntish;
  }): OfferTreeProof {
    const payload = buildOfferTreeDescriptor(params.offers);
    const leafIndex = BigInt(params.leafIndex);
    if (leafIndex < 0n || leafIndex >= BigInt(payload.offers.length)) {
      throw new InvalidOfferTreeError(
        `Leaf index "${leafIndex}" is outside the offer tree.`,
      );
    }

    let index = Number(leafIndex);
    let level = [...payload.leaves];
    const proof: Hex[] = [];
    while (level.length > 1) {
      proof.push(level[index ^ 1]!);
      const next: Hex[] = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(hashNode(level[i]!, level[i + 1]!));
      }
      index = Math.floor(index / 2);
      level = next;
    }

    return deepFreeze({ root: payload.root, leafIndex, proof });
  }

  /**
   * Builds EcrecoverRatifier typed data for a power-of-two offer tree.
   *
   * @param params - Typed-data parameters.
   * @returns EIP-712 typed-data descriptor.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const typedData = OfferTreeUtils.buildEcrecoverRatificationTypedData({
   *   offers: [{} as never],
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   * });
   * console.log(typedData.primaryType);
   * ```
   */
  export function buildEcrecoverRatificationTypedData(params: {
    readonly offers: readonly (IOffer | Offer)[];
    readonly chainId: BigIntish;
    readonly verifyingContract: Address | string;
  }): EcrecoverRatificationTypedData {
    const payload = buildOfferTreeDescriptor(params.offers);
    const offerTreeType =
      payload.height === 0 ? "Offer" : `Offer${"[2]".repeat(payload.height)}`;

    return deepFreeze({
      domain: {
        chainId: BigInt(params.chainId),
        verifyingContract: params.verifyingContract as Address,
      },
      types: {
        ...typedDataTypes,
        OfferTree: [{ name: "offerTree", type: offerTreeType }],
      },
      primaryType: "OfferTree",
      message: {
        offerTree: buildTreeValue(payload.offers),
      },
    });
  }

  /**
   * Builds the EcrecoverRatifier digest used by the Solidity ratifier.
   *
   * @param params - Digest parameters.
   * @returns EIP-712 digest.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const digest = OfferTreeUtils.buildEcrecoverRatificationDigest({
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   height: 0,
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   * });
   * console.log(digest);
   * ```
   */
  export function buildEcrecoverRatificationDigest(params: {
    readonly root: Hex;
    readonly height: number;
    readonly chainId: BigIntish;
    readonly verifyingContract: Address | string;
  }) {
    const domainSeparator = keccak256(
      encodeAbiParameters(domainSeparatorAbi, [
        EIP712_DOMAIN_TYPEHASH,
        BigInt(params.chainId),
        params.verifyingContract as Address,
      ]),
    );
    const structHash = keccak256(
      encodeAbiParameters(treeStructHashAbi, [
        offerTreeTypeHash(params.height),
        params.root as Hex,
      ]),
    );

    return keccak256(concat(["0x1901", domainSeparator, structHash]));
  }

  /**
   * Signs EcrecoverRatifier typed data through an injected signing callback.
   *
   * @param params - Signing parameters.
   * @returns Signature returned by the callback.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const signature = await OfferTreeUtils.signEcrecoverRatification({
   *   offers: [{} as never],
   *   chainId: 8453n,
   *   verifyingContract: "0x0000000000000000000000000000000000000001",
   *   signTypedData: () => "0x",
   * });
   * console.log(signature);
   * ```
   */
  export async function signEcrecoverRatification(params: {
    readonly offers: readonly (IOffer | Offer)[];
    readonly chainId: BigIntish;
    readonly verifyingContract: Address | string;
    readonly signTypedData: (
      typedData: EcrecoverRatificationTypedData,
    ) => Hex | Promise<Hex>;
  }) {
    return params.signTypedData(
      buildEcrecoverRatificationTypedData({
        offers: params.offers,
        chainId: params.chainId,
        verifyingContract: params.verifyingContract,
      }),
    );
  }

  /**
   * Encodes EcrecoverRatifier ratifier data.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = OfferTreeUtils.encodeEcrecoverRatifierData({
   *   signature: {
   *     v: 27,
   *     r: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *     s: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   },
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   leafIndex: 0n,
   *   proof: [],
   * });
   * console.log(data);
   * ```
   */
  export function encodeEcrecoverRatifierData(params: {
    readonly signature: EcrecoverSignature;
    readonly root: Hex;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hex[];
  }) {
    return encodeAbiParameters(signatureAbi, [
      {
        v: params.signature.v,
        r: params.signature.r as Hex,
        s: params.signature.s as Hex,
      },
      params.root as Hex,
      BigInt(params.leafIndex),
      params.proof.map((node) => node as Hex),
    ]);
  }

  /**
   * Decodes EcrecoverRatifier ratifier data.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded Ecrecover ratifier data.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const decoded = OfferTreeUtils.decodeEcrecoverRatifierData("0x" as never);
   * console.log(decoded.leafIndex);
   * ```
   */
  export function decodeEcrecoverRatifierData(
    data: Hex,
  ): DecodedEcrecoverRatifierData {
    const [signature, root, leafIndex, proof] = decodeAbiParameters(
      signatureAbi,
      data,
    );

    return deepFreeze({
      signature: {
        v: signature.v,
        r: signature.r,
        s: signature.s,
      },
      root,
      leafIndex,
      proof: [...proof],
    });
  }

  /**
   * Encodes SetterRatifier ratifier data.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = OfferTreeUtils.encodeSetterRatifierData({
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   leafIndex: 0n,
   *   proof: [],
   * });
   * console.log(data);
   * ```
   */
  export function encodeSetterRatifierData(params: {
    readonly root: Hex;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hex[];
  }) {
    return encodeAbiParameters(setterRatifierDataAbi, [
      params.root as Hex,
      BigInt(params.leafIndex),
      params.proof.map((node) => node as Hex),
    ]);
  }

  /**
   * Decodes SetterRatifier ratifier data.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded Setter ratifier data.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const decoded = OfferTreeUtils.decodeSetterRatifierData("0x" as never);
   * console.log(decoded.proof);
   * ```
   */
  export function decodeSetterRatifierData(
    data: Hex,
  ): DecodedSetterRatifierData {
    const [root, leafIndex, proof] = decodeAbiParameters(
      setterRatifierDataAbi,
      data,
    );

    return deepFreeze({ root, leafIndex, proof: [...proof] });
  }

  /**
   * Verifies a local offer Merkle proof against a root.
   *
   * @param params - Offer proof verification parameters.
   * @returns Whether the proof reconstructs the supplied root.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const valid = OfferTreeUtils.verifyOfferTreeProof({} as never);
   * console.log(valid);
   * ```
   */
  export function verifyOfferTreeProof(params: {
    readonly offer: IOffer | Offer;
    readonly root: Hex;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hex[];
  }) {
    let node = hashOffer(params.offer);
    const leafIndex = BigInt(params.leafIndex);
    if (leafIndex < 0n || leafIndex >> BigInt(params.proof.length) !== 0n) {
      return false;
    }
    let remainingLeafIndex = leafIndex;

    for (const sibling of params.proof) {
      node =
        (remainingLeafIndex & 1n) === 0n
          ? hashNode(node, sibling as Hex)
          : hashNode(sibling as Hex, node);
      remainingLeafIndex >>= 1n;
    }

    return node === params.root;
  }

  /**
   * Builds a SetterRatifier root approval call.
   *
   * @param params - Approval parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const call = OfferTreeUtils.buildSetterRootApprovalCall({
   *   setterRatifier: "0x0000000000000000000000000000000000000001",
   *   maker: "0x0000000000000000000000000000000000000002",
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   * });
   * console.log(call.data);
   * ```
   */
  export function buildSetterRootApprovalCall(params: {
    readonly setterRatifier: Address | string;
    readonly maker: Address | string;
    readonly root: Hex;
    readonly newIsRootRatified?: boolean;
  }): MidnightCall {
    const to = params.setterRatifier as Address;
    const root = params.root as Hex;
    return deepFreeze({
      to,
      data: encodeFunctionData({
        abi: setterRatifierAbi,
        functionName: "setIsRootRatified",
        args: [params.maker as Address, root, params.newIsRootRatified ?? true],
      }),
    });
  }

  /**
   * Builds an EcrecoverRatifier root cancellation call.
   *
   * @param params - Cancellation parameters.
   * @returns Neutral call descriptor.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const call = OfferTreeUtils.buildEcrecoverRootCancellationCall({
   *   ecrecoverRatifier: "0x0000000000000000000000000000000000000001",
   *   maker: "0x0000000000000000000000000000000000000002",
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   * });
   * console.log(call.to);
   * ```
   */
  export function buildEcrecoverRootCancellationCall(params: {
    readonly ecrecoverRatifier: Address | string;
    readonly maker: Address | string;
    readonly root: Hex;
  }): MidnightCall {
    return deepFreeze({
      to: params.ecrecoverRatifier as Address,
      data: encodeFunctionData({
        abi: ecrecoverRatifierAbi,
        functionName: "cancelRoot",
        args: [params.maker as Address, params.root as Hex],
      }),
    });
  }
}
