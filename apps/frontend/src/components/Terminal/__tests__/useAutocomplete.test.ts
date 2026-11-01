import { autocomplete } from "../useAutocomplete";

describe("autocomplete", () => {
  it("should return empty array for empty buffer", () => {
    expect(autocomplete("")).toEqual([]);
  });

  it("should return matching commands for single letter", () => {
    expect(autocomplete("l")).toEqual(["ls"]);
    expect(autocomplete("c")).toEqual(["cd", "cat", "clear"]);
  });

  it("should return empty array for non-matching buffer", () => {
    expect(autocomplete("xyz")).toEqual([]);
  });

  it("should return exact match for full command", () => {
    expect(autocomplete("help")).toEqual(["help"]);
  });
});
