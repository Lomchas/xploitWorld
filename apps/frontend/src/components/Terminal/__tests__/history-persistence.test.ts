import { renderHook } from "@testing-library/react";
import { createHistory, useHistory } from "../useHistory";
it("keeps the same history object across re-renders", () => {
  sessionStorage.clear();
  const { result, rerender } = renderHook(() => useHistory());
  const first = result.current;
  first.add("pwd");
  rerender();
  expect(result.current).toBe(first);
  expect(result.current.navigateUp()).toBe("pwd");
});
it("caps persisted history and keeps the oldest entry when navigating past its edge", () => {
  const history = createHistory();
  for (let index = 0; index < 250; index++) history.add(`echo ${index}`);
  expect(history.commands).toHaveLength(200);
  for (let index = 0; index < 210; index++) history.navigateUp();
  expect(history.navigateUp()).toBe("echo 50");
});
it("falls back to empty history for corrupt storage", () => {
  sessionStorage.setItem("nullprotocol.history", "{bad");
  expect(renderHook(() => useHistory()).result.current.commands).toEqual([]);
});
