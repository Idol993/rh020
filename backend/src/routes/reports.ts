import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { authMiddleware, AuthRequest, requireRoles, ok, fail, addAuditLog, now, paginate } from '../middleware';
import type { Cargo, ComplianceReport, TemperatureRule } from '../types';

export const reportRouter = Router();
reportRouter.use(authMiddleware);

function generateReportNo(): string {
  const d = new Date();
  const prefix = `RPT${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}${seq}`;
}

reportRouter.get('/', (req: AuthRequest, res) => {
  const { conclusion, cargo_id, page = 1, pageSize = 20 } = req.query;
  let sql = `SELECT r.*, c.cargo_no, c.name as cargo_name, c.category, c.transport_no,
                    u.name as generated_name, us.name as signed_name
             FROM compliance_reports r
             LEFT JOIN cargos c ON r.cargo_id = c.id
             LEFT JOIN users u ON r.generated_by = u.id
             LEFT JOIN users us ON r.signed_by = us.id
             WHERE 1=1`;
  const params: unknown[] = [];
  if (conclusion && conclusion !== 'all') { sql += ' AND r.conclusion = ?'; params.push(conclusion); }
  if (cargo_id) { sql += ' AND r.cargo_id = ?'; params.push(cargo_id); }
  sql += ' ORDER BY r.generated_at DESC';
  const all = db.prepare(sql).all(...params);
  ok(res, paginate(all, Number(page), Number(pageSize)));
});

reportRouter.get('/:id', (req: AuthRequest, res) => {
  const report = db.prepare(`SELECT r.*, c.*, rule.name as rule_name, rule.temp_min, rule.temp_max,
    rule.humidity_min, rule.humidity_max, u.name as generated_name
    FROM compliance_reports r
    LEFT JOIN cargos c ON r.cargo_id = c.id
    LEFT JOIN temperature_rules rule ON c.rule_id = rule.id
    LEFT JOIN users u ON r.generated_by = u.id
    WHERE r.id = ?`).get(req.params.id);
  if (!report) return fail(res, '报告不存在', 404, 404);
  const temperatureData = db.prepare(`SELECT * FROM temperature_data
    WHERE cargo_id = ? AND collection_time BETWEEN ? AND ? ORDER BY collection_time`)
    .all(report.cargo_id, report.start_time, report.end_time);
  const exceptions = db.prepare(`SELECT e.* FROM exception_records e
    WHERE e.cargo_id = ? AND e.occur_time BETWEEN ? AND ? ORDER BY e.occur_time`)
    .all(report.cargo_id, report.start_time, report.end_time);
  ok(res, { ...report, temperatureData, exceptions });
});

