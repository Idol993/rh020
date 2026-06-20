import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import request from '@/utils/request';
import type { User } from '@/types';

export const useUserStore = defineStore('user', () => {
  const _user = localStorage.getItem('user');
  const token = ref<string>(localStorage.getItem('token') || '');
  const user = ref<User | null>(_user ? JSON.parse(_user) : null);

  const isLogin = computed(() => !!token.value && !!user.value);
  const role = computed(() => user.value?.role || '');
  const isDirector = computed(() => role.value === 'quality_director');
  const isQC = computed(() => ['quality_director', 'qc'].includes(role.value));
  const isWHManager = computed(() => ['quality_director', 'warehouse_manager'].includes(role.value));
  const isDriver = computed(() => role.value === 'driver');

  async function login(username: string, password: string) {
    const res = await request.post<{ token: string; user: User }>('/auth/login', { username, password });
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    return res.data;
  }

  async function logout() {
    try { await request.post('/auth/logout'); } catch {}
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  function hasPermission(roles: string[]) {
    if (!user.value) return false;
    return roles.includes(user.value.role);
  }

  return { token, user, isLogin, role, isDirector, isQC, isWHManager, isDriver, login, logout, hasPermission };
});
