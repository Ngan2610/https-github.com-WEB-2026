import { openRepo } from './db.js';
import { runVideoWorker } from './services/jobWorker.js';
import { validateServerEnvironment } from './securityConfig.js';
validateServerEnvironment();
const repo = await openRepo();
const controller = new AbortController();
process.on('SIGTERM',()=>controller.abort());
process.on('SIGINT',()=>controller.abort());
await runVideoWorker(repo,{signal:controller.signal});
