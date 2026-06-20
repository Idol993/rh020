<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-header">
        <div class="page-title">
          <div class="icon-tag"><el-icon><User /></el-icon></div>
          用户管理
        </div>
      </div>

      <el-table :data="list" stripe v-loading="loading">
        <el-table-column prop="username" label="用户名" width="140" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column label="角色" width="140">
          <template #default="{row}">
            <el-tag :type="roleTagType(row.role)" effect="plain">
              {{ roleLabelMap[row.role] || row.role }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="email" label="邮箱" min-width="200" show-overflow-tooltip />
        <el-table-column prop="warehouse_name" label="所属仓库" min-width="160" show-overflow-tooltip />
        <el-table-column label="创建时间" width="170">
          <template #default="{row}">{{ fmtDate(row.created_at) }}</template>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { User } from '@element-plus/icons-vue';
import request from '@/utils/request';
import { fmtDate } from '@/utils/format';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const filters = reactive({ page: 1, pageSize: 20 });

const roleLabelMap: Record<string, string> = {
  driver: '司机',
  qc: '质控员',
  warehouse_manager: '仓储主管',
  quality_director: '质量总监',
};

function roleTagType(role: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    driver: 'info',
    qc: 'primary',
    warehouse_manager: 'success',
    quality_director: 'danger',
  };
  return map[role] || 'info';
}

async function loadList() {
  loading.value = true;
  try {
    const res = await request.get<any>('/users', filters);
    list.value = res.data.list || res.data || [];
    total.value = res.data.total || list.value.length;
  } finally { loading.value = false; }
}

onMounted(loadList);
</script>