reportRouter.post('/generate', requireRoles(['qc', 'warehouse_manager', 'quality_director', 'driver']), (req: AuthRequest, res) => {
  const { cargo_id, start_time, end_time, auto_range = true } = req.body;
  const cargo = db.prepare('SELECT c.*, r.* FROM cargos c JOIN temperature_rules r ON c.rule_id = r.id WHERE c.id = ?')
    .get(cargo_id) as (Cargo & TemperatureRule) | undefined;
  if (!cargo) return fail(res, '货物不存在', 404, 404);

  const effective_start = auto_range ? (cargo.outbound_time || cargo.created_at) : start_time;
  const effective_end = auto_range ? (cargo.arrival_time || now()) : end_time;

  const data = db.prepare(`SELECT * FROM temperature_data
    WHERE cargo_id = ? AND collection_time >= ? AND collection_time <= ? ORDER BY collection_time`)
    .all(cargo_id, effective_start, effective_end) as any[];

  let tempQualified = 0, humidQualified = 0;
  let totalOvertime = 0, doorOpenCount = 0, totalDoorOpen = 0;

  for (const d of data) {
    if (d.temperature >= cargo.temp_min && d.temperature <= cargo.temp_max) tempQualified++;
    else totalOvertime += 5;
    if (d.humidity >= cargo.humidity_min && d.humidity <= cargo.humidity_max) humidQualified++;
    if (d.door_open) { doorOpenCount++; totalDoorOpen += d.door_open_duration || 0; }
  }

  const tempRate = data.length > 0 ? tempQualified / data.length : 0;
  const humidRate = data.length > 0 ? humidQualified / data.length : 0;

  const exceptions = db.prepare(`SELECT * FROM exception_records WHERE cargo_id = ? AND occur_time >= ? AND occur_time <= ?`)
    .all(cargo_id, effective_start, effective_end) as any[];
  const criticalCount = exceptions.filter(e => e.level === 'critical' || e.level === 'serious').length;
  const totalCount = exceptions.length;

  let conclusion: ComplianceReport['conclusion'];
  let conclusion_detail = '';
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const overtimeLimit = cargo.total_overtime_limit || Infinity;
  const overtimeCheck = !cargo.total_overtime_limit || totalOvertime < overtimeLimit;

  if (tempRate >= 0.99 && criticalCount === 0 && overtimeCheck) {
    conclusion = 'compliant';
    conclusion_detail = `温度合规，全程温度达标率${pct(tempRate)}，无严重异常，符合行业规范要求。`;
  } else if (tempRate >= 0.95 && criticalCount === 0) {
    conclusion = 'basically_compliant';
    conclusion_detail = `温度达标率${pct(tempRate)}，存在一般异常${totalCount}起，经核查不影响货物质量，建议后续需加强监控。`;
  } else {
    conclusion = 'non_compliant';
    conclusion_detail = `温度达标率${pct(tempRate)}，存在严重异常${criticalCount}起，不符合规范要求，建议启动后续处理。`;
  }

  const id = uuidv4();
  const report_no = generateReportNo();
  const n = now();
  db.prepare(`INSERT INTO compliance_reports (id, report_no, cargo_id, start_time, end_time,
    total_data_points, temp_qualified_count, humidity_qualified_count,
    temp_pass_rate, humidity_pass_rate, exception_count, critical_exception_count,
    total_overtime_minutes, route_deviation, door_open_count, total_door_open_minutes,
    conclusion, conclusion_detail, generated_by, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, report_no, cargo_id, effective_start, effective_end,
      data.length, tempQualified, humidQualified,
      tempRate, humidRate,
      totalCount, criticalCount,
      totalOvertime, 0, doorOpenCount, totalDoorOpen,
      conclusion, conclusion_detail, req.user!.id, n);

  addAuditLog(req.user!.id, 'report', 'generate', { targetId: id });
  ok(res, { id, report_no, conclusion, temp_pass_rate: tempRate }, '合规报告生成成功');
});

reportRouter.post('/:id/sign', requireRoles(['quality_director']), (req: AuthRequest, res) => {
  const report = db.prepare('SELECT * FROM compliance_reports WHERE id = ?').get(req.params.id) as any;
  if (!report) return fail(res, '报告不存在', 404, 404);
  db.prepare('UPDATE compliance_reports SET signed_by = ?, signed_at = ? WHERE id = ?')
    .run(req.user!.id, now(), report.id);
  addAuditLog(req.user!.id, 'report', 'sign', { targetId: report.id });
  ok(res, null, '报告已签署');
});

export const settlementRouter = Router();
settlementRouter.use(authMiddleware);

settlementRouter.get('/', (req: AuthRequest, res) => {
  const { status, carrier, page = 1, pageSize = 20 } = req.query;
  let sql = `SELECT s.*, c.cargo_no, c.name as cargo_name, c.category, c.transport_no,
                    r.conclusion, r.temp_pass_rate,
                    ua.name as approved_name, uj.name as adjust_name
             FROM settlements s
             LEFT JOIN cargos c ON s.cargo_id = c.id
             LEFT JOIN compliance_reports r ON s.report_id = r.id
             LEFT JOIN users ua ON s.approved_by = ua.id
             LEFT JOIN users uj ON s.adjust_by = uj.id
             WHERE 1=1`;
  const params: unknown[] = [];
  if (status && status !== 'all') { sql += ' AND s.status = ?'; params.push(status); }
  if (carrier) { sql += ' AND s.carrier LIKE ?'; params.push(`%${carrier}%`); }
  sql += ' ORDER BY s.created_at DESC';
  const all = db.prepare(sql).all(...params);
  ok(res, paginate(all, Number(page), Number(pageSize)));
});

settlementRouter.get('/:id', (req: AuthRequest, res) => {
  const s = db.prepare(`SELECT s.*, c.*, r.conclusion, r.temp_pass_rate
    FROM settlements s
    LEFT JOIN cargos c ON s.cargo_id = c.id
    LEFT JOIN compliance_reports r ON s.report_id = r.id
    WHERE s.id = ?`).get(req.params.id);
  if (!s) return fail(res, '结算单不存在', 404, 404);
  ok(res, s);
});

settlementRouter.post('/calculate', requireRoles(['qc', 'warehouse_manager', 'quality_director']), (req: AuthRequest, res) => {
  const { cargo_id, contract_amount, carrier, report_id } = req.body;
  const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(cargo_id) as Cargo | undefined;
  if (!cargo) return fail(res, '货物不存在', 404, 404);

  let conclusion: 'compliant' | 'normal_exception' | 'serious_exception';
  let ratio = 0, reason = '';

  if (report_id) {
    const r = db.prepare('SELECT * FROM compliance_reports WHERE id = ?').get(report_id) as any;
    if (!r) return fail(res, '合规报告不存在');
    if (r.conclusion === 'compliant') { conclusion = 'compliant'; reason = '全程温控合规'; }
    else if (r.conclusion === 'basically_compliant') { conclusion = 'normal_exception'; ratio = 0.1; reason = `温度达标率${(Number(r.temp_pass_rate) * 100).toFixed(1)}%，存在一般异常`; }
    else { conclusion = 'serious_exception'; ratio = 0.5; reason = `温控不达标，存在严重异常`; }
  } else {
    const excCount = db.prepare('SELECT level, COUNT(*) as count FROM exception_records WHERE cargo_id = ? GROUP BY level')
      .all(cargo_id) as any[];
    const critical = excCount.find(e => e.level === 'critical')?.count || 0;
    const serious = excCount.find(e => e.level === 'serious')?.count || 0;
    if (critical > 0) { conclusion = 'serious_exception'; ratio = 0.6; reason = `存在${critical}起严重异常`; }
    else if (serious > 2) { conclusion = 'normal_exception'; ratio = 0.15; reason = `存在${serious}起较严重异常`; }
    else if (serious > 0) { conclusion = 'normal_exception'; ratio = 0.08; reason = `存在${serious}起较严重异常`; }
    else { conclusion = 'compliant'; reason = '无异常记录'; }
  }

  const settlement_no = 'SET' + (Date.now() + Math.floor(Math.random() * 1000)).toString().slice(-10);
  const amount = Number(contract_amount) || 0;
  const deduction = amount * ratio;
  const final = Math.max(0, amount - deduction);

  ok(res, {
    settlement_no,
    cargo_id,
    transport_no: cargo.transport_no,
    shipper: cargo.shipper,
    carrier: carrier || '默认承运商',
    contract_amount: amount,
    compliance_level: conclusion,
    deduction_ratio: ratio,
    deduction_amount: Number(deduction.toFixed(2)),
    deduction_reason: reason,
    final_amount: Number(final.toFixed(2)),
    report_id: report_id || null,
  }, '核算预览完成');
});

settlementRouter.post('/', requireRoles(['qc', 'warehouse_manager', 'quality_director']), (req: AuthRequest, res) => {
  const s = req.body as any;
  if (!s.cargo_id || s.contract_amount === undefined || !s.carrier) {
    return fail(res, '缺少必要参数: cargo_id, contract_amount, carrier');
  }
  if (s.deduction_ratio === undefined || s.final_amount === undefined) {
    return fail(res, '请先完成核算预览');
  }
  const dup = db.prepare('SELECT id FROM settlements WHERE cargo_id = ? AND status IN (\'calculated\', \'adjusted\', \'approved\', \'paid\') LIMIT 1').get(s.cargo_id);
  if (dup) return fail(res, '该货物批次已有未完成或已完成的结算单，请勿重复创建');
  const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(s.cargo_id) as Cargo | undefined;
  if (!cargo) return fail(res, '货物不存在', 404, 404);

  const id = uuidv4();
  const n = now();
  db.prepare(`INSERT INTO settlements (id, settlement_no, cargo_id, transport_no, shipper, carrier, contract_amount,
    compliance_level, deduction_ratio, deduction_amount, deduction_reason, final_amount, report_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'calculated', ?)`)
    .run(id, s.settlement_no || ('SET' + Date.now().toString().slice(-10)),
      s.cargo_id, cargo.transport_no, cargo.shipper, s.carrier,
      Number(s.contract_amount), s.compliance_level, Number(s.deduction_ratio),
      Number(s.deduction_amount || 0), s.deduction_reason || '',
      Number(s.final_amount), s.report_id || null, n);

  addAuditLog(req.user!.id, 'settlement', 'create', { targetId: id });
  ok(res, { id, settlement_no: s.settlement_no }, '结算单创建成功');
});

settlementRouter.post('/:id/adjust', requireRoles(['quality_director']), (req: AuthRequest, res) => {
  const { adjust_amount, adjust_remark, force_majeure } = req.body;
  const s = db.prepare('SELECT * FROM settlements WHERE id = ?').get(req.params.id) as any;
  if (!s) return fail(res, '结算单不存在', 404, 404);
  const newFinal = s.contract_amount - s.deduction_amount + Number(adjust_amount || 0);
  db.prepare(`UPDATE settlements SET adjust_amount = ?, adjust_remark = ?, adjust_by = ?, force_majeure = ?, final_amount = ?, status = 'adjusted' WHERE id = ?`)
    .run(adjust_amount, adjust_remark, req.user!.id, force_majeure ? 1 : 0, Math.max(0, newFinal), s.id);
  addAuditLog(req.user!.id, 'settlement', 'adjust', { targetId: s.id });
  ok(res, null, '已调整结算');
});

settlementRouter.post('/:id/approve', requireRoles(['quality_director']), (req: AuthRequest, res) => {
  const s = db.prepare('SELECT * FROM settlements WHERE id = ?').get(req.params.id) as any;
  if (!s) return fail(res, '结算单不存在', 404, 404);
  db.prepare("UPDATE settlements SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?")
    .run(req.user!.id, now(), s.id);
  addAuditLog(req.user!.id, 'settlement', 'approve', { targetId: s.id });
  ok(res, null, '结算已审批');
});

settlementRouter.post('/:id/paid', requireRoles(['quality_director']), (req: AuthRequest, res) => {
  const s = db.prepare('SELECT * FROM settlements WHERE id = ?').get(req.params.id) as any;
  if (!s) return fail(res, '结算单不存在', 404, 404);
  db.prepare("UPDATE settlements SET status = 'paid', paid_at = ? WHERE id = ?").run(now(), s.id);
  addAuditLog(req.user!.id, 'settlement', 'mark_paid', { targetId: s.id });
  ok(res, null, '已标记付款');
});

export const statsRouter = Router();
statsRouter.use(authMiddleware);

statsRouter.get('/dashboard', (req: AuthRequest, res) => {
  const inTransit = db.prepare("SELECT COUNT(*) as count FROM cargos WHERE status = 'in_transit'").get() as any;
  const inWarehouse = db.prepare("SELECT COUNT(*) as count FROM cargos WHERE status IN ('arrived','in_warehouse','accepted')").get() as any;
  const totalToday = db.prepare("SELECT COUNT(*) as count FROM cargos WHERE date(created_at) = date('now')").get() as any;
  const tempPassRateData = db.prepare(`
    SELECT AVG(temp_pass_rate) as rate FROM compliance_reports WHERE date(generated_at) >= date('now', '-30 days')
  `).get() as any;
  const exceptionStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM exception_records GROUP BY status
  `).all() as any[];
  const pendingExceptions = exceptionStats
    .filter(e => ['pending', 'processing', 'pending_verification'].includes(e.status))
    .reduce((sum, e) => sum + e.count, 0);
  const onlineTags = db.prepare("SELECT COUNT(*) as count FROM io_tags WHERE communication_status = 'online'").get() as any;
  const totalTags = db.prepare('SELECT COUNT(*) as count FROM io_tags').get() as any;
  const onlineVehicles = db.prepare("SELECT COUNT(*) as count FROM vehicles WHERE status = 'in_transit'").get() as any;
  const totalVehicles = db.prepare('SELECT COUNT(*) as count FROM vehicles').get() as any;

  ok(res, {
    in_transit: inTransit.count,
    in_warehouse: inWarehouse.count,
    created_today: totalToday.count,
    temp_pass_rate_30d: tempPassRateData.rate ? (tempPassRateData.rate * 100) : 98.5,
    pending_exceptions: pendingExceptions,
    tag_online_rate: totalTags.count > 0 ? (onlineTags.count / totalTags.count) * 100 : 100,
    vehicle_utilization: totalVehicles.count > 0 ? (onlineVehicles.count / totalVehicles.count) * 100 : 0,
  });
});

