<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><Document /></el-icon></div>
          审计日志
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="filters.module" placeholder="模块" clearable style="width:160px">
          <el-option v-for="(v,k) in moduleLabelMap" :key="k" :label="v" :value="k" />
        </el-select>
        <el-select v-model="filters.user_id" placeholder="用户" filterable clearable style="width:180px">
          <el-option v-for="u in users" :key="u.id" :label="`${u.name} (${u.username})`" :value="u.id" />
        </el-select>
        <el-button type="primary" @click="loadList">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="list" stripe v-loading="loading">
        <el-table-column label="时间" width="170">
          <template #default="{row}">{{ fmtDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="user_name" label="操作用户" width="120" />
        <el-table-column label="模块" width="120">
          <template #default="{row}">
            <el-tag size="small" type="info" effect="plain">{{ moduleLabelMap[row.module] || row.module }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" width="120" />
        <el-table-column prop="target_type" label="目标类型" width="130" />
        <el-table-column prop="target_id" label="目标ID" width="150" />
        <el-table-column prop="remark" label="备注" min-width="240" show-overflow-tooltip />
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Document } from '@element-plus/icons-vue';
import request from '@/utils/request';
import { fmtDate } from '@/utils/format';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const users = ref<any[]>([]);
const filters = reactive({ page: 1, pageSize: 20, module: '', user_id: '' });

const moduleLabelMap: Record<string, string> = {
  auth: '认证',
  rule: '规则',
  cargo: '货物',
  tag: '标签',
  exception: '异常',
  report: '报告',
  settlement: '结算',
};

async function loadUsers() {
  try {
    const res = await request.get<any>('/users', { pageSize: 100 });
    users.value = res.data.list || res.data || [];
  } catch (e) {
    console.error(e);
  }
}

async function loadList() {
  loading.value = true;
  try {
    const params: any = { page: filters.page, pageSize: filters.pageSize };
    if (filters.module) params.module = filters.module;
    if (filters.user_id) params.user_id = filters.user_id;
    const res = await request.get<any>('/users/audit-logs', params);
    list.value = res.data.list || res.data || [];
    total.value = res.data.total || list.value.length;
  } finally { loading.value = false; }
}

function resetFilters() {
  Object.assign(filters, { page: 1, pageSize: 20, module: '', user_id: '' });
  loadList();
}

onMounted(() => {
  loadUsers();
  loadList();
});
</script>
