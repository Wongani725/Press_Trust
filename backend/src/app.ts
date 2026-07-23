import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './shared/config';
import apiRoutes from './api/routes';
import { notFoundHandler } from './api/middleware/not-found.middleware';
import { errorHandler } from './api/middleware/error.middleware';
import { startScheduler } from './modules/reporting/report-scheduler';
import { initNotificationSystem } from './modules/notifications';
import { seedConfigsIfEmpty } from './modules/system-config';
import { startOtpCleanup } from './modules/auth/otp-cleanup';

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

if (config.nodeEnv !== 'test') {
  seedConfigsIfEmpty().catch((err) => console.error('[Config] Failed to seed configs:', err));
  startScheduler();
  initNotificationSystem();
  startOtpCleanup();
}

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`Swagger docs: http://localhost:${config.port}/api/v1/docs`);
});

export default app;
