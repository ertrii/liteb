import App from '@app';
import { PORT } from '@config/server';

const app = new App({
  controllers: ['./**/*.controller.ts'],
  schedules: ['./**/*.schedule.ts'],
  entities: ['./**/entities/*.entity.ts'],
});

app.run(PORT);
