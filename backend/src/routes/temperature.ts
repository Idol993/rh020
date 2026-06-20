import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { authMiddleware, AuthRequest, ok, fail, now } from '../middleware';
import type { TemperatureRule, TemperatureData } from '../types';

export const tempRouter = Router();
tempRouter.use(authMiddleware);

tempRouter.post('/upload', (req: AuthRequest, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const n = now();
  const insert = db.prepare(`
    INSERT INTO temperature_data (id, tag_id, cargo_id, temperature, humidity, latitude, longitude, location,
      collection_time, is_realtime, is_supplementary, device_status, door_open, door_open_duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const results: { id: string; tag_id: string; abnormal: boolean; message?: string; exception_ids?: string[] }[] = [];

  const tx = db.transaction((list: typeof items) => {
    for (const d of list) {
      const tag = db.prepare('SELECT * FROM io_tags WHERE tag_no = ? OR id = ?').get(d.tag_id, d.tag_id) as any;
      if (!tag) { results.push({ id: '', tag_id: d.tag_id, abnormal: true, message: '标签不存在' }); continue; }
      const id = uuidv4();
      const cargo = tag.cargo_id ? db.prepare('SELECT rule_id, status FROM cargos WHERE id = ?').get(tag.cargo_id) : null;
      insert.run(id, tag.id, tag.cargo_id, Number(d.temperature), Number(d.humidity),
        d.latitude || null, d.longitude || null, d.location || null,
        d.collection_time || n, d.is_realtime === false ? 0 : 1, d.is_supplementary ? 1 : 0,
        d.device_status || 'normal', d.door_open ? 1 : 0, d.door_open_duration || null, n);
      db.prepare('UPDATE io_tags SET last_heartbeat = ?, current_location = ?, battery_level = ?, communication_status = ? WHERE id = ?')
        .run(n, d.location || tag.current_location, d.battery_level ?? tag.battery_level, 'online', tag.id);

      let abnormal = false;
      let rule: any = null;
      if (cargo) {
        rule = db.prepare('SELECT * FROM temperature_rules WHERE id = ?').get((cargo as any).rule_id);
        if (rule) {
          if (d.temperature < rule.temp_min || d.temperature > rule.temp_max) abnormal = true;
          if (d.humidity < rule.humidity_min || d.humidity > rule.humidity_max) abnormal = true;
        }
      }
      const result: any = { id, tag_id: tag.id, abnormal };
      if (abnormal && cargo && (cargo as any).status !== 'pending_outbound') {
        try {
          const detected = autoDetectForCargo(tag.cargo_id, [d], rule);
          if (detected && detected.length > 0) {
            result.exception_ids = detected;
          }
        } catch (_e) {
          // 异常检测失败不影响数据上传结果
        }
      }
      results.push(result);
    }
  });
  tx(items);
  const excCount = results.reduce((sum, r) => sum + (r.exception_ids?.length || 0), 0);
  ok(res, { uploaded: results.length, results, exceptions_detected: excCount },
    excCount > 0 ? `上传成功，检测到 ${excCount} 条异常` : '上传成功');
});

function autoDetectForCargo(cargo_id: string, recentData: any[], rule: any): string[] {
  if (!cargo_id || !recentData || !recentData.length || !rule) return [];
  const exceptions: any[] = [];
  const newIds: string[] = [];
  for (const d of recentData) {
    const isOver = d.temperature < rule.temp_min || d.temperature > rule.temp_max;
    const isHumidOver = d.humidity < rule.humidity_min || d.humidity > rule.humidity_max;
    if (isOver) {
      exceptions.push({
        type: d.temperature > rule.temp_max ? 'over_temp' : 'low_temp',
        level: d.temperature > rule.temp_max ? 'serious' : 'serious',
        cargo_id,
        tag_id: d.tag_id,
        location: d.location,
        description: `${d.temperature > rule.temp_max ? '温度超标' : '温度过低'}: ${d.temperature}℃，阈值: ${rule.temp_min}~${rule.temp_max}℃`,
        temperature: d.temperature,
        threshold_info: `温度阈值: ${rule.temp_min}~${rule.temp_max}℃`,
        occur_time: d.collection_time,
      });
    }
    if (isHumidOver && !isOver) {
      exceptions.push({
        type: 'humidity_abnormal',
        level: 'normal',
        cargo_id,
        tag_id: d.tag_id,
        location: d.location,
        description: `湿度异常: ${d.humidity}%，阈值: ${rule.humidity_min}~${rule.humidity_max}%`,
        humidity: d.humidity,
        threshold_info: `湿度阈值: ${rule.humidity_min}~${rule.humidity_max}%`,
        occur_time: d.collection_time,
      });
    }
    if (d.device_status && d.device_status !== 'normal') {
      const typeMap: Record<string, string> = { low_battery: 'tag_low_battery', offline: 'tag_offline', sensor_error: 'sensor_error' };
      const t = typeMap[d.device_status] || 'sensor_error';
      const levelMap: Record<string, string> = { low_battery: 'normal', offline: 'normal', sensor_error: 'serious' };
      exceptions.push({
        type: t,
        level: levelMap[t] || 'normal',
        cargo_id,
        tag_id: d.tag_id,
        description: `设备状态异常: ${d.device_status}`,
        occur_time: d.collection_time,
      });
    }
    if (d.door_open && d.door_open_duration && d.door_open_duration > 10) {
      exceptions.push({
        type: 'door_open_long',
        level: 'normal',
        cargo_id,
        tag_id: d.tag_id,
        description: `车门开启时间过长: ${d.door_open_duration}分钟`,
        duration_minutes: d.door_open_duration,
        occur_time: d.collection_time,
      });
    }
  }
  if (exceptions.length === 0) return [];
  const n = now();
  for (const e of exceptions) {
    const id = uuidv4();
    const roles: Record<string, string[]> = {
      normal: ['driver'],
      serious: ['driver', 'qc', 'warehouse_manager'],
      critical: ['driver', 'qc', 'warehouse_manager', 'quality_director'],
    };
    const notifyRoles = roles[e.level] || roles.normal;
    const users = db.prepare('SELECT id FROM users WHERE role IN (' + notifyRoles.map(() => '?').join(',') + ')')
      .all(...notifyRoles) as any[];
    const dup = db.prepare(`SELECT id FROM exception_records WHERE cargo_id = ? AND type = ?
      AND occur_time >= datetime(?, '-10 minutes') LIMIT 1`)
      .get(cargo_id, e.type, e.occur_time);
    if (dup) continue;
    db.prepare(`INSERT INTO exception_records (id, type, level, cargo_id, tag_id, warehouse_id, zone_id, location,
      description, temperature, humidity, threshold_info, duration_minutes, occur_time, status,
      current_handler, notified_users, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
      .run(id, e.type, e.level, e.cargo_id || null, e.tag_id || null, null, null,
        e.location || null, e.description, e.temperature ?? null, e.humidity ?? null,
        e.threshold_info || null, e.duration_minutes ?? null, e.occur_time || n,
        users[0]?.id || null, JSON.stringify(users.map(u => u.id)), n);
    newIds.push(id);
  }
  return newIds;
}

tempRouter.get('/cargo/:cargoId', (req: AuthRequest, res) => {
  const { start_time, end_time, pageSize = 200 } = req.query;
  const cargo = db.prepare(`
    SELECT c.*, r.name as rule_name, r.temp_min, r.temp_max, r.humidity_min, r.humidity_max,
           r.single_overtime_limit, r.total_overtime_limit, r.temp_fluctuation_limit,
           t.id as tag_id, t.tag_no, t.battery_level, t.communication_status,
           v.plate_no, v.type as vehicle_type
    FROM cargos c
    LEFT JOIN temperature_rules r ON c.rule_id = r.id
    LEFT JOIN io_tags t ON c.id = t.cargo_id
    LEFT JOIN vehicles v ON c.vehicle_id = v.id
    WHERE c.id = ?
  `).get(req.params.cargoId);
  if (!cargo) return fail(res, '货物不存在', 404, 404);
  let sql = `SELECT td.*, t.tag_no FROM temperature_data td
    JOIN io_tags t ON td.tag_id = t.id WHERE td.cargo_id = ?`;
  const params: unknown[] = [req.params.cargoId];
  if (start_time) { sql += ' AND td.collection_time >= ?'; params.push(start_time); }
  if (end_time) { sql += ' AND td.collection_time <= ?'; params.push(end_time); }
  sql += ' ORDER BY td.collection_time DESC LIMIT ?';
  params.push(Number(pageSize));
  const data = db.prepare(sql).all(...params).reverse();
  ok(res, { cargo, temperature_data: data });
});

tempRouter.get('/tag/:tagId', (req: AuthRequest, res) => {
  const { limit = 200 } = req.query;
  const data = db.prepare(`SELECT * FROM temperature_data WHERE tag_id = ? ORDER BY collection_time DESC LIMIT ?`)
    .all(req.params.tagId, Number(limit)).reverse();
  ok(res, data);
});

tempRouter.get('/realtime/cargos', (req: AuthRequest, res) => {
  const { status = 'in_transit,arrived,in_warehouse' } = req.query;
  const statusList = (status as string).split(',');
  const placeholders = statusList.map(() => '?').join(',');
  const data = db.prepare(`
    SELECT c.id, c.cargo_no, c.name, c.category, c.sub_category, c.status, c.transport_no,
           r.temp_min, r.temp_max, r.humidity_min, r.humidity_max,
           t.tag_no, t.battery_level, t.communication_status,
           (SELECT temperature FROM temperature_data WHERE cargo_id = c.id ORDER BY collection_time DESC LIMIT 1) as current_temp,
           (SELECT humidity FROM temperature_data WHERE cargo_id = c.id ORDER BY collection_time DESC LIMIT 1) as current_humidity,
           (SELECT collection_time FROM temperature_data WHERE cargo_id = c.id ORDER BY collection_time DESC LIMIT 1) as last_report_time,
           (SELECT location FROM temperature_data WHERE cargo_id = c.id ORDER BY collection_time DESC LIMIT 1) as current_location,
           v.plate_no, u.name as driver_name, u.phone as driver_phone
    FROM cargos c
    LEFT JOIN temperature_rules r ON c.rule_id = r.id
    LEFT JOIN io_tags t ON c.id = t.cargo_id
    LEFT JOIN vehicles v ON c.vehicle_id = v.id
    LEFT JOIN users u ON v.driver_id = u.id
    WHERE c.status IN (${placeholders})
    ORDER BY c.created_at DESC
  `).all(...statusList);
  ok(res, data);
});

export const warehouseRouter = Router();
warehouseRouter.use(authMiddleware);

warehouseRouter.get('/', (req: AuthRequest, res) => {
  const data = db.prepare(`
    SELECT w.*, u.name as manager_name, COUNT(DISTINCT z.id) as zone_count
    FROM warehouses w
    LEFT JOIN users u ON w.manager_id = u.id
    LEFT JOIN warehouse_zones z ON z.warehouse_id = w.id
    GROUP BY w.id ORDER BY w.created_at DESC
  `).all();
  ok(res, data);
});

warehouseRouter.get('/:id/zones', (req: AuthRequest, res) => {
  const zones = db.prepare('SELECT * FROM warehouse_zones WHERE warehouse_id = ? ORDER BY code').all(req.params.id);
  const zonesWithCargos = zones.map((zone: any) => ({
    ...zone,
    cargo_count: db.prepare("SELECT COUNT(*) FROM cargos WHERE warehouse_id = ? AND status IN ('arrived','in_warehouse','accepted') AND id IN (SELECT cargo_id FROM cargos WHERE id IN (SELECT id FROM cargos LIMIT 1))").get(zone.warehouse_id) as any,
  }));
  ok(res, zonesWithCargos);
});

warehouseRouter.post('/zone-temp/upload', (req: AuthRequest, res) => {
  const { zone_id, temperature, humidity } = req.body;
  const zone = db.prepare('SELECT * FROM warehouse_zones WHERE id = ?').get(zone_id) as any;
  if (!zone) return fail(res, '分区不存在', 404, 404);
  const status = temperature < zone.temp_min || temperature > zone.temp_max
    ? (temperature < zone.temp_min - 2 || temperature > zone.temp_max + 2 ? 'error' : 'warning')
    : 'normal';
  db.prepare('UPDATE warehouse_zones SET current_temp = ?, current_humidity = ?, status = ? WHERE id = ?')
    .run(temperature, humidity, status, zone_id);
  ok(res, { status }, '分区温度已更新');
});

export const vehicleRouter = Router();
vehicleRouter.use(authMiddleware);

vehicleRouter.get('/', (req: AuthRequest, res) => {
  const { status } = req.query;
  let sql = `SELECT v.*, u.name as driver_name, u.phone as driver_phone FROM vehicles v LEFT JOIN users u ON v.driver_id = u.id`;
  const params: unknown[] = [];
  if (status) { sql += ' WHERE v.status = ?'; params.push(status); }
  sql += ' ORDER BY v.created_at DESC';
  ok(res, db.prepare(sql).all(...params));
});
