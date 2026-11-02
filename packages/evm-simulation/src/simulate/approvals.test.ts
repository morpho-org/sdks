import {
  blueAbi,
  midnightEventsAbi,
  permit2Abi,
} from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  erc721Abi,
  getAddress,
  type Hex,
  isHex,
  zeroAddress,
} from "viem";
import { expect, test } from "vitest";
import type { SimulationAuthorization } from "../authorizations.js";
import {
  ApprovalCheckUnavailableError,
  UnexpectedMidnightAuthorizationError,
  UnexpectedMorphoAuthorizationError,
  UnexpectedTokenApprovalError,
} from "../errors.js";
import type { ApprovalLimit } from "../limits.js";
import type { RawLog } from "../types.js";
import { assertApprovalEvents, assertPendingApprovals } from "./approvals.js";

const OWNER: Address = "0x1111111111111111111111111111111111111111";
const OTHER: Address = "0x2222222222222222222222222222222222222222";
const SPENDER: Address = "0x3333333333333333333333333333333333333333";
const TOKEN: Address = "0x4444444444444444444444444444444444444444";
const MORPHO: Address = "0x5555555555555555555555555555555555555555";
const PERMIT2: Address = "0x6666666666666666666666666666666666666666";
const MIDNIGHT: Address = "0x7777777777777777777777777777777777777777";
const ECRECOVER_AUTHORIZER: Address =
  "0x8888888888888888888888888888888888888888";
const ADDRESSES = {
  morpho: MORPHO,
  permit2: PERMIT2,
  midnight: MIDNIGHT,
  ecrecoverAuthorizer: ECRECOVER_AUTHORIZER,
} as const;
const PERMIT2_WITHOUT_REGISTRY: Address = getAddress(
  "0x000000000022D473030F116dDEE9F6B43aC78BA3",
);

const normalizeTopics = (topics: readonly unknown[]): readonly Hex[] =>
  topics.flatMap((topic) => {
    if (isHex(topic)) return [topic];
    return Array.isArray(topic) ? topic.filter((value) => isHex(value)) : [];
  });

const rawLog = (
  encoded: { readonly topics: readonly Hex[]; readonly data: Hex },
  address: Address,
): RawLog => ({ ...encoded, address });

const erc20Approval = (params: {
  readonly eventOwner: Address;
  readonly spender: Address;
  readonly value: bigint;
  readonly address?: Address;
}): RawLog =>
  rawLog(
    {
      topics: normalizeTopics(
        encodeEventTopics({
          abi: erc20Abi,
          eventName: "Approval",
          args: { owner: params.eventOwner, spender: params.spender },
        }),
      ),
      data: encodeAbiParameters([{ type: "uint256" }] as const, [params.value]),
    },
    params.address ?? TOKEN,
  );

const erc721Approval = (params: {
  readonly eventOwner: Address;
  readonly approved: Address;
  readonly address?: Address;
}): RawLog =>
  rawLog(
    {
      topics: normalizeTopics(
        encodeEventTopics({
          abi: erc721Abi,
          eventName: "Approval",
          args: {
            owner: params.eventOwner,
            spender: params.approved,
            tokenId: 7n,
          },
        }),
      ),
      data: "0x",
    },
    params.address ?? TOKEN,
  );

const approvalForAll = (params: {
  readonly eventOwner: Address;
  readonly operator: Address;
  readonly approved: boolean;
}): RawLog =>
  rawLog(
    {
      topics: normalizeTopics(
        encodeEventTopics({
          abi: erc721Abi,
          eventName: "ApprovalForAll",
          args: { owner: params.eventOwner, operator: params.operator },
        }),
      ),
      data: encodeAbiParameters([{ type: "bool" }] as const, [params.approved]),
    },
    TOKEN,
  );

