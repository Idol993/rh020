<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><Warning /></el-icon></div>
          异常管理
        </div>
      </div>

      <el-row :gutter="16" style="margin-bottom:16px">
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-title">待处理</div>
            <div class="stat-value" style="color:#f56c6c">{{ stats.pending.total }}</div>
            <div class="stat-sub">
              <span v-for="(v,k) in stats.pending.byLevel" :key="k" style="margin-right:10px">
                <el-tag size="small" :type="exceptionLevelMap[k]?.type">{{ exceptionLevelMap[k]?.label }} {{ v }}</el-tag>
              </span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-title">处理中</div>
            <div class="stat-value" style="color:#e6a23c">{{ stats.processing.total }}</div>
            <div class="stat-sub">
              <span v-for="(v,k) in stats.processing.byLevel" :key="k" style="margin-right:10px">
                <el-tag size="small" :type="exceptionLevelMap[k]?.type">{{ exceptionLevelMap[k]?.label }} {{ v }}</el-tag>
              </span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-title">待验证</div>
            <div class="stat-value" style="color:#409eff">{{ stats.pending_verification.total }}</div>
            <div class="stat-sub">
              <span v-for="(v,k) in stats.pending_verification.byLevel" :key="k" style="margin-right:10px">
                <el-tag size="small" :type="exceptionLevelMap[k]?.type">{{ exceptionLevelMap[k]?.label }} {{ v }}</el-tag>
              </span>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-title">已闭环</div>
            <div class="stat-value" style="color:#67c23a">{{ stats.closed.total }}</div>
            <div class="stat-sub">
              <span v-for="(v,k) in stats.closed.byLevel" :key="k" style="margin-right:10px">
                <el-tag size="small" :type="exceptionLevelMap[k]?.type">{{ exceptionLevelMap[k]?.label }} {{ v }}</el-tag>
              </span>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <div class="filter-bar">
        <el-select v-model="filters.level" placeholder="级别" clearable style="width:120px">
          <el-option v-for="(v,k) in exceptionLevelMap" :key="k" :label="v.label" :value="k" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width:130px">
          <el-option v-for="(v,k) in exceptionStatusMap" :key="k" :label="v.label" :value="k" />
        </el-select>
        <el-select v-model="filters.type" placeholder="异常类型" clearable style="width:180px">
          <el-option v-for="(v,k) in exceptionTypeMap" :key="k" :label="v" :value="k" />
        </el-select>
        <el-button type="primary" @click="loadList">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="list" stripe v-loading="loading" @row-click="openDetail" style="cursor:pointer">
        <el-table-column label="级别" width="90">
          <template #default="{row}">
            <el-tag size="small" :type="exceptionLevelMap[row.level]?.type">{{ exceptionLevelMap[row.level]?.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="150">
          <template #default="{row}">{{ exceptionTypeMap[row.type] || row.type }}</template>
        </el-table-column>
        <el-table-column label="货物" min-width="180">
          <template #default="{row}">
            <div style="line-height:1.5;font-size:12px">
              <div>{{ row.cargo_no || '-' }}</div>
              <div style="color:#606266">{{ row.cargo_name || '-' }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置" width="140" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="温湿度" width="110">
          <template #default="{row}">
            <span v-if="row.temperature !== undefined || row.humidity !== undefined" style="font-size:12px">
              <span v-if="row.temperature !== undefined" style="color:#f56c6c">{{ row.temperature }}℃</span>
              <span v-if="row.temperature !== undefined && row.humidity !== undefined"> / </span>
              <span v-if="row.humidity !== undefined" style="color:#409eff">{{ row.humidity }}%</span>
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="时长" width="90">
          <template #default="{row}">
            <span v-if="row.duration_minutes">{{ row.duration_minutes }}分</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="发生时间" width="160">
          <template #default="{row}">{{ fmtDate(row.occur_time) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag size="small" :type="exceptionStatusMap[row.status]?.type">{{ exceptionStatusMap[row.status]?.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="handler_name" label="处理人" width="100" />
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

    <el-dialog v-model="detailVisible" title="异常详情" width="760px" @opened="loadDetail">
      <div v-if="detail" class="detail-wrapper">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="级别">
            <el-tag :type="exceptionLevelMap[detail.level]?.type">{{ exceptionLevelMap[detail.level]?.label }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="类型">{{ exceptionTypeMap[detail.type] || detail.type }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="exceptionStatusMap[detail.status]?.type">{{ exceptionStatusMap[detail.status]?.label }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="处理人">{{ detail.handler_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="货物" :span="2">
            <span v-if="detail.cargo_no">{{ detail.cargo_no }} / {{ detail.cargo_name }}</span>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="位置">{{ detail.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="发生时间">{{ fmtDate(detail.occur_time) }}</el-descriptions-item>
          <el-descriptions-item label="温度" v-if="detail.temperature !== undefined">
            <span style="color:#f56c6c">{{ detail.temperature }}℃</span>
          </el-descriptions-item>
          <el-descriptions-item label="湿度" v-if="detail.humidity !== undefined">
            <span style="color:#409eff">{{ detail.humidity }}%</span>
          </el-descriptions-item>
          <el-descriptions-item label="持续时长" v-if="detail.duration_minutes">{{ detail.duration_minutes }} 分钟</el-descriptions-item>
          <el-descriptions-item label="阈值信息" v-if="detail.threshold_info">{{ detail.threshold_info }}</el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ detail.description }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="(userStore.isQC || userStore.isWHManager || userStore.isDirector) && ['pending','processing'].includes(detail.status)" style="margin-top:16px">
          <el-divider content-position="left">分配处理人</el-divider>
          <el-form inline>
            <el-form-item label="选择处理人">
              <el-select v-model="assignHandlerId" placeholder="请选择处理人" filterable style="width:200px">
                <el-option v-for="u in handlers" :key="u.id" :label="u.name" :value="u.id" />
              </el-select>
            </el-form-item>
            <el-button type="primary" :disabled="!assignHandlerId || detail.current_handler === assignHandlerId" @click="onAssign">确认分配</el-button>
          </el-form>
        </div>

        <el-divider content-position="left">处理记录</el-divider>
        <el-table :data="detail.handlings || []" size="small" border>
          <el-table-column prop="handler_name" label="处理人" width="100" />
          <el-table-column prop="action" label="处理动作" width="140" />
          <el-table-column prop="description" label="处理说明" min-width="200" show-overflow-tooltip />
          <el-table-column label="处理后温湿度" width="140">
            <template #default="{row}">
              <span style="font-size:12px">
                <span v-if="row.temperature_after !== undefined" style="color:#67c23a">{{ row.temperature_after }}℃</span>
                <span v-if="row.temperature_after !== undefined && row.humidity_after !== undefined"> / </span>
                <span v-if="row.humidity_after !== undefined" style="color:#67c23a">{{ row.humidity_after }}%</span>
                <span v-if="row.temperature_after === undefined && row.humidity_after === undefined">-</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="160">
            <template #default="{row}">{{ fmtDate(row.handle_time) }}</template>
          </el-table-column>
          <el-table-column label="验证状态" width="100">
            <template #default="{row}">
              <el-tag size="small" :type="row.verify_status==='passed'?'success':row.verify_status==='rejected'?'danger':'warning'">
                {{ row.verify_status==='passed'?'已通过':row.verify_status==='rejected'?'已拒绝':'待验证' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="verifier_name" label="验证人" width="100" />
        </el-table>

        <el-divider content-position="left">处理操作</el-divider>
        <div v-if="['pending','processing'].includes(detail.status)" class="handle-section">
          <el-form :model="handleForm" label-width="110px" size="default">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="处理动作">
                  <el-select v-model="handleForm.action" placeholder="请选择" style="width:100%">
                    <el-option label="检查制冷设备" value="检查制冷设备" />
                    <el-option label="关闭车门" value="关闭车门" />
                    <el-option label="调整温度设定" value="调整温度设定" />
                    <el-option label="转移货物" value="转移货物" />
                    <el-option label="更换标签" value="更换标签" />
                    <el-option label="其他" value="其他" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="处理后温度">
                  <el-input-number v-model="handleForm.temperature_after" :precision="1" :step="0.5" style="width:100%" placeholder="℃" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="处理后湿度">
                  <el-input-number v-model="handleForm.humidity_after" :precision="0" :step="1" style="width:100%" placeholder="%" />
                </el-form-item>
              </el-col>
              <el-col :span="24">
                <el-form-item label="处理说明">
                  <el-input v-model="handleForm.description" type="textarea" :rows="3" placeholder="请详细描述处理过程..." />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item>
              <el-button type="primary" @click="onHandle">提交处理</el-button>
            </el-form-item>
          </el-form>
        </div>
        <div v-else-if="detail.status === 'pending_verification'" class="verify-section">
          <el-alert title="此异常待验证处理结果，请质量主管进行验证操作" type="warning" :closable="false" style="margin-bottom:12px" />
          <div>
            <el-button type="success" @click="onVerify(true)">
              <el-icon style="margin-right:4px"><CircleCheck /></el-icon>验证通过
            </el-button>
            <el-button type="danger" @click="onVerify(false)">
              <el-icon style="margin-right:4px"><CircleClose /></el-icon>验证拒绝
            </el-button>
          </div>
        </div>
        <div v-else class="closed-section">
          <el-alert title="此异常已闭环" type="success" :closable="false" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Warning, CircleCheck, CircleClose } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';
import { fmtDate, exceptionLevelMap, exceptionTypeMap, exceptionStatusMap } from '@/utils/format';

const userStore = useUserStore();
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, level: '', status: '', type: '' });

const stats = reactive<Record<string, { total: number; byLevel: Record<string, number> }>>({
  pending: { total: 0, byLevel: {} },
  processing: { total: 0, byLevel: {} },
  pending_verification: { total: 0, byLevel: {} },
  closed: { total: 0, byLevel: {} },
});

const detailVisible = ref(false);
const currentId = ref('');
const detail = ref<any>(null);
const assignHandlerId = ref('');
const handlers = ref<any[]>([]);

const handleForm = reactive({ action: '', description: '', temperature_after: null as number | null, humidity_after: null as number | null });

async function loadList() {
  loading.value = true;
  try {
    const res = await request.get<any>('/exceptions', filters);
    list.value = res.data.list;
    total.value = res.data.total;
    computeStats(res.data.list);
  } finally { loading.value = false; }
}

function computeStats(data: any[]) {
  ['pending', 'processing', 'pending_verification', 'closed'].forEach(s => {
    stats[s as keyof typeof stats].total = 0;
    stats[s as keyof typeof stats].byLevel = {};
  });
  data.forEach(item => {
    const s = stats[item.status as keyof typeof stats];
    if (s) {
      s.total++;
      s.byLevel[item.level] = (s.byLevel[item.level] || 0) + 1;
    }
  });
}

function resetFilters() {
  Object.assign(filters, { page: 1, pageSize: 20, level: '', status: '', type: '' });
  loadList();
}

async function openDetail(row: any) {
  currentId.value = row.id;
  detailVisible.value = true;
}

async function loadDetail() {
  if (!currentId.value) return;
  const res = await request.get<any>('/exceptions/' + currentId.value);
  detail.value = res.data;
  assignHandlerId.value = res.data.current_handler || '';
  Object.assign(handleForm, { action: '', description: '', temperature_after: null, humidity_after: null });
  if (userStore.isQC || userStore.isWHManager || userStore.isDirector) {
    const hr = await request.get<any>('/users', { role: ['qc', 'warehouse_manager', 'quality_director'] });
    handlers.value = hr.data.list || hr.data || [];
  }
}

async function onAssign() {
  if (!assignHandlerId.value) return;
  await request.put<any>('/exceptions/' + currentId.value + '/assign', { handler_id: assignHandlerId.value });
  ElMessage.success('分配成功');
  loadDetail();
  loadList();
}

async function onHandle() {
  if (!handleForm.action) return ElMessage.warning('请选择处理动作');
  if (!handleForm.description) return ElMessage.warning('请填写处理说明');
  await request.post<any>('/exceptions/' + currentId.value + '/handle', handleForm);
  ElMessage.success('处理提交成功');
  loadDetail();
  loadList();
}

async function onVerify(passed: boolean) {
  const title = passed ? '确认验证通过？' : '确认验证拒绝？';
  await ElMessageBox.confirm(title, '提示', { type: passed ? 'success' : 'warning' });
  const remarkText = passed ? '' : '处理不符合要求';
  await request.post<any>('/exceptions/' + currentId.value + '/verify', { passed: passed, remark: remarkText });
  ElMessage.success(passed ? '验证通过' : '已拒绝');
  loadDetail();
  loadList();
}

onMounted(() => { loadList(); });
</script>

<style scoped>
.stat-card { height: 100%; }
.stat-title { font-size: 13px; color: #909399; margin-bottom: 8px; }
.stat-value { font-size: 28px; font-weight: 600; margin-bottom: 8px; }
.stat-sub { font-size: 12px; }
.detail-wrapper { padding: 4px 0; }
.handle-section, .verify-section, .closed-section { padding: 8px 4px; }
</style>
