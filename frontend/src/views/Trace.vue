<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><Aim /></el-icon></div>
          全链路货物溯源
        </div>
      </div>

      <div class="filter-bar">
        <el-input
          v-model="searchKeyword"
          placeholder="请输入批次号或运输单号"
          clearable
          style="width:320px"
          @keyup.enter="onSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" @click="onSearch" :loading="loading">
          <el-icon style="margin-right:4px"><Search /></el-icon>搜索
        </el-button>
      </div>

      <div v-if="!traceData && !loading" style="padding:80px 0;text-align:center;color:#909399">
        <el-icon style="font-size:64px;margin-bottom:16px;opacity:0.3"><Search /></el-icon>
        <div style="font-size:15px">请输入批次号或运输单号进行查询</div>
      </div>

      <div v-if="traceData" v-loading="loading">
        <el-timeline style="padding:10px 0 20px">
          <el-timeline-item
            v-for="(item, index) in timelineItems"
            :key="index"
            :timestamp="item.time"
            :type="item.type"
            :icon="item.icon"
            :hollow="item.hollow"
          >
            <span style="font-weight:600">{{ item.title }}</span>
            <span style="color:#606266;margin-left:8px">{{ item.desc }}</span>
          </el-timeline-item>
        </el-timeline>

        <div class="section-title">
          <el-icon style="margin-right:6px"><Box /></el-icon>货物基础信息
        </div>
        <el-descriptions :column="3" border size="small" style="margin-bottom:8px">
          <el-descriptions-item label="批次号">{{ traceData.cargo.cargo_no }}</el-descriptions-item>
          <el-descriptions-item label="运输单号">{{ traceData.cargo.transport_no }}</el-descriptions-item>
          <el-descriptions-item label="承运车辆">{{ traceData.cargo.plate_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="货物名称" :span="2">{{ traceData.cargo.name }}</el-descriptions-item>
          <el-descriptions-item label="规格">{{ traceData.cargo.specification || '-' }}</el-descriptions-item>
          <el-descriptions-item label="品类">
            <el-tag size="small" :type="traceData.cargo.category==='pharmacy'?'primary':'success'">
              {{ categoryMap[traceData.cargo.category] }} / {{ subCategoryMap[traceData.cargo.sub_category] }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="数量">{{ traceData.cargo.quantity }} {{ traceData.cargo.unit }}</el-descriptions-item>
          <el-descriptions-item label="货物价值">{{ fmtMoney(traceData.cargo.value) }}</el-descriptions-item>
          <el-descriptions-item label="生产/采摘">{{ traceData.cargo.production_date || '-' }}</el-descriptions-item>
          <el-descriptions-item label="有效期至">{{ traceData.cargo.expiry_date || '-' }}</el-descriptions-item>
          <el-descriptions-item label="发货方">{{ traceData.cargo.shipper }}</el-descriptions-item>
          <el-descriptions-item label="收货方">{{ traceData.cargo.receiver }}</el-descriptions-item>
          <el-descriptions-item label="收货地址" :span="2">{{ traceData.cargo.receiver_address || '-' }}</el-descriptions-item>
          <el-descriptions-item label="货物状态">
            <el-tag size="small" :type="cargoStatusMap[traceData.cargo.status]?.type">
              {{ cargoStatusMap[traceData.cargo.status]?.label }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="出库时间">{{ fmtDate(traceData.cargo.outbound_time) }}</el-descriptions-item>
          <el-descriptions-item label="到库时间">{{ fmtDate(traceData.cargo.arrival_time) }}</el-descriptions-item>
          <el-descriptions-item label="验收时间">{{ fmtDate(traceData.cargo.accept_time) }}</el-descriptions-item>
        </el-descriptions>

        <div class="section-title">
          <el-icon style="margin-right:6px"><Connection /></el-icon>温控绑定 & IoT标签
        </div>
        <el-descriptions :column="3" border size="small" style="margin-bottom:12px" v-if="traceData.tag">
          <el-descriptions-item label="标签编号">{{ traceData.tag.tag_no }}</el-descriptions-item>
          <el-descriptions-item label="设备状态">
            <el-tag size="small" :type="tagStatusMap[traceData.tag.status]?.type">
              {{ tagStatusMap[traceData.tag.status]?.label }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="通信状态">
            <el-tag size="small" :type="traceData.tag.communication_status==='online'?'success':'danger'">
              {{ traceData.tag.communication_status==='online'?'在线':'离线' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="电量">{{ traceData.tag.battery_level }}%</el-descriptions-item>
          <el-descriptions-item label="信号强度">{{ traceData.tag.signal_strength || '-' }}</el-descriptions-item>
          <el-descriptions-item label="固件版本">{{ traceData.tag.firmware_version || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="暂无绑定标签" :image-size="80" style="padding:20px 0;margin-bottom:12px" />
        <div style="font-size:13px;color:#606266;margin-bottom:8px;padding:0 4px">绑定操作日志</div>
        <el-table :data="traceData.binding_logs || []" stripe size="small" style="margin-bottom:8px">
          <el-table-column prop="operator_name" label="操作人" width="120" />
          <el-table-column label="操作类型" width="100">
            <template #default="{row}">
              <el-tag size="small" :type="row.operation_type==='bind'?'success':'info'">
                {{ row.operation_type==='bind'?'绑定':'解绑' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作时间" width="170">
            <template #default="{row}">{{ fmtDate(row.created_at) }}</template>
          </el-table-column>
        </el-table>

        <div class="section-title">
          <el-icon style="margin-right:6px"><TrendCharts /></el-icon>温控数据曲线
        </div>
        <div class="chart-box" style="padding:0;margin-bottom:8px">
          <div ref="tempChart" style="width:100%;height:380px"></div>
        </div>

        <div class="section-title">
          <el-icon style="margin-right:6px"><Warning /></el-icon>异常记录
        </div>
        <el-table :data="traceData.exceptions || []" stripe size="small" style="margin-bottom:8px">
          <el-table-column label="发生时间" width="170">
            <template #default="{row}">{{ fmtDate(row.occur_time) }}</template>
          </el-table-column>
          <el-table-column label="级别" width="90">
            <template #default="{row}">
              <el-tag size="small" :type="exceptionLevelMap[row.level]?.type">
                {{ exceptionLevelMap[row.level]?.label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="150">
            <template #default="{row}">{{ exceptionTypeMap[row.type] || row.type }}</template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
            <template #default="{row}">
              <el-tag size="small" :type="exceptionStatusMap[row.status]?.type">
                {{ exceptionStatusMap[row.status]?.label }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!traceData.exceptions?.length" description="暂无异常记录" :image-size="80" style="padding:16px 0" />

        <div class="section-title">
          <el-icon style="margin-right:6px"><Document /></el-icon>合规报告
        </div>
        <el-table :data="traceData.reports || []" stripe size="small" style="margin-bottom:8px">
          <el-table-column prop="report_no" label="报告编号" width="180" />
          <el-table-column label="结论" width="100">
            <template #default="{row}">
              <el-tag size="small" :type="conclusionMap[row.conclusion]?.type">
                {{ conclusionMap[row.conclusion]?.label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="温度合格率" width="140">
            <template #default="{row}">
              <el-progress
                :percentage="Number((row.temp_pass_rate * 100).toFixed(1))"
                :color="row.temp_pass_rate >= 0.98 ? '#67c23a' : row.temp_pass_rate >= 0.90 ? '#e6a23c' : '#f56c6c'"
                :stroke-width="8"
              />
            </template>
          </el-table-column>
          <el-table-column label="生成时间" width="170">
            <template #default="{row}">{{ fmtDate(row.generated_at) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!traceData.reports?.length" description="暂无合规报告" :image-size="80" style="padding:16px 0" />

        <div class="section-title">
          <el-icon style="margin-right:6px"><Money /></el-icon>财务结算
        </div>
        <el-table :data="traceData.settlements || []" stripe size="small" style="margin-bottom:8px">
          <el-table-column prop="settlement_no" label="结算单号" width="170" />
          <el-table-column label="状态" width="100">
            <template #default="{row}">
              <el-tag size="small" :type="settlementStatusMap[row.status]?.type">
                {{ settlementStatusMap[row.status]?.label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="合同金额" width="120" align="right">
            <template #default="{row}">{{ fmtMoney(row.contract_amount) }}</template>
          </el-table-column>
          <el-table-column label="扣款金额" width="120" align="right">
            <template #default="{row}">
              <span :style="{color: row.deduction_amount > 0 ? '#f56c6c' : '#303133'}">{{ fmtMoney(row.deduction_amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="最终金额" width="130" align="right">
            <template #default="{row}">
              <span :style="{fontWeight:600, color: row.deduction_amount > 0 ? '#f56c6c' : '#303133'}">
                {{ fmtMoney(row.final_amount) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!traceData.settlements?.length" description="暂无结算记录" :image-size="80" style="padding:16px 0" />

        <div class="section-title">
          <el-icon style="margin-right:6px"><List /></el-icon>操作审计日志
        </div>
        <el-table :data="traceData.audit_logs || []" stripe size="small">
          <el-table-column label="时间" width="170">
            <template #default="{row}">{{ fmtDate(row.created_at) }}</template>
          </el-table-column>
          <el-table-column prop="user_name" label="操作用户" width="120" />
          <el-table-column prop="module" label="模块" width="140" />
          <el-table-column prop="action" label="操作" width="140" />
          <el-table-column prop="remark" label="详情备注" min-width="260" show-overflow-tooltip />
        </el-table>
        <el-empty v-if="!traceData.audit_logs?.length" description="暂无审计日志" :image-size="80" style="padding:16px 0" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import { Aim, Search, Box, Connection, TrendCharts, Warning, Document, Money, List, CircleCheck, WarningFilled, InfoFilled } from '@element-plus/icons-vue';
import request from '@/utils/request';
import {
  fmtDate, fmtMoney, fmtNumber,
  categoryMap, subCategoryMap, cargoStatusMap,
  tagStatusMap, exceptionLevelMap, exceptionTypeMap, exceptionStatusMap,
  conclusionMap, settlementStatusMap
} from '@/utils/format';

const loading = ref(false);
const searchKeyword = ref('');
const traceData = ref<any>(null);
const tempChart = ref<HTMLDivElement>();

const timelineItems = ref<any[]>([]);

function buildTimeline() {
  if (!traceData.value) return;
  const items: any[] = [];
  const c = traceData.value.cargo;
  items.push({
    title: '货物创建',
    desc: `${c.cargo_no} / ${c.name}`,
    time: fmtDate(c.created_at),
    type: 'primary',
    icon: InfoFilled,
    hollow: false,
  });
  if (c.outbound_time) {
    items.push({
      title: '出库',
      desc: '货物已出库启运',
      time: fmtDate(c.outbound_time),
      type: '',
      icon: null,
      hollow: true,
    });
  }
  if (traceData.value.tag && traceData.value.binding_logs?.length) {
    const bind = traceData.value.binding_logs.find((l: any) => l.operation_type === 'bind');
    if (bind) {
      items.push({
        title: 'IoT标签绑定',
        desc: `${traceData.value.tag.tag_no} / 操作人: ${bind.operator_name}`,
        time: fmtDate(bind.created_at),
        type: 'success',
        icon: CircleCheck,
        hollow: false,
      });
    }
  }
  if (traceData.value.exceptions?.length) {
    const critical = traceData.value.exceptions.filter((e: any) => e.level === 'critical').length;
    const serious = traceData.value.exceptions.filter((e: any) => e.level === 'serious').length;
    if (critical > 0 || serious > 0) {
      items.push({
        title: '异常告警',
        desc: `严重异常 ${critical} 起，较严重 ${serious} 起`,
        time: fmtDate(traceData.value.exceptions[0]?.occur_time),
        type: 'danger',
        icon: WarningFilled,
        hollow: false,
      });
    }
  }
  if (traceData.value.reports?.length) {
    const latest = traceData.value.reports[0];
    items.push({
      title: '合规报告生成',
      desc: `${latest.report_no} / 结论: ${conclusionMap[latest.conclusion]?.label}`,
      time: fmtDate(latest.generated_at),
      type: conclusionMap[latest.conclusion]?.type === 'success' ? 'success' : conclusionMap[latest.conclusion]?.type === 'warning' ? 'warning' : 'danger',
      icon: Document,
      hollow: false,
    });
  }
  if (c.arrival_time) {
    items.push({
      title: '到库',
      desc: '货物已到达冷库',
      time: fmtDate(c.arrival_time),
      type: '',
      icon: null,
      hollow: true,
    });
  }
  if (traceData.value.settlements?.length) {
    const latest = traceData.value.settlements[0];
    items.push({
      title: '运费结算',
      desc: `${latest.settlement_no} / 最终: ${fmtMoney(latest.final_amount)}`,
      time: fmtDate(latest.created_at),
      type: 'warning',
      icon: Money,
      hollow: false,
    });
  }
  if (c.accept_time) {
    items.push({
      title: '验收完成',
      desc: cargoStatusMap[c.status]?.label || '',
      time: fmtDate(c.accept_time),
      type: 'success',
      icon: CircleCheck,
      hollow: false,
    });
  }
  timelineItems.value = items;
}

function renderChart() {
  if (!tempChart.value || !traceData.value) return;
  const chart = echarts.init(tempChart.value);
  const data = traceData.value.temperature_data || [];
  const c = traceData.value.cargo;
  const minT = c.temp_min;
  const maxT = c.temp_max;
  const minH = c.humidity_min;
  const maxH = c.humidity_max;
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['温度', '湿度', '温度阈值下限', '温度阈值上限'], right: 10 },
    grid: { left: 50, right: 60, top: 50, bottom: 60 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 10 }],
    xAxis: {
      type: 'category',
      data: data.map((d: any) => new Date(d.collection_time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })),
    },
    yAxis: [
      { type: 'value', name: '温度(℃)', position: 'left', axisLabel: { formatter: '{value}℃' } },
      { type: 'value', name: '湿度(%)', position: 'right', axisLabel: { formatter: '{value}%' } },
    ],
    series: [
      {
        name: '温度', type: 'line', smooth: true, showSymbol: false,
        data: data.map((d: any) => d.temperature), itemStyle: { color: '#f56c6c' },
        lineStyle: { width: 2 },
        markArea: { itemStyle: { color: 'rgba(103,194,58,0.08)' }, silent: true, data: [[{ yAxis: minT }, { yAxis: maxT }]] },
      },
      { name: '温度阈值下限', type: 'line', data: data.map(() => minT), lineStyle: { type: 'dashed', color: '#67c23a' }, symbol: 'none' },
      { name: '温度阈值上限', type: 'line', data: data.map(() => maxT), lineStyle: { type: 'dashed', color: '#67c23a' }, symbol: 'none' },
      {
        name: '湿度', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false,
        data: data.map((d: any) => d.humidity), itemStyle: { color: '#409eff' }, lineStyle: { width: 2 },
      },
    ],
  });
  const resizeHandler = () => chart.resize();
  window.addEventListener('resize', resizeHandler);
}

async function onSearch() {
  if (!searchKeyword.value.trim()) {
    ElMessage.warning('请输入批次号或运输单号');
    return;
  }
  loading.value = true;
  traceData.value = null;
  try {
    const res = await request.get<any>('/users/trace/cargo/' + encodeURIComponent(searchKeyword.value.trim()));
    traceData.value = res.data;
    await nextTick();
    buildTimeline();
    renderChart();
  } catch (e) {
    traceData.value = null;
  } finally {
    loading.value = false;
  }
}

watch(searchKeyword, () => {
  if (!searchKeyword.value) {
    traceData.value = null;
  }
});
</script>
