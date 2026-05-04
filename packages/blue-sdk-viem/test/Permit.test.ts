import { ChainId, Eip5267Domain, Token } from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import {
  type Address,
  createClient,
  custom,
  domainSeparator,
  type EIP1193RequestFn,
  encodeAbiParameters,
  type Hex,
  type TypedDataDomain,
  toHex,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  UnverifiablePermitDomainError,
} from "../src/error.js";
import {
  getPermitTypedData,
  getVerifiedPermitDomain,
} from "../src/signatures/permit.js";

const owner = randomAddress();

const spender = randomAddress();

const permitArgs = (token: Token) => ({
  erc20: token,
  owner,
  spender,
  allowance: 1n,
  nonce: 0n,
  deadline: 1n,
});

// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
const tokenWithDomain = (
  address = randomAddress(),
  fields: `0x${string}` = "0x0f",
  chainId = BigInt(ChainId.EthMainnet),
  verifyingContract = address,
) =>
  new Token({
    address,
    name: "Token",
    eip5267Domain: new Eip5267Domain({
      fields,
      name: "Token",
      version: "1",
      chainId,
      verifyingContract,
      salt: zeroHash,
      extensions: [],
    }),
  });

describe("getPermitTypedData", () => {
  test("uses fetched EIP-5267 domain when bound to the token and chain", () => {
    const token = tokenWithDomain();

    const typedData = getPermitTypedData(permitArgs(token), ChainId.EthMainnet);

    expect(typedData.domain).toStrictEqual({
      name: "Token",
      version: "1",
      chainId: ChainId.EthMainnet,
      verifyingContract: token.address,
    });
  });

  test("uses an explicit verified domain over EIP-5267", () => {
    const token = tokenWithDomain();
    const explicit: TypedDataDomain = {
      name: "Override",
      version: "2",
      chainId: ChainId.EthMainnet,
      verifyingContract: token.address,
    };

    const typedData = getPermitTypedData(
      permitArgs(token),
      ChainId.EthMainnet,
      { domain: explicit },
    );

    expect(typedData.domain).toStrictEqual(explicit);
  });

  test("throws UnverifiablePermitDomainError when no domain is available", () => {
    const address = randomAddress();
    const tokenWithoutDomain = new Token({ address, name: "Token" });

    expect(() =>
      getPermitTypedData(permitArgs(tokenWithoutDomain), ChainId.EthMainnet),
    ).toThrow(new UnverifiablePermitDomainError(address));
  });

  test("throws when an explicit domain points to another token", () => {
    const token = tokenWithDomain();
    const verifyingContract = randomAddress();

    expect(() =>
      getPermitTypedData(permitArgs(token), ChainId.EthMainnet, {
        domain: {
          name: "Token",
          version: "1",
          chainId: ChainId.EthMainnet,
          verifyingContract,
        },
      }),
    ).toThrow(
      new InvalidPermitDomainVerifyingContractError(
        token.address,
        verifyingContract,
      ),
    );
  });

  test("throws when fetched EIP-5267 domain points to another token", () => {
    const token = tokenWithDomain();
    const verifyingContract = randomAddress();
    const tokenWithForeignDomain = tokenWithDomain(
      token.address,
      "0x0f",
      BigInt(ChainId.EthMainnet),
      verifyingContract,
    );

    expect(() =>
      getPermitTypedData(
        permitArgs(tokenWithForeignDomain),
        ChainId.EthMainnet,
      ),
    ).toThrow(
      new InvalidPermitDomainVerifyingContractError(
        token.address,
        verifyingContract,
      ),
    );
  });

  test("throws when fetched EIP-5267 domain points to another chain", () => {
    const token = tokenWithDomain(
      randomAddress(),
      "0x0f",
      BigInt(ChainId.PolygonMainnet),
    );

    expect(() =>
      getPermitTypedData(permitArgs(token), ChainId.EthMainnet),
    ).toThrow(
      new InvalidPermitDomainChainIdError(
        token.address,
        ChainId.EthMainnet,
        ChainId.PolygonMainnet,
      ),
    );
  });

  test("throws when fetched EIP-5267 domain does not bind to a token address", () => {
    const token = tokenWithDomain(randomAddress(), "0x07");

    expect(() =>
      getPermitTypedData(permitArgs(token), ChainId.EthMainnet),
    ).toThrow(
      new InvalidPermitDomainVerifyingContractError(token.address, undefined),
    );
  });

  test("throws when fetched EIP-5267 domain does not bind to a chain", () => {
    const token = tokenWithDomain(randomAddress(), "0x0b");

    expect(() =>
      getPermitTypedData(permitArgs(token), ChainId.EthMainnet),
    ).toThrow(
      new InvalidPermitDomainChainIdError(
        token.address,
        ChainId.EthMainnet,
        undefined,
      ),
    );
  });
});

const ERC20_NAME_SELECTOR = "0x06fdde03";
const ERC2612_DOMAIN_SEPARATOR_SELECTOR = "0x3644e515";

const encodeStringReturn = (value: string): Hex => {
  return encodeAbiParameters([{ type: "string" }], [value]);
};

const mockTokenClient = (
  token: Address,
  responses: { domainSeparator: Hex; name?: string },
) => {
  const request = (async ({ method, params }) => {
    if (method === "eth_chainId") return toHex(mainnet.id);
    if (method === "eth_call") {
      const [{ data, to }] = params as [{ data: Hex; to: Address }];
      if (to.toLowerCase() !== token.toLowerCase())
        throw new Error(`unexpected to: ${to}`);
      if (data.startsWith(ERC2612_DOMAIN_SEPARATOR_SELECTOR))
        return responses.domainSeparator;
      if (data.startsWith(ERC20_NAME_SELECTOR)) {
        if (responses.name == null) throw new Error("name() reverted");
        return encodeStringReturn(responses.name);
      }
      throw new Error(`unexpected call: ${data}`);
    }
    throw new Error(`unexpected method: ${method}`);
  }) as EIP1193RequestFn;

  return createClient({
    chain: mainnet,
    transport: custom({ request }),
  });
};

