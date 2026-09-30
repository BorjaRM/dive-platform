import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  type HttpStatus,
} from '@nestjs/common';

export class ApiProblemException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    detail?: string,
    readonly headers?: Readonly<Record<string, string>>,
  ) {
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
export class ApiProblemFilter
  implements ExceptionFilter<HttpException | SyntaxError>
{
  catch(exception: HttpException | SyntaxError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const request = host
      .switchToHttp()
      .getRequest<{ originalUrl?: string; url?: string }>();
    const path = request.originalUrl ?? request.url ?? '';
    const isCatalogPath =
      /^\/v1\/centers\/[^/]+\/(activities|slots|channels|catalog-settings)(\/|$)/.test(
        path,
      );
    const isPublicBookingPath =
      /^\/v1\/public\/channels\/[^/]+\/bookings(\/|$)/.test(path);
    const isBootstrapInvitationPath =
      /^\/v1\/platform\/bootstrap-invitations(\/|$)/.test(path);
    if (!isCatalogPath && !isPublicBookingPath && !isBootstrapInvitationPath) {
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
    const problemPayload =
      typeof payload === 'object' && payload !== null
        ? (payload as { code?: string; detail?: string })
        : {};
    const code =
      problemPayload.code ??
      {
        400: 'malformed_json',
        401: 'unauthenticated',
        403: 'permission_denied',
        404: 'resource_not_found',
        422: 'validation_error',
      }[status] ??
      'http_error';
    if (exception instanceof ApiProblemException) {
      for (const [name, value] of Object.entries(exception.headers ?? {})) {
        response.setHeader(name, value);
      }
    }
    response
      .status(status)
      .type('application/problem+json')
      .send({
        type: `https://api.dive-platform.test/problems/${code}`,
        title: code,
        status,
        code,
        ...(problemPayload.detail ? { detail: problemPayload.detail } : {}),
      });
  }
}
