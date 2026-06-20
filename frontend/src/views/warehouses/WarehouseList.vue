<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><OfficeBuilding /></el-icon></div>
          冷库管理
        </div>
      </div>

      <div class="section-title">
        <el-icon style="margin-right:6px"><List /></el-icon>
        冷库列表
      </div>

      <el-table
        :data="warehouses"
        stripe
        v-loading="loading"
        highlight-current-row
        @current-change="handleWarehouseSelect"
        style="cursor:pointer;margin-bottom:20px"
      >
        <el-table-column prop="name" label="冷库名称" min-width="180" />
        <el-table-column prop="code" label="冷库编码" width="140" />
        <el-table-column prop="address" label="地址" min-width="260" show-overflow-tooltip />
        <el-table-column label="类型" width="100">
          <template #default="{row}">
            <el-tag size="small" :type="getWarehouseTypeTag(row.type)">
              {{ getWarehouseTypeLabel(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="manager_name" label="负责人" width="120" />
        <el-table-column label="分区数" width="100" align="center">
          <template #default="{row}">
            <el-tag size="small" type="info" effect="plain">{{ row.zone_count || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag size="small" :type="row.status==='active'?'success':'warning'">
              {{ row.status==='active'?'运行中':'维护中' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <template v-if="selectedWarehouse">
        <div class="section-title">
          <el-icon style="margin-right:6px"><DataAnalysis /></el-icon>
          {{ selectedWarehouse.name }} - 分区温控详情
        </div>

        <div v-loading="zonesLoading" class="zone-grid">
          <div
            v-for="zone in zones"
            :key="zone.id"
            class="zone-card"
            :class="`zone-${getZoneStatus(zone)}`"
          >
            <div class="zone-header">
              <div class="zone-name">
                <el-icon><Grid /></el-icon>
                {{ zone.name }}
              </div>
              <el-tag size="small" type="info" effect="plain">{{ zone.code }}</el-tag>
            </div>

            <div class="zone-temp-section">
              <div class="temp-badge" :class="`badge-${getTempBadgeType(zone)}`">
                <span class="temp-value">{{ fmtNumber(zone.current_temp, 1) }}</span>
                <span class="temp-unit">℃</span>
              </div>
              <div class="humidity-section">
                <el-icon color="#409eff"><Watermelon /></el-icon>
                <span class="humidity-value">{{ fmtNumber(zone.current_humidity, 0) }}%</span>
              </div>
            </div>

            <div class="zone-threshold">
              <div class="threshold-item">
                <span class="threshold-label">温度阈值</span>
                <span class="threshold-value">{{ zone.temp_min }} ~ {{ zone.temp_max }} ℃</span>
              </div>
              <div class="threshold-item">
                <span class="threshold-label">湿度阈值</span>
                <span class="threshold-value">{{ zone.humidity_min }} ~ {{ zone.humidity_max }} %</span>
              </div>
            </div>

            <div class="zone-footer">
              <el-tag
                size="small"
                :type="getZoneTagType(zone.status)"
                effect="dark"
              >
                {{ getZoneStatusLabel(zone.status) }}
              </el-tag>
            </div>
          </div>

          <el-empty v-if="zones.length === 0 && !zonesLoading" description="暂无分区数据" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { OfficeBuilding, List, DataAnalysis, Grid, Watermelon } from '@element-plus/icons-vue';
import request from '@/utils/request';
import { fmtNumber } from '@/utils/format';

const loading = ref(false);
const zonesLoading = ref(false);
const warehouses = ref<any[]>([]);
const zones = ref<any[]>([]);
const selectedWarehouse = ref<any>(null);

function getWarehouseTypeLabel(type: string) {
  const map: Record<string, string> = {
    pharmacy: '医药',
    fresh: '生鲜',
    mixed: '混合',
  };
  return map[type] || type || '-';
}

function getWarehouseTypeTag(type: string) {
  const map: Record<string, string> = {
    pharmacy: 'primary',
    fresh: 'success',
    mixed: 'warning',
  };
  return map[type] || '';
}

function getZoneStatus(zone: any) {
  if (zone.status === 'error') return 'error';
  if (zone.status === 'warning') return 'warning';
  return 'normal';
}

function getTempBadgeType(zone: any) {
  if (zone.current_temp === undefined || zone.current_temp === null) return 'normal';
  const { current_temp, temp_min, temp_max } = zone;
  if (current_temp >= temp_min && current_temp <= temp_max) return 'normal';
  if (
    (current_temp >= temp_min - 2 && current_temp < temp_min) ||
    (current_temp > temp_max && current_temp <= temp_max + 2)
  ) {
    return 'warning';
  }
  return 'error';
}

function getZoneTagType(status: string) {
  const map: Record<string, string> = {
    normal: 'success',
    warning: 'warning',
    error: 'danger',
  };
  return map[status] || 'info';
}

function getZoneStatusLabel(status: string) {
  const map: Record<string, string> = {
    normal: '正常',
    warning: '预警',
    error: '异常',
  };
  return map[status] || status;
}

async function loadWarehouses() {
  loading.value = true;
  try {
    const res = await request.get<any>('/warehouses');
    warehouses.value = res.data || [];
  } finally {
    loading.value = false;
  }
}

async function handleWarehouseSelect(row: any) {
  selectedWarehouse.value = row;
  if (row) {
    await loadZones(row.id);
  }
}

async function loadZones(warehouseId: string) {
  zonesLoading.value = true;
  try {
    const res = await request.get<any>('/warehouses/' + warehouseId + '/zones');
    zones.value = res.data || [];
  } finally {
    zonesLoading.value = false;
  }
}

onMounted(() => {
  loadWarehouses();
});
</script>

<style scoped>
.zone-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 1400px) {
  .zone-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1000px) {
  .zone-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .zone-grid {
    grid-template-columns: 1fr;
  }
}

.zone-card {
  background: #fff;
  border-radius: 8px;
  padding: 18px;
  border: 2px solid #e4e7ed;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
}

.zone-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.zone-card.zone-normal {
  border-color: #67c23a;
}

.zone-card.zone-warning {
  border-color: #e6a23c;
}

.zone-card.zone-error {
  border-color: #f56c6c;
}

.zone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #ebeef5;
}

.zone-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.zone-temp-section {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 14px;
}

.temp-badge {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 8px 16px;
  border-radius: 8px;
}

.temp-badge.badge-normal {
  background: linear-gradient(135deg, #f0f9eb, #e1f3d8);
}

.temp-badge.badge-warning {
  background: linear-gradient(135deg, #fdf6ec, #faecd8);
}

.temp-badge.badge-error {
  background: linear-gradient(135deg, #fef0f0, #fde2e2);
}

.temp-value {
  font-size: 36px;
  font-weight: 700;
  font-family: 'DIN', Arial, sans-serif;
  line-height: 1;
}

.badge-normal .temp-value {
  color: #67c23a;
}

.badge-warning .temp-value {
  color: #e6a23c;
}

.badge-error .temp-value {
  color: #f56c6c;
}

.temp-unit {
  font-size: 16px;
  font-weight: 500;
  color: #909399;
}

.humidity-section {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #ecf5ff;
  border-radius: 6px;
}

.humidity-value {
  font-size: 18px;
  font-weight: 600;
  color: #409eff;
  font-family: 'DIN', Arial, sans-serif;
}

.zone-threshold {
  background: #fafafa;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.threshold-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  line-height: 1.8;
}

.threshold-label {
  color: #909399;
}

.threshold-value {
  color: #606266;
  font-weight: 500;
  font-family: 'DIN', Arial, sans-serif;
}

.zone-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
