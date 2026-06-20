import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { authMiddleware, AuthRequest, requireRoles, ok, fail, addAuditLog, now, paginate } from '../middleware';
import type { Cargo, IoTag } from '../types';

export const cargoRouter = Router();
cargoRouter.use(authMiddleware);

function generateCargoNo(): string {
  const d = new Date();
  const prefix = `CC${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const last = db.prepare("SELECT cargo_no FROM cargos WHERE cargo_no LIKE ? ORDER BY cargo_no DESC LIMIT 1")
    .get(`${prefix}%`) as { cargo_no: string } | undefined;
  const seq = last ? parseInt(last.cargo_no.slice(-4)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

cargoRouter.get('/', (req: AuthRequest, res) => {
  const { status, category, keyword, transport_no, page = 1, pageSize = 20 } = req.query;
  let sql = `SELECT c.*, r.name as rule_name, t.tag_no, v.plate_no, w.name as warehouse_name
             FROM cargos c
             LEFT JOIN temperature_rules r ON c.rule_id = r.id
             LEFT JOIN io_tags t ON c.id = t.cargo_id
             LEFT JOIN vehicles v ON c.vehicle_id = v.id
             LEFT JOIN warehouses w ON c.warehouse_id = w.id
             WHERE 1=1`;
  const params: unknown[] = [];
  if (status) { sql += ' AND c.status = ?'; params.push(status); }
  if (category) { sql += ' AND c.category = ?'; params.push(category); }
  if (transport_no) { sql += ' AND c.transport_no = ?'; params.push(transport_no); }
  if (keyword) { sql += ' AND (c.cargo_no LIKE ? OR c.name LIKE ? OR c.transport_no LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY c.created_at DESC';
  const all = db.prepare(sql).all(...params);
  ok(res, paginate(all, Number(page), Number(pageSize)));
});

cargoRouter.get('/:id', (req: AuthRequest, res) => {
  const cargo = db.prepare(`
    SELECT c.*, r.name as rule_name, r.temp_min, r.temp_max, r.humidity_min, r.humidity_max,
           r.single_overtime_limit, r.total_overtime_limit, r.temp_fluctuation_limit,
           t.id as tag_id, t.tag_no, t.battery_level, t.communication_status, t.sensor_accuracy,
           v.plate_no, v.type as vehicle_type
    FROM cargos c
    LEFT JOIN temperature_rules r ON c.rule_id = r.id
    LEFT JOIN io_tags t ON c.id = t.cargo_id
    LEFT JOIN vehicles v ON c.vehicle_id = v.id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!cargo) return fail(res, '货物不存在', 404, 404);
  ok(res, cargo);
});

cargoRouter.post('/', requireRoles(['qc', 'warehouse_manager', 'quality_director']), (req: AuthRequest, res) => {
  const c = req.body as Partial<Cargo>;
  const required = ['name', 'category', 'sub_category', 'shipper', 'receiver', 'quantity', 'rule_id'];
  for (const f of required) if (!(c as any)[f]) return fail(res, `缺少必要参数: ${f}`);

  const id = uuidv4();
  const cargo_no = c.cargo_no || generateCargoNo();
  const transport_no = c.transport_no || `TR${Date.now().toString().slice(-8)}`;
  const n = now();
  db.prepare(`
    INSERT INTO cargos (id, cargo_no, name, category, sub_category, specification, production_date, expiry_date,
      shipper, receiver, receiver_address, transport_no, vehicle_id, warehouse_id, quantity, unit, value, rule_id,
      status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_outbound', ?)
  `).run(id, cargo_no, c.name, c.category, c.sub_category, c.specification || null, c.production_date || null,
    c.expiry_date || null, c.shipper, c.receiver, c.receiver_address || null, transport_no,
    c.vehicle_id || null, c.warehouse_id || null, c.quantity, c.unit || '件', c.value || 0, c.rule_id, n);

  addAuditLog(req.user!.id, 'cargo', 'create', { targetType: 'cargo', targetId: id, newValue: c });
  ok(res, { id, cargo_no, transport_no }, '货物创建成功');
});

