import test from 'node:test';
import assert from 'node:assert/strict';
import {NorskClient} from './api-client.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('lost response retries exactly the same request and survives client recreation',async()=>{
 const st=storage(),calls=[];let fail=true;
 const fetcher=async(p,o)=>{calls.push(JSON.parse(o.body));if(fail)throw Error('lost');return new Response(JSON.stringify({id:'session',revision:0}),{headers:{'content-type':'application/json'}});};
 const a=new NorskClient({storage:st,fetcher});await assert.rejects(a.create());assert.ok(a.pending);
 fail=false;const b=new NorskClient({storage:st,fetcher});await b.retry();assert.deepEqual(calls[0],calls[1]);assert.equal(b.pending,null);
});
test('a revision conflict clears pending without pretending success',async()=>{
 const a=new NorskClient({storage:storage(),fetcher:async()=>new Response(JSON.stringify({detail:'Conflict'}),{status:409})});
 await assert.rejects(a.create(),e=>e.status===409);assert.equal(a.pending,null);assert.equal(a.session,null);
});
