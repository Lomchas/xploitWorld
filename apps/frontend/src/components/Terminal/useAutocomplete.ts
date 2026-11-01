const DICTIONARY = ["help", "ls", "cd", "pwd", "cat", "echo", "clear"];

export function autocomplete(currentBuffer: string): string[] {
  if (currentBuffer.length === 0) {
    return [];
  }
  return DICTIONARY.filter((cmd) => cmd.startsWith(currentBuffer));
}
