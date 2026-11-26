import "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log?: import("pino").Logger;
      user?: {
        id: string;
        email: string;
        displayName: string;
        permissions: string[];
      };
      csrfToken?: string;
    }
  }
}
