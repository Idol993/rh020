<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><Monitor /></el-icon></div>
          实时温控监控
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <el-tag type="info" effect="plain">
            <el-icon style="margin-right:4px"><RefreshRight /></el-icon>
            每30秒自动刷新
          </el-tag>
          <el-button type="primary" link @click="loadCargos">
            <el-icon style="margin-right:4px"><Refresh /></el-icon>立即刷新
          </el-button>
        </div>
      </div>

      <el-row :gutter="16">
        <el-col :span="11">
          <div class="section-title">
            <el-icon style="margin-right:6px"><List /></el-icon>
            在途/在库货物实时温控列表
          </div>

          <div class="filter-bar">
            <el-select v-model="filters.status" placeholder="状态" clearable style="width:140px">
              <el-option label="全部" value="" />
              <el-option v-for="(v,k) in statusOptions" :key="k" :label="v.label" :value="k" />
            </el-select>
            <el-select v-model="filters.category" placeholder="品类" clearable style="width:120px">
              <el-option label="全部" value="" />
              <el-option v-for="(v,k) in categoryMap" :key="k" :label="v" :value="k" />
            </el-select>
          </div>

          <el-table
            :data="cargos"
            stripe
            v-loading="loading"
            height="calc(100vh - 280px)"
            highlight-current-row
            @current-change="handleRowChange"
            style="cursor:pointer"
          >
            <el-table-column prop="cargo_no" label="批次号" width="140" fixed />
            <el-table-column prop="name" label="货物名称" min-width="140" show-overflow-tooltip />
            <el-table-column label="品类" width="90">
              <template #default="{row}">
                <el-tag size="small" :type="row.category==='pharmacy'?'primary':'success'">
                  {{ categoryMap[row.category] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="温度" width="90">
              <template #default="{row}">
                <span :style="{ color: isTempAbnormal(row) ? '#f56c6c' : '#67c23a', fontWeight: 600 }">
                  {{ fmtNumber(row.current_temp, 1) }}℃
                </span>
              </template>
            </el-table-column>
            <el-table-column label="湿度" width="80">
              <template #default="{row}">{{ fmtNumber(row.current_humidity, 0) }}%</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{row}">
                <el-tag size="small" :type="cargoStatusMap[row.status]?.type || 'info'">
                  {{ cargoStatusMap[row.status]?.label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="current_location" label="当前位置" min-width="130" show-overflow-tooltip />
            <el-table-column label="最近上报" width="130">
              <template #default="{row}">{{ fmtDate(row.last_report_time, 'MM-DD HH:mm') }}</template>
            </el-table-column>
          </el-table>
        </el-col>

        <el-col :span="13">
          <template v-if="selectedCargo">
            <div class="section-title">
              <el-icon style="margin-right:6px"><DataAnalysis /></el-icon>
              {{ selectedCargo.name }} - 温控详情
            </div>

            <el-descriptions :column="3" border size="small" style="margin-bottom:16px">
              <el-descriptions-item label="批次号">{{ selectedCargo.cargo_no }}</el-descriptions-item>
              <el-descriptions-item label="货物名称">{{ selectedCargo.name }}</el-descriptions-item>
              <el-descriptions-item label="品类">{{ categoryMap[selectedCargo.category] }}</el-descriptions-item>
              <el-descriptions-item label="温度阈值">
                <el-tag type="success" effect="plain">{{ selectedCargo.temp_min }} ~ {{ selectedCargo.temp_max }} ℃</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="湿度阈值">
                <el-tag type="primary" effect="plain">{{ selectedCargo.humidity_min }} ~ {{ selectedCargo.humidity_max }} %</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="当前位置">{{ selectedCargo.current_location || '-' }}</el-descriptions-item>
            </el-descriptions>

            <div class="chart-box">
              <div class="chart-title">
                <el-icon style="margin-right:6px"><TrendCharts /></el-icon>
                温度湿度实时曲线
              </div>
              <div ref="chartRef" class="echarts" style="height:calc(100vh - 420px)"></div>
            </div>
          </template>

          <div v-else class="empty-hint">
            <el-empty description="请从左侧列表选择货物查看详情">
              <template #image>
                <el-icon :size="80" color="#c0c4cc"><Pointer /></el-icon>
              </template>
            </el-empty>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
import * as echarts from 'echarts';
import { Monitor, Refresh, RefreshRight, List, DataAnalysis, TrendCharts, Pointer } from '@element-plus/icons-vue';
import request from '@/utils/request';
import { fmtDate, fmtNumber, categoryMap, cargoStatusMap } from '@/utils/format';

const STORAGE_KEY = 'monitor_selected_cargo_id';
const loading = ref(false);
const cargos = ref<any[]>([]);
const selectedCargo = ref<any>(null);
const selectedCargoId = ref<string>(sessionStorage.getItem(STORAGE_KEY) || '');
const chartRef = ref<HTMLDivElement>();
let chartInstance: echarts.ECharts | null = null;
let timer: number | null = null;

const filters = reactive({ status: '', category: '' });

const statusOptions = computed(() => {
  const allowed = ['in_transit', 'arrived', 'in_warehouse', 'accepted'];
  return Object.fromEntries(
    Object.entries(cargoStatusMap).filter(([k]) => allowed.includes(k))
  );
});

function isTempAbnormal(row: any) {
  if (!row || row.current_temp === undefined || row.current_temp === null) return false;
  return row.current_temp < row.temp_min || row.current_temp > row.temp_max;
}

async function loadCargos() {
  loading.value = true;
  try {
    const params: any = {};
    if (filters.status) params.status = filters.status;
    if (filters.category) params.category = filters.category;
    const res = await request.get<any>('/temperature/realtime/cargos', params);
    cargos.value = res.data || [];

    if (selectedCargoId.value) {
      const found = cargos.value.find(c => c.id === selectedCargoId.value);
      if (found) {
        selectedCargo.value = found;
        await loadDetailAndRender();
      } else {
        selectedCargo.value = null;
        selectedCargoId.value = '';
        sessionStorage.removeItem(STORAGE_KEY);
        renderChart([]);
      }
    } else {
      selectedCargo.value = null;
      renderChart([]);
    }
  } finally {
    loading.value = false;
  }
}

async function handleRowChange(row: any) {
  if (!row) return;
  selectedCargo.value = row;
  selectedCargoId.value = row.id;
  sessionStorage.setItem(STORAGE_KEY, row.id);
  if (row) {
    await loadDetailAndRender();
  }
}

async function loadDetailAndRender() {
  if (!selectedCargo.value) return;
  try {
    const res = await request.get<any>('/temperature/cargo/' + selectedCargo.value.id);
    const data = res.data || {};
    if (data.cargo) {
      selectedCargo.value = { ...selectedCargo.value, ...data.cargo };
    }
    await nextTick();
    const tempData = data.temperature_data || [];
    renderChart(tempData);
  } catch (e) {
    await nextTick();
    renderChart([]);
  }
}

function renderChart(tempData: any[]) {
  if (!chartRef.value) return;
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }

  const times = tempData.map(d => fmtDate(d.collection_time, 'MM-DD HH:mm'));
  const temps = tempData.map(d => d.temperature);
  const humids = tempData.map(d => d.humidity);
  const tempMin = selectedCargo.value?.temp_min;
  const tempMax = selectedCargo.value?.temp_max;

  chartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: {
      data: ['温度', '湿度', '温度下限', '温度上限'],
      top: 0,
    },
    grid: { left: 50, right: 50, top: 40, bottom: 40 },
    xAxis: {
      type: 'category',
      data: times,
      boundaryGap: false,
      axisLabel: { fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: '温度(℃)',
        position: 'left',
        axisLabel: { formatter: '{value}℃', fontSize: 11 },
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
      },
      {
        type: 'value',
        name: '湿度(%)',
        position: 'right',
        min: 0,
        max: 100,
        axisLabel: { formatter: '{value}%', fontSize: 11 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: temps,
        itemStyle: { color: '#f56c6c' },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 4,
      },
      {
        name: '湿度',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: humids,
        itemStyle: { color: '#409eff' },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 4,
      },
      {
        name: '温度下限',
        type: 'line',
        smooth: false,
        yAxisIndex: 0,
        data: (tempMin !== undefined && tempMin !== null) ? times.map(() => Number(tempMin)) : [],
        itemStyle: { color: '#67c23a' },
        lineStyle: { type: 'dashed', width: 1.5 },
        symbol: 'none',
      },
      {
        name: '温度上限',
        type: 'line',
        smooth: false,
        yAxisIndex: 0,
        data: (tempMax !== undefined && tempMax !== null) ? times.map(() => Number(tempMax)) : [],
        itemStyle: { color: '#e6a23c' },
        lineStyle: { type: 'dashed', width: 1.5 },
        symbol: 'none',
      },
    ],
  }, true);
}

watch([() => filters.status, () => filters.category], () => {
  loadCargos();
});

function handleResize() {
  if (chartInstance) chartInstance.resize();
}

onMounted(() => {
  loadCargos();
  timer = window.setInterval(loadCargos, 30000);
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  window.removeEventListener('resize', handleResize);
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
  sessionStorage.removeItem(STORAGE_KEY);
});
</script>

<style scoped>
.empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(100vh - 240px);
}
</style>
