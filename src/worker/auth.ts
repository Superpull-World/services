import 'dotenv/config';
import { Worker } from '@temporalio/worker';
import * as activities from '../workflows/auth/activities';
import { createTemporalWorkerConnection } from '../services/temporal';
import { workflowRegistry } from '../workflows/registry';

async function run() {
  const connection = await createTemporalWorkerConnection();
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    workflowsPath: require.resolve('../workflows/auth/workflows'),
    activities,
    taskQueue: workflowRegistry.auth.taskQueue,
  });

  console.log(
    'Auth worker started. Task queue:',
    workflowRegistry.auth.taskQueue,
  );
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
