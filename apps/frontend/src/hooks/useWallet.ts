import { useEffect, useState } from "react";
import type { AccountState } from "@null-protocol/shared";
import { ensureGuestSession, fetchAccount } from "../lib/api";

export function useWallet(attempt: number): AccountState | null {
  const [value, setValue] = useState<AccountState | null>(null);
  useEffect(() => {
    let active = true;
    let loading = false;
    const load = (): void => {
      if (loading || document.hidden) return;
      loading = true;
      void ensureGuestSession()
        .then(fetchAccount)
        .then((account) => {
          if (active) setValue(account);
        })
        .catch(() => undefined)
        .finally(() => {
          loading = false;
        });
    };
    load();
    window.addEventListener("xwd:wallet", load);
    const timer = window.setInterval(load, 12_000);
    return () => {
      active = false;
      window.removeEventListener("xwd:wallet", load);
      window.clearInterval(timer);
    };
  }, [attempt]);
  return value;
}
