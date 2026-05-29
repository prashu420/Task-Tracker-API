import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Maps a small set of HTTP statuses to stable string codes. The code is part of
 * the public error contract, so clients can branch on it without parsing prose.
 */
const STATUS_CODE_MAP: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Single source of truth for the error response shape across every endpoint:
 *   { "status": 400, "code": "VALIDATION_ERROR", "message": "..." }
 *
 * Domain code throws standard Nest exceptions; to customise the `code`, pass an
 * object response, e.g. `new ConflictException({ code: 'EMAIL_TAKEN', message })`.
 * Unknown (non-HTTP) errors are logged in full but returned as a generic 500 so
 * we never leak stack traces or internals to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODE_MAP[status] ?? 'ERROR';

      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        if (typeof obj.code === 'string') code = obj.code;
        // class-validator yields an array of messages; surface the first.
        message = Array.isArray(obj.message)
          ? String(obj.message[0])
          : typeof obj.message === 'string'
            ? obj.message
            : message;
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({ status, code, message });
  }
}
