import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createDemoOperator } from "../src/lib/account";
import { PvpService } from "../src/pvp/service";

const db = new PrismaClient();
async function main(): Promise<void> {
  const { user, key } = await createDemoOperator(db);
  try {
    const { self } = await new PvpService(db, undefined, true).join(
      user.id,
      "sa",
      user.username,
    );
    console.log("Operador de prueba: " + user.username);
    console.log("Clave de acceso: " + key);
    console.log(
      "Arena: Sudamérica · IPv6 " +
        self.address +
        " · IPv4 " +
        (self.ipv4 ?? "sin asignar"),
    );
    console.log("Usa estas credenciales en Contratos → Iniciar sesión.");
  } catch (error: unknown) {
    await db.user.delete({ where: { id: user.id } });
    throw error;
  }
}
void main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Falló la creación del operador.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