cargoRouter.post('/:id/bind-tag', requireRoles(['qc', 'warehouse_manager', 'quality_director']), (req: AuthRequest, res) => {
  const { tag_id } = req.body;
  if (!tag_id) return fail(res, '请选择标签');
  const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(req.params.id) as Cargo | undefined;
  const tag = db.prepare('SELECT * FROM io_tags WHERE id = ?').get(tag_id) as IoTag | undefined;
  if (!cargo) return fail(res, '货物不存在', 404, 404);
  if (!tag) return fail(res, '标签不存在', 404, 404);
  if (tag.status !== 'idle' && tag.cargo_id !== cargo.id) return fail(res, '标签已被占用或状态异常');

  const n = now();
  db.prepare('UPDATE io_tags SET cargo_id = ?, status = ? WHERE id = ?').run(cargo.id, 'bound', tag.id);
  db.prepare('UPDATE cargos SET status = ? WHERE id = ?').run('outbound', cargo.id);
  db.prepare(`INSERT INTO binding_logs (id, cargo_id, tag_id, operation_type, operator_id, created_at)
    VALUES (?, ?, ?, 'bind', ?, ?)`).run(uuidv4(), cargo.id, tag.id, req.user!.id, n);

  addAuditLog(req.user!.id, 'cargo', 'bind_tag', { targetId: cargo.id, remark: `绑定标签 ${tag.tag_no}` });
  ok(res, { bound: true, tag_no: tag.tag_no }, '标签绑定成功');
});

cargoRouter.post('/:id/check-device', (req: AuthRequest, res) => {
  const tag = db.prepare(`SELECT t.*, c.status as cargo_status FROM io_tags t
    LEFT JOIN cargos c ON t.cargo_id = c.id WHERE c.id = ?`).get(req.params.id) as any;
  if (!tag) return fail(res, '未绑定标签');

  const checks: { item: string; ok: boolean; value: unknown; message: string }[] = [
    { item: '通信状态', ok: tag.communication_status === 'online', value: tag.communication_status, message: tag.communication_status === 'online' ? '正常' : '离线，请检查标签网络' },
    { item: '电量', ok: tag.battery_level >= 20, value: `${tag.battery_level}%`, message: tag.battery_level >= 20 ? `电量充足(${tag.battery_level}%)` : `电量过低(${tag.battery_level}%)，请充电` },
    { item: '传感器精度', ok: tag.sensor_accuracy <= 0.3, value: `±${tag.sensor_accuracy}℃`, message: tag.sensor_accuracy <= 0.3 ? '精度达标' : '传感器精度不足，请校准或更换' },
    { item: '标签状态', ok: tag.status === 'bound' || tag.status === 'in_transit', value: tag.status, message: '状态正常' },
  ];
  const allOk = checks.every(c => c.ok);
  ok(res, { passed: allOk, checks }, allOk ? '设备校验通过' : '设备存在异常，请处理');
});

cargoRouter.post('/:id/start-transport', requireRoles(['qc', 'warehouse_manager', 'driver']), (req: AuthRequest, res) => {
  const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(req.params.id) as Cargo | undefined;
  if (!cargo) return fail(res, '货物不存在', 404, 404);
  if (!['outbound', 'in_transit'].includes(cargo.status)) return fail(res, '当前状态无法启运');
  const n = now();
  db.prepare("UPDATE cargos SET status = 'in_transit', outbound_time = ? WHERE id = ?").run(cargo.outbound_time || n, cargo.id);
  db.prepare("UPDATE io_tags SET status = 'in_transit', last_heartbeat = ? WHERE cargo_id = ?").run(n, cargo.id);
  addAuditLog(req.user!.id, 'cargo', 'start_transport', { targetId: cargo.id });
  ok(res, null, '启运成功');
});

