import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../database';
import { authMiddleware, AuthRequest, JWT_SECRET, JWT_EXPIRES_IN, ok, fail, addAuditLog, now } from '../middleware';
import type { User } from '../types';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return fail(res, '用户名和密码不能为空');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  if (!user) return fail(res, '用户名或密码错误', 401, 401);

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return fail(res, '用户名或密码错误', 401, 401);

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const { password: _, ...safeUser } = user;

  addAuditLog(user.id, 'auth', 'login', { ip: req.ip, remark: `用户 ${user.username} 登录系统` });
  ok(res, { token, user: safeUser }, '登录成功');
});

authRouter.get('/profile', authMiddleware, (req: AuthRequest, res) => {
  ok(res, req.user);
});

authRouter.post('/logout', authMiddleware, (req: AuthRequest, res) => {
  addAuditLog(req.user!.id, 'auth', 'logout', { remark: '退出登录' });
  ok(res, null, '退出成功');
});

authRouter.put('/password', authMiddleware, (req: AuthRequest, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return fail(res, '请填写原密码和新密码');
  if (newPassword.length < 6) return fail(res, '新密码长度不能少于6位');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as User;
  if (!bcrypt.compareSync(oldPassword, user.password)) return fail(res, '原密码错误');

  const salt = bcrypt.genSaltSync(10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, salt), req.user!.id);
  addAuditLog(req.user!.id, 'auth', 'change_password', { remark: '修改密码' });
  ok(res, null, '密码修改成功');
});
