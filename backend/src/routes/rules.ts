import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { authMiddleware, AuthRequest, requireRoles, ok, fail, addAuditLog, now, paginate } from '../middleware';
import type { TemperatureRule, User } from '../types';

export const ruleRouter = Router();
ruleRouter.use(authMiddleware);

ruleRouter.get('/', (req: AuthRequest, res) => {
  const { category, sub_category, storage_type, status, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM temperature_rules WHERE 1=1';
  const params: unknown[] = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (sub_category) { sql += ' AND sub_category = ?'; params.push(sub_category); }
  if (storage_type) { sql += ' AND storage_type = ?'; params.push(storage_type); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  const all = db.prepare(sql).all(...params) as TemperatureRule[];
  ok(res, paginate(all, Number(page), Number(pageSize)));
});

ruleRouter.get('/:id', (req: AuthRequest, res) => {
  const rule = db.prepare('SELECT * FROM temperature_rules WHERE id = ?').get(req.params.id) as TemperatureRule | undefined;
  if (!rule) return fail(res, '规则不存在', 404, 404);
  ok(res, rule);
});

ruleRouter.get('/match/auto', (req: AuthRequest, res) => {
  const { category, sub_category, storage_type, transport_mode } = req.query;
  let sql = `SELECT * FROM temperature_rules WHERE status = 'approved' AND category = ? AND sub_category = ? AND storage_type = ?`;
  const params: unknown[] = [category, sub_category, storage_type];
  if (transport_mode) { sql += ' AND (transport_mode IS NULL OR transport_mode = ?)'; params.push(transport_mode); }
  sql += ' ORDER BY is_custom ASC, transport_mode IS NULL ASC LIMIT 1';
  const rule = db.prepare(sql).get(...params) as TemperatureRule | undefined;
  ok(res, rule || null);
});

ruleRouter.post('/', requireRoles(['qc', 'quality_director', 'warehouse_manager']), (req: AuthRequest, res) => {
  const r = req.body as Partial<TemperatureRule>;
  if (!r.category || !r.sub_category || !r.storage_type || r.temp_min === undefined || r.temp_max === undefined) {
    return fail(res, '缺少必要参数');
  }
  const id = uuidv4();
  const n = now();
  const needApproval = req.user!.role !== 'quality_director';
  db.prepare(`
    INSERT INTO temperature_rules (id, category, sub_category, storage_type, transport_mode,
      temp_min, temp_max, humidity_min, humidity_max, temp_fluctuation_limit, single_overtime_limit, total_overtime_limit,
      name, description, is_custom, created_by, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(id, r.category, r.sub_category, r.storage_type, r.transport_mode || null,
    r.temp_min, r.temp_max, r.humidity_min ?? 35, r.humidity_max ?? 75,
    r.temp_fluctuation_limit ?? null, r.single_overtime_limit ?? null, r.total_overtime_limit ?? null,
    r.name || '自定义规则', r.description || '', req.user!.id, needApproval ? 'pending' : 'approved', n, n);

  addAuditLog(req.user!.id, 'rule', 'create', { targetType: 'temperature_rule', targetId: id, newValue: r });
  ok(res, { id, status: needApproval ? 'pending' : 'approved' }, needApproval ? '规则创建成功，待质量总监审核' : '规则创建成功');
});

ruleRouter.put('/:id', requireRoles(['qc', 'quality_director']), (req: AuthRequest, res) => {
  const old = db.prepare('SELECT * FROM temperature_rules WHERE id = ?').get(req.params.id) as TemperatureRule | undefined;
  if (!old) return fail(res, '规则不存在', 404, 404);
  const r = req.body as Partial<TemperatureRule>;
  const n = now();
  db.prepare(`
    UPDATE temperature_rules SET category=?, sub_category=?, storage_type=?, transport_mode=?,
      temp_min=?, temp_max=?, humidity_min=?, humidity_max=?, temp_fluctuation_limit=?, single_overtime_limit=?, total_overtime_limit=?,
      name=?, description=?, updated_at=? WHERE id=?
  `).run(r.category ?? old.category, r.sub_category ?? old.sub_category, r.storage_type ?? old.storage_type, r.transport_mode ?? old.transport_mode,
    r.temp_min ?? old.temp_min, r.temp_max ?? old.temp_max, r.humidity_min ?? old.humidity_min, r.humidity_max ?? old.humidity_max,
    r.temp_fluctuation_limit ?? old.temp_fluctuation_limit, r.single_overtime_limit ?? old.single_overtime_limit, r.total_overtime_limit ?? old.total_overtime_limit,
    r.name ?? old.name, r.description ?? old.description, n, req.params.id);

  addAuditLog(req.user!.id, 'rule', 'update', { targetType: 'temperature_rule', targetId: req.params.id, oldValue: old, newValue: r });
  ok(res, null, '规则更新成功');
});

ruleRouter.post('/:id/approve', requireRoles(['quality_director']), (req: AuthRequest, res) => {
  const rule = db.prepare('SELECT * FROM temperature_rules WHERE id = ?').get(req.params.id) as TemperatureRule | undefined;
  if (!rule) return fail(res, '规则不存在', 404, 404);
  const { approved, remark } = req.body;
  db.prepare('UPDATE temperature_rules SET status = ?, approved_by = ?, updated_at = ? WHERE id = ?')
    .run(approved ? 'approved' : 'rejected', req.user!.id, now(), req.params.id);
  addAuditLog(req.user!.id, 'rule', approved ? 'approve' : 'reject', { targetId: req.params.id, remark });
  ok(res, null, approved ? '审核通过' : '已驳回');
});

ruleRouter.delete('/:id', requireRoles(['quality_director']), (req: AuthRequest, res) => {
  const rule = db.prepare('SELECT * FROM temperature_rules WHERE id = ?').get(req.params.id) as TemperatureRule | undefined;
  if (!rule) return fail(res, '规则不存在', 404, 404);
  if (!rule.is_custom) return fail(res, '系统内置规则不可删除');
  db.prepare('DELETE FROM temperature_rules WHERE id = ?').run(req.params.id);
  addAuditLog(req.user!.id, 'rule', 'delete', { targetId: req.params.id, oldValue: rule });
  ok(res, null, '删除成功');
});