cargoRouter.post('/:id/arrive', requireRoles(['qc', 'warehouse_manager', 'driver']), (req: AuthRequest, res) => {
  const { warehouse_id } = req.body;
  const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(req.params.id) as Cargo | undefined;
  if (!cargo) return fail(res, '货物不存在', 404, 404);
  if (cargo.status !== 'in_transit') return fail(res, '货物不在运输中');
  const n = now();
  db.prepare("UPDATE cargos SET status = 'arrived', arrival_time = ?, warehouse_id = COALESCE(?, warehouse_id) WHERE id = ?")
    .run(n, warehouse_id || null, cargo.id);
  db.prepare("UPDATE io_tags SET status = 'in_warehouse', current_location = (SELECT name FROM warehouses WHERE id = ?) WHERE cargo_id = ?")
    .run(warehouse_id || cargo.warehouse_id, cargo.id);
  addAuditLog(req.user!.id, 'cargo', 'arrive', { targetId: cargo.id });
  ok(res, null, '已到库');
});

cargoRouter.put('/:id/status', requireRoles(['qc', 'warehouse_manager', 'quality_director']), (req: AuthRequest, res) => {
  const { status } = req.body;
  const valid = ['pending_outbound', 'outbound', 'in_transit', 'arrived', 'in_warehouse', 'accepted', 'rejected'];
  if (!valid.includes(status)) return fail(res, '无效状态');
  const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(req.params.id) as Cargo | undefined;
  if (!cargo) return fail(res, '货物不存在', 404, 404);
  const n = now();
  const fields: string[] = [];
  const params: unknown[] = [];
  if (status === 'accepted') { fields.push('accept_time = ?'); params.push(n); }
  fields.push('status = ?'); params.push(status);
  fields.push('id = ?'); params.push(cargo.id);
  db.prepare(`UPDATE cargos SET ${fields.join(', ')}`).run(...params);
  addAuditLog(req.user!.id, 'cargo', 'update_status', { targetId: cargo.id, oldValue: cargo.status, newValue: status });
  ok(res, null, '状态已更新');
});

cargoRouter.get('/:id/timeline', (req: AuthRequest, res) => {
  const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(req.params.id) as any;
  if (!cargo) return fail(res, '货物不存在', 404, 404);

  const audits = db.prepare(`SELECT a.*, u.name as user_name FROM audit_logs a 
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.target_id = ? AND a.module = 'cargo' ORDER BY a.created_at ASC`)
    .all(req.params.id) as any[];

  const reports = db.prepare(`SELECT id, report_no, generated_at FROM compliance_reports WHERE cargo_id = ? ORDER BY generated_at DESC LIMIT 1`)
    .all(req.params.id) as any[];

  const bindings = db.prepare(`SELECT * FROM binding_logs WHERE cargo_id = ? ORDER BY created_at ASC`)
    .all(req.params.id) as any[];

  const nodes: { key: string; label: string; status: 'done' | 'pending' | 'current'; time: string | null; user: string | null; remark: string }[] = [
    { key: 'create', label: '创建批次', status: 'pending', time: null, user: null, remark: '' },
    { key: 'bind_tag', label: '绑定标签', status: 'pending', time: null, user: null, remark: '' },
    { key: 'verify_device', label: '设备校验', status: 'pending', time: null, user: null, remark: '' },
    { key: 'start_transport', label: '启运出库', status: 'pending', time: null, user: null, remark: '' },
    { key: 'arrive', label: '到库', status: 'pending', time: null, user: null, remark: '' },
    { key: 'accept', label: '验收入库', status: 'pending', time: null, user: null, remark: '' },
    { key: 'generate_report', label: '生成合规报告', status: 'pending', time: null, user: null, remark: '' },
  ];

  const findAudit = (action: string) => audits.find(a => a.action === action);

  const setNode = (key: string, audit: any, extraRemark = '') => {
    const node = nodes.find(n => n.key === key);
    if (node && audit) {
      node.status = 'done';
      node.time = audit.created_at;
      node.user = audit.user_name || audit.user_id;
      node.remark = audit.remark || extraRemark;
    }
  };

  setNode('create', findAudit('create'));
  const bind = bindings.find(b => b.operation_type === 'bind');
  if (bind) {
    const n = nodes.find(n => n.key === 'bind_tag');
    if (n) { n.status = 'done'; n.time = bind.created_at; n.remark = '绑定标签成功'; }
  }
  setNode('verify_device', findAudit('verify_device'));
  setNode('start_transport', findAudit('start_transport'));
  setNode('arrive', findAudit('arrive'));

  const acceptAudit = findAudit('accept');
  if (acceptAudit) {
    setNode('accept', acceptAudit, '验收通过，正常入库');
  } else if (cargo.accept_time && cargo.status === 'accepted') {
    const n = nodes.find(n => n.key === 'accept');
    if (n) { n.status = 'done'; n.time = cargo.accept_time; n.user = '系统'; n.remark = '验收通过，正常入库'; }
  }

  if (reports.length > 0) {
    const n = nodes.find(n => n.key === 'generate_report');
    if (n) { n.status = 'done'; n.time = reports[0].generated_at; n.remark = '报告编号: ' + reports[0].report_no; }
  }

  const statusWeights: Record<string, number> = {
    pending_outbound: 0, outbound: 1, in_transit: 2, arrived: 3, in_warehouse: 4, accepted: 5, rejected: 5,
  };
  const currentWeight = statusWeights[cargo.status] ?? 0;

  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].status === 'pending' && i <= currentWeight + 1) {
      nodes[i].status = 'current';
      break;
    }
  }

  ok(res, { cargo, nodes, audits, reports });
});

