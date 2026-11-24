import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  MISSIONS,
  type LevelSummary,
  type UserProgressEntry,
} from "@null-protocol/shared";
import { CampaignJournal } from "./CampaignJournal";

describe("Mission journal", () => {
  it("opens a specific replay, offers the required equipment at its gate and keeps later missions locked", () => {
    const levels: LevelSummary[] = MISSIONS.map((level, index) => ({
      ...level,
      id: "l" + index,
      orderIndex: index,
      isActive: true,
    }));
    const nextIndex = levels.findIndex((level) =>
      level.name.startsWith("1.08"),
    );
    const completed: UserProgressEntry[] = levels
      .slice(0, nextIndex)
      .map((level) => ({
        userId: "u",
        level,
        levelId: level.id,
        completed: true,
        attempts: 1,
        completedAt: "2026-03-10T10:00:00.000Z",
      }));
    render(
      <MemoryRouter>
        <CampaignJournal levels={levels} progress={completed} />
      </MemoryRouter>,
    );
    const journal = within(
      screen.getByRole("region", { name: "Diario de misiones" }),
    );
    expect(
      journal.getByRole("link", { name: "Abrir misión" }).getAttribute("href"),
    ).toBe("/historia?mision=" + levels[nextIndex]!.slug);
    expect(
      journal.getByRole("link", { name: /en Exchange/ }).getAttribute("href"),
    ).toBe("/exchange?articulo=workshop");
    expect(
      journal.getAllByRole("link", { name: "Volver a jugar la misión" }),
    ).toHaveLength(7);
    fireEvent.change(journal.getByRole("combobox"), { target: { value: "6" } });
    expect(journal.queryByRole("link")).toBeNull();
    expect(journal.getAllByText(/Completa primero 1.08/)).toHaveLength(10);
  });
});
