import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';

const bundle = await build({
  entryPoints: ['src/main.ts'], bundle: true, write: false, format: 'iife', platform: 'browser',
  plugins: [{ name: 'test-adapters', setup(builder) {
    builder.onResolve({filter:/^@decartai\/sdk$/}, () => ({path:'sdk',namespace:'test'}));
    builder.onLoad({filter:/.*/,namespace:'test'}, () => ({contents:'export const createDecartClient = options => { globalThis.onClient(options); return globalThis.testClient; }; export const models = {realtime: name => ({name})};'}));
    builder.onLoad({filter:/\.css$/}, () => ({contents:'',loader:'js'}));
  }}],
});
class Element {
  hidden = false; disabled = false; value = ''; textContent = ''; dataset = {}; files = [];
  listeners = new Map();
  classList = {toggle(){},add(){},remove(){}};
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  async fire(name) { await this.listeners.get(name)?.({preventDefault(){}}); }
  replaceChildren(...nodes) { this.textContent = nodes.map(n=>typeof n==='string'?n:n.textContent??'').join(''); }
  toggleAttribute() {} removeAttribute() {} focus() {} showModal() {} close() {} play() { return Promise.resolve(); }
}
async function app(connectImpl, onClient = () => {}) {
  const nodes = new Map();
  const el = id => { if (!nodes.has(id)) nodes.set(id,new Element()); return nodes.get(id); };
  const videoTrack = {addEventListener(){},stop(){},readyState:'live'};
  const cameraStream = { getTracks:()=>[videoTrack],getVideoTracks:()=>[videoTrack] };
  const context = vm.createContext({
    testClient:{realtime:{connect:connectImpl}}, onClient,
    document:{getElementById:el,querySelector:()=>el('stage'),createElement:()=>new Element(),createTextNode:s=>s},
    window:{addEventListener(){}},navigator:{mediaDevices:{getUserMedia:async()=>cameraStream}},
    URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
    createImageBitmap:async()=>({close(){}}), DOMException, Error, console,
    setInterval:()=>1,clearInterval(){},queueMicrotask,
  });
  vm.runInContext(bundle.outputFiles[0].text,context);
  el('api-key').value='test-only-key';
  await el('settings-form').fire('submit');
  el('file').files=[{name:'outfit.png',type:'image/png',size:100}];
  await el('file').fire('change');
  await new Promise(setImmediate);
  await el('start').fire('click');
  await new Promise(setImmediate);
  return {el};
}

test('disconnect-before-rejection preserves the actual plain-object SDK error', async()=> {
  const {el}=await app(async(_,options)=> {
    options.onConnectionChange('connecting');
    options.onConnectionChange('disconnected');
    throw {code:'INVALID_API_KEY',message:'Unauthorized test-only-key'};
  });
  assert.match(el('message').textContent,/Decart rejected this API key/);
  assert.match(el('message').textContent,/Unauthorized/);
  assert.doesNotMatch(el('message').textContent,/test-only-key/);
  assert.equal(el('connection-feedback').hidden,false);
  assert.equal(el('start').disabled,false);
});
test('insufficient credits are actionable and visible',async()=> {
  const {el}=await app(async(_,options)=>{
    options.onConnectionChange('disconnected');
    throw {code:'WEBRTC_SERVER_ERROR',message:'Insufficient credits'};
  });
  assert.match(el('message').textContent,/available API credits/);
  assert.equal(el('connection-feedback').hidden,false);
});
test('successful connection stays active and applies new clothing',async()=> {
  let imageUpdates=0;
  const active={isConnected:()=>true,on(){},disconnect(){},setImage:async()=>{imageUpdates++;}};
  const {el}=await app(async(_,options)=>{
    assert.equal(options.initialState,undefined);
    assert.equal(imageUpdates,0);
    options.onConnectionChange('connected');
    return active;
  });
  assert.equal(el('start').hidden,true);
  assert.equal(el('stop').hidden,false);
  assert.equal(el('connection-feedback').hidden,true);
  await el('apply').fire('click');
  assert.equal(imageUpdates,2);
});
test('live error emitted after disconnect is retained instead of generic reset',async()=> {
  const listeners=new Map();
  let options;
  const active={isConnected:()=>true,on:(name,fn)=>listeners.set(name,fn),disconnect(){},setImage:async()=>{}};
  const {el}=await app(async(_,o)=>{options=o;return active;});
  options.onConnectionChange('disconnected');
  listeners.get('error')({code:'WEBRTC_SERVER_ERROR',message:'Payment balance exhausted'});
  await new Promise(setImmediate);
  assert.match(el('message').textContent,/available API credits/);
  assert.equal(el('connection-feedback').hidden,false);
});

test('stale error retains the actual provider session-limit refusal',async()=> {
  let logger;
  const {el}=await app(async(_,options)=>{
    logger.warn('realtime session ended by the server; not reconnecting',{reason:'session_limit'});
    options.onConnectionChange('disconnected');
    throw new Error('Stale connect attempt');
  },options=>{logger=options.logger;});
  assert.match(el('message').textContent,/session limit reached/);
  assert.doesNotMatch(el('message').textContent,/Stale connect attempt/);
});
test('stale error retains a provider policy refusal without claiming success',async()=> {
  let logger;
  const {el}=await app(async()=>{
    logger.warn('realtime session ended by the server; not reconnecting',{reason:'policy_violation'});
    throw new Error('Stale connect attempt');
  },options=>{logger=options.logger;});
  assert.match(el('message').textContent,/policy_violation/);
  assert.equal(el('start').hidden,false);
});
test('rejected outfit after connection is displayed and ends the session',async()=> {
  let disconnected=false;
  const active={isConnected:()=>true,on(){},disconnect(){disconnected=true;},setImage:async()=>{throw {code:'INVALID_INPUT',message:'Invalid garment image'};}};
  const {el}=await app(async()=>active);
  assert.equal(disconnected,true);
  assert.match(el('message').textContent,/Invalid garment image/);
  assert.equal(el('start').disabled,false);
  assert.equal(el('connection-feedback').hidden,false);
});
