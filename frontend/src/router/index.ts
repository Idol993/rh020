import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useUserStore } from '@/stores/user';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/layout/BasicLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '工作台', icon: 'DataAnalysis' },
      },
      {
        path: 'screen',
        name: 'BigScreen',
        component: () => import('@/views/BigScreen.vue'),
        meta: { title: '监控大屏', icon: 'Monitor' },
      },
      {
        path: 'cargos',
        name: 'Cargos',
        component: () => import('@/views/cargos/CargoList.vue'),
        meta: { title: '货物管理', icon: 'Box' },
      },
      {
        path: 'cargos/:id',
        name: 'CargoDetail',
        component: () => import('@/views/cargos/CargoDetail.vue'),
        meta: { title: '货物详情', hidden: true },
      },
      {
        path: 'rules',
        name: 'Rules',
        component: () => import('@/views/rules/RuleList.vue'),
        meta: { title: '温控规则', icon: 'Setting' },
      },
      {
        path: 'tags',
        name: 'Tags',
        component: () => import('@/views/tags/TagList.vue'),
        meta: { title: 'IoT标签', icon: 'Connection' },
      },
      {
        path: 'monitor',
        name: 'Monitor',
        component: () => import('@/views/monitor/RealtimeMonitor.vue'),
        meta: { title: '实时监控', icon: 'Aim' },
      },
      {
        path: 'warehouses',
        name: 'Warehouses',
        component: () => import('@/views/warehouses/WarehouseList.vue'),
        meta: { title: '冷库管理', icon: 'OfficeBuilding' },
      },
      {
        path: 'exceptions',
        name: 'Exceptions',
        component: () => import('@/views/exceptions/ExceptionList.vue'),
        meta: { title: '异常管理', icon: 'Warning' },
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('@/views/reports/ReportList.vue'),
        meta: { title: '合规报告', icon: 'Document' },
      },
      {
        path: 'settlements',
        name: 'Settlements',
        component: () => import('@/views/settlements/SettlementList.vue'),
        meta: { title: '财务结算', icon: 'Money' },
      },
      {
        path: 'trace',
        name: 'Trace',
        component: () => import('@/views/Trace.vue'),
        meta: { title: '全链路溯源', icon: 'Search' },
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/system/UserList.vue'),
        meta: { title: '用户管理', icon: 'User', roles: ['quality_director'] },
      },
      {
        path: 'audit',
        name: 'AuditLogs',
        component: () => import('@/views/system/AuditLogs.vue'),
        meta: { title: '审计日志', icon: 'Tickets', roles: ['quality_director'] },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { public: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore();
  document.title = to.meta.title ? to.meta.title + ' - 医药与生鲜温控合规管理平台' : '医药与生鲜温控合规管理平台';
  if (to.meta.public) return next();
  if (!userStore.isLogin) return next({ path: '/login', query: { redirect: to.fullPath } });
  if (to.meta.roles && !userStore.hasPermission(to.meta.roles as string[])) {
    return next('/403');
  }
  next();
});

export default router;
