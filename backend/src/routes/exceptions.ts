import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { authMiddleware, AuthRequest, requireRoles, ok, fail, addAuditLog, now, paginate } from '../middleware';
import type { ExceptionLevel, ExceptionRecord, ExceptionType } from '../types';

export const exceptionRouter = Router();
exceptionRouter.use(authMiddleware);

const levelMap: Record<string, ExceptionLevel> = {
  over_temp: 'serious', low_temp: 'serious', humidity_abnormal: 'normal', temp_fluctuation: 'normal',
  overtime_single: 'serious', overtime_total: 'critical',
  tag_offline: 'normal', tag_low_battery: 'normal', sensor_error: 'serious', refrigeration_unit_error: 'critical',
  door_open_long: 'normal', unauthorized_door: 'serious', route_deviation: 'serious', timeout_arrival: 'normal',
  warehouse_zone_temp: 'serious', zone_temp_diff: 'normal',
};

const notifyMap: Record<ExceptionLevel, string[]> = {
  normal: ['driver'],
  serious: ['driver', 'qc', 'warehouse_manager'],
  critical: ['driver', 'qc', 'warehouse_manager', 'quality_director'],
};

exceptionRouter.get('/', (req: AuthRequest, res) => {
  const { level, status, type, cargo_id, page = 1, pageSize = 20 } = req.query;
  let sql = `SELECT e.*, c.cargo_no, c.name as cargo_name, t.tag_no, w.name as warehouse_name,
                    u.name as handler_name, z.name as zone_name
             FROM exception_records e
             LEFT JOIN cargos c ON e.cargo_id = c.id
             LEFT JOIN io_tags t ON e.tag_id = t.id
             LEFT JOIN warehouses w ON e.warehouse_id = w.id
             LEFT JOIN warehouse_zones z ON e.zone_id = z.id
             LEFT JOIN users u ON e.current_handler = u.id
             WHERE 1=1`;
  const params: unknown[] = [];
  if (level && level !== 'all') { sql += ' AND e.level = ?'; params.push(level); }
  if (status && status !== 'all') { sql += ' AND e.status = ?'; params.push(status); }
  if (type) { sql += ' AND e.type = ?'; params.push(type); }
  if (cargo_id) { sql += ' AND e.cargo_id = ?'; params.push(cargo_id); }
  sql += ' ORDER BY e.occur_time DESC';
  const all = db.prepare(sql).all(...params);
  ok(res, paginate(all, Number(page), Number(pageSize)));
});

exceptionRouter.get('/:id', (req: AuthRequest, res) => {
  const exc = db.prepare(`SELECT e.*, c.cargo_no, c.name as cargo_name FROM exception_records e
    LEFT JOIN cargos c ON e.cargo_id = c.id WHERE e.id = ?`).get(req.params.id);
  if (!exc) return fail(res, '异常不存在', 404, 404);
  const handlings = db.prepare(`SELECT h.*, u.name as handler_name, uv.name as verifier_name
    FROM exception_handlings h LEFT JOIN users u ON h.handler_id = u.id
    LEFT JOIN users uv ON h.verifier_id = uv.id WHERE h.exception_id = ? ORDER BY h.handle_time`)
    .all(req.params.id);
  ok(res, { ...exc, handlings });
});

