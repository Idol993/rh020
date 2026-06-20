<template>
  <div class="big-screen">
    <div class="big-screen-title">医药与生鲜温控合规管理监控大屏</div>

    <div class="big-stat-row">
      <div class="big-stat-card">
        <div class="num">{{ stats.in_transit || 0 }}</div>
        <div class="lbl">在途车辆</div>
      </div>
      <div class="big-stat-card">
        <div class="num">{{ stats.in_warehouse || 0 }}</div>
        <div class="lbl">在库货物</div>
      </div>
      <div class="big-stat-card">
        <div class="num">{{ fmtNumber(stats.temp_pass_rate_30d, 1) }}%</div>
        <div class="lbl">温度达标率</div>
      </div>
      <div class="big-stat-card danger">
        <div class="num">{{ stats.pending_exceptions || 0 }}</div>
        <div class="lbl">待处理异常</div>
      </div>
      <div class="big-stat-card">
        <div class="num">{{ fmtNumber(stats.tag_online_rate, 1) }}%</div>
        <div class="lbl">IoT标签在线率</div>
      </div>
      <div class="big-stat-card warn">
        <div class="num">{{ stats.created_today || 0 }}</div>
        <div class="lbl">今日新增</div>
      </div>
    </div>

    <div class="big-cols">
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="big-panel">
          <div class="big-panel-title">近7日温度趋势</div>
          <div ref="trendChart" class="big-chart"></div>
        </div>
        <div class="big-panel">
          <div class="big-panel-title">异常级别分布</div>
          <div ref="exceptionPieChart" class="big-chart"></div>
        </div>
      </div>

      <div class="big-panel" style="display:flex;flex-direction:column">
        <div class="big-panel-title">实时货物温控列表</div>
        <el-table :data="realtimeCargos" size="small" stripe style="flex:1;background:transparent" height="100%">
          <el-table-column prop="cargo_no" label="批次号" width="140">
            <template #default="{row}">
              <span style="color:#a0cfff">{{ row.cargo_no }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="货物名称" min-width="150" show-overflow-tooltip />
          <el-table-column label="温度" width="90">
            <template #default="{row}">
              <span :style="{color:isTempAbnormal(row)?'#f56c6c':'#67c23a',fontWeight:600}">
                {{ row.current_temp?.toFixed(1) || '-' }}℃
              </span>
            </template>
          </el-table-column>
          <el-table-column label="湿度" width="90">
            <template #default="{row}">
              <span style="color:#409eff">{{ row.current_humidity?.toFixed(0) || '-' }}%</span>
            </template>
          </el-table-column>
          <el-table-column prop="location" label="位置" min-width="120" show-overflow-tooltip>
            <template #default="{row}">{{ row.location || row.current_location || row.plate_no || '-' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{row}">
              <el-tag size="small" :type="cargoStatusMap[row.status]?.type || ''" effect="dark">
                {{ cargoStatusMap[row.status]?.label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最近上报" width="160">
            <template #default="{row}">
              <span style="color:#a0cfff">{{ fmtDate(row.last_report_time) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="big-panel">
          <div class="big-panel-title">异常类型TOP10</div>
          <div ref="exceptionBarChart" class="big-chart"></div>
        </div>
        <div class="big-panel">
          <div class="big-panel-title">品类分布</div>
          <div ref="categoryChart" class="big-chart"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import { fmtDate, fmtNumber, cargoStatusMap, exceptionLevelMap, exceptionTypeMap, categoryMap } from '@/utils/format';
import request from '@/utils/request';

const stats = reactive<Record<string, any>>({});
const realtimeCargos = ref<any[]>([]);
const trendChart = ref<HTMLDivElement>();
const exceptionPieChart = ref<HTMLDivElement>();
const exceptionBarChart = ref<HTMLDivElement>();
const categoryChart = ref<HTMLDivElement>();

let refreshTimer: number | null = null;
let trendChartInstance: echarts.ECharts | null = null;
let exceptionPieInstance: echarts.ECharts | null = null;
let exceptionBarInstance: echarts.ECharts | null = null;
let categoryChartInstance: echarts.ECharts | null = null;

function isTempAbnormal(row: any) {
  if (!row || row.current_temp === undefined) return false;
  return row.current_temp < row.temp_min || row.current_temp > row.temp_max;
}

const darkTextStyle = { color: '#a0cfff' };
const darkAxisLine = { lineStyle: { color: 'rgba(64,158,255,0.3)' } };
const darkSplitLine = { lineStyle: { color: 'rgba(64,158,255,0.1)' } };

async function refreshAll() {
  try {
    const r1 = await request.get<any>('/stats/dashboard');
    Object.assign(stats, r1.data || {});

    const r2 = await request.get<any>('/temperature/realtime/cargos');
    realtimeCargos.value = r2.data || [];

    await nextTick();
    renderTrend();
    renderExceptionPie();
    renderExceptionBar();
    renderCategory();
  } catch (e) {
    console.error('BigScreen refresh error', e);
  }
}

async function renderTrend() {
  if (!trendChart.value) return;
  if (!trendChartInstance) trendChartInstance = echarts.init(trendChart.value);
  try {
    const res = await request.get<any>('/stats/temperature/trend', { days: 7 });
    const rows = res.data || [];
    trendChartInstance.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(6,26,58,0.9)', borderColor: '#409eff', textStyle: { color: '#fff' } },
      legend: { data: ['平均温度', '温度达标率'], right: 10, textStyle: darkTextStyle },
      grid: { left: 50, right: 50, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: rows.map(r => r.date?.slice(5) || ''), axisLine: darkAxisLine, axisLabel: darkTextStyle },
      yAxis: [
        { type: 'value', name: '℃', nameTextStyle: darkTextStyle, axisLabel: { ...darkTextStyle, formatter: '{value}℃' }, axisLine: darkAxisLine, splitLine: darkSplitLine },
        { type: 'value', name: '%', max: 100, nameTextStyle: darkTextStyle, axisLabel: { ...darkTextStyle, formatter: '{value}%' }, axisLine: darkAxisLine, splitLine: { show: false } },
      ],
      series: [
        {
          name: '平均温度', type: 'line', smooth: true, data: rows.map(r => Number(r.avg_temp?.toFixed(2) || 0)),
          areaStyle: { color: 'rgba(64,158,255,0.25)' }, itemStyle: { color: '#409eff' }, lineStyle: { color: '#409eff', width: 2 },
        },
        {
          name: '温度达标率', type: 'line', yAxisIndex: 1, smooth: true, data: rows.map(r => Number(r.pass_rate?.toFixed(1) || 98)),
          itemStyle: { color: '#67c23a' }, lineStyle: { color: '#67c23a', type: 'dashed', width: 2 },
        },
      ],
    });
  } catch (e) { console.error(e); }
}

async function renderExceptionPie() {
  if (!exceptionPieChart.value) return;
  if (!exceptionPieInstance) exceptionPieInstance = echarts.init(exceptionPieChart.value);
  try {
    const res = await request.get<any>('/stats/exception/distribution');
    const d = res.data || {};
    const pieData = (d.by_level || []).map((x: any) => ({
      name: exceptionLevelMap[x.level]?.label || x.level,
      value: x.count,
    }));
    exceptionPieInstance.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', backgroundColor: 'rgba(6,26,58,0.9)', borderColor: '#409eff', textStyle: { color: '#fff' } },
      legend: { orient: 'vertical', left: 10, top: 'center', textStyle: darkTextStyle },
      series: [{
        type: 'pie', radius: ['35%', '65%'], center: ['65%', '50%'], avoidLabelOverlap: true,
        label: { formatter: '{b}\n{d}%', color: '#fff' },
        labelLine: { lineStyle: { color: 'rgba(64,158,255,0.4)' } },
        data: pieData,
        color: ['#409eff', '#e6a23c', '#f56c6c'],
      }],
    });
  } catch (e) { console.error(e); }
}

async function renderExceptionBar() {
  if (!exceptionBarChart.value) return;
  if (!exceptionBarInstance) exceptionBarInstance = echarts.init(exceptionBarChart.value);
  try {
    const res = await request.get<any>('/stats/exception/distribution');
    const d = res.data || {};
    const rows = (d.by_type || []).slice(0, 10).map((x: any) => ({
      name: exceptionTypeMap[x.type] || x.type,
      value: x.count,
    }));
    exceptionBarInstance.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(6,26,58,0.9)', borderColor: '#409eff', textStyle: { color: '#fff' } },
      grid: { left: 110, right: 30, top: 10, bottom: 20 },
      xAxis: { type: 'value', axisLine: darkAxisLine, axisLabel: darkTextStyle, splitLine: darkSplitLine },
      yAxis: { type: 'category', data: rows.map(r => r.name).reverse(), axisLine: darkAxisLine, axisLabel: { ...darkTextStyle, fontSize: 12 } },
      series: [{
        type: 'bar', data: rows.map(r => r.value).reverse(),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#409eff' },
            { offset: 1, color: '#66b1ff' },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
        barWidth: 14,
        label: { show: true, position: 'right', color: '#fff', fontSize: 12 },
      }],
    });
  } catch (e) { console.error(e); }
}

