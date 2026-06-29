import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Account,
  type Address,
  type Chain,
  type Client,
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hash,
  type Hex,
  keccak256,
  parseSignature,
  type Signature,
  type Transport,
  verifyTypedData,
} from "viem";
import { signTypedData } from "viem/actions";
import { EIP712_DOMAIN_TYPEHASH } from "../constants.js";
import {
  InvalidTreeError,
  InvalidTreeHeightError,
  InvalidTypedDataSignatureError,
} from "../errors.js";
import type { OfferStruct } from "../offers/index.js";
import type { Item as PayloadItem } from "./Payload.js";
import type { Tree } from "./Tree.js";
import type { TreeProof } from "./TreeUtils.js";

const treeTypeHashes = [
  "0x004abfc3a2bdb852bd9e193d58623de158d293bff8df82b2c73762b1449a92da",
  "0x2b907b506023b7da998b4e05205998675021a6698538b52812412353ba1b5b07",
  "0xf3a8fa1ea464758633ee72dfd7bc109d92c69933b1d626583d37c1adc22431f4",
  "0xc7aee773c7436e1047be687b497f42b5d2195ebcf80278aa902f65b99ea8d5f9",
  "0x1ccd280d009a28babd35e45c7ea1bacc4abecbace69d6ca43bd297618af0d6ea",
  "0x976e461f282292a9fc669ed6f8642da97b0853348b8d3b64caf1a63d74535062",
  "0xa16c55d7ca5db454b6c0466c695febf8df2b4084481546a26383a48fb573f20b",
  "0x15fa4f24cac8ee8dbbc17465043a62700395a7c75c4cc475fe241b6a3424b8bb",
  "0x9bf198023231a1c26072e32ee84aa2ed6a1766ca348cceab9bc1065487b6dc82",
  "0x7d723919779d24dfca798d2847418afb9d07dccc8aeed8db0f2e54a765e59630",
  "0xd50fde6271f599771c124dc4d2f3058693c7ef675e733ceffb870fe5f2941524",
  "0xb1c8d8455bf9b0d65722bc605488eedaf3ca18e32f386c366083af360aed575c",
  "0x62306a7da75b4151cbc5a8c2be14ebd9ef413988ceb26330c2b85ea75df64761",
  "0x4c05f804d2f0a7edc5d767492018eae312b6f8f9649222f8e7a78745783cd45d",
  "0x968c3e8fe32537b97318f74ff109f7e6efa365f25048fc48f474d10981e5d03a",
  "0x9c4b06c4bc414cd5ffb0b3d71fd1450393e79bbe73405f2770ee4489175cf734",
  "0xe225a68d5feb03db447cc58f3a0ff567cfe7446a73cad24e1781a33696066e90",
  "0xa9ef83c85cdc9f01279a32350b39d1e350a51ee9f236a9e6d1be764ec67d2b12",
  "0x083f794c8751fba472222de46673bb4386de88d05495f9d2f2c40d96020a95b3",
  "0xdfc36aba879c79d4ce19d8620a560d41d19bc9b315758ec93c651e92115d238b",
  "0x60f9befb3ea1715092407b29ec59829d55544c89bcd5bde861fef413f2072ddd",
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
    { name: "liquidationCursor", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
  Market: [
    { name: "chainId", type: "uint256" },
    { name: "midnight", type: "address" },
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
    { name: "continuousFeeCap", type: "uint256" },
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
 * Pass this descriptor to the maker or authorized signer before payload
 * encoding. The resulting signature is later embedded into every payload item
 * for the tree.
 *
 * @example
 * ```ts
 * import { EcrecoverRatifierUtils, Offer, Tree, type EcrecoverRatificationTypedData } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
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
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
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
 * Use this after tree validation. Provide either a signing client plus account
 * or a signature that was produced from `typedData`.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type EcrecoverRatifierRatifyParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress, zeroHash } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
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
  | {
      /** Tree being ratified. */
      readonly tree: Tree;
      /** Viem client whose transport signs the typed data built from `tree`. */
      readonly client: Client<Transport, Chain, Account | undefined>;
      /** Account that signs the tree root. It may be the maker or an address authorized by each maker. */
      readonly account: Account | Address;
      /** Omit when the SDK should request the signature through `client`. */
      readonly signature?: undefined;
    }
  | {
      /** Tree being ratified. */
      readonly tree: Tree;
      /** Precomputed signature for this tree root. */
      readonly signature: EcrecoverSignatureInput;
      /** Omit when a precomputed signature is supplied. */
      readonly client?: undefined;
      /** Omit when a precomputed signature is supplied. */
      readonly account?: undefined;
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
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
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
 * items to `Payload.encode`. Ecrecover trees must contain one ratifier; split
 * trees by ratifier before signing. The signer may be the maker or an address
 * authorized by every maker in the tree.
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
   * Use after the tree is built and validated, before requesting the signer
   * signature. The EIP-712 verifier is derived from the shared ratifier address
   * on the tree offers. `ratify` calls this for you when given a client and
   * account.
   *
   * @param params.tree - Ecrecover-ratified offer tree to sign.
   * @param params.chainId - EIP-155 chain id included in the EIP-712 domain.
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
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
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
   * @param params.tree - Ecrecover-ratified offer tree to hash.
   * @param params.chainId - EIP-155 chain id included in the EIP-712 domain.
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
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
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
   * Signs EcrecoverRatifier typed data through a viem client.
   *
   * Use when app code wants the signature separately from payload item
   * construction. If you only need payload items, call `ratify` with the same
   * client and account. The account may be the maker or an address authorized
   * by every maker in the tree; the protocol checks that authorization onchain.
   *
   * @param params.tree - Ecrecover-ratified offer tree to sign.
   * @param params.client - Viem client whose transport signs the tree typed data.
   * @param params.account - Account used to sign the tree typed data.
   * @returns Signature returned by the client.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree height is unsupported.
   * @throws {InvalidTypedDataSignatureError} when the returned signature does not recover to `params.account`.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { createWalletClient, http, zeroAddress } from "viem";
   * import { base } from "viem/chains";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
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
   * const client = createWalletClient({
   *   chain: base,
   *   transport: http(),
   * });
   *
   * const signature = await EcrecoverRatifierUtils.sign({
   *   tree: Tree.create([offer]),
   *   client,
   *   account: offer.maker,
   * });
   * console.log(signature);
   * ```
   */
  export async function sign(params: {
    readonly tree: Tree;
    readonly client: Client<Transport, Chain, Account | undefined>;
    readonly account: Account | Address;
  }): Promise<Hex> {
    const signer =
      typeof params.account === "string"
        ? params.account
        : params.account.address;
    const data = typedData({
      tree: params.tree,
      chainId: params.client.chain.id,
    });

    const signature = await signTypedData<
      Record<string, unknown>,
      "OfferTree",
      Chain,
      Account | undefined
    >(params.client, {
      account: params.account,
      ...data,
    });

    const isValidSignature = await verifyTypedData<
      Record<string, unknown>,
      "OfferTree"
    >({
      ...data,
      address: signer,
      signature,
    });

    if (!isValidSignature) throw new InvalidTypedDataSignatureError(signer);

    return signature;
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
   * @param params.signature - Signature tuple encoded into the ratifier data.
   * @param params.root - Merkle root approved by the signature.
   * @param params.leafIndex - Leaf index proven by `params.proof`.
   * @param params.proof - Merkle proof siblings for the leaf.
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
   * @param params.tree - Ecrecover-ratified offer tree that produced the proof.
   * @param params.leafIndex - Leaf index to prove.
   * @param params.signature - Ecrecover signature for the tree root.
   * @returns ABI-encoded EcrecoverRatifier data.
   * @throws {InvalidTreeError} when the leaf index is outside the tree or the tree contains multiple ratifiers.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Offer, Tree } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
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
    getTreeRatifier(params.tree);
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
   * Use after `Tree.mempoolValidate` and before `Payload.encode`.
   * The returned items preserve tree leaf order and include ratifier data
   * required by takers. The group id is stored on each inline offer.
   *
   * @param params.tree - Ecrecover-ratified offer tree to ratify.
   * @param params.client - Optional viem client whose transport signs typed data built from `params.tree`.
   * @param params.account - Optional account used to sign typed data built from `params.tree`.
   * @param params.signature - Optional precomputed signature for `params.tree`.
   * @returns Items containing each offer and its ratifier data.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree height is unsupported.
   * @throws {InvalidTypedDataSignatureError} when client signing returns a signature that does not recover to `params.account`.
   * @example
   * ```ts
   * import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { createWalletClient, http, zeroAddress } from "viem";
   * import { base } from "viem/chains";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
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
   * const client = createWalletClient({
   *   chain: base,
   *   transport: http(),
   * });
   *
   * const items = await EcrecoverRatifierUtils.ratify({
   *   tree: Tree.create([offer]),
   *   client,
   *   account: offer.maker,
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
      signature = toSignature(await sign(params));
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
