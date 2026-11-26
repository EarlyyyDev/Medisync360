import type { ErrorRequestHandler, RequestHandler } from "express";

export interface ApiErrorShape {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (request, _response, next) => {
  next(
    new ApiError(
      404,
      "NOT_FOUND",
      `Route ${request.method} ${request.path} was not found.`,
    ),
  );
};

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  const isApiError = error instanceof ApiError;
  const status = isApiError ? error.status : 500;
  const code = isApiError ? error.code : "INTERNAL_ERROR";
  const message = isApiError
    ? error.message
    : "An unexpected error occurred.";

  if (!isApiError) {
    request.log?.error(
      {
        err: error,
        requestId: request.requestId,
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : undefined,
      },
      "Unhandled request error",
    );
  }

  const body: ApiErrorShape = {
    success: false,
    error: {
      code,
      message,
      requestId: request.requestId,
    },
  };

  response.status(status).json(body);
};
