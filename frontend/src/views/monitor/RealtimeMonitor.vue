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
              <span style="flex:1"></span>
              <el-button size="small" @click="refreshDetail">
                <el-icon style="margin-right:4px"><Refresh /></el-icon>刷新曲线
              </el-button>
            </div>

            <el-alert
              v-if="isTempAbnormal(selectedCargo) || hasActiveWarning"
              :title="warningTitle"
              type="warning"
              show-icon
              :closable="false"
              style="margin-bottom:12px"
            >
              <template #default>
                <div style="display:flex;align-items:center;gap:12px">
                  <span>当前温度 <b :style="{color:'#f56c6c'}">{{ fmtNumber(selectedCargo.current_temp, 1) }}℃</b>，阈值范围 {{ selectedCargo.temp_min }}~{{ selectedCargo.temp_max }}℃</span>
                  <el-button type="danger" size="small" @click="openWarningModal">
                    <el-icon style="margin-right:4px"><WarningFilled /></el-icon>生成异常记录
                  </el-button>
                </div>
              </template>
            </el-alert>

            <el-row :gutter="12" style="margin-bottom:12px">
              <el-col :span="8">
                <div class="info-card">
                  <div class="info-label">
                    <el-icon style="margin-right:4px;color:#409eff"><DataLine /></el-icon>
                    温度阈值
                  </div>
                  <div class="info-value">
                    <el-tag type="success" effect="plain">{{ selectedCargo.temp_min }} ~ {{ selectedCargo.temp_max }} ℃</el-tag>
                  </div>
                </div>
              </el-col>
              <el-col :span="8">
                <div class="info-card">
                  <div class="info-label">
                    <el-icon style="margin-right:4px;color:#67c23a"><Watermelon /></el-icon>
                    湿度阈值
                  </div>
                  <div class="info-value">
                    <el-tag type="primary" effect="plain">{{ selectedCargo.humidity_min }} ~ {{ selectedCargo.humidity_max }} %</el-tag>
                  </div>
                </div>
              </el-col>
              <el-col :span="8">
                <div class="info-card">
                  <div class="info-label">
                    <el-icon style="margin-right:4px;color:#e6a23c"><Battery /></el-icon>
                    标签电量
                  </div>
                  <div class="info-value">
                    <span :style="{color: selectedCargo.battery_level < 20 ? '#f56c6c' : '#67c23a', fontWeight: 600}">
                      {{ selectedCargo.battery_level || '-' }}%
                    </span>
                  </div>
                </div>
              </el-col>
            </el-row>

            <el-row :gutter="12" style="margin-bottom:12px">
              <el-col :span="12">
                <div class="info-card">
                  <div class="info-label">
                    <el-icon style="margin-right:4px;color:#909399"><Location /></el-icon>
                    最后上报位置
                  </div>
                  <div class="info-value">{{ selectedCargo.current_location || '-' }}</div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="info-card">
                  <div class="info-label">
                    <el-icon style="margin-right:4px;color:#909399"><Clock /></el-icon>
                    最近上报时间
                  </div>
                  <div class="info-value">{{ fmtDate(selectedCargo.last_report_time) || '-' }}</div>
                </div>
              </el-col>
            </el-row>

            <div class="chart-box">
              <div class="chart-title">
                <el-icon style="margin-right:6px"><TrendCharts /></el-icon>
                温度湿度实时曲线
                <span style="flex:1"></span>
                <el-tag size="small" type="info" effect="plain">{{ tempData.length }} 个数据点</el-tag>
              </div>
              <div ref="chartRef" class="echarts" style="height:calc(100vh - 560px)"></div>
            </div>

            <div class="section-title" style="margin-top:12px">
              <el-icon style="margin-right:6px"><Warning /></el-icon>
              最近异常
            </div>
            <div v-loading="loadingExceptions" style="min-height:80px">
              <div v-if="recentExceptions.length > 0" class="exception-list">
                <div
                  v-for="e in recentExceptions"
                  :key="e.id"
                  class="exception-item"
                  @click="$router.push('/exceptions')"
                >
                  <el-tag size="small" :type="exceptionLevelMap[e.level]?.type" style="margin-right:8px">
                    {{ exceptionLevelMap[e.level]?.label }}
                  </el-tag>
                  <span class="exception-desc">{{ e.description }}</span>
                  <span class="exception-status">{{ exceptionStatusMap[e.status]?.label }}</span>
                  <span class="exception-time">{{ fmtDate(e.occur_time, 'MM-DD HH:mm') }}</span>
                </div>
              </div>
              <el-empty v-else description="暂无异常记录" :image-size="60" style="padding:10px 0" />
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

    <el-dialog v-model="warningVisible" title="超阈值预警处理" width="560px">
      <el-form :model="warningForm" label-width="90px">
        <el-form-item label="异常类型">
          <el-select v-model="warningForm.type" style="width:100%">
            <el-option label="温度超标" value="over_temp" />
            <el-option label="温度过低" value="low_temp" />
            <el-option label="湿度异常" value="humidity_abnormal" />
            <el-option label="单次超温超时" value="overtime_single" />
          </el-select>
        </el-form-item>
        <el-form-item label="紧急程度">
          <el-select v-model="warningForm.level" style="width:100%">
            <el-option label="一般" value="normal" />
            <el-option label="较严重" value="serious" />
            <el-option label="严重" value="critical" />
          </el-select>
        </el-form-item>
        <el-form-item label="异常描述">
          <el-input
            v-model="warningForm.description"
            type="textarea"
            :rows="2"
            :placeholder="`当前温度 ${selectedCargo?.current_temp}℃，超过阈值 ${selectedCargo?.temp_min}~${selectedCargo?.temp_max}℃`"
          />
        </el-form-item>
        <el-form-item label="阈值信息">
          <el-input v-model="warningForm.threshold_info" placeholder="如：温度阈值 2~8℃，单次超温阈值 15分钟" />
        </el-form-item>
        <el-form-item label="分配处理人">
          <el-select v-model="warningForm.handler_id" filterable placeholder="选择处理人（可选）" clearable style="width:100%">
            <el-option
              v-for="u in assignableUsers"
              :key="u.id"
              :label="`${u.name} (${roleMap[u.role]})`"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="warningVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingWarning" @click="submitWarning">生成异常记录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
