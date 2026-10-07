import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20000000});
const forbidden=/^(?:\.dev\.vars|\.env(?!\.example$)|\.sites-runtime\/|\.wrangler\/|outputs\/|dist\/|node_modules\/|\.git\/)|\.(?:db|sqlite|sqlite3|log|pem|key)$/i;
const patterns=[/sk-(?:proj-|fuyao-)?[A-Za-z0-9_-]{20,}/,/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const issues=[];
const paths=[...new Set(git('ls-files','--cached','--others','--exclude-standard').trim().split('\n').filter(Boolean))];
for(const path of paths){if(forbidden.test(path)){issues.push({scope:'current',path,reason:'excluded file'});continue;}const stat=lstatSync(path);if(stat.isSymbolicLink()){issues.push({scope:'current',path,reason:'symlink'});continue;}const text=readFileSync(path,'utf8');if(patterns.some(p=>p.test(text)))issues.push({scope:'current',path,reason:'credential pattern'});}
const objects=git('rev-list','--objects','--all').trim().split('\n');let blobs=0;
for(const entry of objects){const index=entry.indexOf(' ');if(index<0)continue;const sha=entry.slice(0,index),path=entry.slice(index+1);if(git('cat-file','-t',sha).trim()!=='blob')continue;blobs++;if(forbidden.test(path)){issues.push({scope:'history',path,reason:'excluded file'});continue;}const text=git('cat-file','-p',sha);if(patterns.some(p=>p.test(text)))issues.push({scope:'history',path,reason:'credential pattern'});}
console.log(JSON.stringify({passed:issues.length===0,currentFiles:paths.length,historyBlobs:blobs,issues}));if(issues.length)process.exitCode=1;
