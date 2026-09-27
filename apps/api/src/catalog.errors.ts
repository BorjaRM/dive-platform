import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  type HttpStatus,
} from '@nestjs/common';

export class CatalogProblemException extends HttpException {
  constructor(status: HttpStatus, code: string, detail?: string) {
    super(
      {
        type: `https://api.dive-platform.test/problems/${code}`,
        title: code,
        status,
        code,
        ...(detail ? { detail } : {}),
      },
      status,
    );
  }
}

@Catch(HttpException, SyntaxError)
export class CatalogProblemFilter
  implements ExceptionFilter<HttpException | SyntaxError>
{
  catch(exception: HttpException | SyntaxError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const request = host
      .switchToHttp()
      .getRequest<{ originalUrl?: string; url?: string }>();
    const path = request.originalUrl ?? request.url ?? '';
    const isCatalogPath =
      /^\/v1\/centers\/[^/]+\/(activities|slots)(\/|$)/.test(path);
    if (!isCatalogPath) {
      if (exception instanceof HttpException) {
        response.status(exception.getStatus()).send(exception.getResponse());
      } else {
        response.status(400).send({
          message: 'Bad Request',
          error: 'Bad Request',
          statusCode: 400,
        });
      }
      return;
    }
    const status =
      exception instanceof HttpException ? exception.getStatus() : 400;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : {};
    const catalogPayload =
      typeof payload === 'object' && payload !== null
        ? (payload as { code?: string; detail?: string })
        : {};
    const code =
      catalogPayload.code ??
      {
        400: 'malformed_json',
        401: 'unauthenticated',
        403: 'permission_denied',
        404: 'resource_not_found',
        422: 'validation_error',
      }[status] ??
      'http_error';
    response
      .status(status)
      .type('application/problem+json')
      .send({
        type: `https://api.dive-platform.test/problems/${code}`,
        title: code,
        status,
        code,
        ...(catalogPayload.detail ? { detail: catalogPayload.detail } : {}),
      });
  }
}
