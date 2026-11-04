import {
  blueAbi,
  midnightEcrecoverAuthorizerAbi,
} from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  type Hex,
} from "viem";
import { expect, test } from "vitest";
import type {
  BlueAuthorizationSignature,
  Erc2612PermitAuthorization,
  MidnightAuthorizationSignature,
} from "../authorizations.js";
import {
  ApprovalCheckUnavailableError,
  UnusedAuthorizationError,
} from "../index.js";
import type { RawLog } from "../types.js";
import { assertSignedAuthorizationsUsed } from "./signed-authorizations.js";

const owner = "0x1111111111111111111111111111111111111111";
const spender = "0x2222222222222222222222222222222222222222";
const token: Address = "0x3333333333333333333333333333333333333333";
const morpho = "0x4444444444444444444444444444444444444444";
const ecrecoverAuthorizer = "0x5555555555555555555555555555555555555555";
const permit: Erc2612PermitAuthorization = {
  type: "erc2612Permit",
  typedData: {
    domain: { chainId: 1, verifyingContract: token },
    primaryType: "Permit",
    types: { Permit: [] },
    message: { owner, spender, value: 100n, nonce: 0n, deadline: 1000n },
  },
};
const blue: BlueAuthorizationSignature = {
  type: "blueAuthorizationSignature",
  typedData: {
    domain: { chainId: 1, verifyingContract: morpho },
    primaryType: "Authorization",
    types: { Authorization: [] },
    message: {
      authorizer: owner,
      authorized: spender,
      isAuthorized: true,
      nonce: 2n,
      deadline: 1000n,
    },
  },
};
const midnight: MidnightAuthorizationSignature = {
  type: "midnightAuthorizationSignature",
  typedData: {
    domain: { chainId: 1, verifyingContract: ecrecoverAuthorizer },
    primaryType: "Authorization",
    types: { Authorization: [] },
    message: {
      authorizer: owner,
      authorized: spender,
      isAuthorized: true,
      nonce: 3n,
      deadline: 1000n,
    },
  },
};
const approval: RawLog = {
  address: token,
  topics: encodeEventTopics({
    abi: erc20Abi,
    eventName: "Approval",
    args: { owner, spender },
  }) as Hex[],
  data: encodeAbiParameters([{ type: "uint256" }], [100n]),
};
const nonce: RawLog = {
  address: morpho,
  topics: encodeEventTopics({
    abi: blueAbi,
    eventName: "IncrementNonce",
    args: { caller: spender, authorizer: owner },
  }) as Hex[],
  data: encodeAbiParameters([{ type: "uint256" }], [2n]),
};
const midnightAuthorization: RawLog = {
  address: ecrecoverAuthorizer,
  topics: encodeEventTopics({
    abi: midnightEcrecoverAuthorizerAbi,
    eventName: "SetIsAuthorized",
    args: { caller: spender, authorizer: owner, authorized: spender },
  }) as Hex[],
  data: encodeAbiParameters(
    [{ type: "bool" }, { type: "uint256" }, { type: "address" }],
    [true, 3n, spender],
  ),
};

test("accepts each matching use event and does not mutate logs", () => {
  const logs = Object.freeze([Object.freeze(approval), Object.freeze(nonce)]);
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [permit, blue],
      logs,
      morpho,
      ecrecoverAuthorizer,
    }),
  ).not.toThrow();
});

test.each([
  { authorization: permit, log: approval },
  { authorization: blue, log: nonce },
])(
  "accepts uppercase event topics for $authorization.type",
  ({ authorization, log }) => {
    const topics = log.topics.map(
      (topic): Hex => `0x${topic.slice(2).toUpperCase()}`,
    );
    expect(() =>
      assertSignedAuthorizationsUsed({
        authorizations: [authorization],
        logs: [{ ...log, topics }],
        morpho,
        ecrecoverAuthorizer,
      }),
    ).not.toThrow();
    expect(topics).toEqual(
      log.topics.map((topic) => `0x${topic.slice(2).toUpperCase()}`),
    );
  },
);