exceptionRouter.post('/auto-detect', (req: AuthRequest, res) => {
  const { cargo_id, start_time, end_time } = req.body;
  const cargo = db.prepare('SELECT c.*, r.* FROM cargos c JOIN temperature_rules r ON c.rule_id = r.id WHERE c.id = ?')
    .get(cargo_id) as any;
  if (!cargo) return fail(res, '货物不存在', 404, 404);

  let sql = `SELECT * FROM temperature_data WHERE cargo_id = ?`;
  const params: unknown[] = [cargo_id];
  if (start_time) { sql += ' AND collection_time >= ?'; params.push(start_time); }
  if (end_time) { sql += ' AND collection_time <= ?'; params.push(end_time); }
  sql += ' ORDER BY collection_time';
  const data = db.prepare(sql).all(...params) as any[];

  const exceptions: Partial<ExceptionRecord>[] = [];
  let overTempTotal = 0;
  let overTempStart: string | null = null;
  let lastOver = false;

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const isOver = d.temperature < cargo.temp_min || d.temperature > cargo.temp_max;
    const isHumidOver = d.humidity < cargo.humidity_min || d.humidity > cargo.humidity_max;

    if (isOver) {
      overTempTotal += 5;
      if (!lastOver) overTempStart = d.collection_time;
      if (!overTempStart) overTempStart = d.collection_time;
      const next = data[i + 1];
      const nextOver = next && (next.temperature < cargo.temp_min || next.temperature > cargo.temp_max);
      if (!nextOver) {
        const singleDuration = 5;
        const needCreate = cargo.single_overtime_limit && singleDuration > cargo.single_overtime_limit;
        if (needCreate) {
          exceptions.push({
            type: 'overtime_single',
            level: levelMap['overtime_single'],
            cargo_id,
            tag_id: d.tag_id,
            location: d.location,
            description: `单次超温时长超标: ${singleDuration}分钟，阈值: ${cargo.single_overtime_limit}分钟`,
            temperature: d.temperature,
            threshold_info: `温度阈值: ${cargo.temp_min}~${cargo.temp_max}℃，超温单次时长阈值: ${cargo.single_overtime_limit}分钟`,
            duration_minutes: singleDuration,
            occur_time: overTempStart,
          });
        } else {
          exceptions.push({
            type: d.temperature > cargo.temp_max ? 'over_temp' : 'low_temp',
            level: levelMap[d.temperature > cargo.temp_max ? 'over_temp' : 'low_temp'],
            cargo_id,
            tag_id: d.tag_id,
            location: d.location,
            description: `${d.temperature > cargo.temp_max ? '温度超标' : '温度过低'}: ${d.temperature}℃，阈值: ${cargo.temp_min}~${cargo.temp_max}℃`,
            temperature: d.temperature,
            threshold_info: `温度阈值: ${cargo.temp_min}~${cargo.temp_max}℃`,
            occur_time: d.collection_time,
          });
        }
        overTempStart = null;
      }
    }
    lastOver = isOver;

    if (isHumidOver) {
      exceptions.push({
        type: 'humidity_abnormal',
        level: levelMap['humidity_abnormal'],
        cargo_id,
        tag_id: d.tag_id,
        location: d.location,
        description: `湿度异常: ${d.humidity}%，阈值: ${cargo.humidity_min}~${cargo.humidity_max}%`,
        humidity: d.humidity,
        threshold_info: `湿度阈值: ${cargo.humidity_min}~${cargo.humidity_max}%`,
        occur_time: d.collection_time,
      });
    }

    if (d.device_status !== 'normal') {
      const typeMap: Record<string, ExceptionType> = { low_battery: 'tag_low_battery', offline: 'tag_offline', sensor_error: 'sensor_error' };
      const t = typeMap[d.device_status] || 'sensor_error';
      exceptions.push({
        type: t,
        level: levelMap[t],
        cargo_id,
        tag_id: d.tag_id,
        description: `设备状态异常: ${d.device_status}`,
        occur_time: d.collection_time,
      });
    }
    if (d.door_open && d.door_open_duration && d.door_open_duration > 10) {
      exceptions.push({
        type: 'door_open_long',
        level: levelMap['door_open_long'],
        cargo_id,
        tag_id: d.tag_id,
        description: `车门开启时间过长: ${d.door_open_duration}分钟`,
        duration_minutes: d.door_open_duration,
        occur_time: d.collection_time,
      });
    }
  }

  if (cargo.total_overtime_limit && overTempTotal > cargo.total_overtime_limit) {
    exceptions.push({
      type: 'overtime_total',
      level: levelMap['overtime_total'],
      cargo_id,
      description: `累计超温时长超标: ${overTempTotal}分钟，阈值: ${cargo.total_overtime_limit}分钟`,
      duration_minutes: overTempTotal,
      threshold_info: `累计超温阈值: ${cargo.total_overtime_limit}分钟`,
      occur_time: data[0]?.collection_time,
    });
  }

  const newIds: string[] = [];
  if (exceptions.length > 0) {
    const tx = db.transaction(() => {
      for (const e of exceptions) {
        const id = uuidv4();
        const roles = notifyMap[e.level!];
        const users = db.prepare(`SELECT id FROM users WHERE role IN (${roles.map(() => '?').join(',')})`).all(...roles) as any[];
        db.prepare(`INSERT INTO exception_records (id, type, level, cargo_id, tag_id, warehouse_id, zone_id, location,
          description, temperature, humidity, threshold_info, duration_minutes, occur_time, status,
          current_handler, notified_users, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
          .run(id, e.type, e.level, e.cargo_id || null, e.tag_id || null, null, null,
            e.location || null, e.description, e.temperature ?? null, e.humidity ?? null,
            e.threshold_info || null, e.duration_minutes ?? null, e.occur_time || now(),
            users[0]?.id || null, JSON.stringify(users.map(u => u.id)), now());
        newIds.push(id);
      }
    });
    tx();
  }
  ok(res, { detected: exceptions.length, newIds });
});

exceptionRouter.post('/:id/handle', (req: AuthRequest, res) => {
  const { action, description, attachment_urls, temperature_after, humidity_after } = req.body;
  const exc = db.prepare('SELECT * FROM exception_records WHERE id = ?').get(req.params.id) as ExceptionRecord | undefined;
  if (!exc) return fail(res, '异常不存在', 404, 404);
  if (!action || !description) return fail(res, '请填写处置动作和说明');
  const id = uuidv4();
  const n = now();
  db.prepare(`INSERT INTO exception_handlings (id, exception_id, handler_id, action, description, attachment_urls,
    temperature_after, humidity_after, handle_time, status, verify_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'pending', ?)`)
    .run(id, exc.id, req.user!.id, action, description, attachment_urls || null,
      temperature_after ?? null, humidity_after ?? null, n, n);
  db.prepare("UPDATE exception_records SET status = 'pending_verification', current_handler = ? WHERE id = ?")
    .run(req.user!.id, exc.id);
  addAuditLog(req.user!.id, 'exception', 'handle', { targetId: exc.id, remark: action });
  ok(res, { id }, '处置完成，待审核验证');
});

exceptionRouter.post('/:id/verify', requireRoles(['qc', 'quality_director', 'warehouse_manager']), (req: AuthRequest, res) => {
  const { passed, remark } = req.body;
  const exc = db.prepare('SELECT * FROM exception_records WHERE id = ?').get(req.params.id) as ExceptionRecord | undefined;
  if (!exc) return fail(res, '异常不存在', 404, 404);
  db.prepare("UPDATE exception_records SET status = ? WHERE id = ?").run(passed ? 'closed' : 'processing', exc.id);
  if (exc.status === 'pending_verification') {
    const latestHandling = db.prepare('SELECT id FROM exception_handlings WHERE exception_id = ? ORDER BY handle_time DESC LIMIT 1').get(req.params.id) as any;
    if (latestHandling) {
      db.prepare('UPDATE exception_handlings SET status = ?, verify_status = ?, verifier_id = ?, verify_remark = ? WHERE id = ?')
        .run(passed ? 'verified' : 'completed', passed ? 'passed' : 'rejected', req.user!.id, remark || '', latestHandling.id);
    }
  }
  addAuditLog(req.user!.id, 'exception', passed ? 'verify_pass' : 'verify_reject', { targetId: exc.id, remark });
  ok(res, null, passed ? '验证通过，异常已闭环' : '需继续处理');
});

exceptionRouter.put('/:id/assign', requireRoles(['qc', 'warehouse_manager', 'quality_director']), (req: AuthRequest, res) => {
  const { handler_id } = req.body;
  const exc = db.prepare('SELECT * FROM exception_records WHERE id = ?').get(req.params.id) as ExceptionRecord | undefined;
  if (!exc) return fail(res, '异常不存在', 404, 404);
  db.prepare("UPDATE exception_records SET current_handler = ?, status = 'processing' WHERE id = ?").run(handler_id, exc.id);
  addAuditLog(req.user!.id, 'exception', 'assign', { targetId: exc.id, remark: '指派给用户ID: ' + handler_id });
  ok(res, null, '已指派，状态更新为处理中');
});

exceptionRouter.get('/stats/summary', (req: AuthRequest, res) => {
  const sql = `
    SELECT level, status, COUNT(*) as count FROM exception_records GROUP BY level, status
  `;
  const rows = db.prepare(sql).all() as any[];
  const stats: Record<string, Record<string, number>> = {
    normal: { pending: 0, processing: 0, pending_verification: 0, closed: 0, total: 0 },
    serious: { pending: 0, processing: 0, pending_verification: 0, closed: 0, total: 0 },
    critical: { pending: 0, processing: 0, pending_verification: 0, closed: 0, total: 0 },
  };
  for (const r of rows) {
    if (stats[r.level]) {
      stats[r.level][r.status] = r.count;
      stats[r.level].total += r.count;
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = db.prepare("SELECT COUNT(*) as count FROM exception_records WHERE date(occur_time) = ?").get(today) as any;
  ok(res, { by_level: stats, today_count: todayCount.count });
});
