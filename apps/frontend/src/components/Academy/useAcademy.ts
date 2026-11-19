import { useEffect, useState } from "react";
import type { AcademyState } from "@null-protocol/shared";
import { ensureGuestSession, fetchAcademy } from "../../lib/api";

export function useAcademy() {
  const [state, setState] = useState<AcademyState | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    void ensureGuestSession()
      .then(fetchAcademy)
      .then((value) => {
        if (current) setState(value);
      })
      .catch((failure: unknown) => {
        if (current)
          setError(
            failure instanceof Error
              ? failure.message
              : "Falló la consulta de prácticas.",
          );
      });
    return () => {
      current = false;
    };
  }, [attempt]);
  return {
    state,
    setState,
    error,
    reload: () => {
      setError("");
      setAttempt((value) => value + 1);
    },
  };
}