async function renderCategory() {
  if (!categoryChart.value) return;
  if (!categoryChartInstance) categoryChartInstance = echarts.init(categoryChart.value);
  try {
    const res = await request.get<any>('/stats/category/distribution');
    const rows = res.data || [];
    const data = rows.map((x: any) => ({
      name: categoryMap[x.category] || (x.sub_category ? (exceptionTypeMap as any)[x.sub_category] || x.sub_category : x.category),
      value: x.count,
    }));
    categoryChartInstance.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', backgroundColor: 'rgba(6,26,58,0.9)', borderColor: '#409eff', textStyle: { color: '#fff' } },
      legend: { orient: 'vertical', left: 10, top: 'center', textStyle: darkTextStyle },
      series: [{
        type: 'pie', radius: ['45%', '70%'], center: ['65%', '50%'], avoidLabelOverlap: true,
        label: { formatter: '{b}\n{d}%', color: '#fff' },
        labelLine: { lineStyle: { color: 'rgba(64,158,255,0.4)' } },
        data,
        color: ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#8e44ad', '#16a085', '#ff8c00', '#9370db'],
      }],
    });
  } catch (e) { console.error(e); }
}

function handleResize() {
  trendChartInstance?.resize();
  exceptionPieInstance?.resize();
  exceptionBarInstance?.resize();
  categoryChartInstance?.resize();
}

onMounted(() => {
  refreshAll();
  refreshTimer = window.setInterval(refreshAll, 60000);
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  window.removeEventListener('resize', handleResize);
  trendChartInstance?.dispose();
  exceptionPieInstance?.dispose();
  exceptionBarInstance?.dispose();
  categoryChartInstance?.dispose();
});
</script>
