import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncRoute(
  handler: (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
