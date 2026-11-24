import { describe, expect, it } from "vitest";
import { readFrontendOrigins } from "../src/lib/origins";

describe("Frontend origin configuration", () => {
  it("normalizes HTTP origins and tolerates empty separators", () => {
    expect(
      readFrontendOrigins(
        "http://localhost:5174/, ,http://192.168.40.103:5174,http://localhost:5174,",
      ),
    ).toEqual(["http://localhost:5174", "http://192.168.40.103:5174"]);
  });
  it("identifies the configuration field for an origin with a missing host", () => {
    for (const value of [
      "http://:5174",
      "http://:5175",
      "http://localhost:5174,http://:5174",
    ])
      expect(() => readFrontendOrigins(value)).toThrow("FRONTEND_ORIGINS");
  });
  it("requires an HTTP or HTTPS origin", () => {
    for (const value of ["", " , ", "file:///tmp/site", "ftp://example.com"])
      expect(() => readFrontendOrigins(value)).toThrow("FRONTEND_ORIGINS");
  });
});
