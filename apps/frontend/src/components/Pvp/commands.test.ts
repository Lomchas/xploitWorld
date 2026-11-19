import { describe, expect, it } from "vitest";
import { parsePvpCommand } from "./commands";

const peers = [
  {
    id: "a".repeat(25),
    alias: "Test-Oponente",
    address: "2001:db8:4::2",
    ipv4: "10.0.0.2",
    online: true,
    score: 0,
    compromises: 0,
  },
];

describe("the PvP terminal", () => {
  it("resolves a visible opponent to a virtual device identity", () => {
    expect(parsePvpCommand("scan 10.0.0.2", peers)).toEqual({
      action: { type: "scan", targetId: peers[0]!.id },
    });
    expect(parsePvpCommand("scan 2001:db8:4::2", peers)).toEqual({
      action: { type: "scan", targetId: peers[0]!.id },
    });
  });
  it("rejects external destinations and command chaining", () => {
    expect(() => parsePvpCommand("scan test-oponente", peers)).toThrow();
    expect(() => parsePvpCommand("scan https://example.com", peers)).toThrow();
    expect(() => parsePvpCommand("scan test-oponente && id", peers)).toThrow();
  });
  it("constructs a source-specific firewall rule with a wildcard port", () => {
    expect(
      parsePvpCommand(
        "firewall add drop any any 2001:0DB8:0004:0000:0000:0000:0000:0002",
        peers,
      ),
    ).toEqual({
      action: {
        type: "rule.add",
        rule: {
          action: "drop",
          protocol: "any",
          port: null,
          sourceId: peers[0]!.id,
        },
      },
    });
  });
});
