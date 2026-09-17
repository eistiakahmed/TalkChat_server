import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';

/**
 * Express Request Validation Middleware Factory.
 * 
 * Intercepts incoming Express requests and validates `req.body`, `req.query`, and `req.params`
 * against the provided Zod schema. If validation fails, Zod throws a `ZodError` which is caught
 * and passed to the centralized `errorHandler` for localized formatting.
 * 
 * @param schema - Any valid Zod object schema
 * @returns Express middleware handler
 * 
 * @see https://expressjs.com/en/guide/using-middleware.html
 * @see https://zod.dev/?id=safeparse
 */
export const validate = (schema: AnyZodObject) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      next(error);
    }
  };
};
