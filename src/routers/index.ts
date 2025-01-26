import express from 'express';
import workflowRouter from './workflow';
import uploadRouter from './upload';

const router = express.Router();

router.use('/health', (req, res) => {
  if (req.method === 'GET') {
    res.send('Connection is healthy');
  }
});

router.use('/workflow', workflowRouter);
router.use('/upload', uploadRouter);

export default router;
