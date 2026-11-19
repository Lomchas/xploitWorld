export interface AccountCredentials {
  username: string;
  key: string;
}

export interface AccountState {
  username: string;
  linked: boolean;
  balanceSats: string | null;
  movements: {
    id: string;
    kind: string;
    deltaSats: string;
    createdAt: string;
  }[];
}
