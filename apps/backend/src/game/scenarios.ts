import { backendTranslator } from "../locales";
import { createHash } from "node:crypto";
import {
  resolveVirtualPath,
  TUTORIAL_MISSIONS,
  VIRTUAL_HOME,
  type Locale,
} from "@null-protocol/shared";

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
export const HOME = VIRTUAL_HOME;
export const DELEGATED_FILE = HOME + "/privado/orden.txt";
export const RELAY = "http://relay.lab/estado";
const dossiers = [
  {
    slug: "chapter-1-ciudad-borrada",
    manifest: HOME + "/caso/origen.sha256",
    receipt: HOME + "/caso/recibo.txt",
    clue: "MERCADO CERO · Lote 017\nActivo: archivo de voces de Vanta\nFirma del vendedor: tu identificador de archivista\n\nNunca firmaste esa orden.",
  },
  {
    slug: "chapter-2-mercado-cero",
    manifest: HOME + "/mercado/libro.sha256",
    receipt: HOME + "/mercado/contraorden.txt",
    clue: "CONTRAORDEN 017 · Se congela el remate. La compra de silencio se registra como mantenimiento. Sigue el expediente OLVIDO.",
  },
  {
    slug: "chapter-3-protocolo-olvido",
    manifest: HOME + "/olvido/raiz.sha256",
    receipt: HOME + "/olvido/restauracion.txt",
    clue: "ACTA DE RESTAURACIÓN · La autorización original pertenece a Consorcio Bruma. La copia restaurada demuestra que Vanta seguía habitada. ECO-7 recupera la primera ruta pública.",
  },
] as const;
export function dossierFor(slug: string, manifest: string) {
  return dossiers.find(
    (item) => item.slug === slug && item.manifest === manifest,
  );
}

export interface ScenarioFile {
  path: string;
  content: string;
  mode?: number;
  owner?: "guest" | "root";
}

export function localizeScenarioFiles(
  files: ScenarioFile[],
  locale: Locale,
): ScenarioFile[] {
  if (locale === "es") return files;
  const t = backendTranslator(locale);
  const originals = new Map(files.map((file) => [file.path, file.content]));
  const content = new Map(files.map((file) => [file.path, t(file.content)]));
  return files.map((file) => {
    const manifest = /^([a-f0-9]{64}) {2}([^\n]+)(\n?)$/.exec(file.content);
    if (manifest) {
      const [, hash, path, newline] = manifest;
      const target = resolveVirtualPath(path!, HOME);
      const before = originals.get(target);
      const after = content.get(target);
      // Valid checksums follow the displayed bytes. A disputed hash stays disputed.
      if (
        before !== undefined &&
        after !== undefined &&
        sha256(before) === hash
      ) {
        return { ...file, content: sha256(after) + "  " + path + newline };
      }
    }
    return { ...file, content: content.get(file.path)! };
  });
}

