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
  "0xc27c38e446b48c820ab9c4373dc63a4a750a08165cb4bb488206ebabe045d650",
  "0x4e15d8736f4406e07bf9844b1653474472a827130c61e899bf1f574a88b8d987",
  "0x46d107447b480c38ef5b7f54603dba0cb23b887f302b01a998b9d8a80320dd53",
  "0xd1f3607a8e81454bb3baf5f898274ab47541fffc690278a74f13e174e116be72",
  "0xb2d98adca9d116c9bc02ce59ec599ac3c2d33db1c0d1217c7e411d9198d427be",
  "0x5931e0597fcf986027f3118b2495a9ac22139d133f9ad2c2198e6738dc3886c5",
  "0x3967d37928614a085b47e8758fbc3869a8aed63bdf60ccee8536ff2b5064da06",
  "0xd6b9f5f45915a260f6e521d9b40f86c385730b6bc330590fcde212e2fea64263",
  "0x080caa519dbd5328c119d9907e0fa3d9a50dc2ae4bf6dd42c93c100dbc89b51a",
  "0x45da471048924165ea2ad1855ba940e454b486e71dcf1666c71a928c8844c419",
  "0xa49a9434fc1836bd08097368325b31039b6a0fd44919f53e4d8f4bf814084cb0",
  "0xd3e93e4525132f0187a6964dc01fef33fde414538ffd212e9f2f478c3263e0a0",
  "0x25990db2d26547f92c711988300df317af57bad5cd5d9d8e787a82f95c929474",
  "0x8e0c648afa977572ead40a1d10a6db2c425b8099545006d834a7b849c6166643",
  "0x4b635250efa6243e277fdd0cf6df993c2943b64f10f3a0756ceb1f47ef8f9b18",
  "0xbde1c927f6222c07c8df264e68b42b8382c7c2b85f4729e0df94297cfeebfa91",
  "0x4d58aea1a67f94be21ab1415bf3b602592430eb9112268fd0fc4e141b1a35e76",
  "0x14c03281bce13010b158e5a4a3378be394ac9e16118aedb17d82ced51e66836c",
  "0x99fd3e76f43b2cc221cb9860bc6c96cda95af3fa07ef5f04e071b54aa9386d06",
  "0x1b1c2f1a04968094d8d0453d49838f7a809d1202ae04a1c2e0964e442ff7988b",
  "0xc8ccd3cb3267dd76f563584920ac60f2283b719917481b85fe5e10b754932455",
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