import * as echarts from 'echarts';
import {
  Monitor, Refresh, RefreshRight, List, DataAnalysis, TrendCharts, Pointer,
  DataLine, Watermelon, Battery, Location, Clock, WarningFilled, Warning
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import request from '@/utils/request';
import { fmtDate, fmtNumber, categoryMap, cargoStatusMap, exceptionLevelMap, exceptionStatusMap, roleMap } from '@/utils/format';

const STORAGE_KEY = 'monitor_selected_cargo_id';
const loading = ref(false);
const cargos = ref<any[]>([]);
const selectedCargo = ref<any>(null);
const selectedCargoId = ref<string>(sessionStorage.getItem(STORAGE_KEY) || '');
const chartRef = ref<HTMLDivElement>();
let chartInstance: echarts.ECharts | null = null;
let timer: number | null = null;
const tempData = ref<any[]>([]);

const recentExceptions = ref<any[]>([]);
const loadingExceptions = ref(false);

const warningVisible = ref(false);
const submittingWarning = ref(false);
const assignableUsers = ref<any[]>([]);
const warningForm = reactive({
  type: 'over_temp',
  level: 'serious',
  description: '',
  threshold_info: '',
  handler_id: '',
});

const hasActiveWarning = computed(() => {
  if (!selectedCargo.value) return false;
  return tempData.value.length > 0 && tempData.value.slice(-3).some(d =>
    d.temperature < selectedCargo.value.temp_min || d.temperature > selectedCargo.value.temp_max
  );
});

const warningTitle = computed(() => {
  if (!selectedCargo.value) return '';
  const t = selectedCargo.value.current_temp;
  if (t > selectedCargo.value.temp_max) return '⚠️ 温度超标预警';
  if (t < selectedCargo.value.temp_min) return '⚠️ 温度过低预警';
  return '⚠️ 实时曲线超阈值';
});

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
        selectedCargo.value = { ...found };
        await loadDetailAndRender();
      } else {
        selectedCargo.value = null;
        selectedCargoId.value = '';
        renderChart([]);
      }
    }
  } finally {
    loading.value = false;
  }
}

async function handleRowChange(row: any) {
  if (!row) return;
  if (selectedCargoId.value && selectedCargoId.value === row.id) return;
  selectedCargo.value = row;
  selectedCargoId.value = row.id;
  sessionStorage.setItem(STORAGE_KEY, row.id);
  await loadDetailAndRender();
}

