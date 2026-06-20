<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><Money /></el-icon></div>
          运费结算管理
        </div>
        <div>
          <el-button type="primary" @click="showCreate = true" v-if="userStore.isDirector">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增运费核算
          </el-button>
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="filters.status" placeholder="状态" clearable style="width:140px">
          <el-option v-for="(v,k) in settlementStatusMap" :key="k" :label="v.label" :value="k" />
        </el-select>
        <el-input v-model="filters.carrier" placeholder="承运商" clearable style="width:180px" />
        <el-button type="primary" @click="loadList">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="list" stripe v-loading="loading">
        <el-table-column prop="settlement_no" label="结算单号" width="170" fixed />
        <el-table-column prop="cargo_no" label="批次号" width="150" />
        <el-table-column label="货物名称" min-width="200">
          <template #default="{row}">
            <div style="line-height:1.5">
              <div>{{ row.cargo_name }}</div>
              <el-tag size="small" :type="row.category==='pharmacy'?'primary':'success'" style="margin-top:4px">
                {{ categoryMap[row.category] }} / {{ subCategoryMap[row.sub_category] }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="transport_no" label="运输单号" width="150" />
        <el-table-column label="合同金额" width="120" align="right">
          <template #default="{row}">{{ fmtMoney(row.contract_amount) }}</template>
        </el-table-column>
        <el-table-column label="合规等级" width="110">
          <template #default="{row}">
            <el-tag size="small" :type="complianceLevelType(row.compliance_level)">
              {{ complianceLevelLabel(row.compliance_level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="扣款比例" width="100" align="center">
          <template #default="{row}">{{ fmtNumber(Number(row.deduction_ratio) * 100, 0) }}%</template>
        </el-table-column>
        <el-table-column label="扣款金额" width="120" align="right">
          <template #default="{row}">
            <span :style="{color: row.deduction_amount > 0 ? '#f56c6c' : '#303133'}">{{ fmtMoney(row.deduction_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="最终金额" width="130" align="right">
          <template #default="{row}">
            <span :style="{fontWeight: 600, color: row.deduction_amount > 0 ? '#f56c6c' : '#303133'}">
              {{ fmtMoney(row.final_amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag size="small" :type="settlementStatusMap[row.status]?.type || 'info'">
              {{ settlementStatusMap[row.status]?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="carrier" label="承运商" width="140" show-overflow-tooltip />
        <el-table-column prop="shipper" label="发货方" width="120" show-overflow-tooltip />
        <el-table-column label="创建时间" width="160">
          <template #default="{row}">{{ fmtDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{row}">
            <el-button type="primary" link size="small" @click="openDetail(row)">详情</el-button>
            <el-button type="warning" link size="small" @click="openAdjust(row)" v-if="userStore.isDirector && ['calculated','adjusted'].includes(row.status)">调整</el-button>
            <el-button type="success" link size="small" @click="onApprove(row)" v-if="userStore.isDirector && ['calculated','adjusted'].includes(row.status)">审批</el-button>
            <el-button link size="small" @click="onPaid(row)" v-if="userStore.isDirector && row.status === 'approved'">标记已付款</el-button>
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

    <el-dialog v-model="showCreate" title="新增运费核算" width="600px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="选择货物" required>
          <el-select
            v-model="createForm.cargo_id"
            filterable
            remote
            placeholder="搜索批次号或货物名称"
            :remote-method="searchCargos"
            :loading="cargoLoading"
            style="width:100%"
          >
            <el-option v-for="c in cargoOptions" :key="c.id" :label="`${c.cargo_no} - ${c.name}`" :value="c.id">
              <span style="float:left">{{ c.cargo_no }} - {{ c.name }}</span>
              <span style="float:right;color:#8492a6;font-size:12px">{{ c.transport_no }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="合同金额" required>
          <el-input-number v-model="createForm.contract_amount" :min="0" :precision="2" :step="100" style="width:100%" placeholder="请输入合同运费金额" />
        </el-form-item>
        <el-form-item label="承运商" required>
          <el-input v-model="createForm.carrier" placeholder="请输入承运商名称" />
        </el-form-item>
        <el-form-item v-if="calcResult">
          <div style="width:100%;padding:16px;background:#f5f7fa;border-radius:6px;border:1px solid #ebeef5">
            <div style="font-weight:600;margin-bottom:12px">核算结果预览</div>
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="合规等级">
                <el-tag size="small" :type="complianceLevelType(calcResult.compliance_level)">
                  {{ complianceLevelLabel(calcResult.compliance_level) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="扣款比例">{{ fmtNumber(Number(calcResult.deduction_ratio) * 100, 0) }}%</el-descriptions-item>
              <el-descriptions-item label="扣款金额" :style="{color: calcResult.deduction_amount > 0 ? '#f56c6c' : ''}">
                {{ fmtMoney(calcResult.deduction_amount) }}
              </el-descriptions-item>
              <el-descriptions-item label="最终金额" :style="{color: calcResult.deduction_amount > 0 ? '#f56c6c' : '', fontWeight: 600}">
                {{ fmtMoney(calcResult.final_amount) }}
              </el-descriptions-item>
              <el-descriptions-item label="扣款原因" :span="2">{{ calcResult.deduction_reason || '-' }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="onCalculate" :loading="calculating">计算</el-button>
        <el-button type="success" @click="onCreateConfirm" :disabled="!calcResult" :loading="creating">确认创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="adjustVisible" title="调整结算单" width="480px">
      <el-form :model="adjustForm" label-width="110px">
        <el-form-item label="当前结算单号">
          <el-tag type="info">{{ currentSettlement?.settlement_no }}</el-tag>
        </el-form-item>
        <el-form-item label="当前最终金额">
          <span style="font-weight:600">{{ fmtMoney(currentSettlement?.final_amount) }}</span>
        </el-form-item>
        <el-form-item label="调整金额" required>
          <el-input-number
            v-model="adjustForm.adjust_amount"
            :precision="2"
            :step="100"
            style="width:100%"
            placeholder="正数增加，负数扣减"
          />
        </el-form-item>
        <el-form-item label="调整说明" required>
          <el-input v-model="adjustForm.adjust_remark" type="textarea" :rows="3" placeholder="请输入调整原因说明" />
        </el-form-item>
        <el-form-item label="不可抗力">
          <el-checkbox v-model="adjustForm.force_majeure">因不可抗力因素导致的调整</el-checkbox>
        </el-form-item>
        <el-form-item label="调整后金额">
          <span style="font-weight:600;color:#409eff">{{ fmtMoney(adjustedAmount) }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" @click="onAdjustConfirm" :loading="adjusting">确认调整</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="结算单详情" width="720px">
      <div v-if="detail" class="detail-wrapper">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="结算单号" :span="2">
            <span style="font-weight:600;letter-spacing:0.5px">{{ detail.settlement_no }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="批次号">{{ detail.cargo_no }}</el-descriptions-item>
          <el-descriptions-item label="货物名称">{{ detail.cargo_name }}</el-descriptions-item>
          <el-descriptions-item label="品类">
            <el-tag size="small" :type="detail.category==='pharmacy'?'primary':'success'">
              {{ categoryMap[detail.category] }} / {{ subCategoryMap[detail.sub_category] }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="运输单号">{{ detail.transport_no }}</el-descriptions-item>
          <el-descriptions-item label="发货方">{{ detail.shipper }}</el-descriptions-item>
          <el-descriptions-item label="承运商">{{ detail.carrier }}</el-descriptions-item>
          <el-descriptions-item label="合同金额">{{ fmtMoney(detail.contract_amount) }}</el-descriptions-item>
          <el-descriptions-item label="合规等级">
            <el-tag size="small" :type="complianceLevelType(detail.compliance_level)">
              {{ complianceLevelLabel(detail.compliance_level) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="扣款比例">{{ fmtNumber(Number(detail.deduction_ratio) * 100, 0) }}%</el-descriptions-item>
          <el-descriptions-item label="扣款金额" :style="{color: detail.deduction_amount > 0 ? '#f56c6c' : ''}">
            {{ fmtMoney(detail.deduction_amount) }}
          </el-descriptions-item>
          <el-descriptions-item label="扣款原因" :span="2">{{ detail.deduction_reason || '-' }}</el-descriptions-item>
          <el-descriptions-item label="调整金额" v-if="detail.adjust_amount !== undefined && detail.adjust_amount !== null">
            <span :style="{color: detail.adjust_amount >= 0 ? '#67c23a' : '#f56c6c'}">
              {{ detail.adjust_amount >= 0 ? '+' : '' }}{{ fmtMoney(detail.adjust_amount) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="不可抗力" v-if="detail.force_majeure !== undefined">
            <el-tag size="small" :type="detail.force_majeure ? 'warning' : 'info'">
              {{ detail.force_majeure ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="调整说明" :span="2" v-if="detail.adjust_remark">{{ detail.adjust_remark }}</el-descriptions-item>
          <el-descriptions-item label="最终金额" :span="2">
            <span style="font-size:18px;font-weight:700;color: detail.deduction_amount > 0 ? '#f56c6c' : '#303133'">
              {{ fmtMoney(detail.final_amount) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag size="small" :type="settlementStatusMap[detail.status]?.type">{{ settlementStatusMap[detail.status]?.label }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="审批人" v-if="detail.approved_by">{{ detail.approved_name || detail.approved_by }}</el-descriptions-item>
          <el-descriptions-item label="审批时间" v-if="detail.approved_at">{{ fmtDate(detail.approved_at) }}</el-descriptions-item>
          <el-descriptions-item label="付款时间" v-if="detail.paid_at">{{ fmtDate(detail.paid_at) }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ fmtDate(detail.created_at) }}</el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Money, Plus } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';
import { fmtDate, fmtMoney, fmtNumber, categoryMap, subCategoryMap, settlementStatusMap } from '@/utils/format';

const userStore = useUserStore();
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, status: '', carrier: '' });

const showCreate = ref(false);
const calculating = ref(false);
const creating = ref(false);
const createForm = reactive({ cargo_id: '', contract_amount: null as number | null, carrier: '' });
const calcResult = ref<any>(null);
const cargoLoading = ref(false);
const cargoOptions = ref<any[]>([]);

const adjustVisible = ref(false);
const adjusting = ref(false);
const currentSettlement = ref<any>(null);
const adjustForm = reactive({ adjust_amount: 0, adjust_remark: '', force_majeure: false });

const detailVisible = ref(false);
const detail = ref<any>(null);

const adjustedAmount = computed(() => {
  if (!currentSettlement.value) return 0;
  return (currentSettlement.value.final_amount || 0) + (adjustForm.adjust_amount || 0);
});

function complianceLevelLabel(level: string): string {
  const map: Record<string, string> = {
    compliant: '完全合规',
    normal_exception: '一般异常',
    serious_exception: '严重异常',
  };
  return map[level] || level;
}

function complianceLevelType(level: string): string {
  const map: Record<string, string> = {
    compliant: 'success',
    normal_exception: 'warning',
    serious_exception: 'danger',
  };
  return map[level] || 'info';
}

async function loadList() {
  loading.value = true;
  try {
    const res = await request.get<any>('/settlements', filters);
    list.value = res.data.list;
    total.value = res.data.total;
  } finally { loading.value = false; }
}

function resetFilters() {
  Object.assign(filters, { page: 1, pageSize: 20, status: '', carrier: '' });
  loadList();
}

async function searchCargos(query: string) {
  if (!query) {
    cargoOptions.value = [];
    return;
  }
  cargoLoading.value = true;
  try {
    const res = await request.get<any>('/cargos', { keyword: query, pageSize: 50 });
    cargoOptions.value = res.data.list || [];
  } finally { cargoLoading.value = false; }
}

async function onCalculate() {
  if (!createForm.cargo_id) return ElMessage.warning('请选择货物');
  if (!createForm.contract_amount) return ElMessage.warning('请输入合同金额');
  if (!createForm.carrier) return ElMessage.warning('请输入承运商');
  calculating.value = true;
  try {
    const res = await request.post<any>('/settlements/calculate', createForm);
    calcResult.value = res.data;
    ElMessage.success('核算完成');
  } finally { calculating.value = false; }
}

async function onCreateConfirm() {
  if (!calcResult.value) return;
  await ElMessageBox.confirm('确认创建该结算单？创建后状态为已核算。', '提示', { type: 'info' });
  creating.value = true;
  try {
    await request.post<any>('/settlements', { ...createForm, ...calcResult.value });
    ElMessage.success('创建成功');
    showCreate.value = false;
    calcResult.value = null;
    Object.assign(createForm, { cargo_id: '', contract_amount: null, carrier: '' });
    loadList();
  } finally { creating.value = false; }
}

async function openAdjust(row: any) {
  currentSettlement.value = row;
  adjustForm.adjust_amount = 0;
  adjustForm.adjust_remark = '';
  adjustForm.force_majeure = false;
  adjustVisible.value = true;
}

async function onAdjustConfirm() {
  if (!adjustForm.adjust_remark) return ElMessage.warning('请输入调整说明');
  if (adjustForm.adjust_amount === 0) return ElMessage.warning('请输入调整金额');
  await ElMessageBox.confirm(`确认调整该结算单？调整后金额为 ${fmtMoney(adjustedAmount.value)}`, '提示', { type: 'warning' });
  adjusting.value = true;
  try {
    await request.post<any>('/settlements/' + currentSettlement.value.id + '/adjust', adjustForm);
    ElMessage.success('调整成功');
    adjustVisible.value = false;
    loadList();
  } finally { adjusting.value = false; }
}

async function onApprove(row: any) {
  await ElMessageBox.confirm(`确认审批结算单 ${row.settlement_no}？审批后不可修改。`, '审批确认', { type: 'warning' });
  await request.post<any>('/settlements/' + row.id + '/approve');
  ElMessage.success('审批成功');
  loadList();
}

async function onPaid(row: any) {
  await ElMessageBox.confirm(`确认标记结算单 ${row.settlement_no} 为已付款？`, '提示', { type: 'info' });
  await request.post<any>('/settlements/' + row.id + '/paid');
  ElMessage.success('已标记为已付款');
  loadList();
}

async function openDetail(row: any) {
  const res = await request.get<any>('/settlements/' + row.id);
  detail.value = res.data;
  detailVisible.value = true;
}

onMounted(loadList);
</script>

<style scoped>
.detail-wrapper { padding: 4px 0; }
</style>
