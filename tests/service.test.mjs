import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, stat } from 'node:fs/promises';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const binary = resolve('target/debug/worklens');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

test('private service, CLI/MCP parity, version gate and persistent agent state', { timeout: 60000 }, async () => {
  const directory = await mkdtemp('/tmp/wl-test-');
  const repository = `${directory}/repo with spaces`;
  const data = `${directory}/data`;
  await mkdir(repository);
  await run('git', ['init', '-b', 'main', repository]);
  const env = { ...process.env, WORKLENS_DATA_DIR: data };
  const cli = async (...args) => JSON.parse((await run(binary, args, { env })).stdout);
  let daemon;
  let mcp;
  const start = async () => {
    daemon = spawn(binary, ['serve'], { env, stdio: 'ignore' });
    for (let n = 0; n < 100; n++) {
      try { await stat(`${data}/service.sock`); await cli('recent'); return; }
      catch { await delay(25); }
    }
    throw new Error('service startup timeout');
  };
  const stop = async (child) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((done) => child.once('exit', done));
    child.kill('SIGTERM');
    await exited;
  };
  try {
    await start();
    assert.equal((await stat(data)).mode & 0o777, 0o700);
    assert.equal((await stat(`${data}/service.sock`)).mode & 0o777, 0o600);
    const opened = await cli('open', repository);
    assert.equal(opened.path, repository.replace('/tmp/', '/private/tmp/'));
    const agent = { id: 'integration', eventId: 'event-1', tool: 'integration-test', objective: 'Verify shared state', worktree: repository };
    const args = ['agent', 'start', '--repo', repository, '--params', JSON.stringify(agent)];
    assert.equal((await cli(...args)).applied, true);
    assert.equal((await cli(...args)).applied, false);
    const sessions = await cli('agents', '--repo', repository);
    mcp = spawn(binary, ['mcp'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const pending = new Map();
    const lines = createInterface({ input: mcp.stdout });
    lines.on('line', (line) => {
      const message = JSON.parse(line);
      pending.get(message.id)?.(message);
    });
    let next = 0;
    const rpc = (method, params) => {
      const id = ++next;
      return new Promise((done, reject) => {
        const timeout = setTimeout(() => reject(new Error(`MCP timeout: ${method}`)), 10000);
        pending.set(id, (value) => { clearTimeout(timeout); pending.delete(id); done(value); });
        mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    };
    const initialized = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'integration-test', version: '1.0' } });
    assert.ok(initialized.result.capabilities.tools);
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const tools = await rpc('tools/list', {});
    assert.deepEqual(tools.result.tools.map((t) => t.name).sort(), ['worklens_query', 'worklens_report', 'worklens_work']);
    const result = await rpc('tools/call', { name: 'worklens_query', arguments: { operation: 'agents', repository: opened.path } });
    assert.deepEqual(JSON.parse(result.result.content[0].text), sessions);
    const denied = await rpc('tools/call', { name: 'worklens_query', arguments: { operation: 'trust', repository: opened.path } });
    assert.equal(denied.result.isError, true);
    await assert.rejects(cli('pr-impact','--repo',repository,'--params','{"number":0}'),error=>error.stderr.includes('Select a positive PR number'));
    const invalidImpact = await rpc('tools/call',{name:'worklens_query',arguments:{operation:'pr_impact',repository:opened.path,params:{number:0}}});
    assert.equal(invalidImpact.result.isError,true);
    assert.equal(invalidImpact.result.content[0].text,'Select a positive PR number');
    const work = {id:'work-integration',eventId:'work-create',actor:'integration-test',expectedRevision:0,
      change:{action:'create',title:'Delivery task',objective:'Verify shared work state',criteria:'Same state across clients',links:[{kind:'agent',reference:agent.id,status:'confirmed',reason:'Explicit test association'}]}};
    const created = await cli('work','create','--repo',repository,'--params',JSON.stringify(work));
    assert.equal(created.item.revision,1);
    const workResult = await rpc('tools/call',{name:'worklens_query',arguments:{operation:'work_show',repository:opened.path,params:{id:work.id}}});
    assert.deepEqual(JSON.parse(workResult.result.content[0].text).item,created.item);
    const note = await rpc('tools/call',{name:'worklens_work',arguments:{operation:'work_note',repository:opened.path,params:{...work,eventId:'work-note',expectedRevision:1,change:{action:'note',text:'MCP local note'}}}});
    assert.equal(JSON.parse(note.result.content[0].text).item.revision,2);
    assert.equal((await cli('work','show','--repo',repository,'--params',JSON.stringify({id:work.id}))).events[0].details.text,'MCP local note');
    const finished = await rpc('tools/call', { name: 'worklens_report', arguments: { action: 'finish', repository: opened.path, id: agent.id, eventId: 'event-2' } });
    assert.equal(JSON.parse(finished.result.content[0].text).session.state, 'completed');
    const mismatch = await new Promise((done, reject) => {
      const socket = connect(`${data}/service.sock`);
      let output = '';
      socket.on('connect', () => socket.write('{"version":999,"operation":"recent","params":{}}\n'));
      socket.on('data', (chunk) => { output += chunk; });
      socket.on('end', () => done(JSON.parse(output)));
      socket.on('error', reject);
    });
    assert.match(mismatch.error, /version mismatch/);
    await stop(mcp);
    await stop(daemon);
    await start();
    assert.equal((await cli('agents', '--repo', repository))[0].state, 'completed');
    const persisted = await cli('work','show','--repo',repository,'--params',JSON.stringify({id:work.id}));
    assert.equal(persisted.item.state,'todo');
    assert.equal(persisted.item.revision,2);
    console.log(`Service evidence retained at ${directory}`);
  } finally {
    await stop(mcp);
    await stop(daemon);
  }
});
