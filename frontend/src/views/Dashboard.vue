<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><DataAnalysis /></el-icon></div>
          工作台 · 欢迎回来，{{ userStore.user?.name }}
        </div>
        <div style="display:flex;gap:10px">
          <el-tag type="info" effect="plain">今日日期：{{ today }}</el-tag>
          <el-button type="primary" link @click="refresh">
            <el-icon style="margin-right:4px"><Refresh /></el-icon>刷新数据
          </el-button>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card blue">
          <el-icon class="stat-icon"><Van /></el-icon>
          <div class="stat-label">在途车辆</div>
          <div class="stat-value">{{ stats.in_transit || 0 }} <span style="font-size:14px;color:#909399">辆</span></div>
        </div>
        <div class="stat-card green">
          <el-icon class="stat-icon"><Box /></el-icon>
          <div class="stat-label">在库货物批次</div>
          <div class="stat-value">{{ stats.in_warehouse || 0 }} <span style="font-size:14px;color:#909399">批</span></div>
        </div>
        <div class="stat-card cyan">
          <el-icon class="stat-icon"><DocumentChecked /></el-icon>
          <div class="stat-label">30日温湿度达标率</div>
          <div class="stat-value" style="color:#16a085">{{ fmtNumber(stats.temp_pass_rate_30d, 1) }}<span style="font-size:14px">%</span></div>
        </div>
        <div class="stat-card red">
          <el-icon class="stat-icon"><Warning /></el-icon>
          <div class="stat-label">待处理异常</div>
          <div class="stat-value" :style="{color: stats.pending_exceptions > 5 ? '#f56c6c' : '#e6a23c'}">{{ stats.pending_exceptions || 0 }} <span style="font-size:14px;color:#909399">起</span></div>
        </div>
        <div class="stat-card purple">
          <el-icon class="stat-icon"><Connection /></el-icon>
          <div class="stat-label">IoT标签在线率</div>
          <div class="stat-value">{{ fmtNumber(stats.tag_online_rate, 1) }}<span style="font-size:14px">%</span></div>
        </div>
        <div class="stat-card orange">
          <el-icon class="stat-icon"><TrendCharts /></el-icon>
          <div class="stat-label">今日新增</div>
          <div class="stat-value">{{ stats.created_today || 0 }} <span style="font-size:14px;color:#909399">批次</span></div>
        </div>
      </div>

      <div class="two-col">
        <div class="chart-box">
          <div class="chart-title">近7日温度达标率趋势</div>
          <div ref="trendChart" class="echarts" style="height:340px"></div>
        </div>
        <div class="chart-box">
          <div class="chart-title">异常分布统计</div>
          <div ref="exceptionChart" class="echarts" style="height:340px"></div>
        </div>
      </div>

      <div class="dashboard-layout" style="margin-top:16px">
        <div>
          <div class="chart-box">
            <div class="chart-title">实时在途/在库温控状态</div>
            <el-table :data="realtimeCargos" stripe size="small" height="340">
              <el-table-column prop="cargo_no" label="批次号" width="160" />
              <el-table-column prop="name" label="货物名称" min-width="160" show-overflow-tooltip />
              <el-table-column label="品类" width="90">
                <template #default="{row}"><el-tag size="small" :type="row.category==='pharmacy'?'primary':'success'">{{ categoryMap[row.category] }}</el-tag></template>
              </el-table-column>
              <el-table-column label="当前温湿度" width="150">
                <template #default="{row}">
                  <div>
                    <span :class="{ 'exception-level-critical': isTempAbnormal(row) }">{{ row.current_temp?.toFixed(1) || '-' }}℃</span>
                    <span style="color:#909399;margin:0 4px">/</span>
                    <span>{{ row.current_humidity?.toFixed(0) || '-' }}%</span>
                  </div>
                  <div style="color:#909399;font-size:11px;margin-top:2px">阈值 {{row.temp_min}}~{{row.temp_max}}℃</div>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="100">
                <template #default="{row}">
                  <el-tag size="small" :type="cargoStatusMap[row.status]?.type || ''">{{ cargoStatusMap[row.status]?.label }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="位置" min-width="140" show-overflow-tooltip>
                <template #default="{row}">{{ row.current_location || row.plate_no || '-' }}</template>
              </el-table-column>
              <el-table-column label="最近上报" width="160">
                <template #default="{row}">{{ fmtDate(row.last_report_time) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="70" fixed="right">
                <template #default="{row}">
                  <el-button type="primary" link size="small" @click="$router.push('/cargos/'+row.id)">详情</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
        <div>
          <div class="chart-box">
            <div class="chart-title">最新异常预警</div>
            <el-table :data="latestExceptions" stripe size="small" height="340">
              <el-table-column label="等级" width="70">
                <template #default="{row}">
                  <el-tag size="small" :type="exceptionLevelMap[row.level]?.type">{{ exceptionLevelMap[row.level]?.label }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="description" label="异常描述" min-width="200" show-overflow-tooltip />
              <el-table-column label="状态" width="90">
                <template #default="{row}">
                  <el-tag size="small" :type="exceptionStatusMap[row.status]?.type">{{ exceptionStatusMap[row.status]?.label }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="发生时间" width="150">
                <template #default="{row}">{{ fmtDate(row.occur_time) }}</template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
import * as echarts from 'echarts';
import { DataAnalysis, Refresh, Box, Van, Warning, Connection, TrendCharts, DocumentChecked } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';
import { fmtDate, fmtNumber, categoryMap, cargoStatusMap, exceptionLevelMap, exceptionStatusMap } from '@/utils/format';

const userStore = useUserStore();
const today = new Date().toLocaleDateString('zh-CN');
const stats = reactive<Record<string, any>>({});
const trendChart = ref<HTMLDivElement>();
const exceptionChart = ref<HTMLDivElement>();
const realtimeCargos = ref<any[]>([]);
const latestExceptions = ref<any[]>([]);

function isTempAbnormal(row: any) {
  if (!row || row.current_temp === undefined) return false;
  return row.current_temp < row.temp_min || row.current_temp > row.temp_max;
}

async function refresh() {
  const r1 = await request.get<any>('/stats/dashboard');
  Object.assign(stats, r1.data);
  const r2 = await request.get<any>('/temperature/realtime/cargos');
  realtimeCargos.value = r2.data || [];
  const r3 = await request.get<any>('/exceptions', { pageSize: 10, status: 'all' });
  latestExceptions.value = r3.data.list || [];
  await nextTick();
  renderTrend();
  renderException();
}

async function renderTrend() {
  const res = await request.get<any>('/stats/temperature/trend', { days: 7 });
  const rows = res.data || [];
  const chart = echarts.init(trendChart.value!);
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['平均温度', '温度达标率'], right: 10 },
    grid: { left: 50, right: 50, top: 40, bottom: 40 },
    xAxis: { type: 'category', data: rows.map(r => r.date?.slice(5) || '') },
    yAxis: [
      { type: 'value', name: '℃', axisLabel: { formatter: '{value}℃' } },
      { type: 'value', name: '%', max: 100, axisLabel: { formatter: '{value}%' } },
    ],
    series: [
      {
        name: '平均温度', type: 'line', smooth: true, data: rows.map(r => Number(r.avg_temp?.toFixed(2) || 0)),
        areaStyle: { color: 'rgba(64,158,255,0.15)' }, itemStyle: { color: '#409eff' },
      },
      {
        name: '温度达标率', type: 'line', yAxisIndex: 1, smooth: true, data: rows.map(r => Number(r.pass_rate?.toFixed(1) || 98)),
        itemStyle: { color: '#67c23a' }, lineStyle: { type: 'dashed' },
      },
    ],
  });
}

async function renderException() {
  const res = await request.get<any>('/stats/exception/distribution');
  const d = res.data || {};
  const chart = echarts.init(exceptionChart.value!);
  const pieData = (d.by_level || []).map((x: any) => ({
    name: ({ normal: '一般', serious: '较严重', critical: '严重' } as any)[x.level] || x.level,
    value: x.count,
  }));
  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 10, top: 'center' },
    grid: { left: 160 },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['62%', '50%'], avoidLabelOverlap: true,
      label: { formatter: '{b}\n{d}%' },
      data: pieData,
      color: ['#409eff', '#e6a23c', '#f56c6c'],
    }],
  });
}

onMounted(refresh);
window.addEventListener('resize', () => {
  echarts.getInstanceByDom(trendChart.value!)?.resize();
  echarts.getInstanceByDom(exceptionChart.value!)?.resize();
});
</script>
