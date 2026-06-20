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
  const results: { id: string; tag_id: string; abnormal: boolean; message?: string }[] = [];
  const tx = db.transaction((list: typeof items) => {
    for (const d of list) {
      const tag = db.prepare('SELECT * FROM io_tags WHERE tag_no = ? OR id = ?').get(d.tag_id, d.tag_id) as any;
      if (!tag) { results.push({ id: '', tag_id: d.tag_id, abnormal: true, message: '标签不存在' }); continue; }
      const id = uuidv4();
      const cargo = tag.cargo_id ? db.prepare('SELECT rule_id FROM cargos WHERE id = ?').get(tag.cargo_id) : null;
      insert.run(id, tag.id, tag.cargo_id, Number(d.temperature), Number(d.humidity),
        d.latitude || null, d.longitude || null, d.location || null,
        d.collection_time || n, d.is_realtime === false ? 0 : 1, d.is_supplementary ? 1 : 0,
        d.device_status || 'normal', d.door_open ? 1 : 0, d.door_open_duration || null, n);
      db.prepare('UPDATE io_tags SET last_heartbeat = ?, current_location = ?, battery_level = ?, communication_status = ? WHERE id = ?')
        .run(n, d.location || tag.current_location, d.battery_level ?? tag.battery_level, 'online', tag.id);

      let abnormal = false;
      if (cargo) {
        const rule = db.prepare('SELECT * FROM temperature_rules WHERE id = ?').get((cargo as any).rule_id) as TemperatureRule;
        if (rule) {
          if (d.temperature < rule.temp_min || d.temperature > rule.temp_max) abnormal = true;
          if (d.humidity < rule.humidity_min || d.humidity > rule.humidity_max) abnormal = true;
        }
      }
      results.push({ id, tag_id: tag.id, abnormal });
    }
  });
  tx(items);
  ok(res, { uploaded: results.length, results });
});

tempRouter.get('/cargo/:cargoId', (req: AuthRequest, res) => {
  const { start_time, end_time, pageSize = 200 } = req.query;
  let sql = `SELECT td.*, t.tag_no FROM temperature_data td
    JOIN io_tags t ON td.tag_id = t.id WHERE td.cargo_id = ?`;
  const params: unknown[] = [req.params.cargoId];
  if (start_time) { sql += ' AND td.collection_time >= ?'; params.push(start_time); }
  if (end_time) { sql += ' AND td.collection_time <= ?'; params.push(end_time); }
  sql += ' ORDER BY td.collection_time DESC LIMIT ?';
  params.push(Number(pageSize));
  const data = db.prepare(sql).all(...params).reverse();
  ok(res, data);
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
