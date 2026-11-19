import { useSearchParams } from "react-router-dom";
import { isAcademyLessonId, type AcademyLessonId } from "@null-protocol/shared";
import { AcademyPanel } from "../components/Academy/AcademyPanel";

export function PracticeView() {
  const [params, setParams] = useSearchParams();
  const practice = params.get("practica");
  const choose = (id: AcademyLessonId | "ruta"): void => {
    const next = new URLSearchParams(params);
    next.set("practica", id);
    next.delete("herramienta");
    setParams(next);
  };
  return (
    <AcademyPanel
      selected={isAcademyLessonId(practice) ? practice : null}
      preferredTool={params.get("herramienta")}
      onChoose={choose}
    />
  );
}
