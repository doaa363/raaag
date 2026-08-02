import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedUser {
  id: string;
  companyId: string;
  role: string;
  departmentId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const userId = (req.headers['x-user-id'] as string) || 'default-user-id';
  const companyId = (req.headers['x-company-id'] as string) || '60d5ecb8b3b3a30015f8e5a1';
  const role = (req.headers['x-user-role'] as string) || 'DISPATCHER';
  const departmentId = req.headers['x-department-id'] as string;

  req.user = {
    id: userId,
    companyId,
    role,
    departmentId,
  };

  next();
}
