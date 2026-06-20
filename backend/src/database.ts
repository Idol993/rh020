import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

let SQL: SqlJsStatic;
let db: Database;
let dbPath: string;

class Database {
  private inner: SqlJsDatabase;
  private inTransaction = false;

  constructor(inner: SqlJsDatabase) {
    this.inner = inner;
  }

  exec(sql: string) {
    this.inner.exec(sql);
  }

  prepare(sql: string) {
    const inner = this.inner;
    const self = this;
    return {
      run(...params: any[]): any {
        const stmt = inner.prepare(sql);
        stmt.bind(params);
        stmt.step();
        stmt.free();
        if (!self.inTransaction) self.save();
        return { changes: inner.getRowsModified() || 0, lastInsertRowid: 0 };
      },
      get(...params: any[]): any {
        const stmt = inner.prepare(sql);
        stmt.bind(params);
        let row: any = undefined;
        if (stmt.step()) {
          row = stmt.getAsObject();
        }
        stmt.free();
        return row;
      },
      all(...params: any[]): any[] {
        const stmt = inner.prepare(sql);
        stmt.bind(params);
        const rows: any[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
      },
    };
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    const self = this;
    return function(...args: any[]) {
      const prevInTx = self.inTransaction;
      if (prevInTx) {
        return fn(...args);
      }
      try {
        self.inTransaction = true;
        self.inner.exec('BEGIN TRANSACTION');
        const result = fn(...args);
        self.inner.exec('COMMIT');
        self.save();
        return result;
      } catch (e) {
        try { self.inner.exec('ROLLBACK'); } catch (_) { /* noop */ }
        throw e;
      } finally {
        self.inTransaction = false;
      }
    } as T;
  }

  pragma(_sql: string) {}

  export(): Uint8Array {
    return this.inner.export();
  }

  save() {
    const data = this.export();
    try {
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch {}
  }
}

export function getDb() {
  return db;
}

export async function initDatabase(): Promise<void> {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => path.join(require.resolve('sql.js'), '..', file),
    });
  }
  const dbDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  dbPath = path.join(dbDir, 'coldchain.db');

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new Database(new SQL.Database(new Uint8Array(buf)));
  } else {
    db = new Database(new SQL.Database());
  }

  createTables();
  seedInitialData();
  db.save();
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      warehouse_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS temperature_rules (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      sub_category TEXT NOT NULL,
      storage_type TEXT NOT NULL,
      transport_mode TEXT,
      temp_min REAL NOT NULL,
      temp_max REAL NOT NULL,
      humidity_min REAL NOT NULL,
      humidity_max REAL NOT NULL,
      temp_fluctuation_limit REAL,
      single_overtime_limit INTEGER,
      total_overtime_limit INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      is_custom INTEGER DEFAULT 0,
      created_by TEXT,
      status TEXT DEFAULT 'approved',
      approved_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      type TEXT NOT NULL,
      total_zones INTEGER DEFAULT 0,
      manager_id TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouse_zones (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      temp_min REAL NOT NULL,
      temp_max REAL NOT NULL,
      humidity_min REAL NOT NULL,
      humidity_max REAL NOT NULL,
      current_temp REAL,
      current_humidity REAL,
      status TEXT DEFAULT 'normal',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      plate_no TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      driver_id TEXT,
      capacity REAL NOT NULL,
      refrigeration_unit TEXT,
      status TEXT DEFAULT 'idle',
      current_location TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cargos (
      id TEXT PRIMARY KEY,
      cargo_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      sub_category TEXT NOT NULL,
      specification TEXT,
      production_date TEXT,
      expiry_date TEXT,
      shipper TEXT NOT NULL,
      receiver TEXT NOT NULL,
      receiver_address TEXT,
      transport_no TEXT NOT NULL,
      vehicle_id TEXT,
      warehouse_id TEXT,
      quantity INTEGER NOT NULL,
      unit TEXT,
      value REAL DEFAULT 0,
      rule_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending_outbound',
      outbound_time TEXT,
      arrival_time TEXT,
      accept_time TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS io_tags (
      id TEXT PRIMARY KEY,
      tag_no TEXT UNIQUE NOT NULL,
      cargo_id TEXT,
      status TEXT DEFAULT 'idle',
      battery_level REAL DEFAULT 100,
      communication_status TEXT DEFAULT 'online',
      sensor_accuracy REAL DEFAULT 0.1,
      firmware_version TEXT,
      last_check_time TEXT,
      last_heartbeat TEXT,
      current_location TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS binding_logs (
      id TEXT PRIMARY KEY,
      cargo_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      remark TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS temperature_data (
      id TEXT PRIMARY KEY,
      tag_id TEXT NOT NULL,
      cargo_id TEXT,
      temperature REAL NOT NULL,
      humidity REAL NOT NULL,
      latitude REAL,
      longitude REAL,
      location TEXT,
      collection_time TEXT NOT NULL,
      is_realtime INTEGER DEFAULT 1,
      is_supplementary INTEGER DEFAULT 0,
      device_status TEXT DEFAULT 'normal',
      door_open INTEGER DEFAULT 0,
      door_open_duration INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exception_records (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      cargo_id TEXT,
      tag_id TEXT,
      warehouse_id TEXT,
      zone_id TEXT,
      location TEXT,
      description TEXT NOT NULL,
      temperature REAL,
      humidity REAL,
      threshold_info TEXT,
      duration_minutes INTEGER,
      occur_time TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reported_by TEXT,
      current_handler TEXT,
      notified_users TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exception_handlings (
      id TEXT PRIMARY KEY,
      exception_id TEXT NOT NULL,
      handler_id TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      attachment_urls TEXT,
      temperature_after REAL,
      humidity_after REAL,
      handle_time TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      verify_status TEXT DEFAULT 'pending',
      verifier_id TEXT,
      verify_remark TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compliance_reports (
      id TEXT PRIMARY KEY,
      report_no TEXT UNIQUE NOT NULL,
      cargo_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      total_data_points INTEGER DEFAULT 0,
      temp_qualified_count INTEGER DEFAULT 0,
      humidity_qualified_count INTEGER DEFAULT 0,
      temp_pass_rate REAL DEFAULT 0,
      humidity_pass_rate REAL DEFAULT 0,
      exception_count INTEGER DEFAULT 0,
      critical_exception_count INTEGER DEFAULT 0,
      total_overtime_minutes INTEGER,
      route_deviation INTEGER DEFAULT 0,
      door_open_count INTEGER DEFAULT 0,
      total_door_open_minutes INTEGER DEFAULT 0,
      conclusion TEXT NOT NULL,
      conclusion_detail TEXT NOT NULL,
      generated_by TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      signed_by TEXT,
      signed_at TEXT,
      pdf_path TEXT
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      settlement_no TEXT UNIQUE NOT NULL,
      cargo_id TEXT NOT NULL,
      transport_no TEXT NOT NULL,
      shipper TEXT NOT NULL,
      carrier TEXT NOT NULL,
      contract_amount REAL NOT NULL,
      compliance_level TEXT NOT NULL,
      deduction_ratio REAL DEFAULT 0,
      deduction_amount REAL DEFAULT 0,
      deduction_reason TEXT,
      force_majeure INTEGER DEFAULT 0,
      adjust_remark TEXT,
      adjust_amount REAL,
      adjust_by TEXT,
      final_amount REAL NOT NULL,
      report_id TEXT,
      status TEXT DEFAULT 'pending',
      approved_by TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      remark TEXT,
      created_at TEXT NOT NULL
    );
  `);

  try {
    db.exec('ALTER TABLE exception_handlings ADD COLUMN verify_status TEXT DEFAULT \'pending\'');
  } catch (_) { /* 字段可能已存在 */ }
  try {
    db.exec('ALTER TABLE binding_logs ADD COLUMN remark TEXT');
  } catch (_) { /* 字段可能已存在 */ }
}

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount && userCount.count > 0) return;

  const now = new Date().toISOString();
  const salt = bcrypt.genSaltSync(10);
  const pwd = bcrypt.hashSync('123456', salt);

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password, name, role, phone, email, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const users = [
    { id: uuidv4(), username: 'director', name: '张总监', role: 'quality_director', phone: '13800000001', email: 'director@coldchain.com' },
    { id: uuidv4(), username: 'qc01', name: '李质控', role: 'qc', phone: '13800000002', email: 'qc01@coldchain.com' },
    { id: uuidv4(), username: 'wh01', name: '王仓储', role: 'warehouse_manager', phone: '13800000003', email: 'wh01@coldchain.com' },
    { id: uuidv4(), username: 'driver01', name: '赵司机', role: 'driver', phone: '13800000004', email: 'driver01@coldchain.com' },
    { id: uuidv4(), username: 'driver02', name: '钱司机', role: 'driver', phone: '13800000005', email: 'driver02@coldchain.com' },
  ];

  const userMap: Record<string, string> = {};
  for (const u of users) {
    insertUser.run(u.id, u.username, pwd, u.name, u.role, u.phone, u.email, now);
    userMap[u.username] = u.id;
  }

  const insertRule = db.prepare(`
    INSERT INTO temperature_rules (id, category, sub_category, storage_type, transport_mode,
      temp_min, temp_max, humidity_min, humidity_max, temp_fluctuation_limit, single_overtime_limit, total_overtime_limit,
      name, description, is_custom, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'approved', ?, ?)
  `);

  const rules: any[] = [
    ['pharmacy', 'vaccine', 'transport', 'long', 2, 8, 35, 75, 2, 5, 10, '疫苗长途运输', 'GSP疫苗冷链运输标准，严格控温2-8℃'],
    ['pharmacy', 'vaccine', 'warehouse', null, 2, 8, 35, 75, 1.5, 3, 8, '疫苗冷库存储', 'GSP疫苗冷库存储标准'],
    ['pharmacy', 'blood', 'transport', 'refrigerated_van', 2, 6, 50, 80, 1, 5, 15, '血液制品运输', 'GMP血液制品运输标准'],
    ['pharmacy', 'refrigerated_drug', 'transport', 'refrigerated_van', 2, 8, 35, 75, 2, 10, 30, '冷藏药品运输', 'GSP冷藏药品标准2-8℃'],
    ['pharmacy', 'frozen_drug', 'transport', 'refrigerated_van', -25, -18, 35, 75, 3, 10, 30, '冷冻药品运输', 'GSP冷冻药品≤-18℃'],
    ['pharmacy', 'normal_drug', 'warehouse', null, 10, 30, 35, 75, 3, 30, 120, '常温药品库', 'GMP常温控温10-30℃'],
    ['fresh', 'vegetable', 'transport', 'short', 0, 15, 80, 95, 3, 15, 60, '蔬菜短途运输', '生鲜蔬菜短途冷链'],
    ['fresh', 'fruit', 'transport', 'long', 0, 10, 85, 95, 2, 15, 60, '水果长途运输', '水果长途冷链保鲜'],
    ['fresh', 'seafood', 'transport', 'refrigerated_van', -2, 2, 80, 95, 1.5, 10, 30, '水产运输', '冰鲜水产-2~2℃'],
    ['fresh', 'meat', 'transport', 'refrigerated_van', 0, 4, 75, 90, 1.5, 10, 30, '冷鲜肉运输', '冷鲜肉0-4℃'],
    ['fresh', 'frozen_food', 'transport', 'refrigerated_van', -25, -18, 70, 90, 3, 10, 30, '冷冻食品运输', '冷冻食品≤-18℃'],
    ['fresh', 'dairy', 'warehouse', null, 2, 6, 60, 85, 2, 10, 30, '乳制品冷库', '乳制品冷藏存储'],
    ['fresh', 'vegetable', 'warehouse', null, 0, 10, 85, 95, 2, 15, 60, '蔬菜冷库', '蔬菜保鲜冷库'],
  ];

  for (const r of rules) {
    insertRule.run(
      uuidv4(), r[0], r[1], r[2], r[3],
      r[4], r[5], r[6], r[7], r[8], r[9], r[10],
      r[11], r[12], now, now
    );
  }

  const insertWarehouse = db.prepare(`
    INSERT INTO warehouses (id, name, code, address, type, total_zones, manager_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `);
  const wh1Id = uuidv4();
  const wh2Id = uuidv4();
  insertWarehouse.run(wh1Id, '华东医药冷链中心一号库', 'WH-PH-001', '上海市浦东新区张江路888号', 'pharmacy', 4, userMap['wh01'], now);
  insertWarehouse.run(wh2Id, '华南生鲜冷链中心一号库', 'WH-FR-001', '广州市白云区太和镇冷链路666号', 'fresh', 5, null, now);

  const insertZone = db.prepare(`
    INSERT INTO warehouse_zones (id, warehouse_id, name, code, temp_min, temp_max, humidity_min, humidity_max, current_temp, current_humidity, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', ?)
  `);
  const zones: any[] = [
    [wh1Id, '2-8℃冷藏区A', 'WH-PH-001-A', 2, 8, 35, 75, 5.2, 55],
    [wh1Id, '2-8℃冷藏区B', 'WH-PH-001-B', 2, 8, 35, 75, 4.8, 58],
    [wh1Id, '-18℃冷冻区', 'WH-PH-001-C', -25, -18, 35, 75, -20.5, 50],
    [wh1Id, '10-30℃常温区', 'WH-PH-001-D', 10, 30, 35, 75, 22.0, 45],
    [wh2Id, '0-10℃蔬果区', 'WH-FR-001-A', 0, 10, 85, 95, 6.5, 90],
    [wh2Id, '-2~2℃水产区', 'WH-FR-001-B', -2, 2, 80, 95, 0.5, 88],
    [wh2Id, '0-4℃肉品区', 'WH-FR-001-C', 0, 4, 75, 90, 2.0, 82],
    [wh2Id, '-18℃冷冻区', 'WH-FR-001-D', -25, -18, 70, 90, -19.5, 80],
    [wh2Id, '2-6℃乳品区', 'WH-FR-001-E', 2, 6, 60, 85, 4.0, 72],
  ];
  for (const z of zones) {
    insertZone.run(uuidv4(), z[0], z[1], z[2], z[3], z[4], z[5], z[6], z[7], z[8], now);
  }

  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (id, plate_no, type, driver_id, capacity, refrigeration_unit, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'idle', ?)
  `);
  const vehicles = [
    ['沪A·88888', 'refrigerated_van', userMap['driver01'], 10, '开利制冷机组V500'],
    ['沪B·66666', 'refrigerated_van', userMap['driver02'], 12, '冷王制冷机组T600'],
    ['沪C·12345', 'long', null, 20, '开利制冷机组V800'],
    ['粤A·99999', 'short', null, 8, '冷王制冷机组T300'],
  ];
  for (const v of vehicles) {
    insertVehicle.run(uuidv4(), v[0], v[1], v[2], v[3], v[4], now);
  }

  const insertTag = db.prepare(`
    INSERT INTO io_tags (id, tag_no, status, battery_level, communication_status, sensor_accuracy, firmware_version, created_at)
    VALUES (?, ?, 'idle', 100, 'online', 0.1, 'v2.3.1', ?)
  `);
  for (let i = 1; i <= 20; i++) {
    const tagNo = `TAG${String(i).padStart(6, '0')}`;
    insertTag.run(uuidv4(), tagNo, now);
  }

  db.prepare('UPDATE users SET warehouse_id = ? WHERE username = ?').run(wh1Id, 'wh01');

  seedDemoData(userMap, wh1Id, wh2Id);
}

function seedDemoData(userMap: Record<string, string>, wh1Id: string, wh2Id: string) {
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const rules = db.prepare('SELECT id, category, sub_category, temp_min, temp_max, humidity_min, humidity_max FROM temperature_rules').all();
  const ruleMap: Record<string, any> = {};
  for (const r of rules) ruleMap[`${r.category}-${r.sub_category}-transport`] = r;

  const vehicles = db.prepare('SELECT id FROM vehicles').all();
  const idleTags = db.prepare("SELECT id, tag_no FROM io_tags WHERE status = 'idle' LIMIT 12").all();

  const cargos = [
    {
      name: '新冠灭活疫苗 Vero细胞', category: 'pharmacy', sub_category: 'vaccine',
      specification: '0.5ml/支×200支', quantity: 200, unit: '箱', value: 96000,
      shipper: '国药中生生物技术有限公司', receiver: '华东市疾控中心', receiver_address: '上海市徐汇区卫生局1号楼',
    },
    {
      name: '人血白蛋白注射液', category: 'pharmacy', sub_category: 'blood',
      specification: '20% 50ml×100瓶', quantity: 100, unit: '箱', value: 45000,
      shipper: '上海莱士血液制品', receiver: '瑞金医院药房', receiver_address: '上海市黄浦区瑞金二路197号',
    },
    {
      name: '胰岛素注射液 甘精', category: 'pharmacy', sub_category: 'refrigerated_drug',
      specification: '3ml:300单位×50盒', quantity: 50, unit: '箱', value: 68000,
      shipper: '赛诺菲制药', receiver: '第一医药连锁总仓', receiver_address: '上海市静安区南京西路616号',
    },
    {
      name: '进口三文鱼 冰鲜', category: 'fresh', sub_category: 'seafood',
      specification: '5-6kg/条×20条', quantity: 20, unit: '箱', value: 32000,
      shipper: '挪威海产集团', receiver: '盒马鲜生大仓', receiver_address: '上海市浦东新区张江配送中心',
    },
    {
      name: '有机蔬菜礼盒', category: 'fresh', sub_category: 'vegetable',
      specification: '5kg装×100盒', quantity: 100, unit: '箱', value: 28000,
      shipper: '崇明有机农场', receiver: '叮咚买菜大仓', receiver_address: '上海市嘉定区马陆配送中心',
    },
    {
      name: '进口车厘子 JJ级', category: 'fresh', sub_category: 'fruit',
      specification: '5kg装×80箱', quantity: 80, unit: '箱', value: 76800,
      shipper: '智利水果出口商', receiver: '百果园华东仓', receiver_address: '上海市松江区九亭镇配送中心',
    },
  ];

  let tagIdx = 0;
  const insertedCargos: { id: string; temp_min: number; temp_max: number; humidity_min: number; humidity_max: number }[] = [];
  const insertCargo = db.prepare(`INSERT INTO cargos (id, cargo_no, name, category, sub_category, specification,
    production_date, expiry_date, shipper, receiver, receiver_address, transport_no, vehicle_id,
    warehouse_id, quantity, unit, value, rule_id, status, outbound_time, arrival_time, accept_time, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const bindTag = db.prepare('UPDATE io_tags SET cargo_id = ?, status = ? WHERE id = ?');
  const insertBinding = db.prepare(`INSERT INTO binding_logs (id, cargo_id, tag_id, operation_type, operator_id, created_at)
    VALUES (?, ?, ?, 'bind', ?, ?)`);

  for (let i = 0; i < cargos.length; i++) {
    const c: any = cargos[i];
    const ruleKey = `${c.category}-${c.sub_category}-transport`;
    const rule = ruleMap[ruleKey] || rules[0];
    const id = uuidv4();
    const cargoNo = `CC202606${String(15 + i).padStart(4, '0')}`;
    const transportNo = `TR202606${String(150 + i).padStart(4, '0')}`;
    const offset = (i - 3) * 3600 * 1000 * 6;
    const created = new Date(start.getTime() + offset);
    const outbound = new Date(created.getTime() + 1800 * 1000);
    const arrival = new Date(outbound.getTime() + 6 * 3600 * 1000 + (i % 3) * 3600 * 1000);
    const accept = i < 4 ? new Date(arrival.getTime() + 1800 * 1000) : null;
    const statuses = ['accepted', 'accepted', 'accepted', 'in_warehouse', 'in_transit', 'in_transit'];

    insertCargo.run(
      id, cargoNo, c.name, c.category, c.sub_category, c.specification,
      '2026-06-01', '2027-06-01', c.shipper, c.receiver, c.receiver_address, transportNo,
      vehicles[i % vehicles.length].id,
      i % 2 === 0 ? wh1Id : wh2Id,
      c.quantity, c.unit, c.value, rule.id,
      statuses[i],
      outbound.toISOString(),
      ['accepted', 'in_warehouse', 'arrived'].includes(statuses[i]) ? arrival.toISOString() : null,
      accept ? accept.toISOString() : null,
      created.toISOString()
    );
    if (tagIdx < idleTags.length) {
      const statusForTag = statuses[i] === 'in_transit' ? 'in_transit' : (['accepted', 'in_warehouse'].includes(statuses[i]) ? 'in_warehouse' : 'bound');
      bindTag.run(id, statusForTag, idleTags[tagIdx].id);
      insertBinding.run(uuidv4(), id, idleTags[tagIdx].id, userMap['qc01'], outbound.toISOString());
      tagIdx++;
    }
    insertedCargos.push({ id, temp_min: rule.temp_min, temp_max: rule.temp_max, humidity_min: rule.humidity_min, humidity_max: rule.humidity_max });
  }

  const insertAudit = db.prepare(`INSERT INTO audit_logs (id, user_id, module, action, target_type, target_id, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < cargos.length; i++) {
    const c = insertedCargos[i];
    const cargo = db.prepare('SELECT cargo_no, status, created_at, outbound_time, arrival_time, accept_time FROM cargos WHERE id = ?').get(c.id);
    if (!cargo) continue;

    insertAudit.run(uuidv4(), userMap['qc01'], 'cargo', 'create', 'cargo', c.id, `创建货物批次: ${cargo.cargo_no}`, cargo.created_at);
    insertAudit.run(uuidv4(), userMap['qc01'], 'cargo', 'bind_tag', 'cargo', c.id, `绑定IoT标签`, cargo.outbound_time);
    insertAudit.run(uuidv4(), userMap['qc01'], 'cargo', 'verify_device', 'cargo', c.id, `设备校验通过`, cargo.outbound_time);
    insertAudit.run(uuidv4(), userMap['qc01'], 'cargo', 'start_transport', 'cargo', c.id, `启运出库`, cargo.outbound_time);

    if (cargo.arrival_time) {
      insertAudit.run(uuidv4(), userMap['wh01'], 'cargo', 'arrive', 'cargo', c.id, `到库登记`, cargo.arrival_time);
    }
    if (cargo.accept_time) {
      const action = cargo.status === 'accepted' ? 'accept' : 'reject';
      const remark = cargo.status === 'accepted' ? '验收通过，正常入库' : '验收异常，拒收';
      insertAudit.run(uuidv4(), userMap['wh01'], 'cargo', action, 'cargo', c.id, remark, cargo.accept_time);
      if (cargo.status === 'accepted') {
        insertAudit.run(uuidv4(), userMap['wh01'], 'cargo', 'put_in_warehouse', 'cargo', c.id, `入库上架`, cargo.accept_time);
      }
    }
  }

  const insertTemp = db.prepare(`INSERT INTO temperature_data (id, tag_id, cargo_id, temperature, humidity,
    latitude, longitude, location, collection_time, is_realtime, is_supplementary, device_status,
    door_open, door_open_duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'normal', 0, NULL, ?)`);

  for (const c of insertedCargos) {
    const tag = db.prepare('SELECT id FROM io_tags WHERE cargo_id = ?').get(c.id);
    if (!tag) continue;
    const cargo = db.prepare('SELECT outbound_time, arrival_time, status FROM cargos WHERE id = ?').get(c.id);
    if (!cargo || !cargo.outbound_time) continue;
    const begin = new Date(cargo.outbound_time);
    const end = cargo.arrival_time ? new Date(cargo.arrival_time) : new Date();
    let cur = new Date(begin);
    let n = 0;
    while (cur <= end && n < 400) {
      const mid = (c.temp_min + c.temp_max) / 2;
      const range = (c.temp_max - c.temp_min) / 2;
      let temp = mid + (Math.random() - 0.5) * range * 0.8;
      if (n === 30 || n === 120) temp = c.temp_max + 2 + Math.random() * 2;
      if (n === 31 || n === 121) temp = c.temp_max + 1 + Math.random();
      let hum = (c.humidity_min + c.humidity_max) / 2 + (Math.random() - 0.5) * 10;
      hum = Math.max(c.humidity_min - 3, Math.min(c.humidity_max + 5, hum));

      const lat = 31.2 + Math.random() * 0.8;
      const lng = 121.3 + Math.random() * 0.8;
      insertTemp.run(
        uuidv4(), tag.id, c.id, Number(temp.toFixed(2)), Number(hum.toFixed(1)),
        Number(lat.toFixed(5)), Number(lng.toFixed(5)),
        `运输途中: 上海市辖区 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        cur.toISOString(), cur.toISOString()
      );
      cur = new Date(cur.getTime() + 5 * 60 * 1000);
      n++;
    }
  }

  for (const c of insertedCargos.slice(0, 3)) {
    const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(c.id);
    if (!cargo) continue;
    const nowIso = new Date().toISOString();
    const reportNo = `RPT${cargo.cargo_no.slice(-8)}`;
    const data = db.prepare('SELECT COUNT(*) as cnt FROM temperature_data WHERE cargo_id = ?').get(c.id);
    const total = data?.cnt || 0;
    const pass = Math.floor(total * 0.97);
    const compliant = total < 120;
    db.prepare(`INSERT INTO compliance_reports (id, report_no, cargo_id, start_time, end_time,
      total_data_points, temp_qualified_count, humidity_qualified_count, temp_pass_rate, humidity_pass_rate,
      exception_count, critical_exception_count, total_overtime_minutes, route_deviation,
      door_open_count, total_door_open_minutes, conclusion, conclusion_detail, generated_by, generated_at, signed_by, signed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      uuidv4(), reportNo, c.id,
      cargo.outbound_time, cargo.arrival_time,
      total, pass, pass,
      compliant ? 0.987 : 0.973, compliant ? 0.991 : 0.981,
      total >= 120 ? 3 : 0, 0, 15, 0, 2, 5,
      compliant ? 'compliant' : 'basically_compliant',
      compliant ? '全程温控合规，符合GSP/GMP标准要求。' : '温度达标率97.3%，存在一般异常3起，不影响货物品质。',
      userMap['qc01'], nowIso, userMap['director'], nowIso
    );

    const setNo = `SET${cargo.transport_no.slice(-8)}`;
    const amount = cargo.value * 0.03;
    const ratio = total >= 120 ? 0.08 : 0;
    const deduct = amount * ratio;
    db.prepare(`INSERT INTO settlements (id, settlement_no, cargo_id, transport_no, shipper, carrier,
      contract_amount, compliance_level, deduction_ratio, deduction_amount, deduction_reason,
      final_amount, status, approved_by, approved_at, created_at, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`).run(
      uuidv4(), setNo, c.id, cargo.transport_no, cargo.shipper, '顺丰冷链物流',
      amount, ratio > 0 ? 'normal_exception' : 'compliant',
      ratio, deduct, ratio > 0 ? '存在一般异常' : '全程合规',
      amount - deduct, userMap['director'], nowIso, nowIso, nowIso
    );
  }

  const exceptionTypes: { type: string; level: string; desc: string; temp?: number }[] = [
    { type: 'over_temp', level: 'serious', desc: '温度超过上限阈值', temp: 10.5 },
    { type: 'humidity_abnormal', level: 'normal', desc: '湿度波动超出允许范围' },
    { type: 'door_open_long', level: 'normal', desc: '冷藏车门开启时长超过15分钟' },
    { type: 'tag_low_battery', level: 'normal', desc: '温控标签电量低于20%' },
  ];
  const excStatus = ['closed', 'closed', 'pending_verification', 'pending', 'processing'];
  for (let i = 0; i < 8; i++) {
    const c = insertedCargos[i % insertedCargos.length];
    const tagRow = db.prepare('SELECT id FROM io_tags WHERE cargo_id = ?').get(c.id);
    const tpl = exceptionTypes[i % exceptionTypes.length];
    const time = new Date(start.getTime() + i * 6 * 3600 * 1000);
    db.prepare(`INSERT INTO exception_records (id, type, level, cargo_id, tag_id, location,
      description, temperature, threshold_info, duration_minutes, occur_time, status,
      current_handler, notified_users, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`)
      .run(
        uuidv4(), tpl.type, tpl.level, c.id,
        tagRow?.id || null,
        '上海市辖区 运输途中',
        tpl.desc, tpl.temp || null,
        `温度阈值: ${c.temp_min}~${c.temp_max}℃`,
        10, time.toISOString(),
        excStatus[i % excStatus.length],
        userMap['driver01'],
        new Date().toISOString()
      );
  }
}

export { db };
