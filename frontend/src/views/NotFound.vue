<template>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f0f2f5">
    <div style="font-size:120px;font-weight:700;color:#409eff;letter-spacing:8px">404</div>
    <div style="font-size:22px;color:#606266;margin:20px 0">页面走丢了 ~</div>
    <el-button type="primary" size="large" @click="$router.push('/')">返回首页</el-button>
  </div>
</template>
