import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { translator, type Locale } from "@null-protocol/shared";
import { LocaleContext, readLocale, saveLocale } from "./locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(readLocale);
  const value = useMemo(
    () => ({
      locale,
      t: translator(locale),
      setLocale: (next: Locale) => {
        saveLocale(next);
        setLocale(next);
      },
    }),
    [locale],
  );
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        value.t("XploitworlD, entrenamiento con una terminal Linux simulada."),
      );
  }, [locale, value]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