async function refreshDetail() {
  if (!selectedCargo.value) return;
  await loadDetailAndRender();
  ElMessage.success('曲线数据已刷新');
}

async function loadDetailAndRender() {
  if (!selectedCargo.value) return;
  try {
    const res = await request.get<any>('/temperature/cargo/' + selectedCargo.value.id);
    const data = res.data || {};
    if (data.cargo) {
      selectedCargo.value = { ...selectedCargo.value, ...data.cargo };
    }
    tempData.value = data.temperature_data || [];
    await nextTick();
    renderChart(tempData.value);
    await loadRecentExceptions();
  } catch (e) {
    await nextTick();
    tempData.value = [];
    renderChart([]);
  }
}

async function loadRecentExceptions() {
  if (!selectedCargo.value) return;
  loadingExceptions.value = true;
  try {
    const res = await request.get<any>('/cargos/' + selectedCargo.value.id + '/recent-exceptions');
    recentExceptions.value = res.data || [];
  } finally {
    loadingExceptions.value = false;
  }
}

async function loadAssignableUsers() {
  try {
    const res = await request.get<any>('/exceptions/assignable/users');
    assignableUsers.value = res.data || [];
  } catch {}
}

function openWarningModal() {
  if (!selectedCargo.value) return;
  const isOver = selectedCargo.value.current_temp > selectedCargo.value.temp_max;
  warningForm.type = isOver ? 'over_temp' : 'low_temp';
  warningForm.level = 'serious';
  warningForm.description = `${isOver ? '温度超标' : '温度过低'}: ${selectedCargo.value.current_temp}℃，阈值: ${selectedCargo.value.temp_min}~${selectedCargo.value.temp_max}℃`;
  warningForm.threshold_info = `温度阈值: ${selectedCargo.value.temp_min}~${selectedCargo.value.temp_max}℃，湿度阈值: ${selectedCargo.value.humidity_min}~${selectedCargo.value.humidity_max}%`;
  warningForm.handler_id = '';
  loadAssignableUsers();
  warningVisible.value = true;
}

async function submitWarning() {
  if (!selectedCargo.value || !warningForm.description) return;
  submittingWarning.value = true;
  try {
    const res = await request.post<any>('/exceptions/create-from-warning', {
      cargo_id: selectedCargo.value.id,
      tag_id: selectedCargo.value.tag_id || selectedCargo.value.tag_no || null,
      type: warningForm.type,
      level: warningForm.level,
      description: warningForm.description,
      temperature: selectedCargo.value.current_temp,
      humidity: selectedCargo.value.current_humidity,
      location: selectedCargo.value.current_location,
      threshold_info: warningForm.threshold_info,
      handler_id: warningForm.handler_id || undefined,
    });
    ElMessage.success('异常记录已生成，' + (warningForm.handler_id ? '已自动分配处理人' : '请尽快分配处理人'));
    warningVisible.value = false;
    await loadRecentExceptions();
  } finally {
    submittingWarning.value = false;
  }
}

function renderChart(tempDataArr: any[]) {
  if (!chartRef.value) return;
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }

  const times = tempDataArr.map(d => fmtDate(d.collection_time, 'MM-DD HH:mm'));
  const temps = tempDataArr.map(d => d.temperature);
  const humids = tempDataArr.map(d => d.humidity);
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
  timer = window.setInterval(async () => {
    await loadCargos();
    if (selectedCargo.value) {
      await loadDetailAndRender();
    }
  }, 30000);
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
.info-card {
  padding: 10px 14px;
  background: #fafafa;
  border-radius: 6px;
}
.info-label {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}
.info-value {
  font-size: 14px;
  color: #303133;
}
.exception-list {
  max-height: 140px;
  overflow-y: auto;
}
.exception-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 6px;
  background: #fafafa;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}
.exception-item:hover {
  background: #f0f0f0;
}
.exception-desc {
  flex: 1;
  font-size: 13px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 12px;
}
.exception-status {
  font-size: 12px;
  color: #909399;
  margin-right: 12px;
}
.exception-time {
  font-size: 12px;
  color: #909399;
  min-width: 100px;
  text-align: right;
}
</style>
