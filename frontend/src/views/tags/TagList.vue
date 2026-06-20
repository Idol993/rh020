<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><Cpu /></el-icon></div>
          IoT标签管理
        </div>
        <div>
          <el-button type="primary" @click="showAdd = true" v-if="userStore.isQC || userStore.isWHManager || userStore.isDirector">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增标签
          </el-button>
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="filters.status" placeholder="状态" clearable style="width:160px">
          <el-option v-for="(v,k) in tagStatusMap" :key="k" :label="v.label" :value="k" />
        </el-select>
        <el-button type="primary" @click="loadList">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="list" stripe v-loading="loading">
        <el-table-column prop="tag_no" label="标签编号" width="170" fixed />
        <el-table-column label="状态" width="110">
          <template #default="{row}">
            <el-tag size="small" :type="tagStatusMap[row.status]?.type || 'info'">{{ tagStatusMap[row.status]?.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="电量" width="110">
          <template #default="{row}">
            <el-progress
              :percentage="row.battery_level"
              :color="batteryColor(row.battery_level)"
              :stroke-width="10"
              :show-text="true"
            />
          </template>
        </el-table-column>
        <el-table-column label="通信状态" width="100">
          <template #default="{row}">
            <el-tag size="small" :type="row.communication_status==='online'?'success':'danger'" effect="plain">
              <el-icon style="margin-right:2px" v-if="row.communication_status==='online'"><Connection /></el-icon>
              <el-icon style="margin-right:2px" v-else><Close /></el-icon>
              {{ row.communication_status==='online'?'在线':'离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="传感器精度" width="120">
          <template #default="{row}">±{{ fmtNumber(row.sensor_accuracy,2) }}℃</template>
        </el-table-column>
        <el-table-column label="关联货物" min-width="220" show-overflow-tooltip>
          <template #default="{row}">
            <div v-if="row.cargo_no">
              <div style="font-weight:500">{{ row.cargo_no }}</div>
              <div style="font-size:12px;color:#909399">{{ row.cargo_name }}</div>
            </div>
            <span v-else style="color:#c0c4cc">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="firmware_version" label="固件版本" width="110" />
        <el-table-column label="最近心跳" width="170">
          <template #default="{row}">
            <span :style="{color:isRecent(row.last_heartbeat)?'':'#f56c6c'}">{{ fmtDate(row.last_heartbeat) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="最近校验" width="170">
          <template #default="{row}">{{ fmtDate(row.last_check_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{row}">
            <el-button type="primary" link size="small" @click="openEdit(row)" v-if="userStore.isQC || userStore.isWHManager || userStore.isDirector">编辑</el-button>
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

    <el-dialog v-model="showAdd" title="新增IoT标签" width="480px">
      <el-form :model="addForm" :rules="addFormRules" ref="addFormRef" label-width="100px">
        <el-form-item label="标签编号" prop="tag_no">
          <el-input v-model="addForm.tag_no" placeholder="如：TAG-20240001" />
        </el-form-item>
        <el-form-item label="固件版本" prop="firmware_version">
          <el-input v-model="addForm.firmware_version" placeholder="如：v2.3.1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="onAdd">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEdit" title="编辑标签信息" width="520px">
      <el-form :model="editForm" :rules="editFormRules" ref="editFormRef" label-width="110px">
        <el-form-item label="标签编号">
          <el-input v-model="editForm.tag_no" disabled />
        </el-form-item>
        <el-form-item label="电量 (%)" prop="battery_level">
          <el-input-number v-model="editForm.battery_level" :min="0" :max="100" style="width:100%" />
        </el-form-item>
        <el-form-item label="通信状态" prop="communication_status">
          <el-select v-model="editForm.communication_status" style="width:100%">
            <el-option label="在线" value="online" />
            <el-option label="离线" value="offline" />
          </el-select>
        </el-form-item>
        <el-form-item label="传感器精度" prop="sensor_accuracy">
          <el-input-number v-model="editForm.sensor_accuracy" :min="0" :max="5" :precision="2" :step="0.05" style="width:100%" />
        </el-form-item>
        <el-form-item label="标签状态" prop="status">
          <el-select v-model="editForm.status" style="width:100%">
            <el-option v-for="(v,k) in tagStatusMap" :key="k" :label="v.label" :value="k" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="onEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormRules, type FormInstance } from 'element-plus';
import { Plus, Cpu, Connection, Close } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';
import { fmtDate, fmtNumber, tagStatusMap } from '@/utils/format';
import dayjs from 'dayjs';

const userStore = useUserStore();
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, status: '' });

const showAdd = ref(false);
const addFormRef = ref<FormInstance>();
const addForm = reactive({ tag_no: '', firmware_version: 'v2.3.1' });
const addFormRules: FormRules = {
  tag_no: [{ required: true, message: '请输入标签编号' }],
  firmware_version: [{ required: true, message: '请输入固件版本' }],
};

const showEdit = ref(false);
const editingId = ref('');
const editFormRef = ref<FormInstance>();
const editForm = reactive({ tag_no: '', battery_level: 100, communication_status: 'online', sensor_accuracy: 0.1, status: 'idle' });
const editFormRules: FormRules = {
  battery_level: [{ required: true, message: '请输入电量' }],
  communication_status: [{ required: true, message: '请选择通信状态' }],
  sensor_accuracy: [{ required: true, message: '请输入传感器精度' }],
  status: [{ required: true, message: '请选择标签状态' }],
};

function batteryColor(level: number) {
  if (level >= 50) return '#67c23a';
  if (level >= 20) return '#e6a23c';
  return '#f56c6c';
}
function isRecent(t?: string) {
  if (!t) return false;
  return dayjs().diff(dayjs(t), 'minute') < 30;
}

async function loadList() {
  loading.value = true;
  try {
    const res = await request.get<any>('/tags', filters);
    list.value = res.data.list;
    total.value = res.data.total;
  } finally { loading.value = false; }
}
function resetFilters() { Object.assign(filters, { page: 1, pageSize: 20, status: '' }); loadList(); }

async function onAdd() {
  const valid = await addFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  await request.post<any>('/tags', addForm);
  ElMessage.success('标签创建成功');
  showAdd.value = false;
  addForm.tag_no = '';
  addForm.firmware_version = 'v2.3.1';
  loadList();
}

function openEdit(row: any) {
  editingId.value = row.id;
  Object.assign(editForm, {
    tag_no: row.tag_no,
    battery_level: row.battery_level,
    communication_status: row.communication_status,
    sensor_accuracy: row.sensor_accuracy,
    status: row.status,
  });
  showEdit.value = true;
}

async function onEdit() {
  const valid = await editFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  await request.put<any>('/tags/' + editingId.value, editForm);
  ElMessage.success('更新成功');
  showEdit.value = false;
  loadList();
}

onMounted(loadList);
</script>
