<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-title">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:12px">
          <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#0f4c75,#3282b8);display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;box-shadow:0 6px 20px rgba(15,76,117,0.4)">❄</div>
        </div>
        <h1>医药与生鲜温控合规管理平台</h1>
        <p>Temperature Compliance Management Platform</p>
      </div>
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" @keyup.enter="onSubmit">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" size="large" placeholder="请输入用户名" :prefix-icon="User" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" size="large" placeholder="请输入密码" :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-form-item style="margin-bottom:10px">
          <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="onSubmit">登 录</el-button>
        </el-form-item>
      </el-form>
      <div class="login-tip">
        <div style="font-weight:600;margin-bottom:4px;color:#0f4c75">测试账号（密码均为 123456）：</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          <div><b>director</b> - 质量总监</div>
          <div><b>qc01</b> - 质控员</div>
          <div><b>wh01</b> - 仓储主管</div>
          <div><b>driver01</b> - 司机</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();
const router = useRouter();
const route = useRoute();

const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({ username: 'director', password: '123456' });
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  loading.value = true;
  try {
    await userStore.login(form.username, form.password);
    ElMessage.success(`欢迎回来，${userStore.user?.name}！`);
    router.push((route.query.redirect as string) || '/dashboard');
  } finally {
    loading.value = false;
  }
}
</script>
