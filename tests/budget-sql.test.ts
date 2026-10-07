import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { BUDGET_RESERVE_SQL, MAX_MODEL_CALLS, MAX_MICRO_USD } from '../lib/harness/model-policy.ts';
test('durable SQLite budget atomically blocks request 41 and reservations beyond $1',()=>{
 const migration = readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).map(f=>readFileSync(new URL(`../drizzle/${f}`,import.meta.url),'utf8')).join('\n');
 const code=String.raw`
import sqlite3,json,sys,tempfile,threading,os
cfg=json.loads(sys.argv[1])
with tempfile.TemporaryDirectory() as tmp:
 path=os.path.join(tmp,'budget.db')
 db=sqlite3.connect(path)
 db.executescript(cfg['schema'])
 db.execute('PRAGMA journal_mode=WAL')
 db.execute('INSERT INTO model_budget VALUES (?,0,0,0,0)',('shared',))
 db.commit()
 results=[]
 lock=threading.Lock()
 barrier=threading.Barrier(cfg['calls']+5)
 def attempt():
  cx=sqlite3.connect(path,timeout=10)
  barrier.wait()
  count=cx.execute(cfg['sql'],(1000,0,'shared',cfg['calls'],1000,cfg['usd'])).rowcount
  cx.commit()
  cx.close()
  with lock: results.append(count)
 threads=[threading.Thread(target=attempt) for _ in range(cfg['calls']+5)]
 for t in threads:t.start()
 for t in threads:t.join()
 assert sum(results)==cfg['calls'],results
 assert db.execute('SELECT calls FROM model_budget').fetchone()[0]==cfg['calls']
 db.execute('INSERT INTO model_budget VALUES (?,0,0,0,0)',('money',))
 first=db.execute(cfg['sql'],(600000,0,'money',cfg['calls'],600000,cfg['usd'])).rowcount
 second=db.execute(cfg['sql'],(600000,0,'money',cfg['calls'],600000,cfg['usd'])).rowcount
 assert first==1 and second==0
 db.commit()
 db.close()
 db=sqlite3.connect(path)
 assert db.execute('SELECT calls FROM model_budget WHERE id=?',('shared',)).fetchone()[0]==cfg['calls']
 print('PASS concurrency, money ceiling, durable reopen')
`;
 const output=execFileSync('python3',['-c',code,JSON.stringify({schema:migration,sql:BUDGET_RESERVE_SQL,calls:MAX_MODEL_CALLS,usd:MAX_MICRO_USD})],{encoding:'utf8'});
 assert.match(output,/PASS/);
});
