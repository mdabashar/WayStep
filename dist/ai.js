/* A portable AI handoff: the user chooses their LLM; no keys or API calls. */
let aiState={output:'',plans:[],target:null};

function normalizePlanJSON(input){
  // Match complete strings first, so formatting inside valid strings is preserved.
  return input.replace(/"(?:\\[\s\S]|[^"\\])*"|“(?:\\[\s\S]|[^”\\])*”|[\u00a0\u202f\u200b\u2060\ufeff]/g,token=>{
    if(token.startsWith('"'))return token;
    if(token.startsWith('“')){
      const content=token.slice(1,-1).replace(/\\[\s\S]|"/g,char=>char==='"'?'\\"':char);
      return `"${content}"`;
    }
    return token==='\u00a0'||token==='\u202f'?' ':'';
  });
}

function parseAIPlan(raw){
  if(typeof raw!=='string'||raw.length>1000000)throw Error('Paste a plan smaller than 1 MB.');
  const text=raw.trim();
  const blocks=[...text.matchAll(/^[ \t]*```(?:json)?[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*\r?$/gim)];
  const input=blocks.length===1?blocks[0][1]:text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  let data;
  try{data=JSON.parse(normalizePlanJSON(input))}catch{throw Error('Waystep couldn’t read the JSON plan. Use Copy code on the full JSON block in your AI app, or choose Load JSON file.');}
  const items=Array.isArray(data?.trips)?data.trips:[data];
  if(!items.length||items.length>20)throw Error('Include between 1 and 20 trips.');
  const validDate=v=>{
    if(v===undefined||v===null||v==='')return true;
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
    const d=new Date(v+'T12:00:00Z');
    return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===v;
  };
  for(const t of items){
    if(!t||typeof t.title!=='string'||!t.title.trim())throw Error('Each trip needs a title.');
    if(!validDate(t.start)||!validDate(t.end))throw Error('Trip dates must use YYYY-MM-DD, or be empty.');
    if(t.start&&t.end&&t.end<t.start)throw Error('The trip end date is before its start date.');
    if(!Array.isArray(t.steps)||!t.steps.length||t.steps.length>200)throw Error('Each trip needs between 1 and 200 travel steps.');
    for(const step of t.steps){
      if(!step||typeof step.title!=='string'||!step.title.trim())throw Error('Every travel step needs a title.');
      if(step.mode&&!Object.hasOwn(modes,step.mode))throw Error(`Unknown transport mode "${String(step.mode).slice(0,40)}". Use walk, bicycle, car, taxi, bus, train, ferry, flight or other.`);
      for(const key of ['departure','arrival'])if(step[key]&&!(typeof step[key]==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(step[key])&&validDate(step[key].slice(0,10))&&+step[key].slice(11,13)<24&&+step[key].slice(14,16)<60))throw Error('Step times must use local YYYY-MM-DDTHH:mm, or be empty.');
    }
  }
  const clean=validate({trips:items});
  clean.forEach(t=>{t.example=false;t.archived=false;t.notes=[t.notes,'AI-assisted draft — verify services, addresses and times before travelling.'].filter(Boolean).join('\n');t.steps.forEach(s=>s.done=false)});
  return clean;
}

function openAIOptions(reset=true){
  if(reset){const t=trip();aiState={output:'',plans:[],target:t?.id||null}}
  showDialog('Plan with AI',`<div class="help-content">
    <p>Connect a compatible AI app to send trip drafts directly to Waystep.</p>
    <button class="btn primary" data-action="mcp-info">Connect an AI app</button>
    <p>Already have an itinerary as JSON? Paste it or load the file to preview it.</p>
    <button class="btn" data-action="ai-paste">Import an existing plan</button>
  </div>`,null);
}

function showAIPaste(){
  showDialog('Import an existing plan',`<form><p class="editor-intro">Paste the JSON plan returned by your AI, or load its JSON file. You’ll review it before anything is added.</p><label class="field">AI-generated plan<textarea name="plan" id="ai-output" autocapitalize="none" autocorrect="off" spellcheck="false" class="code-input" rows="10" required placeholder='{"title":"Brisbane → Wollongong","steps":[…]}'>${esc(aiState.output)}</textarea></label><div class="actions" style="margin-top:12px"><label class="btn file-label">Load JSON file<input type="file" id="ai-file" accept="application/json,.json" hidden></label><button class="btn" type="button" data-action="ai-example">Try a sample plan</button></div><p id="ai-error" class="form-error" role="alert"></p><div class="form-footer"><button class="btn" type="button" data-action="ai-options">← Back</button><button class="btn primary" type="submit">Preview plan →</button></div></form>`,f=>{
    aiState.output=f.get('plan');
    try{aiState.plans=parseAIPlan(aiState.output);showAIReview()}catch(err){editor.querySelector('#ai-error').textContent=err.message}
  });
  editor.querySelector('#ai-file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>1000000)throw Error('Choose a JSON file smaller than 1 MB.');const value=await file.text();aiState.output=value;editor.querySelector('#ai-output').value=value;editor.querySelector('#ai-error').textContent=''}catch(err){editor.querySelector('#ai-error').textContent=err.message}
    e.target.value='';
  };
}

function showAIReview(){
  const plans=aiState.plans,existing=trips.find(t=>t.id===aiState.target);
  const total=plans.reduce((n,t)=>n+t.steps.length,0);
  showDialog('Your journey, ready to personalise',`<div class="ai-body"><p class="ai-notice">✦ AI draft · Check services, addresses and times before travelling. Every step can be edited after adding.</p>${plans.map(t=>`<section class="ai-preview"><h3>${esc(t.title)}</h3><p class="sub">${t.steps.length} travel step${t.steps.length===1?'':'s'} · ${esc(dates(t))}</p><ol>${t.steps.map(s=>`<li><strong>${esc(s.title)}</strong><span>${modes[s.mode]}${s.to?' · '+esc(s.to):''}</span>${s.service?`<span>${esc(s.service)}</span>`:''}</li>`).join('')}</ol><details class="ai-notes"><summary>Trip notes & assumptions</summary><p>${esc(t.notes)}</p></details></section>`).join('')}${existing&&plans.length===1?`<label class="field">Add this plan to<select id="ai-target"><option value="current">Append steps to ${esc(existing.title)}</option><option value="new">Create a new trip</option></select></label><p class="form-help">Your existing steps will be kept.</p>`:''}<div class="form-footer"><button class="btn" data-action="ai-paste">← Edit pasted plan</button><button class="btn primary" data-action="ai-add">Add ${total} step${total===1?'':'s'} to Waystep</button></div></div>`,null);
}

Object.assign(actions,{
  'ai-plan':()=>openAIOptions(),
  'ai-options':()=>openAIOptions(false),
  'ai-paste':()=>showAIPaste(),
  'ai-example':()=>{aiState.output=JSON.stringify({title:'Brisbane → Wollongong · Sample',notes:'Illustrative route only. Ask your AI to check a real itinerary for your travel date.',steps:[{title:'Travel to Brisbane Airport',mode:'taxi',to:'Brisbane Airport, Queensland',notes:'Enter your pickup location and allow check-in time.'},{title:'Fly to Sydney',mode:'flight',from:'Brisbane Airport',to:'Sydney Airport',notes:'Choose a flight and confirm terminals and times.'},{title:'Continue to Wollongong',mode:'train',from:'Sydney Airport',to:'Wollongong Station, NSW',notes:'Confirm current services, transfers and fares with the transport operator.'}]},null,2);showAIPaste()},
  'ai-add':()=>{
    if(!aiState.plans.length)return;
    const selector=editor.querySelector('#ai-target'),target=selector?.value==='current'?aiState.target:null;
    const plans=structuredClone(aiState.plans);
    if(target&&!trips.some(t=>t.id===target)){toast('The destination trip is no longer available.');return}
    if(mutate(ts=>{if(target){const t=ts.find(t=>t.id===target);t.steps.push(...plans[0].steps);t.notes=[t.notes,`Added AI plan: ${plans[0].title}\n${plans[0].notes}`].filter(Boolean).join('\n\n')}else ts.unshift(...plans)})){
      active=target||plans[0].id;filter='active';hideDone=false;query='';editor.close();render();toast('Plan added. Edit any step to make it yours.');aiState.plans=[];
    }
  }
});
