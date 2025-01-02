import 'dotenv/config';
import { Worker } from '@temporalio/worker';
import * as activities from '../workflows/items/activities';
import { createTemporalWorkerConnection } from '../services/temporal';
import { workflowRegistry } from '../workflows/registry';

async function run() {
  const connection = await createTemporalWorkerConnection();
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    workflowsPath: require.resolve('../workflows/items/workflows'),
    activities,
    taskQueue: workflowRegistry.createItemWorkflow.taskQueue,
  });

  console.log(
    'Items worker started. Task queue:',
    workflowRegistry.createItemWorkflow.taskQueue,
  );
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
