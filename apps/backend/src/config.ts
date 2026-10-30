import { cleanEnv, port, str } from "envalid";

export const config = cleanEnv(process.env, {
  PORT: port({ default: 3000 }),
  DATABASE_URL: str(),
  REDIS_URL: str(),
  JWT_SECRET: str(),
  NODE_ENV: str({ default: "development" }),
});
