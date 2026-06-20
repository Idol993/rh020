import express from 'express';
import cors from 'cors';
import { initDatabase } from './database';
import { authRouter } from './routes/auth';
import { ruleRouter } from './routes/rules';
import { cargoRouter, tagRouter } from './routes/cargos';
import { tempRouter, warehouseRouter, vehicleRouter } from './routes/temperature';
import { exceptionRouter } from './routes/exceptions';
import { reportRouter, settlementRouter, statsRouter, userRouter } from './routes/reports';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ code: 0, data: { status: 'ok', time: new Date().toISOString(), version: '1.0.0' } });
});

app.use('/api/auth', authRouter);
app.use('/api/rules', ruleRouter);
app.use('/api/cargos', cargoRouter);
app.use('/api/tags', tagRouter);
app.use('/api/temperature', tempRouter);
app.use('/api/warehouses', warehouseRouter);
app.use('/api/vehicles', vehicleRouter);
app.use('/api/exceptions', exceptionRouter);
app.use('/api/reports', reportRouter);
app.use('/api/settlements', settlementRouter);
app.use('/api/stats', statsRouter);
app.use('/api/users', userRouter);

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ code: 500, message: err.message || '服务器内部错误' });
});

(async function bootstrap() {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ColdChain Backend] Server running on http://localhost:${PORT}`);
    console.log(`  API Base: http://localhost:${PORT}/api`);
    console.log(`  Test users (password: 123456):`);
    console.log(`    director / 123456  - 质量总监 (最高权限)`);
    console.log(`    qc01 / 123456      - 质控员`);
    console.log(`    wh01 / 123456      - 仓储主管`);
    console.log(`    driver01 / 123456 - 司机`);
  });
})();