test.each([permit, blue])(
  "rejects missing evidence for $type",
  (authorization) => {
    expect(() =>
      assertSignedAuthorizationsUsed({
        authorizations: [authorization],
        logs: [],
        morpho,
        ecrecoverAuthorizer,
      }),
    ).toThrow(UnusedAuthorizationError);
  },
);

test.each([
  ["token", { ...approval, address: spender }],
  [
    "owner",
    {
      ...approval,
      topics: encodeEventTopics({
        abi: erc20Abi,
        eventName: "Approval",
        args: { owner: spender, spender },
      }) as Hex[],
    },
  ],
  [
    "spender",
    {
      ...approval,
      topics: encodeEventTopics({
        abi: erc20Abi,
        eventName: "Approval",
        args: { owner, spender: owner },
      }) as Hex[],
    },
  ],
  [
    "value",
    { ...approval, data: encodeAbiParameters([{ type: "uint256" }], [99n]) },
  ],
  ["malformed", { ...approval, data: "0x" }],
  ["no topics", { ...approval, topics: [] }],
  [
    "extra topic",
    { ...approval, topics: [...approval.topics, nonce.topics[1]!] },
  ],
  ["trailing data", { ...approval, data: `${approval.data}00` }],
] as const)("rejects mismatched permit %s", (_, log) => {
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [permit],
      logs: [log],
      morpho,
      ecrecoverAuthorizer,
    }),
  ).toThrow(UnusedAuthorizationError);
});

test.each([
  ["emitter", { ...nonce, address: token }],
  [
    "authorizer",
    {
      ...nonce,
      topics: encodeEventTopics({
        abi: blueAbi,
        eventName: "IncrementNonce",
        args: { caller: spender, authorizer: spender },
      }) as Hex[],
    },
  ],
  [
    "nonce",
    { ...nonce, data: encodeAbiParameters([{ type: "uint256" }], [3n]) },
  ],
  ["malformed", { ...nonce, data: "0x" }],
] as const)("rejects mismatched Blue %s", (_, log) => {
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [blue],
      logs: [log],
      morpho,
      ecrecoverAuthorizer,
    }),
  ).toThrow(UnusedAuthorizationError);
});

test("does not accept a Blue-looking event from an unregistered verifying contract", () => {
  const authorization = {
    ...blue,
    typedData: {
      ...blue.typedData,
      domain: { chainId: 1, verifyingContract: token },
    },
  };
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [authorization],
      logs: [{ ...nonce, address: token }],
      morpho,
      ecrecoverAuthorizer,
    }),
  ).toThrow(UnusedAuthorizationError);
});

test("identifies the missing request and does not reuse an event for duplicates", () => {
  try {
    assertSignedAuthorizationsUsed({
      authorizations: [permit, permit],
      logs: [approval],
      morpho,
      ecrecoverAuthorizer,
    });
    expect.fail("expected missing second permit evidence");
  } catch (error) {
    expect(error).toBeInstanceOf(UnusedAuthorizationError);
    expect(error).toMatchObject({
      code: "UNUSED_AUTHORIZATION",
      authorizationIndex: 1,
      authorization: permit,
    });
  }
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [permit, permit],
      logs: [approval, approval],
      morpho,
      ecrecoverAuthorizer,
    }),
  ).not.toThrow();
});

test("does not require events for unsigned requests or Permit2 signature transfers", () => {
  assertSignedAuthorizationsUsed({
    authorizations: [
      { type: "erc20Approval", token, owner, spender, amount: 100n },
      {
        type: "blueAuthorization",
        authorizer: owner,
        authorized: spender,
        isAuthorized: true,
      },
      {
        type: "permit2SignatureTransfer",
        owner,
        typedData: {
          domain: { chainId: 1, verifyingContract: token },
          primaryType: "PermitTransferFrom",
          types: { PermitTransferFrom: [], TokenPermissions: [] },
          message: {
            permitted: { token, amount: 100n },
            spender,
            nonce: 0n,
            deadline: 1000n,
          },
        },
      },
    ],
    logs: [],
    morpho,
    ecrecoverAuthorizer,
  });
});

