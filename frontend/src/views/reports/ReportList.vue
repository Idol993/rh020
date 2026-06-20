<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><Document /></el-icon></div>
          合规报告
        </div>
        <div>
          <el-button v-if="userStore.isDirector" type="warning" @click="fixOldRates">
            <el-icon style="margin-right:4px"><MagicStick /></el-icon>批量修正旧数据
          </el-button>
          <el-button type="primary" @click="showGenerate = true">
            <el-icon style="margin-right:4px"><Plus /></el-icon>生成报告
          </el-button>
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="filters.conclusion" placeholder="合规结论" clearable style="width:140px">
          <el-option v-for="(v,k) in conclusionMap" :key="k" :label="v.label" :value="k" />
        </el-select>
        <el-select v-model="filters.cargo_id" placeholder="货物批次" filterable clearable style="width:240px">
          <el-option v-for="c in cargos" :key="c.id" :label="`${c.cargo_no} - ${c.name}`" :value="c.id" />
        </el-select>
        <el-button type="primary" @click="loadList">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="list" stripe v-loading="loading" @row-click="openDetail" style="cursor:pointer">
        <el-table-column prop="report_no" label="报告编号" width="180" fixed />
        <el-table-column label="货物批次" min-width="200">
          <template #default="{row}">
            <div style="line-height:1.5;font-size:12px">
              <div>{{ row.cargo_no }}</div>
              <div>
                <el-tag size="small" :type="row.category==='pharmacy'?'primary':'success'" style="margin-right:6px">
                  {{ categoryMap[row.category] }}
                </el-tag>
                <span style="color:#606266">{{ row.cargo_name }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="监测时段" width="280">
          <template #default="{row}">
            <div style="line-height:1.5;font-size:12px">
              <div>起：{{ fmtDate(row.start_time, 'YYYY-MM-DD HH:mm') }}</div>
              <div>止：{{ fmtDate(row.end_time, 'YYYY-MM-DD HH:mm') }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="温度合格率" width="140">
          <template #default="{row}">
            <el-progress :percentage="Number(row.temp_pass_rate * 100).toFixed(1) as unknown as number" :color="rateColor(row.temp_pass_rate)" :stroke-width="8" />
          </template>
        </el-table-column>
        <el-table-column label="湿度合格率" width="140">
          <template #default="{row}">
            <el-progress :percentage="Number(row.humidity_pass_rate * 100).toFixed(1) as unknown as number" :color="rateColor(row.humidity_pass_rate)" :stroke-width="8" />
          </template>
        </el-table-column>
        <el-table-column label="异常数" width="110">
          <template #default="{row}">
            <span>{{ row.exception_count }}</span>
            <span v-if="row.critical_exception_count > 0" style="color:#f56c6c;margin-left:4px">(严重{{ row.critical_exception_count }})</span>
          </template>
        </el-table-column>
        <el-table-column label="结论" width="100">
          <template #default="{row}">
            <el-tag size="small" :type="conclusionMap[row.conclusion]?.type">{{ conclusionMap[row.conclusion]?.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="generated_name" label="生成人" width="100" />
        <el-table-column label="生成时间" width="160">
          <template #default="{row}">{{ fmtDate(row.generated_at) }}</template>
        </el-table-column>
        <el-table-column label="签章状态" width="100">
          <template #default="{row}">
            <el-tag size="small" :type="row.signed_by ? 'success' : 'info'" effect="plain">
              {{ row.signed_by ? `已签章：${row.signed_name || row.signed_by}` : '未签章' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{row}">
            <el-button type="primary" link size="small" @click.stop="openDetail(row)">查看</el-button>
            <el-button
              type="primary"
              link
              size="small"
              @click.stop="onRecalculate(row)"
              v-if="userStore.isQC || userStore.isWHManager || userStore.isDirector"
            >重新核算</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top:16px;justify-content:flex-end;display:flex"
        :current-page="filters.page"
        :page-size="filters.pageSize"
        :total="total"
        layout="total,prev,pager,next,jumper,->,sizes"
        @current-change="p => {filters.page=p;loadList()}"
        @size-change="s => {filters.pageSize=s;loadList()}"
        :page-sizes="[10,20,50,100]"
      />
    </div>

    <el-dialog v-model="detailVisible" title="合规报告详情" width="800px" @opened="loadDetail">
      <div v-if="detail" class="detail-wrapper">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="报告编号" :span="2">
            <span style="font-weight:600;letter-spacing:0.5px">{{ detail.report_no }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="货物批次" :span="2">
            <span>{{ detail.cargo_no }} / {{ detail.cargo_name }}</span>
            <el-tag size="small" :type="detail.category==='pharmacy'?'primary':'success'" style="margin-left:8px">
              {{ categoryMap[detail.category] }} / {{ subCategoryMap[detail.sub_category] }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="监测开始">{{ fmtDate(detail.start_time) }}</el-descriptions-item>
          <el-descriptions-item label="监测结束">{{ fmtDate(detail.end_time) }}</el-descriptions-item>
          <el-descriptions-item label="数据点总数">{{ detail.total_data_points }}</el-descriptions-item>
          <el-descriptions-item label="温度合格点">{{ detail.temp_qualified_count }}</el-descriptions-item>
          <el-descriptions-item label="湿度合格点">{{ detail.humidity_qualified_count }}</el-descriptions-item>
          <el-descriptions-item label="异常次数">
            <span>{{ detail.exception_count }}</span>
            <span v-if="detail.critical_exception_count > 0" style="color:#f56c6c;margin-left:4px">(严重{{ detail.critical_exception_count }}次)</span>
          </el-descriptions-item>
          <el-descriptions-item label="累计超温时长" v-if="detail.total_overtime_minutes">{{ detail.total_overtime_minutes }} 分钟</el-descriptions-item>
          <el-descriptions-item label="轨迹偏离">
            <el-tag size="small" :type="detail.route_deviation ? 'danger' : 'success'">
              {{ detail.route_deviation ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="开门次数">{{ detail.door_open_count }} 次</el-descriptions-item>
          <el-descriptions-item label="累计开门时长">{{ detail.total_door_open_minutes }} 分钟</el-descriptions-item>
          <el-descriptions-item label="生成人">{{ detail.generated_name }}</el-descriptions-item>
          <el-descriptions-item label="生成时间">{{ fmtDate(detail.generated_at) }}</el-descriptions-item>
          <el-descriptions-item label="签章人" v-if="detail.signed_by">{{ detail.signed_name || detail.signed_by }}</el-descriptions-item>
          <el-descriptions-item label="签章时间" v-if="detail.signed_at">{{ fmtDate(detail.signed_at) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">合格率分析</el-divider>
        <el-row :gutter="24" style="margin-bottom:8px">
          <el-col :span="12">
            <div style="padding:16px;background:#fafafa;border-radius:6px">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="color:#606266;font-size:13px">温度合格率</span>
                <span :style="{color: rateColor(detail.temp_pass_rate), fontWeight:600, fontSize:18px}">
                  {{ (detail.temp_pass_rate * 100).toFixed(1) }}%
                </span>
              </div>
              <el-progress
                :percentage="Number((detail.temp_pass_rate * 100).toFixed(1))"
                :color="rateColor(detail.temp_pass_rate)"
                :stroke-width="14"
                :show-text="false"
              />
              <div style="margin-top:6px;font-size:12px;color:#909399">
                合格点 {{ detail.temp_qualified_count }} / 总点 {{ detail.total_data_points }}
              </div>
            </div>
          </el-col>
          <el-col :span="12">
            <div style="padding:16px;background:#fafafa;border-radius:6px">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="color:#606266;font-size:13px">湿度合格率</span>
                <span :style="{color: rateColor(detail.humidity_pass_rate), fontWeight:600, fontSize:18px}">
                  {{ (detail.humidity_pass_rate * 100).toFixed(1) }}%
                </span>
              </div>
              <el-progress
                :percentage="Number((detail.humidity_pass_rate * 100).toFixed(1))"
                :color="rateColor(detail.humidity_pass_rate)"
                :stroke-width="14"
                :show-text="false"
              />
              <div style="margin-top:6px;font-size:12px;color:#909399">
                合格点 {{ detail.humidity_qualified_count }} / 总点 {{ detail.total_data_points }}
              </div>
            </div>
          </el-col>
        </el-row>

        <el-divider content-position="left">合规结论</el-divider>
        <div style="padding:16px;border-radius:6px;border:1px solid #ebeef5;background:f5f7fa">
          <div style="display:flex;align-items:center;margin-bottom:12px">
            <el-tag size="large" :type="conclusionMap[detail.conclusion]?.type" effect="dark" style="font-size:15px;padding:4px 14px">
              {{ conclusionMap[detail.conclusion]?.label }}
            </el-tag>
          </div>
          <div style="white-space:pre-wrap;line-height:1.8;color:#303133;font-size:13px">
            {{ detail.conclusion_detail }}
          </div>
        </div>

        <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:8px">
          <template v-if="userStore.isQC || userStore.isWHManager || userStore.isDirector">
            <el-button :loading="recalculating" @click="onRecalculate(detail)" type="primary">
              <el-icon style="margin-right:4px"><RefreshRight /></el-icon>重新核算
            </el-button>
          </template>
          <template v-if="userStore.isDirector && !detail.signed_by">
            <el-button type="primary" :loading="signing" @click="onSign">
              <el-icon style="margin-right:4px"><EditPen /></el-icon>电子签章
            </el-button>
          </template>
          <el-button @click="detailVisible = false">关闭</el-button>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="showGenerate" title="生成合规报告" width="520px">
      <el-form :model="genForm" label-width="100px">
        <el-form-item label="选择货物" required>
          <el-select v-model="genForm.cargo_id" filterable placeholder="请选择货物批次" style="width:100%">
            <el-option v-for="c in cargos" :key="c.id" :label="`${c.cargo_no} - ${c.name}`" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerate = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="onGenerate">生成报告</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Document, Plus, EditPen, MagicStick, RefreshRight } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';
import { fmtDate, categoryMap, subCategoryMap, conclusionMap } from '@/utils/format';

const userStore = useUserStore();
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, conclusion: '', cargo_id: '' });
const cargos = ref<any[]>([]);

const detailVisible = ref(false);
const currentId = ref('');
const detail = ref<any>(null);
const signing = ref(false);
const recalculating = ref(false);

const showGenerate = ref(false);
const generating = ref(false);
const genForm = reactive({ cargo_id: '' });

function rateColor(rate: number): string {
  const r = Number(rate);
  if (r >= 0.98) return '#67c23a';
  if (r >= 0.90) return '#e6a23c';
  return '#f56c6c';
}

async function loadList() {
  loading.value = true;
  try {
    const res = await request.get<any>('/reports', filters);
    list.value = res.data.list;
    total.value = res.data.total;
  } finally { loading.value = false; }
}

function resetFilters() {
  Object.assign(filters, { page: 1, pageSize: 20, conclusion: '', cargo_id: '' });
  loadList();
}

async function loadCargos() {
  const res = await request.get<any>('/cargos', { pageSize: 500 });
  cargos.value = res.data.list || res.data || [];
}

async function openDetail(row: any) {
  currentId.value = row.id;
  detailVisible.value = true;
}

async function loadDetail() {
  if (!currentId.value) return;
  const res = await request.get<any>('/reports/' + currentId.value);
  detail.value = res.data;
}

async function onSign() {
  await ElMessageBox.confirm('确认对该报告进行电子签章？签章后不可撤销。', '电子签章', { type: 'warning' });
  signing.value = true;
  try {
    await request.post<any>('/reports/' + currentId.value + '/sign');
    ElMessage.success('签章成功');
    await loadDetail();
    loadList();
  } finally { signing.value = false; }
}

async function onGenerate() {
  if (!genForm.cargo_id) return ElMessage.warning('请选择货物批次');
  generating.value = true;
  try {
    await ElMessageBox.confirm('确认生成该货物的合规报告？', '提示', { type: 'info' });
    const res = await request.post<any>('/reports/generate', { cargo_id: genForm.cargo_id });
    ElMessage.success('报告生成成功');
    showGenerate.value = false;
    genForm.cargo_id = '';
    loadList();
    if (res.data?.id) {
      currentId.value = res.data.id;
      detailVisible.value = true;
    }
  } finally { generating.value = false; }
}

async function onRecalculate(row: any) {
  await ElMessageBox.confirm(
    `确认重新核算报告 ${row.report_no}？重新核算将更新数据并清除原签章。`,
    '重新核算',
    { type: 'warning' }
  );
  try {
    const res = await request.post<any>('/reports/' + row.id + '/recalculate');
    ElMessage.success(res.data.message || '重新核算成功');
    loadList();
    if (currentId.value === row.id) loadDetail();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '重新核算失败');
  }
}

async function fixOldRates() {
  await ElMessageBox.confirm(
    '确认批量修正所有旧报告的合格率数据？将把旧数据中大于1的合格率（如98.7）自动除以100转为小数格式（0.987）。',
    '批量修正',
    { type: 'warning' }
  );
  try {
    const res = await request.post<any>('/reports/fix-old-rates');
    ElMessage.success(res.data.message || '修正完成');
    loadList();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '修正失败');
  }
}

onMounted(() => { loadList(); loadCargos(); });
</script>

<style scoped>
.detail-wrapper { padding: 4px 0; }
</style>
