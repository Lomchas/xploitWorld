import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CAMPAIGN_CHAPTERS,
  CATALOG,
  STORY_EQUIPMENT,
  campaignMission,
  prerequisiteSlugs,
  languageTag,
  type LevelSummary,
  type UserProgressEntry,
} from "@null-protocol/shared";
import { useLocale } from "../lib/locale";

export function CampaignJournal({
  levels,
  progress,
}: {
  levels: LevelSummary[];
  progress: UserProgressEntry[];
}) {
  const { t, locale } = useLocale();
  const records = new Map(progress.map((row) => [row.level.slug, row]));
  const done = (slug: string) => records.get(slug)?.completed === true;
  const chapterOf = (slug: string) => campaignMission(slug)?.chapter ?? 0;
  const next = levels.find((level) => !done(level.slug));
  const [chapter, setChapter] = useState(() =>
    next ? chapterOf(next.slug) : 6,
  );
  const chapters = [{ number: 0, name: "Entrenamiento" }, ...CAMPAIGN_CHAPTERS];
  const visible = levels.filter((level) => chapterOf(level.slug) === chapter);

  return (
    <section className="campaign-journal" aria-labelledby="journal-title">
      <h2 id="journal-title">{t("Diario de misiones")}</h2>
      <label>
        {t("Elegir capítulo")}{" "}
        <select
          value={chapter}
          onChange={(event) => setChapter(Number(event.target.value))}
        >
          {chapters.map((group) => (
            <option key={group.number} value={group.number}>
              {group.number ? group.number + " · " : ""}
              {t(group.name)}
            </option>
          ))}
        </select>
      </label>
      <p>
        {t("{done} de {total} niveles completados", {
          done: visible.filter((level) => done(level.slug)).length,
          total: visible.length,
        })}
      </p>
      <ol>
        {visible.map((level) => {
          const record = records.get(level.slug);
          const missing = prerequisiteSlugs(level.slug).find(
            (slug) => !done(slug),
          );
          const playable = record?.completed || !missing;
          const gear = STORY_EQUIPMENT[campaignMission(level.slug)?.code ?? ""];
          return (
            <li key={level.slug}>
              <strong>{t(level.name)}</strong>
              {playable ? (
                <>
                  <p>{t(level.description)}</p>
                  {!record?.completed && gear && (
                    <p>
                      <Link to={"/exchange?articulo=" + gear}>
                        {t("Ver {name} en Exchange", {
                          name: t(CATALOG[gear].name),
                        })}
                      </Link>
                    </p>
                  )}
                  {record?.completedAt && (
                    <p>
                      {t("Completada el {date}", {
                        date: new Date(record.completedAt).toLocaleDateString(
                          languageTag(locale),
                        ),
                      })}
                    </p>
                  )}
                  <Link
                    to={"/historia?mision=" + encodeURIComponent(level.slug)}
                  >
                    {t(
                      record?.completed
                        ? "Volver a jugar la misión"
                        : "Abrir misión",
                    )}
                  </Link>
                </>
              ) : (
                <p>
                  {t("Completa primero {mission}.", {
                    mission: t(
                      levels.find((item) => item.slug === missing)?.name ??
                        missing ??
                        "",
                    ),
                  })}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
