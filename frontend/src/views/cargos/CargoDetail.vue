<template>
  <div class="page-container" v-loading="loading">
    <div class="page-card" v-if="cargo">
      <div class="page-header">
        <div class="page-title">
          <el-button link @click="$router.back()" style="padding:0"><el-icon style="font-size:22px"><ArrowLeft /></el-icon></el-button>
          <div class="icon-tag" style="margin-left:10px"><el-icon><Document /></el-icon></div>
          货物详情 · {{ cargo.cargo_no }}
        </div>
        <div>
          <el-tag size="large" :type="cargoStatusMap[cargo.status]?.type">{{ cargoStatusMap[cargo.status]?.label }}</el-tag>
        </div>
      </div>

      <el-descriptions :column="3" border size="small" style="margin-bottom:20px">
        <el-descriptions-item label="批次号">{{ cargo.cargo_no }}</el-descriptions-item>
        <el-descriptions-item label="运输单号">{{ cargo.transport_no }}</el-descriptions-item>
        <el-descriptions-item label="承运车辆">{{ cargo.plate_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="货物名称" :span="2">{{ cargo.name }}</el-descriptions-item>
        <el-descriptions-item label="规格">{{ cargo.specification || '-' }}</el-descriptions-item>
        <el-descriptions-item label="品类">
          <el-tag size="small" :type="cargo.category==='pharmacy'?'primary':'success'">{{ categoryMap[cargo.category] }} / {{ subCategoryMap[cargo.sub_category] }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="数量">{{ cargo.quantity }} {{ cargo.unit }}</el-descriptions-item>
        <el-descriptions-item label="货物价值">{{ fmtMoney(cargo.value) }}</el-descriptions-item>
        <el-descriptions-item label="生产/采摘">{{ cargo.production_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="有效期至">{{ cargo.expiry_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="发货方">{{ cargo.shipper }}</el-descriptions-item>
        <el-descriptions-item label="收货方">{{ cargo.receiver }}</el-descriptions-item>
        <el-descriptions-item label="收货地址" :span="2">{{ cargo.receiver_address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="IoT标签">{{ cargo.tag_no || '-' }} (电量: {{cargo.battery_level}}% / {{ cargo.communication_status==='online'?'在线':'离线' }})</el-descriptions-item>
        <el-descriptions-item label="出库时间">{{ fmtDate(cargo.outbound_time) }}</el-descriptions-item>
        <el-descriptions-item label="到库时间">{{ fmtDate(cargo.arrival_time) }}</el-descriptions-item>
        <el-descriptions-item label="验收时间">{{ fmtDate(cargo.accept_time) }}</el-descriptions-item>
      </el-descriptions>

      <div class="section-title">温控规则配置</div>
      <el-descriptions :column="4" border size="small">
        <el-descriptions-item label="规则">{{ cargo.rule_name }}</el-descriptions-item>
        <el-descriptions-item label="温度阈值">{{ cargo.temp_min }}℃ ~ {{ cargo.temp_max }}℃</el-descriptions-item>
        <el-descriptions-item label="湿度阈值">{{ cargo.humidity_min }}% ~ {{ cargo.humidity_max }}%</el-descriptions-item>
        <el-descriptions-item label="超温阈值">单次{{ cargo.single_overtime_limit || '-' }}分钟 / 累计{{ cargo.total_overtime_limit || '-' }}分钟</el-descriptions-item>
      </el-descriptions>

      <div style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap">
        <el-button type="primary" @click="generateReport" :disabled="!canGenerateReport">
          <el-icon style="margin-right:4px"><DocumentAdd /></el-icon>生成合规报告
        </el-button>
        <el-button type="warning" @click="detectExceptions">
          <el-icon style="margin-right:4px"><Warning /></el-icon>自动检测异常
        </el-button>
        <el-button type="success" @click="calculateSettlement" v-if="canGenerateReport">
          <el-icon style="margin-right:4px"><Money /></el-icon>核算运费
        </el-button>
        <el-button @click="$router.push('/reports?cargo_id=' + cargo.id)">查看历史报告</el-button>
      </div>

      <div class="section-title">温度湿度曲线图</div>
      <div class="chart-box">
        <div ref="tempChart" style="width:100%;height:380px"></div>
      </div>

      <div class="section-title">异常记录</div>
      <el-table :data="exceptions" stripe size="small" style="margin-bottom:16px">
        <el-table-column label="等级" width="80">
          <template #default="{row}"><el-tag size="small" :type="exceptionLevelMap[row.level]?.type">{{ exceptionLevelMap[row.level]?.label }}</el-tag></template>
        </el-table-column>
        <el-table-column label="类型" width="140">
          <template #default="{row}">{{ exceptionTypeMap[row.type] }}</template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="260" />
        <el-table-column label="温湿度" width="140">
          <template #default="{row}">
            <span v-if="row.temperature!==undefined">{{ row.temperature }}℃</span>
            <span v-if="row.humidity!==undefined"> / {{ row.humidity }}%</span>
          </template>
        </el-table-column>
        <el-table-column prop="duration_minutes" label="时长(分)" width="90" />
        <el-table-column label="状态" width="120">
          <template #default="{row}"><el-tag size="small" :type="exceptionStatusMap[row.status]?.type">{{ exceptionStatusMap[row.status]?.label }}</el-tag></template>
        </el-table-column>
        <el-table-column label="发生时间" width="170">
          <template #default="{row}">{{ fmtDate(row.occur_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{row}"><el-button type="primary" link size="small" @click="$router.push('/exceptions')">查看</el-button></template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import * as echarts from 'echarts';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Document, DocumentAdd, Warning, Money } from '@element-plus/icons-vue';
import request from '@/utils/request';
import { fmtDate, fmtMoney, categoryMap, subCategoryMap, cargoStatusMap, exceptionLevelMap, exceptionTypeMap, exceptionStatusMap } from '@/utils/format';

const route = useRoute();
const loading = ref(false);
const cargo = ref<any>();
const exceptions = ref<any[]>([]);
const tempData = ref<any[]>([]);
const tempChart = ref<HTMLDivElement>();

const canGenerateReport = ref(false);

async function loadDetail() {
  loading.value = true;
  try {
    const id = route.params.id as string;
    const r = await request.get<any>('/cargos/' + id);
    cargo.value = r.data;
    canGenerateReport.value = !!cargo.value.outbound_time;
    await loadTempData();
    await loadExceptions();
  } finally { loading.value = false; }
}

async function loadTempData() {
  const r = await request.get<any>('/temperature/cargo/' + cargo.value.id, { pageSize: 500 });
  tempData.value = r.data || [];
  await nextTick();
  renderChart();
}

async function loadExceptions() {
  const r = await request.get<any>('/exceptions', { cargo_id: cargo.value.id, pageSize: 100, status: 'all' });
  exceptions.value = r.data.list || [];
}

function renderChart() {
  if (!tempChart.value) return;
  const chart = echarts.init(tempChart.value);
  const data = tempData.value;
  const minT = cargo.value.temp_min;
  const maxT = cargo.value.temp_max;
  const minH = cargo.value.humidity_min;
  const maxH = cargo.value.humidity_max;
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['温度', '湿度', '温度阈值下限', '温度阈值上限'], right: 10 },
    grid: { left: 50, right: 60, top: 50, bottom: 60 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 10 }],
    xAxis: {
      type: 'category',
      data: data.map(d => new Date(d.collection_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
    },
    yAxis: [
      { type: 'value', name: '温度(℃)', position: 'left', axisLabel: { formatter: '{value}℃' } },
      { type: 'value', name: '湿度(%)', position: 'right', axisLabel: { formatter: '{value}%' } },
    ],
    series: [
      {
        name: '温度', type: 'line', smooth: true, showSymbol: false,
        data: data.map(d => d.temperature), itemStyle: { color: '#f56c6c' },
        lineStyle: { width: 2 },
        markArea: { itemStyle: { color: 'rgba(103,194,58,0.08)' }, silent: true, data: [[{ yAxis: minT }, { yAxis: maxT }]] },
      },
      { name: '温度阈值下限', type: 'line', data: data.map(() => minT), lineStyle: { type: 'dashed', color: '#67c23a' }, symbol: 'none' },
      { name: '温度阈值上限', type: 'line', data: data.map(() => maxT), lineStyle: { type: 'dashed', color: '#67c23a' }, symbol: 'none' },
      {
        name: '湿度', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false,
        data: data.map(d => d.humidity), itemStyle: { color: '#409eff' }, lineStyle: { width: 2 },
      },
    ],
  });
  window.addEventListener('resize', () => chart.resize());
}

async function generateReport() {
  await ElMessageBox.confirm('确认生成该批次的全程合规报告？', '提示', { type: 'info' });
  const r = await request.post<any>('/reports/generate', { cargo_id: cargo.value.id });
  ElMessage.success(r.message);
  setTimeout(() => window.open('/reports', '_blank'), 500);
}

async function detectExceptions() {
  const r = await request.post<any>('/exceptions/auto-detect', { cargo_id: cargo.value.id });
  ElMessage.success(`检测完成，新增异常 ${r.data.newIds.length} 起`);
  loadExceptions();
}

async function calculateSettlement() {
  const { value: amount } = await ElMessageBox.prompt('请输入合同运费金额（元）', '运费核算', {
    confirmButtonText: '核算',
    inputValue: (cargo.value.value * 0.03 || 1000).toFixed(2),
    inputPattern: /^\d+(\.\d+)?$/,
    inputErrorMessage: '请输入有效金额',
  });
  const r = await request.post<any>('/settlements/calculate', {
    cargo_id: cargo.value.id, contract_amount: Number(amount), carrier: '顺丰冷链物流',
  });
  ElMessage.success(`核算完成：扣款${r.data.deduction_ratio.toFixed(0)}%，最终金额¥${r.data.final_amount.toFixed(2)}`);
}

onMounted(loadDetail);
</script>
