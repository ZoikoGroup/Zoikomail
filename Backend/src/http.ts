import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

/**
 * Error envelope from API §4 — code, message and a request id that also
 * appears in the logs, so a support conversation can start from the id the
 * user was shown.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/** Honours an inbound X-Request-ID so a trace spans frontend and backend. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('X-Request-ID');
  req.requestId = inbound && /^[\w-]{1,64}$/.test(inbound) ? inbound : `req_${randomBytes(4).toString('hex')}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: 'No such endpoint.', request_id: req.requestId },
  } satisfies ApiErrorBody);
}

/**
 * Terminal error handler.
 *
 * Internal failures return a fixed message. A database error text can name
 * tables, columns and constraints, which is free reconnaissance — it belongs in
 * the log, not the response.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, request_id: req.requestId },
    } satisfies ApiErrorBody);
    return;
  }

  console.error(`[${req.requestId}] unhandled:`, error);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'The request could not be completed.',
      request_id: req.requestId,
    },
  } satisfies ApiErrorBody);
}

/** Client address for the audit row, respecting a single trusted proxy hop. */
export function clientIp(req: Request): string | null {
  const forwarded = req.header('X-Forwarded-For');
  const raw = forwarded ? forwarded.split(',')[0]!.trim() : req.socket.remoteAddress;
  if (!raw) return null;
  // Postgres INET rejects the IPv4-mapped IPv6 form Node reports on dual-stack.
  return raw.replace(/^::ffff:/, '');
}
