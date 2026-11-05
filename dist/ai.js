/* A portable AI handoff: the user chooses their LLM; no keys or API calls. */
let aiState={planningMode:'standard',projectContext:'',origin:'',destination:'',start:'',preferences:'',prompt:'',output:'',plans:[],target:null};

function planningPrompt(values){
  const project=values.planningMode==='project';
  return `Plan a practical, step-by-step journey for Waystep, a travel checklist app.
From: ${values.origin || (project?'Find the starting location in the project materials; ask if unclear.':'Ask me for the starting location')}
To: ${values.destination || (project?'Find the destination in the project materials; ask if unclear.':'Ask me for the destination')}
Travel date: ${values.start || (project?'Use confirmed travel dates in the project materials; ask if unclear.':'Not decided; leave date/time fields empty')}
Preferences: ${values.preferences || 'Practical connections with enough transfer time.'}

${project?`PROJECT-BASED PLANNING
I am sending this prompt inside an existing AI project where I have gathered my travel information. Use the project files, instructions and relevant previous conversations that are actually available to you. Do not claim to have read inaccessible files or chats; tell me what is missing and ask me to provide it.
Project guidance / documents to prioritise: ${values.projectContext || 'Review all relevant available travel materials for this journey.'}

1. Review booking confirmations, tickets, accommodation details, event schedules, maps, travel requirements and my stated preferences. Extract confirmed dates, local times, exact addresses, operators, route/flight numbers, booking references, terminals/platforms when confirmed, check-in/check-out deadlines and required arrival times.
2. Reconcile the materials before planning. Identify conflicting dates, missing connections, superseded or cancelled bookings and tentative alternatives. Prefer the latest confirmed booking when clearly documented, preserve my booked arrangements and ask about unresolved critical conflicts. Do not silently choose between conflicting confirmations.
3. Build the full chronological journey: starting location, every connection and intermediate stop, airport/station transfers, accommodation, events and final destination. Include return or multi-day legs when supported by the project and within the trip scope. Add practical walking legs, check-in/security/baggage tasks, transfer buffers and access instructions where relevant. Label estimated transfer durations or suggested services as estimates or suggestions in notes; never present them as confirmed bookings.
4. For confirmed details, put a concise source reference in the relevant step notes (document filename, page/section or booking message date). Distinguish confirmed facts, estimates and outstanding checks. Include only booking details needed for the journey; omit unrelated personal data. Put unresolved non-critical items and a short source overview in trip notes.
5. If an essential starting point, destination, travel date or booking conflict cannot be resolved from the materials, ask focused questions first. After clarification, produce the final plan in the JSON format below. If useful documents are unavailable, request them rather than inventing their contents.

`:''}Include intermediate destinations, street/station/airport addresses, walking transfers and the final destination. Include transport, operator/service numbers, departure/arrival details and useful notes when known. Research current official transport sources if you can browse. Never invent services, prices, platform numbers, exact addresses or timetables: leave uncertain fields empty and explain what to check in notes. Do not invent booking references. Use each location's local time, and mention timezone changes in notes. Do not mark anything completed. Put source URLs in notes when available. This is a draft for me to review, not a booking.

Return ONLY one JSON object in the following format, with as many ordered steps as needed. Empty strings are allowed for unknown optional fields. Use YYYY-MM-DD for dates and YYYY-MM-DDTHH:mm (no timezone suffix) for local departure/arrival times.
Transport mode must be one of: walk, bicycle, car, taxi, bus, train, ferry, flight, other.
{
  "title": "Origin → Destination",
  "start": "",
  "end": "",
  "notes": "Draft itinerary. Assumptions and things to confirm.",
  "steps": [
    {
      "title": "A clear action for this part of the journey",
      "mode": "train",
      "from": "Starting location/address",
      "to": "Destination/address",
      "service": "",
      "departure": "",
      "arrival": "",
      "booking": "",
      "notes": ""
    }
  ]
}`;
}

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

