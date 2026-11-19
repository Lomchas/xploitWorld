import { createHistory as useHistory } from "../useHistory";

describe("useHistory", () => {
  it("should navigate up to the oldest command after adding 3", () => {
    const { add, navigateUp } = useHistory();
    add("ls");
    add("pwd");
    add("cat file.txt");

    expect(navigateUp()).toBe("cat file.txt");
    expect(navigateUp()).toBe("pwd");
    expect(navigateUp()).toBe("ls");
  });

  it("should return undefined when navigating down at the end", () => {
    const { add, navigateDown, resetPointer } = useHistory();
    add("ls");
    add("pwd");

    resetPointer();
    expect(navigateDown()).toBeUndefined();
  });

  it("should not duplicate consecutive identical commands", () => {
    const { add, commands } = useHistory();
    add("ls");
    add("ls");
    add("pwd");

    expect(commands).toEqual(["ls", "pwd"]);
  });

  it("should reset pointer after navigating", () => {
    const { add, navigateUp, resetPointer, navigateDown } = useHistory();
    add("ls");
    add("pwd");

    navigateUp(); // "pwd"
    navigateUp(); // "ls"
    resetPointer();
    expect(navigateDown()).toBeUndefined();
  });
});