cargoRouter.get('/:id/recent-exceptions', (req: AuthRequest, res) => {
  const data = db.prepare(`SELECT e.*, c.cargo_no, c.name as cargo_name
    FROM exception_records e LEFT JOIN cargos c ON e.cargo_id = c.id
    WHERE e.cargo_id = ? ORDER BY e.occur_time DESC LIMIT 3`).all(req.params.id);
  ok(res, data);
});

export const tagRouter = Router();
tagRouter.use(authMiddleware);

tagRouter.get('/', (req: AuthRequest, res) => {
  const { status, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT t.*, c.cargo_no, c.name as cargo_name
             FROM io_tags t LEFT JOIN cargos c ON t.cargo_id = c.id WHERE 1=1`;
  const params: unknown[] = [];
  if (status && status !== 'all') { sql += ' AND t.status = ?'; params.push(status); }
  sql += ' ORDER BY t.created_at DESC';
  const all = db.prepare(sql).all(...params);
  ok(res, paginate(all, Number(page), Number(pageSize)));
});

tagRouter.post('/', requireRoles(['qc', 'quality_director', 'warehouse_manager']), (req: AuthRequest, res) => {
  const { tag_no, firmware_version } = req.body;
  if (!tag_no) return fail(res, '标签编号不能为空');
  const exist = db.prepare('SELECT id FROM io_tags WHERE tag_no = ?').get(tag_no);
  if (exist) return fail(res, '标签编号已存在');
  const id = uuidv4();
  db.prepare(`INSERT INTO io_tags (id, tag_no, firmware_version, created_at)
    VALUES (?, ?, ?, ?)`).run(id, tag_no, firmware_version || 'v2.3.1', now());
  addAuditLog(req.user!.id, 'tag', 'create', { targetId: id });
  ok(res, { id }, '标签创建成功');
});

tagRouter.put('/:id', requireRoles(['qc', 'quality_director', 'warehouse_manager']), (req: AuthRequest, res) => {
  const { battery_level, communication_status, sensor_accuracy, status } = req.body;
  const tag = db.prepare('SELECT * FROM io_tags WHERE id = ?').get(req.params.id) as IoTag | undefined;
  if (!tag) return fail(res, '标签不存在', 404, 404);
  db.prepare(`UPDATE io_tags SET battery_level=?, communication_status=?, sensor_accuracy=?, status=?, last_check_time=? WHERE id=?`)
    .run(battery_level ?? tag.battery_level, communication_status ?? tag.communication_status,
      sensor_accuracy ?? tag.sensor_accuracy, status ?? tag.status, now(), tag.id);
  ok(res, null, '标签已更新');
});
