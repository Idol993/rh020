import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './database';
import type { User } from './types';

export const JWT_SECRET = process.env.JWT_SECRET || 'coldchain-platform-secret-key-2024';
export const JWT_EXPIRES_IN = '24h';

export interface AuthRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未提供认证令牌' });
  }
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId) as User | undefined;
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    const { password: _, ...safeUser } = user;
    req.user = safeUser as User;
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
  }
}

export function requireRoles(roles: User['role'][]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ code: 401, message: '未认证' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: '权限不足' });
    }
    next();
  };
}

export function now(): string {
  return new Date().toISOString();
}

export function addAuditLog(userId: string, module: string, action: string, opts: {
  targetType?: string; targetId?: string; oldValue?: unknown; newValue?: unknown; ip?: string; remark?: string;
} = {}) {
  const { v4: uuidv4 } = require('uuid');
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, module, action, target_type, target_id, old_value, new_value, ip_address, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(), userId, module, action,
    opts.targetType || null, opts.targetId || null,
    opts.oldValue !== undefined ? JSON.stringify(opts.oldValue) : null,
    opts.newValue !== undefined ? JSON.stringify(opts.newValue) : null,
    opts.ip || null, opts.remark || null, now()
  );
}

export function ok<T>(res: Response, data: T, message = 'success') {
  return res.json({ code: 0, data, message });
}

export function fail(res: Response, message: string, code = 400, status = 400) {
  return res.status(status).json({ code, message });
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const start = (page - 1) * pageSize;
  const list = items.slice(start, start + pageSize);
  return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
