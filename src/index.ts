import express from 'express';
import router from './routers';
import cors from 'cors';
import 'dotenv/config';
import { loggerService } from './services/logger';

const app = express();

// Add logging middleware early in the stack
app.use(loggerService.expressLogger());

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', router);

// Add error logging middleware after routes
app.use(loggerService.errorHandler());

const port = process.env.PORT || 5000;

app.listen(port, () => {
  loggerService.info('Server started', { port: port.toString() });
});
