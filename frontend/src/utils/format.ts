import dayjs from 'dayjs';

export const categoryMap: Record<string, string> = {
  pharmacy: '医药',
  fresh: '生鲜',
};

export const subCategoryMap: Record<string, string> = {
  vaccine: '疫苗', blood: '血液制品', refrigerated_drug: '冷藏药品',
  frozen_drug: '冷冻药品', normal_drug: '常温药品',
  vegetable: '蔬菜', fruit: '水果', seafood: '水产',
  meat: '冷鲜肉', frozen_food: '冷冻食品', dairy: '乳制品',
};

export const storageTypeMap: Record<string, string> = {
  transport: '运输', warehouse: '存储',
};

export const cargoStatusMap: Record<string, { label: string; type: string }> = {
  pending_outbound: { label: '待出库', type: 'info' },
  outbound: { label: '已出库', type: '' },
  in_transit: { label: '在途运输', type: 'primary' },
  arrived: { label: '已到库', type: 'warning' },
  in_warehouse: { label: '在库存储', type: '' },
  accepted: { label: '已验收', type: 'success' },
  rejected: { label: '已拒收', type: 'danger' },
};

export const exceptionLevelMap: Record<string, { label: string; color: string; type: string }> = {
  normal: { label: '一般', color: '#409eff', type: 'info' },
  serious: { label: '较严重', color: '#e6a23c', type: 'warning' },
  critical: { label: '严重', color: '#f56c6c', type: 'danger' },
};

export const exceptionTypeMap: Record<string, string> = {
  over_temp: '温度超标', low_temp: '温度过低', humidity_abnormal: '湿度异常',
  temp_fluctuation: '温度波动超限', overtime_single: '单次超温时长超标',
  overtime_total: '累计超温时长超标', tag_offline: '标签离线',
  tag_low_battery: '标签低电量', sensor_error: '传感器故障',
  refrigeration_unit_error: '制冷机组故障', door_open_long: '开门时间过长',
  unauthorized_door: '非授权开门', route_deviation: '轨迹偏离',
  timeout_arrival: '超时未到库', warehouse_zone_temp: '冷库分区温度异常',
  zone_temp_diff: '区域温差超标',
};

export const exceptionStatusMap: Record<string, { label: string; type: string }> = {
  pending: { label: '待处理', type: 'danger' },
  processing: { label: '处理中', type: 'warning' },
  pending_verification: { label: '待验证', type: 'warning' },
  closed: { label: '已闭环', type: 'success' },
};

export const conclusionMap: Record<string, { label: string; type: string }> = {
  compliant: { label: '合规', type: 'success' },
  basically_compliant: { label: '基本合规', type: 'warning' },
  non_compliant: { label: '不合规', type: 'danger' },
};

export const settlementStatusMap: Record<string, { label: string; type: string }> = {
  pending: { label: '待核算', type: 'info' },
  calculated: { label: '已核算', type: '' },
  approved: { label: '已审批', type: 'success' },
  paid: { label: '已付款', type: 'success' },
  adjusted: { label: '已调整', type: 'warning' },
};

export const tagStatusMap: Record<string, { label: string; type: string }> = {
  idle: { label: '空闲', type: 'success' },
  bound: { label: '已绑定', type: '' },
  in_transit: { label: '在途使用', type: 'primary' },
  in_warehouse: { label: '在库使用', type: 'warning' },
  faulty: { label: '故障', type: 'danger' },
  low_battery: { label: '低电量', type: 'warning' },
};

export function fmtDate(s: string | undefined, fmt = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!s) return '-';
  return dayjs(s).format(fmt);
}

export function fmtNumber(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null) return '-';
  return Number(n).toFixed(digits);
}

export function fmtMoney(n: number | undefined): string {
  if (n === undefined || n === null) return '-';
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
