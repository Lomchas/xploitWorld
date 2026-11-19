import { createContext, useContext } from "react";
import {
  isLocale,
  translator,
  type Locale,
  type Translator,
} from "@null-protocol/shared";

const storageKey = "xploitworld.language";

export function readLocale(): Locale {
  try {
    const value = localStorage.getItem(storageKey);
    if (isLocale(value)) return value;
  } catch {
    // The current session can still change the language.
  }
  return "es";
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(storageKey, locale);
  } catch {
    // The in-memory preference still applies.
  }
}

export const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
}>({ locale: "es", setLocale: () => undefined, t: translator("es") });

export const useLocale = () => useContext(LocaleContext);
