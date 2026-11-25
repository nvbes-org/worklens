import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const binary = resolve('target/debug/worklens');
const directory = await mkdtemp('/tmp/wl-recipe-');
const env = { ...process.env, WORKLENS_DATA_DIR: directory };
const daemon = spawn(binary, ['serve'], { env, stdio: 'ignore' });
const cli = async (...args) => JSON.parse((await run(binary, args, { env, maxBuffer: 16_000_000, timeout: 125000 })).stdout);
const results = [];
try {
  for (let i = 0; i < 100; i++) {
    try { await cli('recent'); break; }
    catch { await new Promise((done) => setTimeout(done, 50)); }
  }
  for (const path of process.argv.slice(2)) {
    const repository = await cli('open', path);
    const measure = async (operation, extra = []) => {
      const started = performance.now();
      const data = await cli(operation, '--repo', path, ...extra);
      return { milliseconds: Math.round(performance.now() - started), data };
    };
    const git = await measure('git');
    const cold = await measure('graph', ['--refresh']);
    const warm = await measure('graph');
    const entry = { name: repository.name, gitMs: git.milliseconds, graphColdMs: cold.milliseconds, graphCachedMs: warm.milliseconds,
      worktrees: git.data.worktrees.length, projects: cold.data.nodes.filter((n) => !n.external).length,
      edges: cold.data.edges.length, sources: cold.data.sources };
    // Only the implementation repository is trusted for this explicit developer recipe.
    if (repository.path === process.cwd()) {
      await cli('trust', '--repo', path, '--params', '{"trusted":true}');
      const trusted = await measure('graph', ['--refresh']);
      entry.trustedMs = trusted.milliseconds;
      entry.trustedSources = trusted.data.sources;
      const tasks = await cli('tasks', '--repo', path, '--params', '{"project":"desktop","target":"check"}');
      entry.taskCount = Object.keys((tasks.taskGraph ?? tasks).tasks ?? {}).length;
    }
    results.push(entry);
    console.log(JSON.stringify(entry, null, 2));
  }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/local-recipe.json', JSON.stringify(results, null, 2));
} finally {
  const stopped = new Promise((done) => daemon.once('exit', done));
  daemon.kill('SIGTERM');
  await stopped;
}