const permit2Approval = (params: {
  readonly eventOwner: Address;
  readonly spender: Address;
  readonly amount: bigint;
  readonly address?: Address;
}): RawLog =>
  rawLog(
    {
      topics: normalizeTopics(
        encodeEventTopics({
          abi: permit2Abi,
          eventName: "Approval",
          args: {
            owner: params.eventOwner,
            token: TOKEN,
            spender: params.spender,
          },
        }),
      ),
      data: encodeAbiParameters(
        [{ type: "uint160" }, { type: "uint48" }] as const,
        [params.amount, 1_000],
      ),
    },
    params.address ?? PERMIT2,
  );

const permit2Permit = (params: {
  readonly eventOwner: Address;
  readonly spender: Address;
  readonly amount: bigint;
  readonly address?: Address;
}): RawLog =>
  rawLog(
    {
      topics: normalizeTopics(
        encodeEventTopics({
          abi: permit2Abi,
          eventName: "Permit",
          args: {
            owner: params.eventOwner,
            token: TOKEN,
            spender: params.spender,
          },
        }),
      ),
      data: encodeAbiParameters(
        [{ type: "uint160" }, { type: "uint48" }, { type: "uint48" }] as const,
        [params.amount, 1_000, 1],
      ),
    },
    params.address ?? PERMIT2,
  );

const setAuthorization = (params: {
  readonly authorizer: Address;
  readonly authorized: Address;
  readonly newIsAuthorized: boolean;
  readonly address?: Address;
}): RawLog =>
  rawLog(
    {
      topics: normalizeTopics(
        encodeEventTopics({
          abi: blueAbi,
          eventName: "SetAuthorization",
          args: {
            caller: OWNER,
            authorizer: params.authorizer,
            authorized: params.authorized,
          },
        }),
      ),
      data: encodeAbiParameters([{ type: "bool" }] as const, [
        params.newIsAuthorized,
      ]),
    },
    params.address ?? MORPHO,
  );

const setIsAuthorized = (params: {
  readonly caller?: Address;
  readonly onBehalf: Address;
  readonly authorized: Address;
  readonly newIsAuthorized: boolean;
  readonly address?: Address;
}): RawLog =>
  rawLog(
    {
      topics: normalizeTopics(
        encodeEventTopics({
          abi: midnightEventsAbi,
          eventName: "SetIsAuthorized",
          args: {
            caller: params.caller ?? OTHER,
            authorized: params.authorized,
            onBehalf: params.onBehalf,
          },
        }),
      ),
      data: encodeAbiParameters([{ type: "bool" }] as const, [
        params.newIsAuthorized,
      ]),
    },
    params.address ?? MIDNIGHT,
  );

const limits: readonly ApprovalLimit[] = [
  { type: "token", token: TOKEN, owner: OWNER, spender: SPENDER },
  { type: "morphoAuthorization", authorizer: OWNER, authorized: SPENDER },
  { type: "midnightAuthorization", onBehalf: OWNER, authorized: SPENDER },
];

const assertEvents = (logs: readonly RawLog[], allowed = limits) =>
  assertApprovalEvents({ logs, owner: OWNER, allowed, addresses: ADDRESSES });

