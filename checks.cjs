const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const element=()=>({innerHTML:'',style:{},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},close(){}});
const els=new Map();const document={querySelector:s=>{if(!els.has(s))els.set(s,element());return els.get(s)},querySelectorAll:()=>[],addEventListener(){}};
let saved=null;
const context=vm.createContext({document,crypto:require('node:crypto').webcrypto,localStorage:{getItem:()=>JSON.stringify({trips:[]}),setItem:(k,v)=>{saved=v}},navigator:{onLine:true},window:{addEventListener(){}},structuredClone,setTimeout:()=>0,clearTimeout(){},console});
vm.runInContext(fs.readFileSync('dist/example-plan.js','utf8'),context);
vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
vm.runInContext(fs.readFileSync('dist/ai.js','utf8'),context);
const run=s=>vm.runInContext(s,context);
// Directions preserve both addresses and select an appropriate supported mode.
for(const [mode,expected] of Object.entries({walk:'walking',bicycle:'bicycling',car:'driving',taxi:'driving',bus:'transit',train:'transit',ferry:'transit'})){
  context.mapStep={mode,from:'Airport & station, Brisbane',to:'2–14 Cliff Road, Wollongong'};
  const target=run('mapTarget(mapStep)'),url=new URL(target.url);
  assert.equal(url.pathname,'/maps/dir/');assert.equal(url.searchParams.get('origin'),context.mapStep.from);assert.equal(url.searchParams.get('destination'),context.mapStep.to);assert.equal(url.searchParams.get('travelmode'),expected);assert.equal(url.searchParams.get('api'),'1');
}
for(const item of [{mode:'walk',to:'Wollongong Station'},{mode:'flight',from:'Brisbane Airport',to:'Sydney Airport'},{mode:'other',from:'Hotel',to:'Event room'},{mode:'walk',from:'Same hotel',to:'Same hotel'}]){
  context.mapStep=item;const target=run('mapTarget(mapStep)');assert.equal(new URL(target.url).pathname,'/maps/search/');assert.equal(new URL(target.url).searchParams.get('query'),item.to);
}
run('example()');assert.equal(JSON.parse(saved).trips[0].steps.length,32);
run('mutate(ts=>ts[0].steps[0].done=true)');assert.equal(JSON.parse(saved).trips[0].steps[0].done,true);
run('move(trip().steps[1].id,-1)');assert.equal(JSON.parse(saved).trips[0].steps[0].mode,'taxi');
run('actions.duplicate(active)');assert.equal(JSON.parse(saved).trips.length,2);assert.equal(JSON.parse(saved).trips[0].steps.some(s=>s.done),false);
run('actions.archive()');assert.equal(JSON.parse(saved).trips[1].archived,true);
assert.equal(run('validate(JSON.parse(JSON.stringify({trips}))).length'),2);
assert.throws(()=>run('validate({trips:[{title:"Broken",steps:[null]}]})'));
context.unsafe='<script>"&';assert.equal(run('esc(unsafe)'),'&lt;script&gt;&quot;&amp;');
// AI imports are previewed separately, never write during parsing, and start unchecked.
const beforeAI=saved;
context.aiJSON=JSON.stringify({title:'AI journey',start:'2026-11-05',steps:[{title:'Catch the train',mode:'train',departure:'2026-11-05T09:30',done:true}]});
assert.equal(run('parseAIPlan(aiJSON)[0].steps[0].done'),false);
assert.equal(saved,beforeAI);
context.fenced='```json\n'+context.aiJSON+'\n```';assert.equal(run('parseAIPlan(fenced).length'),1);
context.mobilePaste='Here is your itinerary.\r\n```json\r\n\u200b{“title”:\u00a0“Brisbane trip”,“steps”:[{“title”:“Take the train”,"notes":"Keep “this text” and a\u00a0space."}]}\r\n```\r\nSafe travels!';
assert.equal(run('parseAIPlan(mobilePaste)[0].title'),'Brisbane trip');
assert.equal(run('parseAIPlan(mobilePaste)[0].steps[0].notes'),'Keep “this text” and a\u00a0space.');
context.incomplete=context.aiJSON.slice(0,-2);
assert.throws(()=>run('parseAIPlan(incomplete)'),/Copy code/);
context.ambiguous=context.fenced+'\n\n'+context.fenced;
assert.throws(()=>run('parseAIPlan(ambiguous)'),/Copy code/);
context.wrapper=JSON.stringify({trips:[JSON.parse(context.aiJSON)]});assert.equal(run('parseAIPlan(wrapper)[0].title'),'AI journey');
for(const bad of ['{}','{"title":"Missing steps","steps":[]}',JSON.stringify({title:'Bad mode',steps:[{title:'Go',mode:'spaceship'}]}),JSON.stringify({title:'Bad date',start:'2026-02-30',steps:[{title:'Go'}]}),JSON.stringify({title:'Bad time',steps:[{title:'Go',departure:'2026-11-05T29:00'}]})]){context.bad=bad;assert.throws(()=>run('parseAIPlan(bad)'))}
assert.equal(run('validate({trips:[{title:"Old trip",color:"#dce6d0",steps:[]} ]})[0].color'),'#dbeafe');
const beforeMove=saved;assert.equal(run('move("missing",-1)'),false);assert.equal(saved,beforeMove);
assert.equal(run('move(trip().steps[0].id,-1)'),false);
const position=run('trip().steps[0].id');context.position=position;run('move(position,1)');assert.equal(run('trip().steps[1].id'),position);run('move(position,-1)');assert.equal(run('trip().steps[0].id'),position);
assert.equal(run('planningPrompt({origin:"Brisbane",destination:"Wollongong"}).includes("Never invent")'),true);
// Both prompt variants retain the same importable JSON contract.
for(const planningMode of ['standard','project']){
  context.promptOptions={planningMode,projectContext:'Use the latest confirmed tickets.'};
  const prompt=run('planningPrompt(promptOptions)');
  context.promptJSON=prompt.slice(prompt.indexOf('\n{')+1);
  assert.equal(run('parseAIPlan(promptJSON)[0].steps.length'),1);
  assert.equal(prompt.includes('PROJECT-BASED PLANNING'),planningMode==='project');
}
// Appending keeps the original route, retains AI assumptions and cannot double-add.
const oldLength=run('trip().steps.length'),oldFirst=run('trip().steps[0].id');
run('aiState.plans=parseAIPlan(aiJSON);aiState.target=active;editor.querySelector=()=>({value:"current"});actions["ai-add"]()');
assert.equal(run('trip().steps.length'),oldLength+1);assert.equal(run('trip().steps[0].id'),oldFirst);assert.equal(run('trip().notes.includes("AI-assisted draft")'),true);
run('actions["ai-add"]()');assert.equal(run('trip().steps.length'),oldLength+1);
// Deletion waits for confirmation and removes only the chosen step.
const beforeDelete=saved,deleteLength=run('trip().steps.length'),keepId=run('trip().steps[1].id');
run('let deleteConfirmation;showDialog=(title,body,handler)=>{deleteConfirmation=handler};actions["delete-step"](trip().steps[0].id)');
assert.equal(saved,beforeDelete);run('deleteConfirmation()');assert.equal(run('trip().steps.length'),deleteLength-1);assert.equal(run('trip().steps[0].id'),keepId);
const before=saved;run('localStorage.setItem=()=>{throw Error("full")}; mutate(ts=>ts.length=0)');assert.equal(saved,before);assert.equal(run('trips.length'),2);
console.log('Passed: persistence, completion, bidirectional ordering, duplication, archive, AI parsing, fenced JSON, validation, colour migration, escaping and failed-save recovery.');
// A deleted sample stays deleted; existing libraries are not modified on startup.
function boot(raw){let output=raw;const c=vm.createContext({document,crypto:require('node:crypto').webcrypto,localStorage:{getItem:()=>raw,setItem:(k,v)=>output=v},navigator:{onLine:true},window:{addEventListener(){}},structuredClone,setTimeout:()=>0,clearTimeout(){},console});for(const f of ['example-plan.js','app.js'])vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c);return {data:JSON.parse(output),c}}
const fresh=boot(null);assert.equal(fresh.data.trips.length,1);assert.equal(fresh.data.trips[0].steps.length,32);assert.equal(fresh.data.trips[0].example,true);assert.equal(vm.runInContext('active',fresh.c),null);
assert.equal(boot(JSON.stringify(fresh.data)).data.trips.length,1);
assert.equal(boot(JSON.stringify({trips:[]})).data.trips.length,0);
assert.equal(fresh.data.trips[0].steps.every(s=>!s.done&&(!s.booking||s.booking==='DEMO-ONLY')),true);
console.log('Passed: automatic demo on first visit, no duplicate reseeding, deletion persistence and demo booking placeholders.');