function openAIPlanner(reset=true){
  if(reset){const t=trip();aiState={planningMode:'standard',projectContext:'',origin:'',destination:t?.title||'',start:t?.start||'',preferences:t?.notes||'',prompt:'',output:'',plans:[],target:t?.id||null}}
  showDialog('Let AI do the first draft',`<form><div class="ai-intro"><span class="ai-orb" aria-hidden="true">✦</span><p>Describe your journey once. Get a detailed plan from your favourite AI, then make it yours.</p></div><div class="flow-steps"><b>1 Describe</b><span>2 Ask your AI</span><span>3 Review & add</span></div><div class="fields"><label class="field full">Where will you plan?<select name="planningMode" id="ai-planning-mode"><option value="standard" ${aiState.planningMode!=='project'?'selected':''}>Start a new AI plan</option><option value="project" ${aiState.planningMode==='project'?'selected':''}>Use my existing AI project</option></select></label><div class="field full project-guidance" id="ai-project-guidance" ${aiState.planningMode==='project'?'':'hidden'}><p class="form-help">Paste the generated prompt inside your AI project containing your bookings, documents and earlier planning. Waystep does not connect to or read the project. Leave route fields blank if your project already contains them.</p><label class="field">Project guidance (optional)<textarea name="projectContext" maxlength="5000" placeholder="e.g. Use my flight tickets and hotel confirmations. Follow the latest itinerary. Include the return journey.">${esc(aiState.projectContext)}</textarea></label></div>${field('Starting location','origin',aiState.origin,'text',false,'required maxlength="1000" placeholder="e.g. Brisbane, Queensland"')}${field('Destination','destination',aiState.destination,'text',false,'required maxlength="1000" placeholder="e.g. Wollongong, NSW"')}${field('Travel date (optional)','start',aiState.start,'date',true)}<label class="field full">Preferences & stops along the way<textarea name="preferences" maxlength="5000" placeholder="e.g. Prefer trains, avoid early departures, visit Sydney on the way…">${esc(aiState.preferences)}</textarea></label></div><div class="form-footer"><button type="button" class="btn" data-action="ai-paste">I already have an AI plan</button><button class="btn primary" type="submit">Create planning prompt →</button></div><p class="form-help">Uses ChatGPT or any other LLM through copy and paste. No API key required.</p></form>`,f=>{
    Object.assign(aiState,Object.fromEntries(f));aiState.prompt=planningPrompt(aiState);showAIPrompt();
  });
  const mode=editor.querySelector('#ai-planning-mode');
  const updateMode=()=>{
    const project=mode.value==='project';
    editor.querySelector('#ai-project-guidance').hidden=!project;
    for(const name of ['origin','destination'])editor.querySelector(`[name="${name}"]`).required=!project;
  };
  mode.onchange=updateMode;updateMode();
}

function showAIPrompt(){
  showDialog(aiState.planningMode==='project'?'Use this inside your AI project':'Ask your favourite AI',`<div class="ai-body"><div class="flow-steps"><span>1 Describe</span><b>2 Ask your AI</b><span>3 Review & add</span></div><p class="sub">${aiState.planningMode==='project'?'Open your existing project in ChatGPT or another AI app, then paste this prompt into a chat inside that project. The AI will use the project materials it can access.':'Copy this prompt, paste it into ChatGPT or another LLM, and ask it to plan your journey.'}</p><label class="field" style="margin-top:20px">Your planning prompt<textarea id="ai-prompt" class="code-input" rows="8" readonly>${esc(aiState.prompt)}</textarea></label><div class="actions" style="margin-top:14px"><button class="btn primary" data-action="ai-copy">Copy prompt</button><a class="btn" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT ↗</a></div><p class="form-help">Nothing is sent automatically. Share only the travel details you want your chosen AI to see.</p><div class="form-footer"><button class="btn" data-action="ai-describe">← Back</button><button class="btn primary" data-action="ai-paste">I have the plan →</button></div></div>`,null);
}

function showAIPaste(){
  showDialog('Bring your plan into Waystep',`<form><div class="flow-steps"><span>1 Describe</span><span>2 Ask your AI</span><b>3 Review & add</b></div><p class="editor-intro">Paste the JSON plan returned by your AI, or load its JSON file. You’ll review it before anything is added.</p><label class="field">AI-generated plan<textarea name="plan" id="ai-output" autocapitalize="none" autocorrect="off" spellcheck="false" class="code-input" rows="10" required placeholder='{"title":"Brisbane → Wollongong","steps":[…]}'>${esc(aiState.output)}</textarea></label><div class="actions" style="margin-top:12px"><label class="btn file-label">Load JSON file<input type="file" id="ai-file" accept="application/json,.json" hidden></label><button class="btn" type="button" data-action="ai-example">Try a sample plan</button></div><p id="ai-error" class="form-error" role="alert"></p><div class="form-footer"><button class="btn" type="button" data-action="ai-describe">← Back</button><button class="btn primary" type="submit">Preview plan →</button></div></form>`,f=>{
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
  'ai-plan':()=>openAIPlanner(),
  'ai-describe':()=>openAIPlanner(false),
  'ai-paste':()=>showAIPaste(),
  'ai-copy':async()=>{
    const input=editor.querySelector('#ai-prompt');input?.select();
    try{
      await Promise.race([navigator.clipboard.writeText(aiState.prompt),new Promise((_,reject)=>setTimeout(()=>reject(Error('Clipboard unavailable')),1500))]);
      toast('Prompt copied. Paste it into your favourite AI.');
    }catch{toast('Prompt selected. Use Copy or Ctrl/Cmd+C to copy it.');}
  },
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