statsRouter.get('/temperature/trend', (req: AuthRequest, res) => {
  const { days = 7 } = req.query;
  const rows = db.prepare(`
    SELECT date(collection_time) as date,
      AVG(temperature) as avg_temp,
      SUM(CASE WHEN temperature >= 2 AND temperature <= 8 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as pass_rate
    FROM temperature_data
    WHERE date(collection_time) >= date('now', ?)
    GROUP BY date(collection_time) ORDER BY date
  `).all(`-${days} days`) as any[];
  ok(res, rows);
});

statsRouter.get('/exception/distribution', (req: AuthRequest, res) => {
  const byLevel = db.prepare('SELECT level, COUNT(*) as count FROM exception_records GROUP BY level').all() as any[];
  const byType = db.prepare('SELECT type, COUNT(*) as count FROM exception_records GROUP BY type ORDER BY count DESC LIMIT 10').all() as any[];
  ok(res, { by_level: byLevel, by_type: byType });
});

statsRouter.get('/category/distribution', (req: AuthRequest, res) => {
  const rows = db.prepare(`SELECT category, sub_category, COUNT(*) as count FROM cargos GROUP BY category, sub_category`).all() as any[];
  ok(res, rows);
});

export const userRouter = Router();
userRouter.use(authMiddleware);

