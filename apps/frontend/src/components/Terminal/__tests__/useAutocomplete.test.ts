import { autocomplete } from "../useAutocomplete";

describe("autocomplete", () => {
  it("should return empty array for empty buffer", () => {
    expect(autocomplete("")).toEqual([]);
  });

  it("should return matching commands for single letter", () => {
    expect(autocomplete("l")).toEqual(["levels", "listar_operaciones", "ls"]);
    expect(autocomplete("c")).toEqual([
      "cat",
      "cd",
      "certificado",
      "check",
      "chmod",
      "clear",
      "curl",
    ]);
  });

  it("should return empty array for non-matching buffer", () => {
    expect(autocomplete("xyz")).toEqual([]);
  });

  it("should return exact match for full command", () => {
    expect(autocomplete("help")).toEqual(["help"]);
  });
});
