import { expectTypeOf } from "vitest";
import type {
  ChainSimulationClientConfig,
  ChainSimulationConfig,
  ChainSimulationConfigEntry,
  SimulationConfig,
} from "./index.js";
import { createTestSimulationClient } from "./test-helpers/create-test-simulation-client.js";

interface ExtendedChainConfig extends ChainSimulationConfig {
  readonly label: string;
}

describe("simulation configuration types", () => {
  test("behavior: legacy interfaces remain extensible with a required string URL", () => {
    const legacy: ExtendedChainConfig = {
      simulateV1Url: "https://rpc.example",
      label: "legacy",
    };
    expectTypeOf(legacy.simulateV1Url).toEqualTypeOf<string>();
    const config: SimulationConfig = { chains: new Map([[1, legacy]]) };
    expect(config.chains.get(1)).toBe(legacy);
  });

  test("behavior: client configurations are accepted alongside legacy entries", () => {
    const client: ChainSimulationClientConfig = {
      client: createTestSimulationClient("https://rpc.example"),
    };
    expectTypeOf(client).toMatchTypeOf<ChainSimulationConfigEntry>();
    const config: SimulationConfig = {
      chains: new Map<number, ChainSimulationConfigEntry>([
        [1, client],
        [2, { simulateV1Url: "https://rpc.example" }],
      ]),
    };
    expect(config.chains.size).toBe(2);
  });
});
