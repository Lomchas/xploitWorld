import { cleanEnv, port, str } from "envalid";

export const config = cleanEnv(process.env, {
  PORT: port({ default: 3000 }),
  DATABASE_URL: str({ default: "postgresql://postgres:postgres@localhost:5432/nullprotocol" }),
  REDIS_URL: str({ default: "redis://localhost:6379" }),
  JWT_SECRET: str({ default: "dev-secret-change-in-production" }),
  NODE_ENV: str({ default: "development" }),
});
