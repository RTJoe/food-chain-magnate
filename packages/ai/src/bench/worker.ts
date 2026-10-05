/** Worker-thread entry for the bench pool: plays one game per message (see pool.ts). */
import { parentPort } from 'node:worker_threads';
import { playAndTrace, type WorkerJob, type WorkerReply } from './pool.js';

parentPort?.on('message', (job: WorkerJob) => {
  let reply: WorkerReply;
  try {
    reply = { index: job.spec.index, result: playAndTrace(job.spec, job.traceDir) };
  } catch (e) {
    reply = { index: job.spec.index, error: e instanceof Error ? (e.stack ?? e.message) : String(e) };
  }
  parentPort?.postMessage(reply);
});
