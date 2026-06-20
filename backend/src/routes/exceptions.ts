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

const suggestionMap: Record<string, string> = {
  over_temp: '1. 立即检查制冷设备运行状态；2. 调整温度设定至规定范围；3. 查看车门是否未关好；4. 如设备故障，联系维修人员并转移货物',
  low_temp: '1. 检查制冷设备是否过度制冷；2. 适当调高温度设定；3. 检查货物是否受冻损坏；4. 如传感器故障，更换标签设备',
  humidity_abnormal: '1. 检查湿度调节设备；2. 如湿度过高开启除湿；3. 如湿度过低检查加湿设备；4. 查看是否有漏水或积水',
  temp_fluctuation: '1. 检查温控系统稳定性；2. 减少开关门次数；3. 检查保温层是否完好；4. 校准温度传感器',
  overtime_single: '1. 检查单次超温原因；2. 评估货物是否受影响；3. 记录并分析异常原因；4. 制定预防措施',
  overtime_total: '1. 累计超温时长超标，启动质量评估；2. 检查全程温控曲线；3. 评估货物品质影响；4. 必要时启动不合格品处理流程',
  tag_offline: '1. 检查标签通信状态；2. 重新绑定或激活标签；3. 如信号弱，调整位置；4. 更换备用标签',
  tag_low_battery: '1. 及时更换标签电池；2. 检查电池续航异常原因；3. 准备备用标签',
  sensor_error: '1. 检查传感器数据准确性；2. 校准或更换传感器；3. 使用备用设备监控',
  refrigeration_unit_error: '1. 立即检查制冷机组；2. 切换备用机组；3. 联系维修人员；4. 评估货物转移可行性',
  door_open_long: '1. 检查车门是否关闭；2. 核实装卸货进度；3. 减少开门时间；4. 检查门禁系统',
  unauthorized_door: '1. 核实开门授权情况；2. 查看监控记录；3. 调查异常原因；4. 加强门禁管理',
  route_deviation: '1. 联系司机确认位置；2. 核实是否有合理绕行；3. 评估对运输时效和温控的影响；4. 加强路线监控',
  timeout_arrival: '1. 联系司机了解延误原因；2. 评估货物温控状态；3. 调整收货安排；4. 更新运输计划',
  warehouse_zone_temp: '1. 检查库区温控设备；2. 核实货物摆放是否影响通风；3. 校准温度传感器；4. 必要时转移货物',
  zone_temp_diff: '1. 检查库区气流分布；2. 调整风机运行；3. 优化货物摆放；4. 增加监测点',
};

exceptionRouter.get('/:id', (req: AuthRequest, res) => {
  const exc = db.prepare(`SELECT e.*, c.cargo_no, c.name as cargo_name, c.category, c.sub_category, c.status as cargo_status,
                                  c.temp_min, c.temp_max, c.humidity_min, c.humidity_max,
                                  t.tag_no, t.battery_level, u.name as handler_name
                           FROM exception_records e
                           LEFT JOIN cargos c ON e.cargo_id = c.id
                           LEFT JOIN io_tags t ON e.tag_id = t.id
                           LEFT JOIN users u ON e.current_handler = u.id
                           WHERE e.id = ?`).get(req.params.id) as any;
  if (!exc) return fail(res, '异常不存在', 404, 404);

  const handlings = db.prepare(`SELECT h.*, u.name as handler_name, uv.name as verifier_name
    FROM exception_handlings h LEFT JOIN users u ON h.handler_id = u.id
    LEFT JOIN users uv ON h.verifier_id = uv.id WHERE h.exception_id = ? ORDER BY h.handle_time DESC`)
    .all(req.params.id);

  let recentTempData: any[] = [];
  let historyExceptions: any[] = [];
  let suggestion = '';

  if (exc.cargo_id) {
    recentTempData = db.prepare(`SELECT temperature, humidity, collection_time, location
      FROM temperature_data WHERE cargo_id = ? ORDER BY collection_time DESC LIMIT 50`)
      .all(exc.cargo_id).reverse();

    historyExceptions = db.prepare(`SELECT id, type, level, status, occur_time, description
      FROM exception_records WHERE cargo_id = ? AND id != ? ORDER BY occur_time DESC LIMIT 5`)
      .all(exc.cargo_id, exc.id);
  }

  suggestion = suggestionMap[exc.type] || '请根据实际情况采取相应处置措施，确保货物安全。';

  const timeline = [
    { status: 'pending', label: '待接单', done: true, time: exc.occur_time, user: null, remark: '异常触发' },
  ];
  if (exc.status !== 'pending') {
    timeline.push({ status: 'processing', label: '处理中', done: exc.status !== 'pending', time: null, user: exc.handler_name, remark: '已分配处理人' });
  }
  if (exc.status === 'pending_verification' || exc.status === 'closed') {
    timeline.push({ status: 'pending_verification', label: '待验证', done: true, time: handlings[0]?.handle_time || null, user: handlings[0]?.handler_name || null, remark: handlings[0]?.action || '' });
  }
  if (exc.status === 'closed') {
    const vh = handlings.find((h: any) => h.verify_status === 'passed');
    timeline.push({ status: 'closed', label: '已闭环', done: true, time: vh?.verify_time || null, user: vh?.verifier_name || null, remark: vh?.verify_remark || '验证通过' });
  }

  ok(res, {
    ...exc,
    handlings,
    recent_temp_data: recentTempData,
    history_exceptions: historyExceptions,
    suggestion,
    status_timeline: timeline,
  });
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
            occur_time: overTempStart ?? d.collection_time,
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

exceptionRouter.post('/create-from-warning', requireRoles(['qc', 'warehouse_manager', 'quality_director']), (req: AuthRequest, res) => {
  const { cargo_id, tag_id, type, level, description, temperature, humidity, location, threshold_info, handler_id } = req.body;
  if (!cargo_id || !type || !description) return fail(res, '缺少必要参数');

  const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(cargo_id) as any;
  if (!cargo) return fail(res, '货物不存在', 404, 404);

  const id = uuidv4();
  const n = now();
  const t = type as ExceptionType;
  const lv = (level || levelMap[type] || 'normal') as ExceptionLevel;
  const roles = notifyMap[lv];
  const users = db.prepare(`SELECT id FROM users WHERE role IN (${roles.map(() => '?').join(',')})`).all(...roles) as any[];
  const finalHandler = handler_id || users[0]?.id || null;

  db.prepare(`INSERT INTO exception_records (id, type, level, cargo_id, tag_id, warehouse_id, zone_id, location,
    description, temperature, humidity, threshold_info, duration_minutes, occur_time, status,
    current_handler, notified_users, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, t, lv, cargo_id, tag_id || null, cargo.warehouse_id || null, null,
      location || cargo.current_location || null, description,
      temperature ?? null, humidity ?? null, threshold_info || null, null, n,
      finalHandler ? 'processing' : 'pending', finalHandler, JSON.stringify(users.map(u => u.id)), n);

  addAuditLog(req.user!.id, 'exception', 'create_from_warning', { targetId: id, remark: description });
  ok(res, { id, status: finalHandler ? 'processing' : 'pending' }, '异常记录已生成');
});

exceptionRouter.get('/assignable/users', requireRoles(['qc', 'warehouse_manager', 'quality_director']), (req: AuthRequest, res) => {
  const users = db.prepare(`SELECT id, name, role, phone FROM users WHERE role IN ('driver','qc','warehouse_manager') ORDER BY role`).all();
  ok(res, users);
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