describe("getVerifiedPermitDomain", () => {
  test("returns knownDomain immediately when bound to token and chain", async () => {
    const token = randomAddress();
    const knownDomain: TypedDataDomain = {
      name: "Whatever",
      version: "9",
      chainId: ChainId.EthMainnet,
      verifyingContract: token,
    };

    // Client is never called because knownDomain short-circuits the discovery.
    const client = createClient({
      chain: mainnet,
      transport: custom({
        request: async () => {
          throw new Error("client should not be called");
        },
      }),
    });

    const domain = await getVerifiedPermitDomain(client, {
      token,
      chainId: ChainId.EthMainnet,
      knownDomain,
    });

    expect(domain).toStrictEqual(knownDomain);
  });

  test("matches default candidate (name, version: '1') against on-chain DOMAIN_SEPARATOR", async () => {
    const token = randomAddress();
    const trueDomain: TypedDataDomain = {
      name: "Random Token",
      version: "1",
      chainId: ChainId.EthMainnet,
      verifyingContract: token,
    };

    const client = mockTokenClient(token, {
      domainSeparator: domainSeparator({ domain: trueDomain }),
      name: "Random Token",
    });

    const domain = await getVerifiedPermitDomain(client, {
      token,
      chainId: ChainId.EthMainnet,
      tokenName: "Random Token",
    });

    expect(domain).toStrictEqual(trueDomain);
  });

  test("matches default candidate (name, version: '2') against on-chain DOMAIN_SEPARATOR", async () => {
    const token = randomAddress();
    const trueDomain: TypedDataDomain = {
      name: "USDC",
      version: "2",
      chainId: ChainId.EthMainnet,
      verifyingContract: token,
    };

    const client = mockTokenClient(token, {
      domainSeparator: domainSeparator({ domain: trueDomain }),
      name: "USDC",
    });

    const domain = await getVerifiedPermitDomain(client, {
      token,
      chainId: ChainId.EthMainnet,
      tokenName: "USDC",
    });

    expect(domain).toStrictEqual(trueDomain);
  });

  test("matches an extra candidate when the on-chain name differs from the EIP-712 name", async () => {
    const token = randomAddress();
    const trueDomain: TypedDataDomain = {
      name: "USD Coin",
      version: "2",
      chainId: ChainId.EthMainnet,
      verifyingContract: token,
    };

    const client = mockTokenClient(token, {
      domainSeparator: domainSeparator({ domain: trueDomain }),
      name: "USDC",
    });

    const domain = await getVerifiedPermitDomain(client, {
      token,
      chainId: ChainId.EthMainnet,
      tokenName: "USDC",
      extraCandidates: [{ name: "USD Coin", version: "2" }],
    });

    expect(domain).toStrictEqual(trueDomain);
  });

  test("returns null when no candidate matches the on-chain DOMAIN_SEPARATOR", async () => {
    const token = randomAddress();
    const otherDomain: TypedDataDomain = {
      name: "Other",
      version: "3",
      chainId: ChainId.EthMainnet,
      verifyingContract: token,
    };

    const client = mockTokenClient(token, {
      domainSeparator: domainSeparator({ domain: otherDomain }),
      name: "Token",
    });

    const domain = await getVerifiedPermitDomain(client, {
      token,
      chainId: ChainId.EthMainnet,
      tokenName: "Token",
    });

    expect(domain).toBeNull();
  });

  test("returns null when DOMAIN_SEPARATOR() reverts", async () => {
    const token = randomAddress();

    const client = createClient({
      chain: mainnet,
      transport: custom({
        request: async ({ method }) => {
          if (method === "eth_chainId") return toHex(mainnet.id);
          throw new Error("DOMAIN_SEPARATOR reverted");
        },
      }),
    });

    const domain = await getVerifiedPermitDomain(client, {
      token,
      chainId: ChainId.EthMainnet,
      tokenName: "Token",
    });

    expect(domain).toBeNull();
  });

  test("falls back to on-chain name() when tokenName is omitted", async () => {
    const token = randomAddress();
    const trueDomain: TypedDataDomain = {
      name: "Discovered",
      version: "1",
      chainId: ChainId.EthMainnet,
      verifyingContract: token,
    };

    const client = mockTokenClient(token, {
      domainSeparator: domainSeparator({ domain: trueDomain }),
      name: "Discovered",
    });

    const domain = await getVerifiedPermitDomain(client, {
      token,
      chainId: ChainId.EthMainnet,
    });

    expect(domain).toStrictEqual(trueDomain);
  });

  test("rejects a knownDomain bound to another chain", async () => {
    const token = randomAddress();

    const client = createClient({
      chain: mainnet,
      transport: custom({
        request: async () => {
          throw new Error("client should not be called");
        },
      }),
    });

    await expect(
      getVerifiedPermitDomain(client, {
        token,
        chainId: ChainId.EthMainnet,
        knownDomain: {
          name: "Token",
          version: "1",
          chainId: ChainId.PolygonMainnet,
          verifyingContract: token,
        },
      }),
    ).rejects.toBeInstanceOf(InvalidPermitDomainChainIdError);
  });
});
