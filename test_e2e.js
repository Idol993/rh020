const axios = require('axios');

const BASE = 'http://localhost:3001/api';
let token = '';
const headers = () => ({ Authorization: 'Bearer ' + token });

async function test() {
  console.log('\n=== 开始端到端测试 ===\n');

  // 1. 登录
  const login = await axios.post(BASE + '/auth/login', { username: 'director', password: '123456' });
  token = login.data.data.token;
  console.log('✅ 测试1：登录成功');

  // 2. 问题1 - 规则自动匹配
  console.log('\n=== 问题1：规则自动匹配 ===');
  const cases = [
    { cat: 'pharmacy', sub: 'vaccine' },
    { cat: 'pharmacy', sub: 'normal_drug' },
    { cat: 'fresh', sub: 'vegetable' },
    { cat: 'fresh', sub: 'seafood' },
    { cat: 'fresh', sub: 'frozen_food' },
  ];
  for (const c of cases) {
    const r = await axios.get(BASE + '/rules/match/auto', {
      headers: headers(), params: { category: c.cat, sub_category: c.sub, storage_type: 'transport' }
    });
    const ok = r.data.data && r.data.data.id;
    console.log(`${ok ? '✅' : '❌'} ${c.sub} -> ${r.data.data?.name || '未匹配'}`);
  }

  // 3. 获取在途货物
  const cargos = await axios.get(BASE + '/cargos', {
    headers: headers(), params: { status: 'in_transit', pageSize: 1 }
  });
  const cargo = cargos.data.data.list[0];
  console.log(`\n✅ 选中在途货物: ${cargo.cargo_no} / ${cargo.name} (id=${cargo.id})`);

  // 4. 问题2 - 温度曲线数据
  console.log('\n=== 问题2：温度曲线 ===');
  const temp = await axios.get(BASE + '/temperature/cargo/' + cargo.id, { headers: headers() });
  const hasCargo = !!temp.data.data.cargo;
  const dataLength = temp.data.data.temperature_data?.length || 0;
  const hasData = dataLength > 0;
  const hasMin = temp.data.data.cargo?.temp_min !== undefined && temp.data.data.cargo?.temp_min !== null;
  console.log(`${hasCargo ? '✅' : '❌'} 返回cargo信息`);
  console.log(`${hasData ? '✅' : '❌'} 返回温度数据 ${dataLength} 条`);
  console.log(`${hasMin ? '✅' : '❌'} 阈值信息: ${temp.data.data.cargo?.temp_min}~${temp.data.data.cargo?.temp_max}℃`);
  console.log(`   tag_no: ${temp.data.data.cargo?.tag_no || '无'}`);

  // 5. 问题3 - 全链路溯源（3种方式）
  console.log('\n=== 问题3：全链路溯源 ===');
  const searches = [
    { key: cargo.cargo_no, name: '批次号' },
    { key: cargo.transport_no, name: '运输单号' },
    { key: cargo.id, name: '货物ID' },
  ];
  for (const s of searches) {
    try {
      const trace = await axios.get(BASE + '/users/trace/cargo/' + s.key, { headers: headers() });
      const td = trace.data.data;
      const ok = !!td.cargo && !!td.tag && td.binding_logs?.length > 0 && td.audit_logs?.length > 0;
      console.log(`${ok ? '✅' : '❌'} ${s.name}: ${s.key}`);
      console.log(`   cargo=${!!td.cargo}, tag=${!!td.tag}, bindings=${td.binding_logs?.length || 0}, audits=${td.audit_logs?.length || 0}`);
      console.log(`   阈值: ${td.cargo?.temp_min}~${td.cargo?.temp_max}℃ / ${td.cargo?.humidity_min}~${td.cargo?.humidity_max}%`);
    } catch (e) {
      console.log(`❌ ${s.name}: ${s.key} -> ${e.response?.data?.message || e.message}`);
    }
  }

  // 6. 问题5 - 温控上传触发异常检测
  console.log('\n=== 问题5：温控上传 + 异常检测 ===');
  const tagNo = temp.data.data.cargo.tag_no;
  const tempMin = temp.data.data.cargo.temp_min;
  const tempMax = temp.data.data.cargo.temp_max;
  const overTemp = Math.round((tempMax + 5) * 10) / 10;

  const upload = await axios.post(BASE + '/temperature/upload', [{
    tag_id: tagNo,
    temperature: overTemp,
    humidity: 55,
    collection_time: new Date().toISOString().replace('T', ' ').slice(0, 19),
    location: '北京-京藏高速K120',
    battery_level: 85,
    device_status: 'normal',
  }], { headers: headers() });

  console.log(`${upload.data.data.exceptions_detected > 0 ? '✅' : '❌'} 上传超温数据 ${overTemp}℃，检测到异常: ${upload.data.data.exceptions_detected}条`);
  console.log(`   message: ${upload.data.message}`);

  // 7. 问题5 - 异常列表验证
  const excList = await axios.get(BASE + '/exceptions', {
    headers: headers(), params: { cargo_id: cargo.id, pageSize: 5 }
  });
  const newExc = excList.data.data.list[0];
  const excOk = newExc && newExc.type && newExc.status === 'pending';
  console.log(`${excOk ? '✅' : '❌'} 异常列表新增: type=${newExc?.type}, level=${newExc?.level}, status=${newExc?.status}`);
  const excId = newExc.id;

  // 8. 问题5 - 异常处置
  const handle = await axios.post(BASE + '/exceptions/' + excId + '/handle', {
    action: '调整温度设定',
    description: '已检查并调整制冷设备，温度正在恢复',
    temperature_after: (tempMin + tempMax) / 2,
    humidity_after: 60,
  }, { headers: headers() });
  console.log(`${handle.data.code === 0 ? '✅' : '❌'} 异常处置: ${handle.data.message}`);

  // 9. 问题5 - 异常验证（闭环）
  const verify = await axios.post(BASE + '/exceptions/' + excId + '/verify', {
    passed: true,
    remark: '处置有效，温度已恢复正常范围',
  }, { headers: headers() });
  console.log(`${verify.data.code === 0 ? '✅' : '❌'} 异常验证: ${verify.data.message}`);

  // 验证最终状态
  const excDetail = await axios.get(BASE + '/exceptions/' + excId, { headers: headers() });
  const d = excDetail.data.data;
  const closed = d.status === 'closed' && d.handlings[0]?.verify_status === 'passed';
  console.log(`${closed ? '✅' : '❌'} 闭环验证: status=${d.status}, verify_status=${d.handlings[0]?.verify_status}`);

  // 10. 问题4 - 运费结算（已在PowerShell测试中通过，这里再验证一遍）
  console.log('\n=== 问题4：运费结算 ===');
  const calc = await axios.post(BASE + '/settlements/calculate', {
    cargo_id: cargo.id,
    contract_amount: 8000,
    carrier: '顺丰冷运',
  }, { headers: headers() });
  const calcOk = calc.data.code === 0 && calc.data.data.final_amount !== undefined;
  console.log(`${calcOk ? '✅' : '❌'} 核算预览: 扣款比例=${calc.data.data.deduction_ratio * 100}%, 最终=${calc.data.data.final_amount}元`);

  // 检查是否已存在结算单（之前可能已创建）
  const existing = await axios.get(BASE + '/settlements', {
    headers: headers(), params: { cargo_id: cargo.id }
  });
  if (existing.data.data.list?.length > 0) {
    console.log('ℹ️  该货物已有结算单，跳过保存测试');
  } else {
    const save = await axios.post(BASE + '/settlements', calc.data.data, { headers: headers() });
    const saveOk = save.data.code === 0 && save.data.data.id;
    console.log(`${saveOk ? '✅' : '❌'} 保存结算单: id=${save.data.data?.id}`);

    try {
      await axios.post(BASE + '/settlements', calc.data.data, { headers: headers() });
      console.log('❌ 去重验证失败');
    } catch (e) {
      const dupOk = e.response?.data?.code !== 0;
      console.log(`${dupOk ? '✅' : '❌'} 去重验证: ${e.response?.data?.message}`);
    }
  }

  console.log('\n=== 批次问题2：货物详情温湿度曲线数据结构 ===');
  const cargoDetailResp = await axios.get(BASE + '/temperature/cargo/' + cargo.id, { headers: headers() });
  const dd = cargoDetailResp.data.data || {};
  const cargoWrapperOk = !!dd.cargo;
  const tempArrOk = Array.isArray(dd.temperature_data);
  console.log(`${cargoWrapperOk && tempArrOk ? '✅' : '❌'} 数据结构正确: cargo=${cargoWrapperOk}, temperature_data数组=${tempArrOk}, 点数=${dd.temperature_data?.length ?? 0}`);
  if (dd.temperature_data?.length > 0) {
    const hasTempFld = dd.temperature_data[0].temperature !== undefined;
    const hasTimeFld = dd.temperature_data[0].collection_time !== undefined;
    console.log(`${hasTempFld && hasTimeFld ? '✅' : '❌'} 数据点字段完整: temperature=${hasTempFld}, collection_time=${hasTimeFld}`);
  }

  console.log('\n=== 批次问题3：实时监控品类筛选 ===');
  const allList = await axios.get(BASE + '/temperature/realtime/cargos', { headers: headers() });
  const freshList = await axios.get(BASE + '/temperature/realtime/cargos', { headers: headers(), params: { category: 'fresh' } });
  const pharList = await axios.get(BASE + '/temperature/realtime/cargos', { headers: headers(), params: { category: 'pharmacy' } });
  const allOk = Array.isArray(allList.data.data);
  const freshOk = freshList.data.data.every(x => x.category === 'fresh');
  const pharOk = pharList.data.data.every(x => x.category === 'pharmacy');
  console.log(`${allOk ? '✅' : '❌'} 全部列表: 共${allList.data.data?.length ?? 0}条`);
  console.log(`${freshOk ? '✅' : '❌'} 筛选生鲜: 共${freshList.data.data?.length ?? 0}条，全部category=fresh`);
  console.log(`${pharOk ? '✅' : '❌'} 筛选医药: 共${pharList.data.data?.length ?? 0}条，全部category=pharmacy`);

  console.log('\n=== 批次问题4：合格率百分比规范 ===');
  const reports = await axios.get(BASE + '/reports', { headers: headers(), params: { pageSize: 5 } });
  const firstReport = reports.data.data.list?.[0];
  const rateOk = firstReport && Number(firstReport.temp_pass_rate) < 2 && Number(firstReport.temp_pass_rate) > 0;
  console.log(`${rateOk ? '✅' : '❌'} 报告temp_pass_rate是小数(0~1): ${firstReport?.temp_pass_rate}`);
  const stats = await axios.get(BASE + '/stats/dashboard', { headers: headers() });
  const statsOk = stats.data.data.temp_pass_rate_30d > 0 && stats.data.data.temp_pass_rate_30d <= 100;
  console.log(`${statsOk ? '✅' : '❌'} Dashboard达标率是百分比(0~100): ${stats.data.data.temp_pass_rate_30d}%`);

  console.log('\n=== 新功能1：货物流程时间线 ===');
  const cargoForTimeline = await axios.get(BASE + '/cargos', { headers: headers(), params: { pageSize: 1 } });
  const c1 = cargoForTimeline.data.data.list[0];
  const timeline = await axios.get(BASE + '/cargos/' + c1.id + '/timeline', { headers: headers() });
  const tlOk = Array.isArray(timeline.data.data.nodes) && timeline.data.data.nodes.length === 7;
  console.log(`${tlOk ? '✅' : '❌'} 流程节点7个: ${timeline.data.data.nodes?.map(n=>`${n.label}=${n.status}`).join(', ')}`);
  const doneCount = timeline.data.data.nodes.filter(n => n.status === 'done').length;
  console.log(`已完成节点数: ${doneCount} 个`);

  console.log('\n=== 新功能2：最近异常查询 ===');
  const recent = await axios.get(BASE + '/cargos/' + c1.id + '/recent-exceptions', { headers: headers() });
  console.log(`✅ 最近异常接口正常，返回 ${recent.data.data?.length || 0} 条`);

  console.log('\n=== 新功能3：报告重新核算 ===');
  const reportForRecalc = firstReport;
  if (reportForRecalc && !reportForRecalc.signed_by) {
    const recalc = await axios.post(BASE + '/reports/' + reportForRecalc.id + '/recalculate', {}, { headers: headers() });
    const recalcOk = recalc.data.code === 0 && recalc.data.data.temp_pass_rate !== undefined;
    console.log(`${recalcOk ? '✅' : '❌'} 报告重新核算: new_rate=${recalc.data.data?.temp_pass_rate}, msg=${recalc.data.message}`);
  } else {
    console.log('ℹ️  跳过重新核算（首个报告已签章或不存在）');
  }

  console.log('\n=== 新功能4：批量修正旧报告合格率 ===');
  const fix = await axios.post(BASE + '/reports/fix-old-rates', {}, { headers: headers() });
  const fixOk = fix.data.code === 0;
  console.log(`${fixOk ? '✅' : '❌'} 批量修正: fixed=${fix.data.data?.fixed}/${fix.data.data?.total}, msg=${fix.data.message}`);

  console.log('\n=== 新功能5：可分配处理人列表 ===');
  const assignUsers = await axios.get(BASE + '/exceptions/assignable/users', { headers: headers() });
  const usersOk = Array.isArray(assignUsers.data.data) && assignUsers.data.data.length > 0;
  console.log(`${usersOk ? '✅' : '❌'} 可分配用户: ${assignUsers.data.data?.map(u => u.name).join(', ')}`);

  console.log('\n=== 新功能6：预警生成异常记录 ===');
  const warningExc = await axios.post(BASE + '/exceptions/create-from-warning', {
    cargo_id: c1.id,
    type: 'over_temp',
    level: 'serious',
    description: '测试: 温度超标 15℃，阈值 2~8℃',
    temperature: 15,
    humidity: 60,
    location: '北京市朝阳区',
    threshold_info: '温度阈值 2~8℃，湿度阈值 45~75%',
    handler_id: assignUsers.data.data[0]?.id,
  }, { headers: headers() });
  const newExcOk = warningExc.data.code === 0 && warningExc.data.data.id;
  console.log(`${newExcOk ? '✅' : '❌'} 从预警生成异常: id=${warningExc.data.data?.id}, status=${warningExc.data.data?.status}`);

  console.log('\n=== 测试完成 ===\n');
}

test().catch(e => {
  console.error('❌ 测试失败:', e.response?.data || e.message);
  process.exit(1);
});