export function scenarioFiles(
  slug: string,
  flag: string | null,
  locale: Locale = "es",
): ScenarioFile[] {
  const t = backendTranslator(locale);
  const marker =
    (flag ?? t("Señal pendiente. Carga las misiones del servidor.")) + "\n";
  const readme = (instructions: string): ScenarioFile => ({
    path: HOME + "/README.txt",
    content:
      t(instructions) +
      t("\nEntrega la flag con submit ") +
      slug +
      " <flag>.\n",
  });
  switch (slug) {
    case TUTORIAL_MISSIONS[1].slug:
      return [
        readme(
          "Guardia UNO · La ficha de la cohorte llegó con permisos en cero. Inspecciona con ls -l permisos. Usa chmod 600 permisos/evidencia.txt y vuelve a leerla.",
        ),
        { path: HOME + "/permisos/evidencia.txt", content: marker, mode: 0 },
      ];
    case TUTORIAL_MISSIONS[2].slug:
      return [
        readme(
          "Guardia UNO · Antes de cerrar el turno hay que preservar el volcado. El proceso relevo lo bloquea. Ubícalo con ps y envía SIGTERM con kill <pid>. Revisa turno/dump.txt.",
        ),
        {
          path: HOME + "/turno/dump.txt",
          content: "El volcado sigue bloqueado por relevo.\n",
        },
      ];
    case TUTORIAL_MISSIONS[3].slug:
      return [
        readme(
          "Guardia UNO · El catálogo de prácticas perdió su ruta. Comprueba si el relé interno sigue disponible. Usa ip addr, lee red/hosts.txt y consulta la URL del escenario con curl.",
        ),
        {
          path: HOME + "/red/hosts.txt",
          content:
            t("192.0.2.50 relay.lab\nRecurso de estado: ") + RELAY + "\n",
        },
      ];
    case TUTORIAL_MISSIONS[4].slug:
      return [
        readme(
          "Guardia UNO · El acta de relevo pertenece al administrador. La guardia te delegó una lectura. Comprueba su alcance con sudo -l antes de abrir el acta.",
        ),
        { path: DELEGATED_FILE, content: marker, mode: 0o600, owner: "root" },
      ];
    case TUTORIAL_MISSIONS[5].slug:
      return [
        readme(
          "Guardia UNO · Última prueba de la cohorte. Busca CANAL en registro/eventos.log con grep -n. Lee el paquete indicado con base64 -d. Si apruebas, la guardia te asignará un encargo de campo.",
        ),
        {
          path: HOME + "/registro/eventos.log",
          content:
            "turno 01 descartado\nCANAL final paquetes/07.b64\nturno 02 sin acuse\n",
        },
        {
          path: HOME + "/paquetes/03.b64",
          content: Buffer.from(t("Latido antiguo\n")).toString("base64") + "\n",
        },
        {
          path: HOME + "/paquetes/07.b64",
          content: Buffer.from(marker).toString("base64") + "\n",
        },
      ];
    case dossiers[0].slug: {
      const message =
        "ECO-7: Vanta sigue en línea. Alguien subasta sus recuerdos en el Mercado Cero.\n";
      return [
        readme(
          "00:17. Vanta desapareció del mapa. Hace diez minutos estabas archivando las voces de sus habitantes. Ahora ni tu propia credencial reconoce la ciudad.\nECO-7 te dejó dos comunicados y un recibo cerrado. Los espejos se contradicen. Reconstruye lo ocurrido con la bitácora de caso/ y verifica el manifiesto auténtico desde tu directorio personal.",
        ),
        {
          path: HOME + "/caso/bitacora.log",
          content:
            "00:16 SUR anuncia normalidad. Adjunto: boletin.sha256\n00:17 ECO-7: Si te cambian el mapa, conserva la huella. Espejo NORTE, origen.sha256.\n00:18 Se retira la ruta pública a Vanta\n00:21 Lote 017 abierto para subasta\n",
        },
        { path: HOME + "/caso/norte.msg", content: message },
        {
          path: HOME + "/caso/sur.msg",
          content: "COMUNICADO: Vanta nunca existió.\n",
        },
        {
          path: dossiers[0].manifest,
          content: sha256(message) + "  caso/norte.msg\n",
        },
        {
          path: HOME + "/caso/boletin.sha256",
          content: sha256("original retirado") + "  caso/sur.msg\n",
        },
      ];
    }
    case dossiers[1].slug: {
      const receipt =
        "RECIBO 017 · Transferencia de archivo de voces. Comprador: Consorcio Bruma. Orden asociada: OLVIDO.\n";
      return [
        readme(
          "El Mercado Cero admite una sola puja por identidad. Tu credencial aparece en dos. ECO-7 dejó un contacto cifrado junto al libro de ofertas. Localiza el lote 017, lee el contacto y comprueba el recibo auténtico.",
        ),
        {
          path: HOME + "/mercado/ofertas.log",
          content:
            "LOT-014 copia de respaldo\nLOT-017 huella en libro.sha256 · contacto canal.b64\nLOT-071 identidad señuelo\n",
        },
        {
          path: HOME + "/mercado/canal.b64",
          content:
            Buffer.from(
              t(
                "ECO-7: la huella válida apunta al recibo 017. Verifica el libro con sha256sum -c desde tu directorio personal.\n",
              ),
            ).toString("base64") + "\n",
        },
        { path: HOME + "/mercado/017.rec", content: receipt },
        {
          path: HOME + "/mercado/071.rec",
          content: "RECIBO 071 · Movimiento de señuelo sin orden asociada.\n",
        },
        {
          path: dossiers[1].manifest,
          content: sha256(receipt) + "  mercado/017.rec\n",
        },
      ];
    }
    case dossiers[2].slug: {
      const order =
        "OLVIDO 00:17 · Autoriza Consorcio Bruma · alcance: rutas públicas · Vanta conserva las voces.\n";
      return [
        readme(
          "ECO-7 encontró una copia de la orden. Solo confía en la raíz que dejó el archivista de guardia. Cruza el registro de autorizaciones y verifica la huella antes de anunciar la restauración.",
        ),
        {
          path: HOME + "/olvido/autorizaciones.log",
          content:
            "00:14 orden simulada señuelo.msg\n00:17 Consorcio Bruma · copia orden.msg · raíz raiz.sha256\n00:21 ECO-7 conserva la copia con sello.\n",
        },
        { path: HOME + "/olvido/orden.msg", content: order },
        {
          path: HOME + "/olvido/señuelo.msg",
          content: "Orden de entrenamiento sin firma.\n",
        },
        {
          path: dossiers[2].manifest,
          content: sha256(order) + "  olvido/orden.msg\n",
        },
      ];
    }
    case TUTORIAL_MISSIONS[0].slug:
      return [
        readme(
          "Relevo de Vanta · 2061. La jefa de guardia te entregó una copia autorizada de la carpeta del relevo. Conserva la señal del relé Norte. Usa ls -a para localizar el archivo oculto y cat para leerlo.",
        ),
        ...(flag === null
          ? []
          : [{ path: HOME + "/.signal", content: marker }]),
      ];
    default:
      return [];
  }
}
