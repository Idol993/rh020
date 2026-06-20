<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><Management /></el-icon></div>
          温控规则管理
        </div>
        <div>
          <el-button type="primary" @click="openCreate" v-if="userStore.isQC || userStore.isWHManager || userStore.isDirector">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增规则
          </el-button>
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="filters.category" placeholder="品类" clearable style="width:120px">
          <el-option v-for="(v,k) in categoryMap" :key="k" :label="v" :value="k" />
        </el-select>
        <el-select v-model="filters.storage_type" placeholder="场景" clearable style="width:120px">
          <el-option v-for="(v,k) in storageTypeMap" :key="k" :label="v" :value="k" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width:120px">
          <el-option label="待审核" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
        <el-button type="primary" @click="loadList">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="list" stripe v-loading="loading">
        <el-table-column prop="name" label="规则名称" min-width="180" show-overflow-tooltip>
          <template #default="{row}">
            <span>{{ row.name }}</span>
            <el-tag size="small" type="warning" effect="plain" style="margin-left:6px" v-if="row.is_custom">自定义</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="品类" width="160">
          <template #default="{row}">
            <el-tag size="small" :type="row.category==='pharmacy'?'primary':'success'">
              {{ categoryMap[row.category] }} / {{ subCategoryMap[row.sub_category] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="场景" width="90">
          <template #default="{row}">{{ storageTypeMap[row.storage_type] }}</template>
        </el-table-column>
        <el-table-column label="温度范围 (℃)" width="140">
          <template #default="{row}">{{ fmtNumber(row.temp_min,1) }} ~ {{ fmtNumber(row.temp_max,1) }}</template>
        </el-table-column>
        <el-table-column label="湿度范围 (%)" width="140">
          <template #default="{row}">{{ fmtNumber(row.humidity_min,0) }} ~ {{ fmtNumber(row.humidity_max,0) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{row}">
            <el-tag size="small" :type="ruleStatusType(row.status)">
              {{ ruleStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="170">
          <template #default="{row}">{{ fmtDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{row}">
            <el-button type="primary" link size="small" @click="openEdit(row)" v-if="userStore.isQC || userStore.isDirector">编辑</el-button>
            <template v-if="row.status==='pending' && userStore.isDirector">
              <el-button type="success" link size="small" @click="onApprove(row,true)">通过</el-button>
              <el-button type="danger" link size="small" @click="onApprove(row,false)">驳回</el-button>
            </template>
            <el-button type="danger" link size="small" @click="onDelete(row)" v-if="row.is_custom && userStore.isDirector">删除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑规则' : '新增规则'" width="680px">
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="110px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="规则名称" prop="name"><el-input v-model="form.name" placeholder="自定义规则名称" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="品类" prop="category">
            <el-select v-model="form.category" placeholder="请选择" style="width:100%" @change="onCategoryChange">
              <el-option v-for="(v,k) in categoryMap" :key="k" :label="v" :value="k" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="细分类型" prop="sub_category">
            <el-select v-model="form.sub_category" style="width:100%" @change="tryAutoMatch">
              <template v-if="form.category==='pharmacy'">
                <el-option v-for="(v,k) in pharmacySubs" :key="k" :label="v" :value="k" />
              </template>
              <template v-else>
                <el-option v-for="(v,k) in freshSubs" :key="k" :label="v" :value="k" />
              </template>
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="应用场景" prop="storage_type">
            <el-select v-model="form.storage_type" style="width:100%" @change="tryAutoMatch">
              <el-option v-for="(v,k) in storageTypeMap" :key="k" :label="v" :value="k" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="运输方式">
            <el-select v-model="form.transport_mode" placeholder="运输场景可选" clearable style="width:100%" @change="tryAutoMatch">
              <el-option label="短途运输" value="short" />
              <el-option label="长途运输" value="long" />
              <el-option label="普通货车" value="normal_van" />
              <el-option label="冷藏车" value="refrigerated_van" />
              <el-option label="冷藏箱" value="refrigerated_box" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="6"><el-form-item label="温度下限" prop="temp_min">
            <el-input-number v-model="form.temp_min" :precision="1" :step="0.5" style="width:100%" />
          </el-form-item></el-col>
          <el-col :span="6"><el-form-item label="温度上限" prop="temp_max">
            <el-input-number v-model="form.temp_max" :precision="1" :step="0.5" style="width:100%" />
          </el-form-item></el-col>
          <el-col :span="6"><el-form-item label="湿度下限" prop="humidity_min">
            <el-input-number v-model="form.humidity_min" :min="0" :max="100" style="width:100%" />
          </el-form-item></el-col>
          <el-col :span="6"><el-form-item label="湿度上限" prop="humidity_max">
            <el-input-number v-model="form.humidity_max" :min="0" :max="100" style="width:100%" />
          </el-form-item></el-col>
          <el-col :span="24"><el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="3" placeholder="规则描述/备注" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onSubmit">{{ isEdit ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox, type FormRules, type FormInstance } from 'element-plus';
import { Plus, Management } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';
import { fmtDate, fmtNumber, categoryMap, subCategoryMap, storageTypeMap } from '@/utils/format';

const userStore = useUserStore();
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, category: '', storage_type: '', status: '' });

const pharmacySubs = computed(() => Object.fromEntries(Object.entries(subCategoryMap).filter(([k]) => ['vaccine','blood','refrigerated_drug','frozen_drug','normal_drug'].includes(k))));
const freshSubs = computed(() => Object.fromEntries(Object.entries(subCategoryMap).filter(([k]) => ['vegetable','fruit','seafood','meat','frozen_food','dairy'].includes(k))));

const dialogVisible = ref(false);
const isEdit = ref(false);
const editingId = ref('');
const formRef = ref<FormInstance>();
const defaultForm = () => ({ name: '', category: 'pharmacy', sub_category: 'vaccine', storage_type: 'transport', transport_mode: '', temp_min: 2, temp_max: 8, humidity_min: 35, humidity_max: 75, description: '' });
const form = reactive<any>(defaultForm());

const formRules: FormRules = {
  name: [{ required: true, message: '请输入规则名称' }],
  category: [{ required: true, message: '请选择品类' }],
  sub_category: [{ required: true, message: '请选择细分类型' }],
  storage_type: [{ required: true, message: '请选择应用场景' }],
  temp_min: [{ required: true, message: '请输入温度下限' }],
  temp_max: [{ required: true, message: '请输入温度上限' }],
  humidity_min: [{ required: true, message: '请输入湿度下限' }],
  humidity_max: [{ required: true, message: '请输入湿度上限' }],
};

function ruleStatusLabel(s: string) {
  return { pending: '待审核', approved: '已通过', rejected: '已驳回' }[s] || s;
}
function ruleStatusType(s: string) {
  return { pending: 'warning', approved: 'success', rejected: 'danger' }[s] || 'info';
}

async function loadList() {
  loading.value = true;
  try {
    const res = await request.get<any>('/rules', filters);
    list.value = res.data.list;
    total.value = res.data.total;
  } finally { loading.value = false; }
}
function resetFilters() { Object.assign(filters, { page: 1, pageSize: 20, category: '', storage_type: '', status: '' }); loadList(); }

function openCreate() {
  isEdit.value = false;
  editingId.value = '';
  Object.assign(form, defaultForm());
  dialogVisible.value = true;
}
function openEdit(row: any) {
  isEdit.value = true;
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name, category: row.category, sub_category: row.sub_category,
    storage_type: row.storage_type, transport_mode: row.transport_mode || '',
    temp_min: row.temp_min, temp_max: row.temp_max,
    humidity_min: row.humidity_min, humidity_max: row.humidity_max,
    description: row.description,
  });
  dialogVisible.value = true;
}
function onCategoryChange() {
  if (form.category === 'pharmacy') form.sub_category = 'vaccine';
  else form.sub_category = 'vegetable';
  tryAutoMatch();
}

