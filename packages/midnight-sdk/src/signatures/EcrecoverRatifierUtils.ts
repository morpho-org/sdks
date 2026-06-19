import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hash,
  type Hex,
  keccak256,
  parseSignature,
  type Signature,
} from "viem";
import { EIP712_DOMAIN_TYPEHASH } from "../constants.js";
import { InvalidTreeError, InvalidTreeHeightError } from "../errors.js";
import type { OfferStruct } from "../offers/index.js";
import type { Item as PayloadItem } from "./Payload.js";
import type { Tree } from "./Tree.js";
import type { TreeProof } from "./TreeUtils.js";

const treeTypeHashes = [
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

const domainSeparatorAbi = [
  { name: "typehash", type: "bytes32" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

const treeStructHashAbi = [
  { name: "typehash", type: "bytes32" },
  { name: "root", type: "bytes32" },
] as const;

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

const buildTreeValue = (offers: readonly OfferStruct[]): unknown => {
  if (offers.length === 1) return offers[0]!;
  const mid = offers.length / 2;
  return [
    buildTreeValue(offers.slice(0, mid)),
    buildTreeValue(offers.slice(mid)),
  ];
};

const getTreeRatifier = (tree: Tree): Address => {
  const offers = tree.offers;
  const firstOffer = offers[0];
  if (firstOffer == null) {
    throw new InvalidTreeError("Tree must contain at least one offer.");
  }

  const ratifier = firstOffer.ratifier;
  const comparableRatifier = ratifier.toLowerCase();
  for (const offer of offers.slice(1)) {
    if (offer.ratifier.toLowerCase() !== comparableRatifier) {
      throw new InvalidTreeError(
        `All offers in an Ecrecover tree must use one ratifier; expected "${ratifier}", got "${offer.ratifier}". Build separate trees per ratifier.`,
      );
    }
  }

  return ratifier;
};

/**
 * Decoded EcrecoverRatifier ratifier data.
 *
 * Use this on the take-side or in diagnostics after `Payload.decode` when you
 * need to inspect the signature and proof attached to an Ecrecover offer.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifierUtils, type DecodedEcrecoverRatifierData } from "@morpho-org/midnight-sdk";
 * import { zeroHash } from "viem";
 *
 * const data = EcrecoverRatifierUtils.encodeRatifierData({
 *   signature: { v: 27, r: zeroHash, s: zeroHash },
 *   root: zeroHash,
 *   leafIndex: 0n,
 *   proof: [],
 * });
 * const decoded: DecodedEcrecoverRatifierData =
 *   EcrecoverRatifierUtils.decodeRatifierData(data);
 * console.log(decoded.signature.v);
 * ```
 */
export interface DecodedEcrecoverRatifierData extends TreeProof {
  /** Ecrecover signature tuple decoded from ratifier data. */
  readonly signature: Signature<number, number> & { readonly v: number };
}

/**
 * Ecrecover typed-data descriptor returned to signing code.
 *
 * Pass this descriptor to the maker wallet before payload encoding. The
 * resulting signature is later embedded into every payload item for the tree.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifierUtils, Offer, Tree, type EcrecoverRatificationTypedData } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   expiry: 3_600n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxUnits: 100n,
 * });
 * const typedData: EcrecoverRatificationTypedData =
 *   EcrecoverRatifierUtils.typedData({
 *     tree: Tree.create([offer]),
 *     chainId: 8453n,
 *   });
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
 * Hex string or viem signature accepted by Ecrecover ratifier helpers.
 *
 * @example
 * ```ts
 * import type { EcrecoverSignatureInput } from "@morpho-org/midnight-sdk";
 *
 * const signature = "0x" as EcrecoverSignatureInput;
 * console.log(signature);
 * ```
 */
export type EcrecoverSignatureInput =
  | Hex
  | Signature
  | Signature<number, number>;

/**
 * Signing callback accepted by Ecrecover ratifier helpers.
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
 * Parameters for {@link EcrecoverRatifierUtils.typedData}.
 *
 * Use these after `Tree.create` and after the maker route has been classified
 * as `ecrecover`.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type EcrecoverRatifierTypedDataParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   expiry: 3_600n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxUnits: 100n,
 * });
 * const params: EcrecoverRatifierTypedDataParams = {
 *   tree: Tree.create([offer]),
 *   chainId: 8453n,
 * };
 * console.log(params.chainId);
 * ```
 */
export interface EcrecoverRatifierTypedDataParams {
  /** Tree being ratified. */
  readonly tree: Tree;
  /** Chain id used by the EIP-712 domain. */
  readonly chainId: BigIntish;
}

/**
 * Parameters for {@link EcrecoverRatifierUtils.ratify}.
 *
 * Use this after tree validation. Provide either a signing callback for the
 * maker wallet or a signature that was produced from `typedData`.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type EcrecoverRatifierRatifyParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress, zeroHash } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   expiry: 3_600n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxUnits: 100n,
 * });
 * const params: EcrecoverRatifierRatifyParams = {
 *   tree: Tree.create([offer]),
 *   signature: { v: 27, r: zeroHash, s: zeroHash },
 * };
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
      /** Tree being ratified. */
      readonly tree: Tree;
      /** Precomputed signature for this tree root. */
      readonly signature: EcrecoverSignatureInput;
      /** Omit when a precomputed signature is supplied. */
      readonly signTypedData?: undefined;
      /** Omit when a precomputed signature is supplied. */
      readonly chainId?: undefined;
    };

/**
 * Parameters for one EcrecoverRatifier ratifier-data value.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type EcrecoverRatifierDataParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress, zeroHash } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [],
 *     maturity: 54_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   expiry: 3_600n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxUnits: 100n,
 * });
 * const params: EcrecoverRatifierDataParams = {
 *   tree: Tree.create([offer]),
 *   leafIndex: 0n,
 *   signature: { v: 27, r: zeroHash, s: zeroHash },
 * };
 * console.log(params.leafIndex);
 * ```
 */
export interface EcrecoverRatifierDataParams {
  /** Tree that produced the proof. */
  readonly tree: Tree;
  /** Leaf index to prove. */
  readonly leafIndex: BigIntish;
  /** Ecrecover signature for the tree root. */
  readonly signature: EcrecoverSignatureInput;
}

/**
 * EcrecoverRatifier-specific pure utilities.
 *
 * Use this route for EOA and EIP-7702 makers. The make-side sequence is:
 * create offers with the Ecrecover ratifier address, build the group/tree,
 * validate the tree, sign the typed data, call `ratify`, then pass the returned
 * items to `Payload.encode`.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(EcrecoverRatifierUtils.treeTypeHash(0));
 * ```
 */
export namespace EcrecoverRatifierUtils {
  /**
   * Returns the Solidity HashLib tree typehash for a tree height.
   *
   * @param height - Tree height.
   * @returns Tree typehash.
   * @throws {InvalidTreeHeightError} when height exceeds 20.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(EcrecoverRatifierUtils.treeTypeHash(0));
   * ```
   */
  export function treeTypeHash(height: number) {
    const typehash = treeTypeHashes[height];
    if (typehash == null) throw new InvalidTreeHeightError(height);

    return typehash;
  }

  /**
   * Builds EcrecoverRatifier typed data for a tree.
   *
   * Use after the tree is built and validated, before requesting the maker's
   * wallet signature. The EIP-712 verifier is derived from the shared ratifier
   * address on the tree offers. `ratify` calls this for you when given
   * `signTypedData`.
   *
   * @param params - Typed-data parameters.
   * @returns EIP-712 typed-data descriptor.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree height is unsupported.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   *
   * const typedData = EcrecoverRatifierUtils.typedData({
   *   tree: Tree.create([offer]),
   *   chainId: 8453n,
   * });
   * console.log(typedData.primaryType);
   * ```
   */
  export function typedData(
    params: EcrecoverRatifierTypedDataParams,
  ): EcrecoverRatificationTypedData {
    const verifyingContract = getTreeRatifier(params.tree);
    const treeType =
      params.tree.height === 0
        ? "Offer"
        : `Offer${"[2]".repeat(params.tree.height)}`;

    return deepFreeze({
      domain: {
        chainId: BigInt(params.chainId),
        verifyingContract,
      },
      types: {
        ...typedDataTypes,
        OfferTree: [{ name: "offerTree", type: treeType }],
      },
      primaryType: "OfferTree",
      message: {
        offerTree: buildTreeValue(params.tree.paddedOffers),
      },
    });
  }

  /**
   * Builds the EcrecoverRatifier digest used by the Solidity ratifier.
   *
   * @param params - Digest parameters.
   * @returns EIP-712 digest.
   * @throws {InvalidTreeError} when the tree contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when height exceeds 20.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   *
   * const digest = EcrecoverRatifierUtils.digest({
   *   tree: Tree.create([offer]),
   *   chainId: 8453n,
   * });
   * console.log(digest);
   * ```
   */
  export function digest(params: EcrecoverRatifierTypedDataParams) {
    const verifyingContract = getTreeRatifier(params.tree);
    const domainSeparator = keccak256(
      encodeAbiParameters(domainSeparatorAbi, [
        EIP712_DOMAIN_TYPEHASH,
        BigInt(params.chainId),
        verifyingContract,
      ]),
    );
    const structHash = keccak256(
      encodeAbiParameters(treeStructHashAbi, [
        treeTypeHash(params.tree.height),
        params.tree.root,
      ]),
    );

    return keccak256(concat(["0x1901", domainSeparator, structHash]));
  }

  /**
   * Signs EcrecoverRatifier typed data through an injected signing callback.
   *
   * Use when app code wants the signature separately from payload item
   * construction. If you only need payload items, call `ratify` with the same
   * `signTypedData` callback.
   *
   * @param params - Signing parameters.
   * @returns Signature returned by the callback.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree height is unsupported.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   *
   * const signature = await EcrecoverRatifierUtils.sign({
   *   tree: Tree.create([offer]),
   *   chainId: 8453n,
   *   signTypedData: () => "0x",
   * });
   * console.log(signature);
   * ```
   */
  export async function sign(
    params: EcrecoverRatifierTypedDataParams & {
      readonly signTypedData: EcrecoverSignTypedData;
    },
  ) {
    return params.signTypedData(typedData(params));
  }

  /**
   * Converts a hex ECDSA signature into the Solidity tuple shape.
   *
   * @param signature - Hex string or tuple signature.
   * @returns Signature tuple.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   * import { zeroHash } from "viem";
   *
   * const signature = EcrecoverRatifierUtils.toSignature({
   *   v: 27,
   *   r: zeroHash,
   *   s: zeroHash,
   * });
   * console.log(signature.v);
   * ```
   */
  export function toSignature(
    signature: EcrecoverSignatureInput,
  ): Signature<number, number> & { readonly v: number } {
    if (typeof signature !== "string") {
      return {
        v:
          signature.v != null
            ? Number(signature.v)
            : Number(signature.yParity) + 27,
        r: signature.r,
        s: signature.s,
      };
    }

    const parsed = parseSignature(signature);
    return {
      v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
      r: parsed.r,
      s: parsed.s,
    };
  }

  /**
   * Encodes EcrecoverRatifier ratifier data.
   *
   * Use only when you already have a signature and proof. Most maker flows call
   * `ratifierData` for one leaf or `ratify` for every leaf in the tree.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = EcrecoverRatifierUtils.encodeRatifierData({
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
  export function encodeRatifierData(params: {
    readonly signature: Signature | Signature<number, number>;
    readonly root: Hash;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hash[];
  }) {
    const signature = toSignature(params.signature);

    return encodeAbiParameters(signatureAbi, [
      {
        v: signature.v,
        r: signature.r,
        s: signature.s,
      },
      params.root,
      BigInt(params.leafIndex),
      params.proof,
    ]);
  }

  /**
   * Decodes EcrecoverRatifier ratifier data.
   *
   * Use on the take-side or in tests after `Payload.decode` to inspect the
   * proof/signature attached to a published offer.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded Ecrecover ratifier data.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
   * import { zeroHash } from "viem";
   *
   * const data = EcrecoverRatifierUtils.encodeRatifierData({
   *   signature: { v: 27, r: zeroHash, s: zeroHash },
   *   root: zeroHash,
   *   leafIndex: 0n,
   *   proof: [],
   * });
   * const decoded = EcrecoverRatifierUtils.decodeRatifierData(data);
   * console.log(decoded.leafIndex);
   * ```
   */
  export function decodeRatifierData(data: Hex): DecodedEcrecoverRatifierData {
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
   * Builds one ratifier-data value for a tree leaf.
   *
   * Use after a tree has been signed when a caller needs data for one offer
   * leaf. Use `ratify` to produce payload-ready items for the whole tree.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded EcrecoverRatifier data.
   * @throws {InvalidTreeError} when the leaf index is outside the tree.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Offer, Tree } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const data = EcrecoverRatifierUtils.ratifierData({
   *   tree: Tree.create([offer]),
   *   leafIndex: 0n,
   *   signature: { v: 27, r: zeroHash, s: zeroHash },
   * });
   * console.log(data);
   * ```
   */
  export function ratifierData(params: EcrecoverRatifierDataParams): Hex {
    const proof = params.tree.proof(params.leafIndex);

    return encodeRatifierData({
      signature: toSignature(params.signature),
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
    });
  }

  /**
   * Signs or consumes a tree signature and returns payload-ready items.
   *
   * Use after `MidnightApi.validateMempoolTree` and before `Payload.encode`.
   * The returned items preserve tree leaf order and include ratifier data
   * required by takers. The group id is stored on each inline offer.
   *
   * @param params - Ratification parameters.
   * @returns Items containing each offer and its ratifier data.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree height is unsupported.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   *
   * const items = await EcrecoverRatifierUtils.ratify({
   *   tree: Tree.create([offer]),
   *   signature: {
   *     v: 27,
   *     r: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *     s: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   },
   * });
   * console.log(items.length);
   * ```
   */
  export async function ratify(
    params: EcrecoverRatifierRatifyParams,
  ): Promise<readonly PayloadItem[]> {
    let signature: Signature<number, number> & { readonly v: number };
    if (params.signature != null) {
      getTreeRatifier(params.tree);
      signature = toSignature(params.signature);
    } else {
      signature = toSignature(await params.signTypedData(typedData(params)));
    }
    const items: PayloadItem[] = [];

    for (const offer of params.tree.offers) {
      items.push({
        offer,
        ratifierData: ratifierData({
          tree: params.tree,
          leafIndex: items.length,
          signature,
        }),
      });
    }

    return items;
  }
}
