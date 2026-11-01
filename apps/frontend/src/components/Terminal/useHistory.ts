export interface HistoryState {
  commands: string[];
  pointer: number;
}

export function useHistory() {
  const state: HistoryState = { commands: [], pointer: 0 };

  function add(cmd: string): void {
    if (
      state.commands.length > 0 &&
      state.commands[state.commands.length - 1] === cmd
    ) {
      return;
    }
    state.commands.push(cmd);
    state.pointer = state.commands.length;
  }

  function navigateUp(): string | undefined {
    if (state.pointer > 0) {
      state.pointer -= 1;
      return state.commands[state.pointer];
    }
    return undefined;
  }

  function navigateDown(): string | undefined {
    if (state.pointer < state.commands.length - 1) {
      state.pointer += 1;
      return state.commands[state.pointer];
    }
    if (state.pointer === state.commands.length - 1) {
      state.pointer = state.commands.length;
    }
    return undefined;
  }

  function resetPointer(): void {
    state.pointer = state.commands.length;
  }

  return {
    ...state,
    add,
    navigateUp,
    navigateDown,
    resetPointer,
  };
}
