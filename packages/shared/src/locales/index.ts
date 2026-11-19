import publicMessages from "./en.json";

export type Locale = "es" | "en";
export type TranslationValues = Readonly<Record<string, string | number>>;
export type Translator = (source: string, values?: TranslationValues) => string;

const placeholder = /\{(\w+)\}/g;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const spanish: Translator = (source, values) =>
  values
    ? source.replace(placeholder, (match, name: string) =>
        Object.hasOwn(values, name) ? String(values[name]) : match,
      )
    : source;

export function createEnglishTranslator(
  messages: Readonly<Record<string, string>>,
  fallback: Translator = spanish,
): Translator {
  const patterns = Object.keys(messages)
    .filter((key) => /\{\w+\}/.test(key))
    .map((source) => {
      const parts = source.split(placeholder);
      const names = parts.filter((_, index) => index % 2);
      const literals = parts.filter((_, index) => index % 2 === 0);
      return {
        source,
        names,
        weight: literals.join("").length,
        expression: new RegExp(
          "^" + literals.map(escape).join("(.+?)") + "$",
          "su",
        ),
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const localize: Translator = (source, values) => {
    if (Object.hasOwn(messages, source))
      return spanish(messages[source]!, values);
    // Older messages already have their values interpolated. Keep those
    // values intact when matching a complete authored message.
    if (!values) {
      for (const { source: key, names, expression } of patterns) {
        const match = expression.exec(source);
        if (match)
          return spanish(
            messages[key]!,
            Object.fromEntries(
              names.map((name, index) => {
                const value = match[index + 1]!;
                return [
                  name,
                  name.endsWith("Label") && value.length < source.length
                    ? localize(value)
                    : value,
                ];
              }),
            ),
          );
      }
    }
    return fallback(source, values);
  };
  return localize;
}

const english = createEnglishTranslator(publicMessages);

export function isLocale(value: unknown): value is Locale {
  return value === "es" || value === "en";
}

export const translator = (locale: Locale): Translator =>
  locale === "en" ? english : spanish;

export function translate(
  locale: Locale,
  source: string,
  values?: TranslationValues,
): string {
  return translator(locale)(source, values);
}

export const languageTag = (locale: Locale): string =>
  locale === "en" ? "en-US" : "es-CO";
