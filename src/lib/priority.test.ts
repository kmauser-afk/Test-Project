import { describe, it, expect } from "vitest";
import { derivePriority } from "./priority";

describe("derivePriority", () => {
  it("maps high impact + high urgency to P1", () => {
    expect(derivePriority("HIGH", "HIGH")).toBe("P1");
  });
  it("maps high + medium to P2", () => {
    expect(derivePriority("HIGH", "MEDIUM")).toBe("P2");
  });
  it("maps medium + medium to P3", () => {
    expect(derivePriority("MEDIUM", "MEDIUM")).toBe("P3");
  });
  it("maps low + low to P4", () => {
    expect(derivePriority("LOW", "LOW")).toBe("P4");
  });
});