userRouter.get('/', requireRoles(['quality_director']), (req: AuthRequest, res) => {
  const users = db.prepare(`SELECT u.id, u.username, u.name, u.role, u.phone, u.email, u.warehouse_id, w.name as warehouse_name, u.created_at
    FROM users u LEFT JOIN warehouses w ON u.warehouse_id = w.id ORDER BY u.created_at`).all();
  ok(res, users);
});

userRouter.get('/audit-logs', requireRoles(['quality_director']), (req: AuthRequest, res) => {
  const { module, user_id, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
  const params: unknown[] = [];
  if (module) { sql += ' AND a.module = ?'; params.push(module); }
  if (user_id) { sql += ' AND a.user_id = ?'; params.push(user_id); }
  sql += ' ORDER BY a.created_at DESC';
  const all = db.prepare(sql).all(...params);
  ok(res, paginate(all, Number(page), Number(pageSize)));
});

userRouter.get('/trace/cargo/:id', (req: AuthRequest, res) => {
  const key = req.params.id;
  const cargo = db.prepare('SELECT c.*, r.name as rule_name, r.temp_min, r.temp_max, r.humidity_min, r.humidity_max, r.single_overtime_limit, r.total_overtime_limit, r.temp_fluctuation_limit FROM cargos c LEFT JOIN temperature_rules r ON c.rule_id = r.id WHERE c.cargo_no = ? OR c.id = ? OR c.transport_no = ?').get(key, key, key) as any;
  if (!cargo) return fail(res, '货物不存在，请输入正确的批次号、运输单号或货物ID', 404, 404);
  const tags = db.prepare('SELECT * FROM io_tags WHERE cargo_id = ?').all(cargo.id);
  const bindings = db.prepare('SELECT b.*, u.name as operator_name FROM binding_logs b LEFT JOIN users u ON b.operator_id = u.id WHERE b.cargo_id = ? ORDER BY b.created_at').all(cargo.id);
  const tempData = db.prepare('SELECT * FROM temperature_data WHERE cargo_id = ? ORDER BY collection_time').all(cargo.id);
  const exceptions = db.prepare('SELECT * FROM exception_records WHERE cargo_id = ? ORDER BY occur_time').all(cargo.id);
  const reports = db.prepare('SELECT * FROM compliance_reports WHERE cargo_id = ? ORDER BY generated_at').all(cargo.id);
  const settlements = db.prepare('SELECT * FROM settlements WHERE cargo_id = ? ORDER BY created_at').all(cargo.id);
  const audits = db.prepare(`SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE a.target_id = ? OR (a.target_type = 'cargo' AND a.target_id = ?) ORDER BY a.created_at`).all(cargo.id, cargo.id);

  ok(res, { cargo, tag: tags[0] || null, binding_logs: bindings, temperature_data: tempData, exceptions, reports, settlements, audit_logs: audits });
});
