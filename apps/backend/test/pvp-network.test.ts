import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  addressNumber,
  energyNow,
  freshDevice,
  inspectPort,
  probeHost,
  scanHost,
  virtualAddress,
  type VirtualHost,
} from "../src/pvp/network";
import { analyzeSpecimen, makeSpecimen } from "../src/pvp/specimens";
import { parseAction, parseJoin, readConfig } from "../src/pvp/validation";

const host = (id: string): VirtualHost => ({
  id,
  address: "2001:db8:4::1",
  integrity: 100,
  config: freshDevice(),
});

describe("PvP virtual packet decisions", () => {
  it("starts with exposed TCP and UDP services and no installed protections", () => {
    const source = host("a");
    const target = host("b");
    const { ports, flows } = scanHost(source, target);
    expect(
      ports.filter((port) => port.state === "open").map((port) => port.port),
    ).toEqual([22, 80, 53]);
    expect(flows.find((flow) => flow.port === 80)?.trace.slice(0, 3)).toEqual([
      "SYN",
      "SYN-ACK",
      "ACK",
    ]);
    expect(flows.find((flow) => flow.port === 53)?.trace).toEqual([
      "Datagrama UDP",
      "Respuesta de aplicación virtual",
    ]);
    expect(target.config.tools).toEqual([]);
  });
  it("applies the first matching rule, including source and protocol", () => {
    const source = host("a");
    const target = host("b");
    target.config.tools.push("firewall");
    target.config.policy = "drop";
    target.config.rules = [
      {
        id: "1",
        action: "allow",
        protocol: "tcp",
        port: 80,
        sourceId: source.id,
      },
      { id: "2", action: "drop", protocol: "any", port: null, sourceId: null },
    ];
    expect(inspectPort(source, target, "tcp", 80).observation.state).toBe(
      "open",
    );
    expect(inspectPort(host("c"), target, "tcp", 80).observation).toEqual({
      protocol: "tcp",
      port: 80,
      state: "filtered",
    });
    target.config.rules.reverse();
    expect(probeHost(source, target, "tcp", 80).damage).toBe(0);
  });
  it("moves the web port when TLS is enabled, while patching controls damage", () => {
    const source = host("a");
    const target = host("b");
    target.config.tools.push("tls");
    target.config.tls = true;
    expect(inspectPort(source, target, "tcp", 80).observation.state).toBe(
      "closed",
    );
    expect(probeHost(source, target, "tcp", 443)).toMatchObject({
      damage: 34,
      flow: { encryption: "tls", state: "open" },
    });
    target.config.services.web.patched = true;
    expect(probeHost(source, target, "tcp", 443)).toMatchObject({
      damage: 0,
      patched: true,
    });
  });
  it("requires mutual VPN trust and a permitted UDP tunnel before exposing administration", () => {
    const source = host("a");
    const target = host("b");
    source.config.vpn = target.config.vpn = true;
    source.config.tools.push("vpn");
    target.config.tools.push("vpn", "firewall");
    target.config.trustedPeers.push(source.id);
    expect(inspectPort(source, target, "tcp", 22).observation.state).toBe(
      "filtered",
    );
    source.config.trustedPeers.push(target.id);
    expect(inspectPort(source, target, "tcp", 22)).toMatchObject({
      encryption: "vpn",
      observation: { state: "open" },
    });
    target.config.rules.push({
      id: "1",
      action: "drop",
      protocol: "udp",
      port: 51820,
      sourceId: null,
    });
    expect(inspectPort(source, target, "tcp", 22).observation.state).toBe(
      "filtered",
    );
  });
  it("bounds damage on disabled and compromised devices", () => {
    const source = host("a");
    const target = host("b");
    target.integrity = 11;
    expect(probeHost(source, target, "tcp", 80).damage).toBe(11);
    target.config.isolated = true;
    expect(probeHost(source, target, "tcp", 80).damage).toBe(0);
    target.config.isolated = false;
    target.integrity = 0;
    expect(probeHost(source, target, "udp", 53).damage).toBe(0);
  });
  it("generates stable documentation addresses across the 16-bit boundary", () => {
    for (const value of [1, 65535, 65536, 2_147_483_647]) {
      const address = virtualAddress("sa", value);
      expect(address.startsWith("2001:db8:4::")).toBe(true);
      expect(addressNumber("sa", address)).toBe(value);
      expect(addressNumber("af", address)).toBeUndefined();
    }
  });
  it("caps energy regeneration and handles clocks moving backwards", () => {
    const now = new Date(15_000);
    expect(energyNow(30, new Date(5_000), now)).toBe(35);
    expect(energyNow(99, new Date(5_000), now)).toBe(100);
    expect(energyNow(40, new Date(16_000), now)).toBe(40);
  });
});

describe("PvP input and forensic evidence", () => {
  it("rejects arbitrary hosts, extra authority fields, and invalid transport", () => {
    const requestId = randomUUID();
    expect(() =>
      parseAction({
        requestId,
        action: { type: "scan", targetId: "https://127.0.0.1" },
      }),
    ).toThrow();
    expect(() =>
      parseAction({
        requestId,
        action: { type: "repair", balanceSats: "9999" },
      }),
    ).toThrow();
    expect(() =>
      parseAction({
        requestId,
        action: {
          type: "counter",
          eventId: "c".repeat(25),
          protocol: "icmp",
          port: 0,
        },
      }),
    ).toThrow();
    expect(() => parseJoin({ regionId: "sa", alias: "<script>" })).toThrow();
  });
  it("fails closed when stored defenses omit their installed package", () => {
    expect(() => readConfig({ ...freshDevice(), isolated: true })).toThrow();
  });
  it("decodes only verified inert NPX bytes and identifies the matching patch", () => {
    const sample = makeSpecimen("dns");
    const report = analyzeSpecimen(sample);
    expect(report).toMatchObject({
      signature: "NPX-DNS-01",
      service: "dns",
      sha256: sample.sha256,
    });
    expect(report.instructions.at(-1)).toContain("HALT");
    expect(() =>
      analyzeSpecimen({ ...sample, hex: sample.hex.replace("33", "34") }),
    ).toThrow("integrity");
  });
});
