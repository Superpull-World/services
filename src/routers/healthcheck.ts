import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.send('Connection is healthy');
});

export default router;
