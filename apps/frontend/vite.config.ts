import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import {
  CAMPAIGN_BRANCHES,
  CAMPAIGN_CHAPTERS,
  MISSIONS,
} from "../../packages/shared/src/terminal/missions";

const campaignMessages = new Set<string>([
  ...CAMPAIGN_CHAPTERS.map(({ name }) => name),
  ...CAMPAIGN_BRANCHES.map(({ name }) => name),
  ...MISSIONS.flatMap(({ name, description }) => [
    name,
    name.replace(/^\d\.\d+ · /u, ""),
    description,
  ]),
]);
const campaignTerms =
  /vanta|eco-7|bruma|olvido|mercado cero|\balma\b|\bvarela\b|la primera guardia|first watch|archivist|\bstory\b|\bhistoria\b|campa(?:ña|ign)|\bchapter\b|capítulo|expediente|prólogo|epílogo|prologue|epilogue|xid_/iu;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pvp = mode === "pvp";
  const story = mode === "story";
  const target =
    env.DEV_BACKEND_URL || "http://127.0.0.1:" + (pvp ? 3001 : 3000);
  const proxy =
    pvp || story
      ? {
          "/api": { target, changeOrigin: false },
          "/health": { target, changeOrigin: false },
          "/ws": { target, ws: true, changeOrigin: false },
        }
      : undefined;
  const offset = pvp ? 2 : story ? 1 : 0;
  const filterCatalog: Plugin = {
    name: "arena-localization",
    enforce: "pre",
    transform(source, id) {
      if (
        !pvp ||
        !id.replaceAll("\\", "/").endsWith("/shared/src/locales/en.json")
      )
        return;
      const entries = Object.entries(
        JSON.parse(source) as Record<string, string>,
      );
      const messages = Object.fromEntries(
        entries.filter(([key, value]) => {
          const pair = key + " " + value;
          return (
            !campaignMessages.has(key) &&
            !/\bUNO\b/u.test(pair) &&
            !campaignTerms.test(pair)
          );
        }),
      );
      return JSON.stringify(messages);
    },
  };
  return {
    plugins: [filterCatalog, react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@null-protocol/shared": path.resolve(
          __dirname,
          "../../packages/shared/src/index.ts",
        ),
      },
    },
    publicDir: story ? "public" : false,
    cacheDir: "node_modules/.vite-" + mode,
    build: { outDir: "dist/" + mode, target: "es2022" },
    server: {
      port: 5173 + offset,
      strictPort: true,
      host: "127.0.0.1",
      proxy,
      fs: {
        allow: [__dirname, "../../packages/shared", "../../node_modules"],
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem}",
          "**/migracion-m64/**",
          "**/apps/frontend/dist/**",
          ...(story
            ? []
            : [
                "**/apps/frontend/public/**",
                "story-opening.json",
                "StoryApp.tsx",
                "HistoriaView.tsx",
                "SavedGamesView.tsx",
                "PracticeView.tsx",
                "ExchangeView.tsx",
              ]),
        ],
      },
    },
    preview: {
      port: 4173 + offset,
      strictPort: true,
      host: "127.0.0.1",
      proxy,
    },
  };
});
