<template>
  <div class="layout-container">
    <div class="layout-header">
      <div class="layout-logo">
        <div class="logo-icon">❄</div>
        <span>医药与生鲜温控合规管理平台</span>
      </div>
      <el-menu
        mode="horizontal"
        :default-active="activeMenu"
        router
        style="flex:1;border:none"
        :ellipsis="false"
      >
        <template v-for="route in menuRoutes" :key="route.path">
          <el-menu-item :index="'/' + route.path" v-if="!route.meta?.hidden && (!route.meta?.roles || userStore.hasPermission(route.meta.roles as string[]))">
            <el-icon style="margin-right:4px"><component :is="route.meta?.icon" /></el-icon>
            <span>{{ route.meta?.title }}</span>
          </el-menu-item>
        </template>
      </el-menu>
      <div style="display:flex;align-items:center;gap:18px;margin-left:auto">
        <el-badge :value="unreadExceptions" :hidden="unreadExceptions === 0" class="exception-badge">
          <el-button link type="primary" @click="$router.push('/exceptions')" style="font-size:18px">
            <el-icon><Bell /></el-icon>
          </el-button>
        </el-badge>
        <el-dropdown @command="onDropdownCmd">
          <div style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:0 6px">
            <el-avatar :size="32" style="background:#0f4c75">{{ userStore.user?.name?.charAt(0) || 'U' }}</el-avatar>
            <div style="font-size:13px;line-height:1.2">
              <div style="font-weight:600">{{ userStore.user?.name }}</div>
              <div style="color:#909399;font-size:11px">{{ roleLabel }}</div>
            </div>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile"><el-icon><User /></el-icon>个人中心</el-dropdown-item>
              <el-dropdown-item command="password"><el-icon><Key /></el-icon>修改密码</el-dropdown-item>
              <el-dropdown-item divided command="logout"><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
    <div class="layout-main">
      <div class="layout-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </div>
    <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
      <el-form :model="pwdForm" :rules="pwdRules" ref="pwdFormRef" label-width="90px">
        <el-form-item label="原密码" prop="old"><el-input v-model="pwdForm.old" type="password" show-password /></el-form-item>
        <el-form-item label="新密码" prop="new"><el-input v-model="pwdForm.new" type="password" show-password /></el-form-item>
        <el-form-item label="确认密码" prop="confirm"><el-input v-model="pwdForm.confirm" type="password" show-password /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" @click="onChangePwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Bell, User, Key, SwitchButton } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const menuRoutes = computed(() => (router.options.routes.find(r => r.path === '/')?.children || []).filter(r => r.name && r.name !== 'CargoDetail'));
const activeMenu = computed(() => route.path);
const unreadExceptions = ref(0);
const roleLabel = computed(() => ({
  driver: '司机', qc: '质控员', warehouse_manager: '仓储主管', quality_director: '质量总监',
}[userStore.role || '']));

const pwdVisible = ref(false);
const pwdFormRef = ref<FormInstance>();
const pwdForm = reactive({ old: '', new: '', confirm: '' });
const pwdRules: FormRules = {
  old: [{ required: true, message: '请输入原密码' }],
  new: [{ required: true, message: '请输入新密码', min: 6 }],
  confirm: [
    { required: true, message: '请确认新密码' },
    { validator: (_r, v, cb) => v === pwdForm.new ? cb() : cb(new Error('两次密码不一致')), trigger: 'blur' },
  ],
};

async function onChangePwd() {
  const valid = await pwdFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  await request.put('/auth/password', { oldPassword: pwdForm.old, newPassword: pwdForm.new });
  ElMessage.success('密码修改成功');
  pwdVisible.value = false;
  Object.assign(pwdForm, { old: '', new: '', confirm: '' });
}

async function onDropdownCmd(cmd: string) {
  if (cmd === 'logout') {
    ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' }).then(async () => {
      await userStore.logout();
      router.push('/login');
    }).catch(() => {});
  } else if (cmd === 'password') {
    pwdVisible.value = true;
  } else if (cmd === 'profile') {
    ElMessage.info('个人中心功能开发中');
  }
}

async function loadExceptionCount() {
  try {
    const res = await request.get<any>('/exceptions/stats/summary');
    const d = res.data;
    let total = 0;
    for (const lvl of Object.values(d.by_level || {})) {
      total += (lvl as any).pending + (lvl as any).processing + (lvl as any).pending_verification;
    }
    unreadExceptions.value = total;
  } catch {}
}

onMounted(loadExceptionCount);
setInterval(loadExceptionCount, 30000);
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.exception-badge :deep(.el-badge__content) { top: 4px; }
</style>