test("accepts a matching EcrecoverAuthorizer SetIsAuthorized event", () => {
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [midnight],
      logs: [midnightAuthorization],
      morpho,
      ecrecoverAuthorizer,
    }),
  ).not.toThrow();
});

test("accepts EcrecoverAuthorizer events with uppercase topic hex", () => {
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [midnight],
      logs: [
        {
          ...midnightAuthorization,
          topics: midnightAuthorization.topics.map(
            (topic) => `0x${topic.slice(2).toUpperCase()}` as Hex,
          ),
        },
      ],
      morpho,
      ecrecoverAuthorizer,
    }),
  ).not.toThrow();
});

test("fails closed when EcrecoverAuthorizer evidence logs are unavailable", () => {
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [midnight],
      logs: undefined,
      morpho,
      ecrecoverAuthorizer,
    }),
  ).toThrow(ApprovalCheckUnavailableError);
});

test.each([
  [
    "nonce",
    {
      ...midnightAuthorization,
      data: encodeAbiParameters(
        [{ type: "bool" }, { type: "uint256" }, { type: "address" }],
        [true, 4n, spender],
      ),
    },
  ],
  [
    "authorizer",
    {
      ...midnightAuthorization,
      topics: encodeEventTopics({
        abi: midnightEcrecoverAuthorizerAbi,
        eventName: "SetIsAuthorized",
        args: { caller: spender, authorizer: spender, authorized: spender },
      }) as Hex[],
    },
  ],
  [
    "authorized",
    {
      ...midnightAuthorization,
      topics: encodeEventTopics({
        abi: midnightEcrecoverAuthorizerAbi,
        eventName: "SetIsAuthorized",
        args: { caller: spender, authorizer: owner, authorized: token },
      }) as Hex[],
    },
  ],
  [
    "isAuthorized",
    {
      ...midnightAuthorization,
      data: encodeAbiParameters(
        [{ type: "bool" }, { type: "uint256" }, { type: "address" }],
        [false, 3n, spender],
      ),
    },
  ],
  ["no topics", { ...midnightAuthorization, topics: [] }],
  ["truncated data", { ...midnightAuthorization, data: "0x" }],
  ["wrong event", { ...midnightAuthorization, topics: nonce.topics }],
  ["emitter", { ...midnightAuthorization, address: token }],
  ["missing", undefined],
] as const)("rejects mismatched EcrecoverAuthorizer evidence: %s", (_, log) => {
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [midnight],
      logs: log === undefined ? [] : [log],
      morpho,
      ecrecoverAuthorizer,
    }),
  ).toThrow(UnusedAuthorizationError);
});

test("rejects EcrecoverAuthorizer evidence from an unregistered verifying contract", () => {
  const unregisteredEcrecoverAuthorizer: Address =
    "0x6666666666666666666666666666666666666666";
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [
        {
          ...midnight,
          typedData: {
            ...midnight.typedData,
            domain: {
              ...midnight.typedData.domain,
              verifyingContract: unregisteredEcrecoverAuthorizer,
            },
          },
        },
      ],
      logs: [
        {
          ...midnightAuthorization,
          address: unregisteredEcrecoverAuthorizer,
        },
      ],
      morpho,
      ecrecoverAuthorizer,
    }),
  ).toThrow(UnusedAuthorizationError);
});

test("does not reuse an EcrecoverAuthorizer event for duplicate signatures", () => {
  expect(() =>
    assertSignedAuthorizationsUsed({
      authorizations: [midnight, midnight],
      logs: [midnightAuthorization],
      morpho,
      ecrecoverAuthorizer,
    }),
  ).toThrow(
    expect.objectContaining({
      authorizationIndex: 1,
      authorization: midnight,
    }),
  );
});