test("rejects sender ERC-20 approvals, accepts other owners, zero and explicit entries", () => {
  expect(() =>
    assertEvents(
      [erc20Approval({ eventOwner: OWNER, spender: OTHER, value: 2n })],
      [],
    ),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertEvents(
      [
        erc20Approval({
          eventOwner: getAddress(OTHER),
          spender: OTHER,
          value: 2n,
        }),
      ],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents(
      [
        erc20Approval({
          eventOwner: getAddress(OWNER),
          spender: OTHER,
          value: 2n,
        }),
      ],
      [],
    ),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertEvents(
      [erc20Approval({ eventOwner: OWNER, spender: OTHER, value: 0n })],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents([
      erc20Approval({ eventOwner: OWNER, spender: SPENDER, value: 2n }),
    ]),
  ).not.toThrow();
});

test("rejects ERC-721 token and operator approvals, but accepts revocations", () => {
  expect(() =>
    assertEvents([erc721Approval({ eventOwner: OWNER, approved: SPENDER })]),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertEvents([
      erc721Approval({ eventOwner: OWNER, approved: zeroAddress }),
    ]),
  ).not.toThrow();
  expect(() =>
    assertEvents([
      approvalForAll({ eventOwner: OWNER, operator: SPENDER, approved: true }),
    ]),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertEvents([
      approvalForAll({ eventOwner: OWNER, operator: SPENDER, approved: false }),
    ]),
  ).not.toThrow();
  expect(() =>
    assertEvents([
      approvalForAll({ eventOwner: OTHER, operator: SPENDER, approved: true }),
    ]),
  ).not.toThrow();
});

test("checks Permit2 Approval and Permit events only from the registered emitter", () => {
  expect(() =>
    assertEvents(
      [permit2Approval({ eventOwner: OWNER, spender: OTHER, amount: 2n })],
      [],
    ),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertEvents(
      [permit2Permit({ eventOwner: OWNER, spender: OTHER, amount: 2n })],
      [],
    ),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertEvents(
      [
        permit2Approval({
          eventOwner: OWNER,
          spender: OTHER,
          amount: 2n,
          address: TOKEN,
        }),
      ],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents(
      [
        permit2Permit({
          eventOwner: OWNER,
          spender: OTHER,
          amount: 2n,
          address: TOKEN,
        }),
      ],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents(
      [permit2Approval({ eventOwner: OWNER, spender: OTHER, amount: 0n })],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents([
      permit2Permit({ eventOwner: OWNER, spender: OTHER, amount: 0n }),
    ]),
  ).not.toThrow();
  expect(() =>
    assertEvents(
      [permit2Approval({ eventOwner: OTHER, spender: OTHER, amount: 2n })],
      [],
    ),
  ).not.toThrow();
});

test("checks Permit2 events from any emitter when no Permit2 address is registered", () => {
  const addresses = { morpho: MORPHO } as const;
  const assertEventsWithoutRegisteredPermit2 = (
    logs: readonly RawLog[],
    allowed = limits,
  ) =>
    assertApprovalEvents({
      logs,
      owner: OWNER,
      allowed,
      addresses,
    });

  expect(() =>
    assertEventsWithoutRegisteredPermit2([
      permit2Approval({
        eventOwner: OWNER,
        spender: OTHER,
        amount: 2n,
        address: PERMIT2_WITHOUT_REGISTRY,
      }),
    ]),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertEventsWithoutRegisteredPermit2([
      permit2Approval({
        eventOwner: OWNER,
        spender: SPENDER,
        amount: 2n,
        address: PERMIT2_WITHOUT_REGISTRY,
      }),
    ]),
  ).not.toThrow();
});

test("checks Morpho authorizations only from Morpho and accepts revocations", () => {
  expect(() =>
    assertEvents(
      [
        setAuthorization({
          authorizer: OWNER,
          authorized: OTHER,
          newIsAuthorized: true,
        }),
      ],
      [],
    ),
  ).toThrow(UnexpectedMorphoAuthorizationError);
  expect(() =>
    assertEvents(
      [
        setAuthorization({
          authorizer: OWNER,
          authorized: OTHER,
          newIsAuthorized: true,
          address: TOKEN,
        }),
      ],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents(
      [
        setAuthorization({
          authorizer: OWNER,
          authorized: OTHER,
          newIsAuthorized: false,
        }),
      ],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents(
      [
        setAuthorization({
          authorizer: OTHER,
          authorized: OTHER,
          newIsAuthorized: true,
        }),
      ],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents([
      setAuthorization({
        authorizer: OWNER,
        authorized: SPENDER,
        newIsAuthorized: true,
      }),
    ]),
  ).not.toThrow();
});

test("checks Midnight authorizations only from Midnight and accepts revocations", () => {
  const grant = setIsAuthorized({
    onBehalf: OWNER,
    authorized: OTHER,
    newIsAuthorized: true,
  });
  const error = (() => {
    try {
      assertEvents([grant], []);
    } catch (caught) {
      return caught;
    }
  })();
  expect(error).toBeInstanceOf(UnexpectedMidnightAuthorizationError);
  expect(error).toMatchObject({ onBehalf: OWNER, authorized: OTHER });
  expect(() =>
    assertEvents(
      [
        grant,
        setIsAuthorized({
          onBehalf: OWNER,
          authorized: OTHER,
          newIsAuthorized: false,
        }),
      ],
      [],
    ),
  ).toThrow(UnexpectedMidnightAuthorizationError);
  expect(() =>
    assertEvents(
      [
        setIsAuthorized({
          onBehalf: OWNER,
          authorized: OTHER,
          newIsAuthorized: false,
        }),
        setIsAuthorized({
          onBehalf: OTHER,
          authorized: OTHER,
          newIsAuthorized: true,
        }),
        setIsAuthorized({
          onBehalf: OWNER,
          authorized: OTHER,
          newIsAuthorized: true,
          address: TOKEN,
        }),
      ],
      [],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents(
      [grant],
      [{ type: "midnightAuthorization", onBehalf: OWNER, authorized: OTHER }],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents(
      [grant],
      [{ type: "morphoAuthorization", authorizer: OWNER, authorized: OTHER }],
    ),
  ).toThrow(UnexpectedMidnightAuthorizationError);
  expect(() =>
    assertApprovalEvents({
      logs: [grant],
      owner: OWNER,
      allowed: [],
      addresses: { morpho: MORPHO },
    }),
  ).not.toThrow();
  expect(() => assertEvents([{ ...grant, data: "0x" }], [])).toThrow(
    ApprovalCheckUnavailableError,
  );
});

test("matches Midnight authorizations by onBehalf and authorized", () => {
  const grant = setIsAuthorized({
    onBehalf: OWNER,
    authorized: OTHER,
    newIsAuthorized: true,
  });
  expect(() =>
    assertEvents(
      [grant],
      [
        {
          type: "midnightAuthorization",
          onBehalf: OTHER,
          authorized: OTHER,
        },
      ],
    ),
  ).toThrow(UnexpectedMidnightAuthorizationError);
});

test("checks grants made by the sender on another account", () => {
  const grant = setIsAuthorized({
    caller: OWNER,
    onBehalf: OTHER,
    authorized: SPENDER,
    newIsAuthorized: true,
  });
  const error = (() => {
    try {
      assertEvents([grant], []);
    } catch (caught) {
      return caught;
    }
  })();
  expect(error).toBeInstanceOf(UnexpectedMidnightAuthorizationError);
  expect(error).toMatchObject({
    onBehalf: OTHER,
    authorized: SPENDER,
  });
  expect(() =>
    assertEvents(
      [grant],
      [
        {
          type: "midnightAuthorization",
          onBehalf: OTHER,
          authorized: SPENDER,
        },
      ],
    ),
  ).not.toThrow();
  expect(() =>
    assertEvents(
      [
        setIsAuthorized({
          caller: OWNER,
          onBehalf: OTHER,
          authorized: SPENDER,
          newIsAuthorized: false,
        }),
      ],
      [],
    ),
  ).not.toThrow();
});

test("checks pending token and Morpho authorizations against the same allowlist", () => {
  const tokenAuthorization: SimulationAuthorization = {
    type: "erc20Approval",
    token: TOKEN,
    owner: OWNER,
    spender: SPENDER,
    amount: 1n,
  };
  const permit: SimulationAuthorization = {
    type: "erc2612Permit",
    typedData: {
      domain: { chainId: 1, verifyingContract: TOKEN },
      primaryType: "Permit",
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      message: {
        owner: OWNER,
        spender: SPENDER,
        value: 1n,
        nonce: 0n,
        deadline: 1_000n,
      },
    },
  };
  const permit2: SimulationAuthorization = {
    type: "permit2SignatureTransfer",
    owner: OWNER,
    typedData: {
      domain: { chainId: 1, verifyingContract: PERMIT2 },
      primaryType: "PermitTransferFrom",
      types: {
        PermitTransferFrom: [
          { name: "permitted", type: "TokenPermissions" },
          { name: "spender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
        TokenPermissions: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
      message: {
        permitted: { token: TOKEN, amount: 1n },
        spender: SPENDER,
        nonce: 0n,
        deadline: 1_000n,
      },
    },
  };
  const authorization: SimulationAuthorization = {
    type: "blueAuthorization",
    authorizer: OWNER,
    authorized: SPENDER,
    isAuthorized: true,
  };
  const authorizationSignature: SimulationAuthorization = {
    type: "blueAuthorizationSignature",
    typedData: {
      domain: { chainId: 1, verifyingContract: MORPHO },
      primaryType: "Authorization",
      types: {
        Authorization: [
          { name: "authorizer", type: "address" },
          { name: "authorized", type: "address" },
          { name: "isAuthorized", type: "bool" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      message: {
        authorizer: OWNER,
        authorized: SPENDER,
        isAuthorized: true,
        nonce: 0n,
        deadline: 1_000n,
      },
    },
  };
  const midnightAuthorizationSignature: SimulationAuthorization = {
    type: "midnightAuthorizationSignature",
    typedData: {
      domain: { chainId: 1, verifyingContract: ECRECOVER_AUTHORIZER },
      primaryType: "Authorization",
      types: {
        Authorization: [
          { name: "authorizer", type: "address" },
          { name: "authorized", type: "address" },
          { name: "isAuthorized", type: "bool" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      message: {
        authorizer: OWNER,
        authorized: SPENDER,
        isAuthorized: true,
        nonce: 1n,
        deadline: 1_000n,
      },
    },
  };
  expect(() =>
    assertPendingApprovals({
      authorizations: [
        tokenAuthorization,
        permit,
        permit2,
        authorization,
        authorizationSignature,
        midnightAuthorizationSignature,
      ],
      allowed: limits,
      addresses: ADDRESSES,
    }),
  ).not.toThrow();
  expect(() =>
    assertPendingApprovals({
      authorizations: [
        { ...authorization, authorized: OTHER, isAuthorized: false },
        {
          ...authorizationSignature,
          typedData: {
            ...authorizationSignature.typedData,
            message: {
              ...authorizationSignature.typedData.message,
              authorized: OTHER,
              isAuthorized: false,
            },
          },
        },
        {
          ...midnightAuthorizationSignature,
          typedData: {
            ...midnightAuthorizationSignature.typedData,
            message: {
              ...midnightAuthorizationSignature.typedData.message,
              isAuthorized: false,
            },
          },
        },
      ],
      allowed: [],
      addresses: ADDRESSES,
    }),
  ).not.toThrow();
  expect(() =>
    assertPendingApprovals({
      authorizations: [{ ...tokenAuthorization, spender: OTHER }],
      allowed: limits,
      addresses: ADDRESSES,
    }),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertPendingApprovals({
      authorizations: [
        {
          ...permit,
          typedData: {
            ...permit.typedData,
            message: { ...permit.typedData.message, spender: OTHER },
          },
        },
      ],
      allowed: limits,
      addresses: ADDRESSES,
    }),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertPendingApprovals({
      authorizations: [
        {
          ...permit2,
          typedData: {
            ...permit2.typedData,
            message: { ...permit2.typedData.message, spender: OTHER },
          },
        },
      ],
      allowed: limits,
      addresses: ADDRESSES,
    }),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertPendingApprovals({
      authorizations: [
        {
          ...authorizationSignature,
          typedData: {
            ...authorizationSignature.typedData,
            message: {
              ...authorizationSignature.typedData.message,
              authorized: OTHER,
            },
          },
        },
      ],
      allowed: limits,
      addresses: ADDRESSES,
    }),
  ).toThrow(UnexpectedMorphoAuthorizationError);
  expect(() =>
    assertPendingApprovals({
      authorizations: [
        {
          ...midnightAuthorizationSignature,
          typedData: {
            ...midnightAuthorizationSignature.typedData,
            message: {
              ...midnightAuthorizationSignature.typedData.message,
              authorized: OTHER,
            },
          },
        },
      ],
      allowed: limits,
      addresses: ADDRESSES,
    }),
  ).toThrow(UnexpectedMidnightAuthorizationError);
  expect(() =>
    assertPendingApprovals({
      authorizations: [midnightAuthorizationSignature],
      allowed: limits,
      addresses: { ...ADDRESSES, ecrecoverAuthorizer: OTHER },
    }),
  ).toThrow(
    expect.objectContaining({
      name: "UnexpectedMidnightAuthorizationError",
      allowlistable: false,
    }),
  );
  expect(() =>
    assertPendingApprovals({
      authorizations: [
        { ...tokenAuthorization, amount: 0n },
        {
          ...permit,
          typedData: {
            ...permit.typedData,
            message: { ...permit.typedData.message, value: 0n },
          },
        },
        {
          ...permit2,
          typedData: {
            ...permit2.typedData,
            message: {
              ...permit2.typedData.message,
              permitted: { token: TOKEN, amount: 0n },
            },
          },
        },
      ],
      allowed: [],
      addresses: ADDRESSES,
    }),
  ).not.toThrow();
  expect(() =>
    assertPendingApprovals({
      authorizations: [{ ...authorization, authorized: OTHER }],
      allowed: limits,
      addresses: ADDRESSES,
    }),
  ).toThrow(UnexpectedMorphoAuthorizationError);
  expect(() =>
    assertPendingApprovals({
      authorizations: [{ ...authorization, isAuthorized: false }],
      allowed: [],
      addresses: ADDRESSES,
    }),
  ).not.toThrow();
  expect(() =>
    assertPendingApprovals({
      authorizations: [
        {
          ...authorizationSignature,
          typedData: {
            ...authorizationSignature.typedData,
            domain: {
              ...authorizationSignature.typedData.domain,
              verifyingContract: OTHER,
            },
          },
        },
      ],
      allowed: limits,
      addresses: ADDRESSES,
    }),
  ).toThrow(
    expect.objectContaining({
      name: "UnexpectedMorphoAuthorizationError",
      allowlistable: false,
    }),
  );
  expect(() =>
    assertPendingApprovals({
      authorizations: [permit2],
      allowed: limits,
      addresses: { morpho: MORPHO },
    }),
  ).toThrow(UnexpectedTokenApprovalError);
  expect(() =>
    assertPendingApprovals({
      authorizations: [
        {
          ...permit2,
          typedData: {
            ...permit2.typedData,
            domain: { ...permit2.typedData.domain, verifyingContract: OTHER },
          },
        },
      ],
      allowed: limits,
      addresses: ADDRESSES,
    }),
  ).toThrow(
    expect.objectContaining({
      name: "UnexpectedTokenApprovalError",
      allowlistable: false,
    }),
  );
});

test("fails closed for malformed approval logs", () => {
  const valid = erc20Approval({ eventOwner: OWNER, spender: OTHER, value: 1n });
  expect(() =>
    assertEvents([{ ...valid, topics: valid.topics.slice(0, 2) }]),
  ).toThrow(ApprovalCheckUnavailableError);
  expect(() => assertEvents([{ ...valid, data: "0x" }])).toThrow(
    ApprovalCheckUnavailableError,
  );
  const permit = permit2Approval({
    eventOwner: OWNER,
    spender: OTHER,
    amount: 1n,
  });
  expect(() => assertEvents([{ ...permit, data: "0x" }])).toThrow(
    ApprovalCheckUnavailableError,
  );
});
