import { describe, expect, it } from "vitest";
import {
  clientAddress,
  proxyTrust,
  readProxyIps,
} from "../src/lib/client-address";

describe("direct reverse proxy trust", () => {
  it("ignores a forged forwarding header from an untrusted peer", () => {
    const request = {
      socket: { remoteAddress: "192.0.2.20" },
      headers: { "x-forwarded-for": "192.0.2.99" },
    };
    expect(clientAddress(request, ["127.0.0.1"])).toBe("192.0.2.20");
  });
  it("accepts only the client adjacent to an explicitly trusted direct proxy", () => {
    const request = {
      socket: { remoteAddress: "::ffff:127.0.0.1" },
      headers: { "x-forwarded-for": "192.0.2.99, 192.0.2.20" },
    };
    expect(clientAddress(request, ["127.0.0.1"])).toBe("192.0.2.20");
    expect(proxyTrust(["127.0.0.1"])("127.0.0.1", 1)).toBe(false);
    expect(() => readProxyIps("*")).toThrow();
  });
});