async function tryAutoMatch() {
  if (!form.category || !form.sub_category || !form.storage_type || isEdit.value) return;
  try {
    const params: any = { category: form.category, sub_category: form.sub_category, storage_type: form.storage_type };
    if (form.transport_mode) params.transport_mode = form.transport_mode;
    const res = await request.get<any>('/rules/match/auto', params);
    if (res.data) {
      Object.assign(form, {
        temp_min: res.data.temp_min, temp_max: res.data.temp_max,
        humidity_min: res.data.humidity_min, humidity_max: res.data.humidity_max,
      });
    }
  } catch {}
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  if (form.temp_min > form.temp_max) return ElMessage.warning('温度下限不能大于上限');
  if (form.humidity_min > form.humidity_max) return ElMessage.warning('湿度下限不能大于上限');

  if (isEdit.value) {
    await request.put<any>('/rules/' + editingId.value, form);
    ElMessage.success('更新成功');
  } else {
    const res = await request.post<any>('/rules', form);
    ElMessage.success(res.message || '创建成功');
  }
  dialogVisible.value = false;
  loadList();
}

async function onApprove(row: any, approved: boolean) {
  const action = approved ? '通过' : '驳回';
  await ElMessageBox.confirm(`确认${action}该规则？`, '审核确认', { type: approved ? 'success' : 'warning' });
  await request.post<any>('/rules/' + row.id + '/approve', { approved, remark: '' });
  ElMessage.success(`已${action}`);
  loadList();
}

async function onDelete(row: any) {
  await ElMessageBox.confirm('确认删除该规则？此操作不可恢复', '删除确认', { type: 'danger' });
  await request.delete<any>('/rules/' + row.id);
  ElMessage.success('删除成功');
  loadList();
}

onMounted(loadList);
</script>
