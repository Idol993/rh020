export type Role = 'driver' | 'qc' | 'warehouse_manager' | 'quality_director';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  phone: string;
  email: string;
  warehouse_id?: string;
  created_at: string;
}

export type Category = 'pharmacy' | 'fresh';
export type SubCategory =
  | 'vaccine' | 'blood' | 'refrigerated_drug' | 'frozen_drug' | 'normal_drug'
  | 'vegetable' | 'fruit' | 'seafood' | 'meat' | 'frozen_food' | 'dairy';
export type StorageType = 'transport' | 'warehouse';
export type TransportMode = 'short' | 'long' | 'normal_van' | 'refrigerated_van' | 'refrigerated_box';
export type CargoStatus = 'pending_outbound' | 'outbound' | 'in_transit' | 'arrived' | 'in_warehouse' | 'accepted' | 'rejected';

export interface TemperatureRule {
  id: string;
  category: Category;
  sub_category: SubCategory;
  storage_type: StorageType;
  transport_mode?: TransportMode;
  temp_min: number;
  temp_max: number;
  humidity_min: number;
  humidity_max: number;
  temp_fluctuation_limit?: number;
  single_overtime_limit?: number;
  total_overtime_limit?: number;
  name: string;
  description: string;
  is_custom: boolean;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface Cargo {
  id: string;
  cargo_no: string;
  name: string;
  category: Category;
  sub_category: SubCategory;
  specification?: string;
  production_date?: string;
  expiry_date?: string;
  shipper: string;
  receiver: string;
  receiver_address?: string;
  transport_no: string;
  vehicle_id?: string;
  warehouse_id?: string;
  quantity: number;
  unit: string;
  value: number;
  rule_id: string;
  status: CargoStatus;
  outbound_time?: string;
  arrival_time?: string;
  accept_time?: string;
  created_at: string;
}

export type ExceptionType =
  | 'over_temp' | 'low_temp' | 'humidity_abnormal' | 'temp_fluctuation'
  | 'overtime_single' | 'overtime_total'
  | 'tag_offline' | 'tag_low_battery' | 'sensor_error' | 'refrigeration_unit_error'
  | 'door_open_long' | 'unauthorized_door' | 'route_deviation' | 'timeout_arrival'
  | 'warehouse_zone_temp' | 'zone_temp_diff';
export type ExceptionLevel = 'normal' | 'serious' | 'critical';
export type ExceptionStatus = 'pending' | 'processing' | 'pending_verification' | 'closed';

export interface ExceptionRecord {
  id: string;
  type: ExceptionType;
  level: ExceptionLevel;
  cargo_id?: string;
  tag_id?: string;
  warehouse_id?: string;
  zone_id?: string;
  location?: string;
  description: string;
  temperature?: number;
  humidity?: number;
  threshold_info?: string;
  duration_minutes?: number;
  occur_time: string;
  status: ExceptionStatus;
  reported_by?: string;
  current_handler?: string;
  notified_users: string;
  created_at: string;
}

export type ComplianceConclusion = 'compliant' | 'basically_compliant' | 'non_compliant';

export interface ComplianceReport {
  id: string;
  report_no: string;
  cargo_id: string;
  start_time: string;
  end_time: string;
  total_data_points: number;
  temp_qualified_count: number;
  humidity_qualified_count: number;
  temp_pass_rate: number;
  humidity_pass_rate: number;
  exception_count: number;
  critical_exception_count: number;
  total_overtime_minutes?: number;
  route_deviation: boolean;
  door_open_count: number;
  total_door_open_minutes: number;
  conclusion: ComplianceConclusion;
  conclusion_detail: string;
  generated_by: string;
  generated_at: string;
  signed_by?: string;
  signed_at?: string;
}

export type SettlementStatus = 'pending' | 'calculated' | 'approved' | 'paid' | 'adjusted';

export interface Settlement {
  id: string;
  settlement_no: string;
  cargo_id: string;
  transport_no: string;
  shipper: string;
  carrier: string;
  contract_amount: number;
  compliance_level: 'compliant' | 'normal_exception' | 'serious_exception';
  deduction_ratio: number;
  deduction_amount: number;
  deduction_reason: string;
  force_majeure: boolean;
  adjust_remark?: string;
  adjust_amount?: number;
  final_amount: number;
  report_id?: string;
  status: SettlementStatus;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  paid_at?: string;
}

export interface TemperatureData {
  id: string;
  tag_id: string;
  cargo_id?: string;
  temperature: number;
  humidity: number;
  latitude?: number;
  longitude?: number;
  location?: string;
  collection_time: string;
  is_realtime: boolean;
  is_supplementary: boolean;
  device_status: string;
  door_open: boolean;
  door_open_duration?: number;
  created_at: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  type: string;
  manager_id?: string;
  created_at: string;
}

export interface WarehouseZone {
  id: string;
  warehouse_id: string;
  name: string;
  code: string;
  temp_min: number;
  temp_max: number;
  humidity_min: number;
  humidity_max: number;
  current_temp?: number;
  current_humidity?: number;
  status: 'normal' | 'warning' | 'error';
  created_at: string;
}
