import { bool, cleanEnv, host, port, str } from "envalid";
import { readProxyIps } from "./lib/client-address";

export const config = cleanEnv(process.env, {
  GAME_MODE: str({ choices: ["story", "pvp"] }),
  XWD_SERVE_ARENA: bool({ default: false }),
  PORT: port({ default: 3000 }),
  HOST: host({ default: "127.0.0.1" }),
  DATABASE_URL: str(),
  FRONTEND_ORIGINS: str({
    devDefault:
      "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
  }),
  TRUST_PROXY_IPS: str({ default: "" }),
  NODE_ENV: str({
    default: "development",
    choices: ["development", "test", "production"],
  }),
});
export const allowedOrigins = config.FRONTEND_ORIGINS.split(",").map(
  (value) => new URL(value.trim()).origin,
);
export const trustedProxyIps = readProxyIps(config.TRUST_PROXY_IPS);
