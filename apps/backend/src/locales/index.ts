import {
  createEnglishTranslator,
  translator,
  type Locale,
  type Translator,
} from "@null-protocol/shared";
import storyAndExercises from "./en.json";

// Case evidence, hints and grading terms belong on the server.
const english = createEnglishTranslator(storyAndExercises, translator("en"));
export const backendTranslator = (locale: Locale): Translator =>
  locale === "en" ? english : translator("es");
