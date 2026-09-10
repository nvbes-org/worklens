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
    let diagnostics = '';
    let lastError;
    daemon = spawn(binary, ['serve'], { env, stdio: ['ignore','ignore','pipe'] });
    daemon.stderr.on('data',chunk=>{ diagnostics=(diagnostics+chunk.toString()).slice(-8192); });
    for (let n = 0; n < 100; n++) {
      if(daemon.exitCode!==null || daemon.signalCode!==null)throw new Error(`Service exited: ${daemon.exitCode ?? daemon.signalCode}; ${diagnostics}`);
      try { await stat(`${data}/service.sock`); await cli('recent'); return; }
      catch(error) { lastError=error; await delay(25); }
    }
    throw new Error(`service startup timeout; ${diagnostics}`,{cause:lastError});
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
    const expectations={...work,eventId:'expectations',expectedRevision:2,change:{action:'expectations',expectations:[{repository:'owner/repo',kind:'check',name:'test',appId:42}]}};
    const expectedResult=await rpc('tools/call',{name:'worklens_work',arguments:{operation:'work_expectations',repository:opened.path,params:expectations}});
    assert.equal(expectedResult.result.isError,false);
    const declared=JSON.parse(expectedResult.result.content[0].text).item;
    assert.deepEqual((await cli('work','show','--repo',repository,'--params',JSON.stringify({id:work.id}))).item,declared);
    assert.equal((await cli('work','expectations','--repo',repository,'--params',JSON.stringify(expectations))).applied,false);
    const decision={...work,eventId:'decision-request',expectedRevision:3,change:{action:'decision_request',decision:{id:'scope',question:'Accept scope?',context:'Local test only; no execution',options:['Accept','Reject']}}};
    assert.equal((await cli('work','decision-request','--repo',repository,'--params',JSON.stringify(decision))).item.decisions[0].resolution.state,'pending');
    const answer={...work,eventId:'decision-answer',expectedRevision:4,change:{action:'decision_answer',id:'scope',answer:'Accept',reason:'Explicit test answer, not human approval'}};
    const answered=await rpc('tools/call',{name:'worklens_work',arguments:{operation:'work_decision_answer',repository:opened.path,params:answer}});
    assert.equal(answered.result.isError,false);
    assert.deepEqual((await cli('work','show','--repo',repository,'--params',JSON.stringify({id:work.id}))).item,JSON.parse(answered.result.content[0].text).item);
    assert.equal((await cli('work','decision-answer','--repo',repository,'--params',JSON.stringify(answer))).applied,false);
    const secondDecision={...decision,eventId:'decision-second',expectedRevision:5,change:{...decision.change,decision:{...decision.change.decision,id:'cancel-me'}}};
    const secondResult=await rpc('tools/call',{name:'worklens_work',arguments:{operation:'work_decision_request',repository:opened.path,params:secondDecision}});
    assert.equal(secondResult.result.isError,false);
    const cancelled=await cli('work','decision-cancel','--repo',repository,'--params',JSON.stringify({...work,eventId:'decision-cancel',expectedRevision:6,change:{action:'decision_cancel',id:'cancel-me',reason:'Superseded test'}}));
    assert.equal(cancelled.item.decisions[1].resolution.state,'cancelled');
    const invalidValidation=await rpc('tools/call',{name:'worklens_query',arguments:{operation:'validations',repository:opened.path,params:{slug:'owner/repo',sha:'bad'}}});
    assert.equal(invalidValidation.result.isError,true);
    assert.match(invalidValidation.result.content[0].text,/40-character/);
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
    assert.equal(persisted.item.revision,7);
    assert.equal(persisted.item.decisions[0].resolution.answer,'Accept');
    assert.equal(persisted.item.decisions[1].resolution.state,'cancelled');
    assert.equal(persisted.item.expectations[0].name,'test');
    console.log(`Service evidence retained at ${directory}`);
  } finally {
    await stop(mcp);
    await stop(daemon);
  }
});
