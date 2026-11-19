import { signed, type Scene } from "./scene";

export const CERTIFICATE_NAME =
  "Analista Junior de Ciberseguridad · XploitworlD";
export const PASS_SCORE = 80;
export const DIRECTOR_ALIAS = "X" + "i" + "d_";

export const VARIANTS = [
  {
    id: "VX-81",
    city: "Cobalto",
    asset: "COB-08",
    guest: "CO-241",
    local: "20:41",
    utc: "01:41",
    event: "01:44",
    delay: 3,
    minutes: 9,
  },
  {
    id: "VX-42",
    city: "Umbral",
    asset: "UMB-12",
    guest: "UM-318",
    local: "21:22",
    utc: "02:22",
    event: "02:27",
    delay: 5,
    minutes: 10,
  },
  {
    id: "VX-56",
    city: "Orilla",
    asset: "ORI-16",
    guest: "OR-169",
    local: "22:36",
    utc: "03:36",
    event: "03:40",
    delay: 4,
    minutes: 8,
  },
] as const;

type Variant = (typeof VARIANTS)[number];

export function finalScenes(v: Variant): Record<string, Scene> {
  return {
    "6.01": {
      opening: `Vértice · La junta entrega ${v.id}. Su topología reproduce la pérdida de asociaciones en la réplica de ${v.city}. Si la prueba funciona, guardia recuperará Vanta con revisión independiente.`,
      task: "Lee autorización e inventario. Documenta caso, alcance, activo y responsable. Para el puntaje completo, registra también dependencia y consecuencia de perderla.",
      files: {
        "autorizacion.txt": `${v.id} · Alcance: réplica de auditoría · Activo autorizado ${v.asset} · Revisión por junta de guardia.`,
        "inventario.txt": `${v.asset} · índice de ${v.city} · dependencia: canal de coordinación · impacto: huéspedes sin acceso.`,
      },
      commands: ["cat autorizacion.txt", "cat inventario.txt"],
      note: [v.id, v.asset, "réplica de auditoría", "junta de guardia"],
      grade: {
        base: 15,
        bonus: [
          { points: 5, terms: ["dependencia", "canal de coordinación"] },
          { points: 5, terms: ["impacto", "huéspedes sin acceso"] },
        ],
      },
      hint: "El informe debe cubrir autorización y activo. El inventario explica además la dependencia y el impacto.",
      ending:
        "La junta acepta el alcance. Entrega una cuenta temporal que debe seguir sirviendo después de recortar sus permisos.",
    },
    "6.02": {
      opening:
        "Una cuenta temporal abre la copia de recuperación. También heredó la capacidad de cambiar la estación original. Esa facultad excede el acta.",
      task: "Ajusta la cuenta de relevo y verifica restauración permitida y producción denegada. Registra resultados y, para el puntaje completo, la caducidad de la cuenta.",
      files: {
        "relevo.txt":
          "Cuenta relevo · restauración en réplica · producción reservada · caducidad: fin de guardia.",
      },
      commands: ["cat relevo.txt"],
      control: {
        name: "relevo",
        initial: "administrador",
        final: "replica",
        outcomes: {
          administrador: { restauracion: "Permitida", produccion: "Permitida" },
          replica: {
            restauracion: "Permitida en réplica",
            produccion: "Denegada",
          },
          revocado: { restauracion: "Denegada", produccion: "Denegada" },
        },
        checks: [
          ["replica", "restauracion"],
          ["replica", "produccion"],
        ],
      },
      note: ["relevo", "restauración", "producción denegada"],
      grade: {
        base: 12,
        bonus: [{ points: 3, terms: ["caducidad", "fin de guardia"] }],
      },
      hint: "El acta autoriza restaurar en réplica. Usa el valor replica y prueba ambos destinos.",
      ending:
        "La cuenta queda limitada. Dos relojes del expediente todavía dificultan decidir cuándo empezó la secuencia.",
    },
    "6.03": {
      opening: `El reporte ${v.id} mezcla la hora local del relevo con el reloj de Vértice. La copia de recepción llegó con demora.`,
      task: "Consulta las dos bitácoras. Registra primero el inicio en UTC y después la retirada de asociaciones. Para el puntaje completo, identifica ambas fuentes y explica la demora de recepción.",
      files: {
        "relevo.log": `${v.local} UTC-05:00 · inicio de orden ${v.id} · fuente relevo`,
        "vertice.log": `${v.event}Z · índice retirado · fuente Vértice\nDemora de recepción: ${v.delay} min. Este desfase se registra por separado.`,
      },
      commands: ["cat relevo.log", "cat vertice.log"],
      note: [v.utc, v.event, "UTC"],
      chronology: [v.utc, v.event],
      grade: {
        base: 15,
        bonus: [
          {
            points: 5,
            terms: ["relevo", "Vértice", "demora", `${v.delay} min`],
          },
        ],
      },
      hint: "Suma cinco horas a relevo.log. El tiempo de recepción de la copia se documenta aparte.",
      ending:
        "La cronología deja una ventana de contención. Una segunda orden permanece en cola.",
    },
    "6.04": {
      opening: `La cola de ${v.asset} admite una orden que repetiría la pérdida. El canal de coordinación de guardia debe seguir disponible.`,
      task: "Aplica la contención y comprueba la orden y el canal. Registra la medida y la disponibilidad. Para el puntaje completo, añade el identificador del control.",
      files: {
        "contencion.txt":
          "Cambio CTR-06 · aislar el segmento de órdenes y preservar coordinación.",
      },
      commands: ["cat contencion.txt"],
      control: {
        name: "contencion",
        initial: "abierta",
        final: "aislada",
        outcomes: {
          abierta: { cola: "Orden pendiente", coordinacion: "Disponible" },
          cierre: { cola: "Interrumpida", coordinacion: "Indisponible" },
          aislada: { cola: "Orden contenida", coordinacion: "Disponible" },
        },
        checks: [
          ["aislada", "cola"],
          ["aislada", "coordinacion"],
        ],
      },
      note: ["orden contenida", "coordinación disponible"],
      grade: { base: 8, bonus: [{ points: 2, terms: ["CTR-06"] }] },
      hint: "El cierre general interrumpe coordinación. La opción aislada conserva ese canal.",
      ending:
        "La cola queda bloqueada y coordinación responde. La junta autoriza probar la copia sellada.",
    },
    "6.05": {
      opening: `Una ficha de ${v.city} quedó válida sin ciudad. La copia de respaldo guarda su relación anterior con ${v.asset}.`,
      task: "Verifica la copia, restaura en réplica y comprueba asociación, identidad y acceso. Registra las tres verificaciones y, para el puntaje completo, el tiempo de recuperación.",
      files: {
        ...signed(
          "respaldo.txt",
          `${v.id} · ${v.guest} → ${v.asset} · custodia junta de guardia\n`,
          "respaldo.sha256",
        ),
        "objetivos.txt": `RTO: 12 min · ventana de prueba prevista: ${v.minutes} min`,
      },
      commands: ["sha256sum -c respaldo.sha256"],
      control: {
        name: "restauracion",
        initial: "pendiente",
        final: "verificada",
        outcomes: {
          pendiente: {
            asociacion: "Ausente",
            identidad: "Disponible en copia",
            acceso: "Denegado por falta de vínculo",
          },
          verificada: {
            asociacion: `${v.guest} → ${v.asset}`,
            identidad: "Titular comprobado",
            acceso: `Disponible · RTO observado ${v.minutes} min`,
          },
        },
        checks: [
          ["verificada", "asociacion"],
          ["verificada", "identidad"],
          ["verificada", "acceso"],
        ],
      },
      note: [v.guest, v.asset, "asociación", "identidad", "acceso"],
      grade: {
        base: 12,
        bonus: [{ points: 3, terms: ["RTO", `${v.minutes} min`] }],
      },
      hint: "Comprueba primero el sello. Usa set restauracion verificada y prueba los tres resultados por separado.",
      ending:
        "La muestra reconoce a su titular y recupera el acceso. La junta pide que otra persona pueda repetir la prueba.",
    },
    "6.06": {
      opening:
        "Tu compañera de cohorte recibe una copia de trabajo. Debe comprobar que el servicio se puede revertir y que el original permaneció bajo custodia.",
      task: "Verifica la copia, ensaya la reversión y devuelve el servicio al estado recuperado. Guarda original, copia, custodia y resultado de la verificación.",
      files: {
        ...signed(
          "revision.txt",
          `COPIA-${v.id} · original ORIG-${v.id} · custodia junta de guardia\n`,
          "revision.sha256",
        ),
      },
      commands: ["sha256sum -c revision.sha256", "cat revision.txt"],
      control: {
        name: "revision",
        initial: "recuperada",
        final: "recuperada",
        outcomes: {
          recuperada: { consulta: "Disponible · acceso de muestra verificado" },
          revertida: {
            consulta: "La muestra vuelve al estado previo de la réplica",
          },
        },
        checks: [
          ["recuperada", "consulta"],
          ["revertida", "consulta"],
          ["recuperada", "consulta"],
        ],
        ordered: true,
      },
      note: [`ORIG-${v.id}`, `COPIA-${v.id}`, "junta de guardia", "OK"],
      grade: { base: 5 },
      hint: "Prueba consulta con la réplica recuperada, con la revisión revertida y otra vez recuperada.",
      ending:
        "La revisión queda bajo custodia. La cabecera que Varela usaba en sus actas aparece en un manifiesto preservado.",
    },
    "6.07": {
      opening:
        "ECO-7 monta una copia de la vieja cabecera CRT. Dos anotaciones corresponden a las marcas que encontraste al recuperar las rutas de Vanta.",
      task: "Verifica el manifiesto y lee las marcas. Entrega el sello bruto respetando mayúsculas y guion bajo.",
      files: {
        ...signed(
          "cabecera.txt",
          "XploitworlD_\nPosición de la primera marca: primer carácter.\nPosición de la última marca: los tres caracteres finales.\n",
          "cabecera.sha256",
        ),
      },
      commands: ["sha256sum -c cabecera.sha256", "cat cabecera.txt"],
      answer: "XlD_",
      caseSensitive: true,
      hint: "El sello une la X inicial con lD_. El carácter junto a D en el título es ele minúscula.",
      ending:
        "Tienes el sello de cabecera. Falta traducirlo al registro de identidades.",
    },
    "6.08": {
      opening:
        "El sello CRT dibuja dos caracteres con el mismo trazo. El mapa de Vértice identifica cuál corresponde a la cuenta.",
      task: "Lee la tabla y busca FORMATO en el registro. Entrega la letra que el glifo intermedio representa en la cuenta.",
      files: {
        "tabla.txt":
          "GLIFO: ele de la cabecera CRT · VALOR: i minúscula en el registro",
        "registro.log":
          "FORMATO · inicial X · glifo según tabla · sufijo d_\nACCESO · alias completo requerido en el expediente final",
      },
      commands: ["cat tabla.txt", "grep -n FORMATO registro.log"],
      answer: "i",
      caseSensitive: true,
      hint: "La tabla convierte el glifo que parece ele en una i minúscula. La ficha del capítulo 4 ya te dio el sufijo.",
      ending:
        "Ya puedes formar el alias. Antes de abrir la copia del director, la junta espera tu recomendación de recuperación.",
    },
    "6.09": {
      opening:
        "Varela vuelve a pedir la firma que lo dejaría al mando. En tu consola aparecen el acta de recuperación y los testimonios que la respaldan.",
      task: "Lee la plantilla y entrega el informe. Incluye el caso, el alias reconstruido, impacto, contención, recuperación y revisión independiente. El traspaso suma los últimos puntos del informe.",
      files: {
        "acta.txt": `${v.id} · campos mínimos: alias, impacto, contención, recuperación, revisión independiente. Traspaso: junta de guardia.`,
      },
      commands: ["cat acta.txt"],
      note: [
        v.id,
        DIRECTOR_ALIAS,
        "impacto",
        "contención",
        "recuperación",
        "revisión independiente",
      ],
      grade: {
        base: 8,
        bonus: [{ points: 2, terms: ["traspaso", "junta de guardia"] }],
      },
      hint: "Combina X, la letra que indica tabla.txt del caso anterior y el sufijo d_. Usa la plantilla para organizar el resto.",
      ending:
        "La junta autoriza abrir la copia del PC de dirección. El informe sustenta la recuperación con revisión independiente.",
    },
    "6.10": {
      opening:
        "La consola de auditoría monta una copia del equipo de Varela. La puerta lleva el mismo sello de la cabecera. ECO-7 espera el acuse local para completar la atribución.",
      task: "Entrega la flag del alias con submit <alias>. Después lee los dos documentos liberados y cierra el caso con check.",
      files: {
        "permiso.txt":
          "Junta de guardia · auditoría de copia local del PC · acceso de solo lectura al expediente autorizado.",
      },
      alias: true,
      commands: [
        "cat director/acuse.txt",
        "grep -n CONT-35 director/actividad.log",
      ],
      hint: "Une la X inicial, la i minúscula de la tabla y d_. Usa submit con el alias como único argumento.",
      ending:
        "El acuse local confirma que Elías Varela ordenó el borrado. La junta invalida el mandato exclusivo y guardia recupera las asociaciones de Vanta. Alma vuelve a oír el buzón en su casa. ECO-7 deja encendida la ruta pública.",
    },
  };
}

export const DIRECTOR_FILES = {
  "director/acuse.txt":
    "ACUSE LOCAL · CONT-35 · Elías Varela · Aprobación presencial en dirección · 00:15Z · Objetivo: retirar asociaciones y activar la cláusula de continuidad.",
  "director/actividad.log":
    "00:15Z CONT-35 · Elías Varela confirma orden del índice en su estación\n00:17Z CONT-35 · Core confirma retirada de asociaciones\n00:18Z · Bruma ejecuta retirada de ruta pública",
};
