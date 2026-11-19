import express, {
  type RequestHandler,
  type Response,
  type Router,
} from "express";
import type { PrismaClient } from "@prisma/client";
import {
  WORKSPACE_IMAGE_TYPES,
  WORKSPACE_LIMITS,
  WORKSPACE_ROOT,
} from "@null-protocol/shared";
import { asyncRoute, HttpError } from "../lib/http";
import type { AuthenticatedSession } from "../lib/session";
import { parseWorkspaceAction, WorkspaceService } from "./service";

export function workspaceRoutes(
  db: PrismaClient,
  auth: RequestHandler,
  root = WORKSPACE_ROOT,
): Router {
  const router = express.Router();
  const workspace = new WorkspaceService(db, root);
  const owner = (res: Response) =>
    (res.locals.session as AuthenticatedSession).user.id;
  router.use(auth);
  router.get(
    "/entries",
    asyncRoute(async (req, res) => {
      res.json(await workspace.list(owner(res), req.query.path));
    }),
  );
  router.get(
    "/text",
    asyncRoute(async (req, res) => {
      res.json(await workspace.text(owner(res), req.query.path));
    }),
  );
  router.post(
    "/entries",
    express.json({ limit: "100kb", strict: true }),
    asyncRoute(async (req, res) => {
      res.json(
        await workspace.mutate(
          owner(res),
          parseWorkspaceAction(req.body, root),
        ),
      );
    }),
  );
  router.put(
    "/image",
    express.raw({
      type: [...WORKSPACE_IMAGE_TYPES],
      limit: WORKSPACE_LIMITS.fileImageBytes,
      inflate: false,
    }),
    asyncRoute(async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        throw new HttpError(415, "Envía una imagen PNG, JPEG o WebP.");
      res
        .status(201)
        .json(
          await workspace.importImage(
            owner(res),
            req.query.path,
            req.body,
            req.get("Content-Type"),
          ),
        );
    }),
  );
  router.get(
    "/image",
    asyncRoute(async (req, res) => {
      const { image, mime } = await workspace.image(owner(res), req.query.path);
      res.type(mime).send(image);
    }),
  );
  return router;
}
