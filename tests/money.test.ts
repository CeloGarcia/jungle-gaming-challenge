import { describe, it, expect } from "vitest";
import { eth, wei } from "../src/domain";
describe("ETH exato", () => {
  it("soma e multiplica sem ponto flutuante", () => {
    expect(eth(wei("0.1") + wei("0.2"))).toBe("0.3");
    expect(eth(wei("1.79") * 9n + wei("0.016"))).toBe("16.126");
  });
  it("preserva wei e rejeita valores inexatos", () => {
    expect(eth(wei("0.000000000000000001"))).toBe("0.000000000000000001");
    expect(() => wei("1.0000000000000000001")).toThrow();
    expect(() => wei("-1")).toThrow();
  });
});
