import { describe, expect, test } from "vitest";
import {
  BLUE_API_BASE_URL,
  BLUE_API_GRAPHQL_URL,
  CDN_BASE_URL,
  DOCS_BASE_URL,
  getSubdomainBaseUrl,
  MORPHO_DOMAIN,
  OPTIMIZERS_API_BASE_URL,
  OPTIMIZERS_BASE_URL,
  REWARDS_BASE_URL,
} from "./urls.js";

describe("urls", () => {
  describe("MORPHO_DOMAIN", () => {
    test("is the canonical morpho.org domain", () => {
      expect(MORPHO_DOMAIN).toBe("morpho.org");
    });
  });

  describe("getSubdomainBaseUrl", () => {
    test("composes https://<sub>.morpho.org", () => {
      expect(getSubdomainBaseUrl("foo")).toBe("https://foo.morpho.org");
    });

    test("supports hyphenated subdomains", () => {
      expect(getSubdomainBaseUrl("foo-bar")).toBe("https://foo-bar.morpho.org");
    });

    test("does not validate the subdomain (trusts caller)", () => {
      expect(getSubdomainBaseUrl("")).toBe("https://.morpho.org");
    });
  });

  describe("exported subdomain URLs", () => {
    test("CDN_BASE_URL points to cdn", () => {
      expect(CDN_BASE_URL).toBe("https://cdn.morpho.org");
    });
    test("DOCS_BASE_URL points to docs", () => {
      expect(DOCS_BASE_URL).toBe("https://docs.morpho.org");
    });
    test("BLUE_API_BASE_URL points to api", () => {
      expect(BLUE_API_BASE_URL).toBe("https://api.morpho.org");
    });
    test("REWARDS_BASE_URL points to rewards", () => {
      expect(REWARDS_BASE_URL).toBe("https://rewards.morpho.org");
    });
    test("OPTIMIZERS_BASE_URL points to optimizers", () => {
      expect(OPTIMIZERS_BASE_URL).toBe("https://optimizers.morpho.org");
    });
    test("OPTIMIZERS_API_BASE_URL aliases the api subdomain", () => {
      expect(OPTIMIZERS_API_BASE_URL).toBe("https://api.morpho.org");
    });
  });

  describe("BLUE_API_GRAPHQL_URL", () => {
    test("appends /graphql to the API base URL", () => {
      expect(BLUE_API_GRAPHQL_URL).toBe("https://api.morpho.org/graphql");
    });

    test("is a valid absolute URL", () => {
      expect(() => new URL(BLUE_API_GRAPHQL_URL)).not.toThrow();
      expect(new URL(BLUE_API_GRAPHQL_URL).pathname).toBe("/graphql");
    });
  });
});
