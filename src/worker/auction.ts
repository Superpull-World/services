import 'dotenv/config';
import { Worker } from '@temporalio/worker';
import * as activities from '../workflows/auctions/activities';
import { createTemporalWorkerConnection } from '../services/temporal';
import { workflowRegistry } from '../workflows/registry';

async function run() {
  const connection = await createTemporalWorkerConnection();
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    workflowsPath: require.resolve('../workflows/auctions/workflows'),
    activities,
    taskQueue: workflowRegistry.getAuctions.taskQueue,
  });

  console.log(
    'Auction worker started. Task queue:',
    workflowRegistry.getAuctions.taskQueue,
  );
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
