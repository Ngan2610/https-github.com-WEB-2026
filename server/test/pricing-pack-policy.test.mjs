import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPackInput} from '../src/pricingPolicy.js';

const pack={name:'  Gia đình  ',uploads:5,outs:10,durationDays:null,enabled:true,sortOrder:7};
test('Package input is normalized and valid',()=>{
 const result=cleanPackInput(pack);
 assert.deepEqual(result.value,{...pack,name:'Gia đình'});
});
test('Pack validator rejects negative, fractional and oversubscribed quantities',()=>{
 for(const broken of [{uploads:-1},{uploads:0},{uploads:1.2},{uploads:5001},
   {outs:16},{outs:-1},{enabled:'true'},{sortOrder:-1},
   {durationDays:0},{durationDays:3651},{name:' '.repeat(10)},
   {name:'x'.repeat(101)}]) {
   assert.equal(cleanPackInput({...pack,...broken}).error,'invalid_pack',JSON.stringify(broken));
 }
});
test('Pack validator does not accept missing or malformed fields',()=>{
 assert.equal(cleanPackInput({}).error,'invalid_pack');
 assert.equal(cleanPackInput({...pack,sortOrder:'1'}).error,'invalid_pack');
 assert.equal(cleanPackInput({...pack,durationDays:30}).value.durationDays,30);
});
