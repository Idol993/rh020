<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><Box /></el-icon></div>
          货物批次管理
        </div>
        <div>
          <el-button type="primary" @click="showCreate = true" v-if="userStore.isQC || userStore.isWHManager || userStore.isDirector">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增货物批次
          </el-button>
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="filters.status" placeholder="状态" clearable style="width:140px">
          <el-option v-for="(v,k) in cargoStatusMap" :key="k" :label="v.label" :value="k" />
        </el-select>
        <el-select v-model="filters.category" placeholder="品类" clearable style="width:120px">
          <el-option label="医药" value="pharmacy" />
          <el-option label="生鲜" value="fresh" />
        </el-select>
        <el-input v-model="filters.transport_no" placeholder="运输单号" clearable style="width:180px" />
        <el-input v-model="filters.keyword" placeholder="批次号/名称/单号关键字" clearable style="width:240px" />
        <el-button type="primary" @click="loadList">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="list" stripe v-loading="loading">
        <el-table-column prop="cargo_no" label="批次号" width="170" fixed />
        <el-table-column prop="name" label="货物名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="品类" width="100">
          <template #default="{row}">
            <el-tag size="small" :type="row.category==='pharmacy'?'primary':'success'">
              {{ categoryMap[row.category] }} / {{ subCategoryMap[row.sub_category] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="specification" label="规格" width="140" show-overflow-tooltip />
        <el-table-column prop="quantity" label="数量" width="90">
          <template #default="{row}">{{ row.quantity }} {{ row.unit }}</template>
        </el-table-column>
        <el-table-column prop="transport_no" label="运输单号" width="160" />
        <el-table-column label="发货方→收货方" min-width="220">
          <template #default="{row}">
            <div style="line-height:1.6;font-size:12px">
              <div><span style="color:#909399">发：</span>{{ row.shipper }}</div>
              <div><span style="color:#909399">收：</span>{{ row.receiver }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{row}">
            <el-tag size="small" :type="cargoStatusMap[row.status]?.type || 'info'">{{ cargoStatusMap[row.status]?.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="IoT标签" width="130">
          <template #default="{row}">{{ row.tag_no || '-' }}</template>
        </el-table-column>
        <el-table-column prop="plate_no" label="车辆" width="110" />
        <el-table-column label="时间" width="160">
          <template #default="{row}">{{ fmtDate(row.outbound_time || row.created_at, 'MM-DD HH:mm') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{row}">
            <el-button type="primary" link size="small" @click="$router.push('/cargos/'+row.id)">详情</el-button>
            <el-button type="primary" link size="small" @click="openBind(row)" v-if="row.status==='pending_outbound' && (userStore.isQC||userStore.isWHManager)">绑定标签</el-button>
            <el-button type="primary" link size="small" @click="onCheckDevice(row)" v-if="['outbound','in_transit','arrived'].includes(row.status)">设备校验</el-button>
            <el-button type="success" link size="small" @click="onStart(row)" v-if="['outbound'].includes(row.status) && (userStore.isQC||userStore.isDriver)">启运</el-button>
            <el-button type="warning" link size="small" @click="onArrive(row)" v-if="row.status==='in_transit' && (userStore.isQC||userStore.isWHManager||userStore.isDriver)">到库</el-button>
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

    <el-dialog v-model="showCreate" title="新增货物批次" width="640px">
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="货物名称" prop="name"><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="品类" prop="category">
            <el-select v-model="form.category" placeholder="请选择" style="width:100%" @change="matchRule">
              <el-option label="医药" value="pharmacy" />
              <el-option label="生鲜" value="fresh" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="细分类型" prop="sub_category">
            <el-select v-model="form.sub_category" style="width:100%" @change="matchRule">
              <template v-if="form.category==='pharmacy'">
                <el-option v-for="(v,k) in pharmacySubs" :key="k" :label="v" :value="k" />
              </template>
              <template v-else>
                <el-option v-for="(v,k) in freshSubs" :key="k" :label="v" :value="k" />
              </template>
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="规格"><el-input v-model="form.specification" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="数量" prop="quantity"><el-input-number v-model="form.quantity" :min="1" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="单位"><el-input v-model="form.unit" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="生产/采摘日期"><el-date-picker v-model="form.production_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="有效期至"><el-date-picker v-model="form.expiry_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="货物价值"><el-input-number v-model="form.value" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="温控规则" prop="rule_id">
            <el-select v-model="form.rule_id" style="width:100%" placeholder="自动匹配或手动选择">
              <el-option v-for="r in rules" :key="r.id" :label="r.name + ` (${r.temp_min}~${r.temp_max}℃)`" :value="r.id" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="24"><el-form-item label="发货方" prop="shipper"><el-input v-model="form.shipper" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="收货方" prop="receiver"><el-input v-model="form.receiver" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="收货地址"><el-input v-model="form.receiver_address" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="运输单号"><el-input v-model="form.transport_no" placeholder="留空自动生成" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="承运车辆">
            <el-select v-model="form.vehicle_id" placeholder="选择车辆" clearable style="width:100%">
              <el-option v-for="v in vehicles" :key="v.id" :label="v.plate_no" :value="v.id" />
            </el-select>
          </el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="onCreate">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="bindVisible" title="绑定IoT温控标签" width="480px">
      <el-form label-width="90px">
        <el-form-item label="当前批次"><el-tag type="info" size="large">{{ currentCargo?.cargo_no }} - {{ currentCargo?.name }}</el-tag></el-form-item>
        <el-form-item label="选择标签" required>
          <el-select v-model="selectedTagId" placeholder="请选择空闲标签" filterable style="width:100%">
            <el-option v-for="t in idleTags" :key="t.id" :label="`${t.tag_no} (电量${t.battery_level}% / ${t.communication_status==='online'?'在线':'离线'})`" :value="t.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bindVisible = false">取消</el-button>
        <el-button type="primary" @click="onBind">确认绑定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormRules, type FormInstance } from 'element-plus';
import { Plus, Box } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';
import { fmtDate, categoryMap, subCategoryMap, cargoStatusMap } from '@/utils/format';

const userStore = useUserStore();
const router = useRouter();
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const filters = reactive({ page: 1, pageSize: 20, status: '', category: '', transport_no: '', keyword: '' });

const pharmacySubs = computed(() => Object.fromEntries(Object.entries(subCategoryMap).filter(([k]) => ['vaccine','blood','refrigerated_drug','frozen_drug','normal_drug'].includes(k))));
const freshSubs = computed(() => Object.fromEntries(Object.entries(subCategoryMap).filter(([k]) => ['vegetable','fruit','seafood','meat','frozen_food','dairy'].includes(k))));

const showCreate = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<any>({ name: '', category: 'pharmacy', sub_category: 'vaccine', specification: '', quantity: 1, unit: '箱', value: 0, shipper: '', receiver: '', receiver_address: '', transport_no: '', vehicle_id: '', rule_id: '' });
const formRules: FormRules = {
  name: [{ required: true, message: '请输入货物名称' }],
  category: [{ required: true, message: '请选择品类' }],
  sub_category: [{ required: true, message: '请选择细分类型' }],
  quantity: [{ required: true, message: '请输入数量' }],
  shipper: [{ required: true, message: '请输入发货方' }],
  receiver: [{ required: true, message: '请输入收货方' }],
  rule_id: [{ required: true, message: '请选择温控规则' }],
};
const rules = ref<any[]>([]);
const vehicles = ref<any[]>([]);

const bindVisible = ref(false);
const currentCargo = ref<any>();
const selectedTagId = ref('');
const idleTags = ref<any[]>([]);

async function loadList() {
  loading.value = true;
  try {
    const res = await request.get<any>('/cargos', filters);
    list.value = res.data.list;
    total.value = res.data.total;
  } finally { loading.value = false; }
}
function resetFilters() { Object.assign(filters, { page: 1, pageSize: 20, status: '', category: '', transport_no: '', keyword: '' }); loadList(); }

async function loadSelects() {
  const r = await request.get<any>('/rules', { pageSize: 100, status: 'approved' });
  rules.value = r.data.list;
  const v = await request.get<any>('/vehicles');
  vehicles.value = v.data;
}

async function matchRule() {
  if (!form.category || !form.sub_category) return;
  const res = await request.get<any>('/rules/match/auto', { category: form.category, sub_category: form.sub_category, storage_type: 'transport' });
  if (res.data) form.rule_id = res.data.id;
}

async function onCreate() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  await request.post<any>('/cargos', form);
  ElMessage.success('创建成功');
  showCreate.value = false;
  loadList();
}

async function openBind(row: any) {
  currentCargo.value = row;
  const res = await request.get<any>('/tags', { status: 'idle', pageSize: 100 });
  idleTags.value = res.data.list;
  selectedTagId.value = '';
  bindVisible.value = true;
}

async function onBind() {
  if (!selectedTagId.value) return ElMessage.warning('请选择标签');
  await request.post<any>('/cargos/' + currentCargo.value.id + '/bind-tag', { tag_id: selectedTagId.value });
  ElMessage.success('绑定成功');
  bindVisible.value = false;
  loadList();
}

async function onCheckDevice(row: any) {
  const res = await request.post<any>('/cargos/' + row.id + '/check-device');
  const { passed, checks } = res.data;
  const html = `<table style="width:100%;border-collapse:collapse">
    ${checks.map((c:any) => `<tr style="border-bottom:1px solid #eee"><td style="padding:6px 8px;width:120px">${c.item}</td><td style="padding:6px 8px;color:${c.ok?'#67c23a':'#f56c6c'};font-weight:600">${c.value}</td><td style="padding:6px 8px;color:#606266">${c.message}</td></tr>`).join('')}
  </table>`;
  ElMessageBox.alert(html, passed ? '设备校验通过' : '设备校验异常', {
    dangerouslyUseHTMLString: true, type: passed ? 'success' : 'warning',
  });
}

async function onStart(row: any) {
  await ElMessageBox.confirm('确认启动该批次运输流程？', '提示', { type: 'info' });
  await request.post<any>('/cargos/' + row.id + '/start-transport');
  ElMessage.success('已启运');
  loadList();
}

async function onArrive(row: any) {
  await ElMessageBox.confirm('确认该批次已到达冷库？', '提示', { type: 'warning' });
  await request.post<any>('/cargos/' + row.id + '/arrive', { warehouse_id: row.warehouse_id });
  ElMessage.success('已登记到库');
  loadList();
}

onMounted(() => { loadList(); loadSelects(); });
</script>
