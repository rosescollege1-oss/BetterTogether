const STORAGE_KEY = "betterTogether.v1";

const defaultData = {
  people: {
    rose: {
      goals: [
        { id:"wake8", name:"Up by 8 every weekday", type:"days_per_week", target:5, input:"checkbox", weekdayOnly:true, active:true },
        { id:"social", name:"Less than 3 hours social media per week", type:"max_weekly", target:180, input:"number", unit:"minutes", active:true },
        { id:"eatout", name:"Eating out max once per week", type:"max_weekly", target:1, input:"checkbox_count", unit:"time", active:true },
        { id:"workout", name:"Work out 5 days per week", type:"days_per_week", target:5, input:"checkbox", active:true },
        { id:"dogs", name:"Train dogs 5 days per week", type:"days_per_week", target:5, input:"checkbox", active:true },
        { id:"bible", name:"Bible study 5 days per week", type:"days_per_week", target:5, input:"checkbox", active:true },
        { id:"wineonly", name:"Only alcohol allowed is wine", type:"daily_checkbox", target:1, input:"checkbox", active:true },
        { id:"todos75", name:"75% of to-do list finished every day", type:"daily_percentage", target:75, input:"todo_percentage", active:true }
      ],
      checkins: {}, moods: {}, todos: {}
    },
    adrian: { goals: [], checkins:{}, moods:{}, todos:{} }
  },
  events: []
};

let data = loadData();
let activeDates = { rose: todayKey(), adrian: todayKey() };
let calendarCursor = new Date();
calendarCursor.setDate(1);
let viewWeekOffset = 0;
let draggedGoal = null;

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function uid(prefix="id"){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

function todayKey(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function parseLocalDate(key){ const [y,m,d]=key.split("-").map(Number); return new Date(y,m-1,d); }
function fmtDate(key, opts={weekday:"long",month:"long",day:"numeric"}){ return parseLocalDate(key).toLocaleDateString(undefined,opts); }
function startOfWeek(d=new Date()){
  const x=new Date(d); const day=x.getDay(); const diff=day===0?-6:1-day;
  x.setDate(x.getDate()+diff); x.setHours(0,0,0,0); return x;
}
function weekDates(d=new Date()){
  const s=startOfWeek(d);
  return Array.from({length:7},(_,i)=>{ const x=new Date(s); x.setDate(s.getDate()+i); return todayKey(x); });
}
function viewedWeekDate(){ const d=new Date(); d.setDate(d.getDate()+(viewWeekOffset*7)); return d; }
function viewedWeekDates(){ return weekDates(viewedWeekDate()); }
function isPastOrToday(dateKey){ return dateKey <= todayKey(); }

function loadData(){
  const raw=localStorage.getItem(STORAGE_KEY);
  let loaded;
  try{ loaded=raw?JSON.parse(raw):clone(defaultData); }catch{ loaded=clone(defaultData); }
  const merged={
    ...clone(defaultData), ...loaded,
    people:{
      rose:{...clone(defaultData.people.rose), ...(loaded.people?.rose||{})},
      adrian:{...clone(defaultData.people.adrian), ...(loaded.people?.adrian||{})}
    },
    events:loaded.events||[]
  };
  ["rose","adrian"].forEach(person=>{
    merged.people[person].goals=(merged.people[person].goals||[]).map(g=>({active:true,...g}));
  });
  const wake=merged.people.rose.goals.find(g=>g.id==="wake8");
  if(wake){
    wake.input="checkbox"; wake.weekdayOnly=true; wake.type="days_per_week"; wake.target=5; wake.active=wake.active!==false;
    Object.values(merged.people.rose.checkins||{}).forEach(c=>{
      if(typeof c.wake8==="string") c.wake8=c.wake8!=="" && c.wake8<="08:00";
    });
  }
  return merged;
}
function persistLocal(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); }

const BACKEND_URL_KEY="betterTogether.backendUrl";
const ACCESS_CODE_KEY="betterTogether.accessCode";
const CLIENT_ID_KEY="betterTogether.clientId";
const PENDING_KEY="betterTogether.pendingMutations";
const FRESH_SHARED_KEY="betterTogether.freshSharedV4";
let backendUrl=localStorage.getItem(BACKEND_URL_KEY)||"";
let accessCode=localStorage.getItem(ACCESS_CODE_KEY)||"";
let clientId=localStorage.getItem(CLIENT_ID_KEY)||uid("client");
localStorage.setItem(CLIENT_ID_KEY,clientId);
let pendingMutations=[];
try{ pendingMutations=JSON.parse(localStorage.getItem(PENDING_KEY)||"[]"); }catch{ pendingMutations=[]; }
// Clean restart: on the first load of this version, forget the old failed sync
// connection and mutation queue. The visual app stays the same; only the shared
// data connection starts fresh.
if(localStorage.getItem(FRESH_SHARED_KEY)!=="1"){
  backendUrl=""; accessCode=""; pendingMutations=[];
  localStorage.removeItem(BACKEND_URL_KEY);
  localStorage.removeItem(ACCESS_CODE_KEY);
  localStorage.removeItem(PENDING_KEY);
}
let bridgeReady=false, syncBusy=false, syncPollTimer=null, lastSyncAt=null, lastSyncError='';

function normalizeSharedState(incoming){
  const loaded=incoming||{};
  const merged={
    ...clone(defaultData),...loaded,
    people:{
      rose:{...clone(defaultData.people.rose),...(loaded.people?.rose||{})},
      adrian:{...clone(defaultData.people.adrian),...(loaded.people?.adrian||{})}
    },
    events:loaded.events||[],
    meta:{...(loaded.meta||{})}
  };
  ["rose","adrian"].forEach(person=>{
    merged.people[person].goals=(merged.people[person].goals||[]).map(g=>({active:true,...g}));
    merged.people[person].checkins=merged.people[person].checkins||{};
    merged.people[person].moods=merged.people[person].moods||{};
    merged.people[person].todos=merged.people[person].todos||{};
  });
  const wake=merged.people.rose.goals.find(g=>g.id==="wake8");
  if(wake){
    wake.input="checkbox"; wake.weekdayOnly=true; wake.type="days_per_week"; wake.target=5; wake.active=wake.active!==false;
    Object.values(merged.people.rose.checkins||{}).forEach(c=>{ if(typeof c.wake8==="string") c.wake8=c.wake8!==""&&c.wake8<="08:00"; });
  }
  merged.events=merged.events.map(ev=>({exceptions:[],overrides:{},...ev,recurrence:ev.recurrence||null}));
  return merged;
}

function savePending(){ localStorage.setItem(PENDING_KEY,JSON.stringify(pendingMutations)); }
function friendlySyncError(err){
  const raw=String(err?.message||err||"Unknown sync error");
  if(/access code/i.test(raw)) return "The access code does not match the shared sheet. Copy it again from the Settings tab.";
  if(/not been set up|spreadsheet/i.test(raw)) return "The Apps Script backend is reachable, but its shared sheet is not ready. Run setupBetterTogether in Apps Script once, then try again.";
  if(/timed out/i.test(raw)) return "The shared backend took too long to answer. Try Connect & sync again.";
  if(/could not reach|failed to load/i.test(raw)) return "Could not reach the shared Apps Script backend. Check the /exec URL and deployment access.";
  return raw;
}
function setSyncStatus(mode,text,detailOverride=""){
  const btn=document.getElementById("syncStatusBtn"), label=document.getElementById("syncStatusText"), detail=document.getElementById("syncDetail");
  if(!btn||!label) return;
  btn.className=`sync-pill ${mode}`; label.textContent=text;
  if(detail){
    if(detailOverride) detail.textContent=detailOverride;
    else if(mode==="connected") detail.textContent=`Connected${lastSyncAt?` · last synced ${lastSyncAt.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`:""}${pendingMutations.length?` · ${pendingMutations.length} waiting`:""}.`;
    else if(mode==="syncing") detail.textContent="Syncing this phone with the shared copy…";
    else if(mode==="waiting") detail.textContent=`Saved on this phone. ${pendingMutations.length||1} change${pendingMutations.length===1?" is":"s are"} waiting to sync.`;
    else if(mode==="error") detail.textContent=lastSyncError||"Could not reach the shared copy.";
    else detail.textContent="Not connected yet. This phone is saving locally only.";
  }
}
function showSyncError(err){
  lastSyncError=friendlySyncError(err);
  console.warn("Better Together sync:",err);
  setSyncStatus(navigator.onLine?"error":"waiting",navigator.onLine?"Sync needs attention":"Waiting to sync",lastSyncError);
}
function queueMutation(mutation){
  if(!mutation) return;
  pendingMutations.push({id:uid("mut"),createdAt:new Date().toISOString(),...mutation});
  savePending();
}
function saveData(mutation=null){
  persistLocal();
  if(mutation) queueMutation(mutation);
  renderAll();
  if(mutation&&backendUrl&&accessCode&&bridgeReady) flushPendingMutations();
  else if(mutation&&backendUrl&&accessCode&&!bridgeReady) configureBridge();
  else if(mutation&&(!backendUrl||!accessCode)) setSyncStatus("local","Local only");
}
function adoptSharedState(state){
  data=normalizeSharedState(state);
  persistLocal(); lastSyncAt=new Date(); renderAll(); setSyncStatus("connected",pendingMutations.length?"Sync pending":"Shared ✓");
}

function teardownBridge(){ bridgeReady=false; syncBusy=false; }
function backendApiUrl(method,args,callback){
  const u=new URL(backendUrl);
  u.searchParams.set("api","1");
  u.searchParams.set("method",method);
  u.searchParams.set("args",JSON.stringify(args||[]));
  u.searchParams.set("accessCode",accessCode);
  u.searchParams.set("callback",callback);
  u.searchParams.set("v",String(Date.now()));
  return u.toString();
}
function bridgeCall(method,args=[]){
  return new Promise((resolve,reject)=>{
    if(!backendUrl||!accessCode){ reject(new Error("Shared sync is not configured.")); return; }
    const callback=`bt_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement("script");
    let settled=false;
    const timer=setTimeout(()=>finish(new Error("Shared sync timed out.")),18000);
    function cleanup(){ clearTimeout(timer); try{ delete window[callback]; }catch{} script.remove(); }
    function finish(err,value){ if(settled) return; settled=true; cleanup(); err?reject(err):resolve(value); }
    window[callback]=message=>{
      if(!message||message.ok===false) finish(new Error(message?.error||"Shared sync failed."));
      else finish(null,message.result);
    };
    try{ script.src=backendApiUrl(method,args,callback); }
    catch(err){ finish(new Error("The Apps Script URL is not valid.")); return; }
    script.onerror=()=>finish(new Error("Could not reach the shared Apps Script backend."));
    document.head.appendChild(script);
  });
}
function configureBridge(){
  teardownBridge(); lastSyncError='';
  if(!backendUrl||!accessCode){ setSyncStatus("local","Local only"); return; }
  try{ new URL(backendUrl); }catch{ showSyncError(new Error("The Apps Script URL is not valid.")); return; }
  bridgeReady=true;
  setSyncStatus("syncing","Connecting…","Checking the shared Apps Script backend…");
  connectShared();
}
async function connectShared(){
  if(syncBusy||!bridgeReady) return;
  syncBusy=true; setSyncStatus("syncing","Checking connection…","Checking the access code and shared sheet…");
  try{
    await bridgeCall("pingShared",[]);
    // Fresh connection: the shared copy wins. Old browser-only data is intentionally not imported.
    if(localStorage.getItem(FRESH_SHARED_KEY)!=="1"){
      pendingMutations=[]; savePending();
    }
    const result=await bridgeCall("getState",[-1]);
    if(result?.state) adoptSharedState(result.state);
    localStorage.setItem(FRESH_SHARED_KEY,"1");
    lastSyncError=''; startSyncPolling();
    if(syncDialog?.open) syncDialog.close();
  }catch(err){ bridgeReady=false; showSyncError(err); }
  finally{ syncBusy=false; }
  if(pendingMutations.length&&bridgeReady&&!lastSyncError) flushPendingMutations();
}
async function bootstrapShared(){ return connectShared(); }
async function flushPendingMutations(){
  if(syncBusy||!bridgeReady||!pendingMutations.length) return;
  syncBusy=true; setSyncStatus("syncing","Syncing…");
  try{
    // Send queued edits one at a time, but DO NOT replace the screen with the
    // server's state after every single edit. That was the source of the
    // "tweaking"/disappearing behavior when another edit happened mid-sync.
    while(pendingMutations.length){
      const mut=pendingMutations[0];
      await bridgeCall("applyMutation",[mut,clientId]);
      pendingMutations.shift();
      savePending();
    }

    // Once every queued local change has reached the shared copy, pull one
    // clean snapshot. If the user makes another edit while this request is in
    // flight, keep the optimistic local screen and sync that new edit first.
    const result=await bridgeCall("getState",[-1]);
    if(!pendingMutations.length && result?.state){
      data=normalizeSharedState(result.state);
      persistLocal();
    }

    lastSyncAt=new Date();
    renderAll();
    setSyncStatus("connected",pendingMutations.length?"Sync pending":"Shared ✓");
  }catch(err){
    showSyncError(err);
  }finally{
    syncBusy=false;
    // A new edit may have been queued during the final pull.
    if(pendingMutations.length&&bridgeReady&&!lastSyncError){
      setTimeout(flushPendingMutations,0);
    }
  }
}
async function pullSharedState(){
  if(syncBusy||!bridgeReady||pendingMutations.length) return;
  syncBusy=true;
  try{
    const rev=Number(data.meta?.revision||0);
    const result=await bridgeCall("getState",[rev]);

    // If the user changed something while this pull was in flight, never let
    // the older server snapshot overwrite that newer local edit.
    if(pendingMutations.length) return;

    if(result?.state) adoptSharedState(result.state);
    else { lastSyncAt=new Date(); setSyncStatus("connected","Shared ✓"); }
  }catch(err){ bridgeReady=false; showSyncError(err); }
  finally{
    syncBusy=false;
    if(pendingMutations.length&&bridgeReady&&!lastSyncError){
      setTimeout(flushPendingMutations,0);
    }
  }
}
function startSyncPolling(){
  if(syncPollTimer) clearInterval(syncPollTimer);
  syncPollTimer=setInterval(()=>{ if(document.visibilityState==="visible"&&bridgeReady){ pendingMutations.length?flushPendingMutations():pullSharedState(); } },15000);
}
function initSharedSync(){
  const intro=document.querySelector("#syncDialog .modal-card > p.muted.small");
  if(intro) intro.textContent="Connect both phones to the same Apps Script backend. This shared copy becomes the source of truth; old browser-only data is not imported.";
  document.getElementById("backendUrlInput").value=backendUrl;
  document.getElementById("accessCodeInput").value=accessCode;
  document.getElementById("disconnectSyncBtn").classList.toggle("hidden",!backendUrl);
  if(backendUrl&&accessCode) configureBridge(); else setSyncStatus("local","Local only");
}
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"&&backendUrl&&accessCode){ bridgeReady? (pendingMutations.length?flushPendingMutations():pullSharedState()) : configureBridge(); } });
window.addEventListener("focus",()=>{ if(backendUrl&&accessCode){ bridgeReady? (pendingMutations.length?flushPendingMutations():pullSharedState()) : configureBridge(); } });
window.addEventListener("online",()=>{ if(backendUrl&&accessCode){ bridgeReady?flushPendingMutations():configureBridge(); } });
window.addEventListener("offline",()=>{ if(backendUrl) setSyncStatus("waiting","Waiting to sync"); });


function setPage(page){
  document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id===page));
  document.querySelectorAll(".tab").forEach(el=>el.classList.toggle("active",el.dataset.page===page));
  window.scrollTo({top:0,behavior:"smooth"});
  if(page==="calendar") renderCalendar();
}
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>setPage(btn.dataset.page)));
document.querySelectorAll("[data-jump]").forEach(btn=>btn.addEventListener("click",()=>setPage(btn.dataset.jump)));
document.querySelectorAll("[data-prev-week]").forEach(btn=>btn.addEventListener("click",()=>{ viewWeekOffset--; renderAll(); }));
document.querySelectorAll("[data-this-week]").forEach(btn=>btn.addEventListener("click",()=>{ viewWeekOffset=0; renderAll(); }));

function ensureCheckin(person,date){
  if(!data.people[person].checkins[date]) data.people[person].checkins[date]={};
  return data.people[person].checkins[date];
}
function ensureTodos(person,date){
  if(!data.people[person].todos[date]) data.people[person].todos[date]=[];
  return data.people[person].todos[date];
}
function todoPercent(person,date){
  const list=data.people[person].todos[date]||[];
  if(!list.length) return 0;
  return Math.round((list.filter(x=>x.done).length/list.length)*100);
}
function activeGoals(person){ return (data.people[person].goals||[]).filter(g=>g.active!==false); }

function goalDailySatisfied(person,goal,date){
  const check=data.people[person].checkins[date]||{};
  const dateObj=parseLocalDate(date);
  if(goal.weekdayOnly && [0,6].includes(dateObj.getDay())) return null;
  if(goal.input==="todo_percentage") return todoPercent(person,date)>=Number(goal.target||0);
  if(goal.input==="checkbox"||goal.input==="checkbox_count") return !!check[goal.id];
  if(goal.type==="daily_percentage") return Number(check[goal.id]||0)>=Number(goal.target||0);
  if(goal.type==="daily_checkbox") return !!check[goal.id];
  return false;
}

function goalProgress(person,goal,refDate=viewedWeekDate()){
  const dates=weekDates(refDate);
  const checkins=data.people[person].checkins;
  if(goal.type==="days_per_week"){
    let count=0;
    dates.forEach(date=>{ if(goalDailySatisfied(person,goal,date)) count++; });
    const target=Number(goal.target||0);
    return {value:count,target,pct:Math.min(100,Math.round((count/Math.max(1,target))*100)),label:`${count}/${target}`};
  }
  if(goal.type==="max_weekly"){
    let total=0;
    dates.forEach(date=>{
      const c=checkins[date]||{};
      total += goal.input==="checkbox_count" ? (c[goal.id]?1:0) : Number(c[goal.id]||0);
    });
    const target=Number(goal.target||0);
    const pct=total<=target?100:Math.max(0,Math.round((target/Math.max(total,1))*100));
    const unit=goal.unit==="minutes"?" min":"";
    return {value:total,target,pct,label:`${total}${unit} / max ${target}${unit}`};
  }
  if(goal.type==="min_weekly"){
    let total=0;
    dates.forEach(date=>{ total+=Number((checkins[date]||{})[goal.id]||0); });
    const target=Number(goal.target||0);
    return {value:total,target,pct:Math.min(100,Math.round((total/Math.max(target,1))*100)),label:`${total}/${target}`};
  }
  if(goal.type==="daily_percentage"){
    const applicable=dates.filter(date=>!(goal.weekdayOnly&&[0,6].includes(parseLocalDate(date).getDay())) && isPastOrToday(date));
    let hits=0,days=0;
    applicable.forEach(date=>{
      const hasTodo=(data.people[person].todos[date]||[]).length>0;
      const hasDirect=(checkins[date]||{})[goal.id]!==undefined;
      if(goal.input==="todo_percentage"){
        if(hasTodo){ days++; if(goalDailySatisfied(person,goal,date)) hits++; }
      }else if(hasDirect){ days++; if(goalDailySatisfied(person,goal,date)) hits++; }
    });
    return {value:hits,target:days,pct:days?Math.round((hits/days)*100):0,label:days?`${hits}/${days} days`:"No data yet"};
  }
  if(goal.type==="daily_checkbox"){
    const applicable=dates.filter(date=>!(goal.weekdayOnly&&[0,6].includes(parseLocalDate(date).getDay())) && isPastOrToday(date));
    let hits=0,days=0;
    applicable.forEach(date=>{
      const c=checkins[date]||{};
      if(c[goal.id]!==undefined){ days++; if(c[goal.id]) hits++; }
    });
    return {value:hits,target:days,pct:days?Math.round((hits/days)*100):0,label:days?`${hits}/${days} days`:"No data yet"};
  }
  return {value:0,target:1,pct:0,label:"No data"};
}
function personScore(person){
  const goals=activeGoals(person);
  if(!goals.length) return 0;
  const pcts=goals.map(g=>goalProgress(person,g,viewedWeekDate()).pct);
  return Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length);
}

function renderScores(){
  ["rose","adrian"].forEach(person=>{
    const score=personScore(person), cap=person[0].toUpperCase()+person.slice(1), goals=activeGoals(person);
    document.getElementById(`${person}Score`).textContent=`${score}%`;
    document.getElementById(`${person}Progress`).style.width=`${score}%`;
    document.getElementById(`${person}PageScore`).textContent=`${score}%`;
    const note=document.getElementById(`${person}ScoreNote`);
    if(!goals.length) note.textContent=`Add ${cap}’s goals when she’s ready.`;
    else note.textContent=`${goals.length} active goal${goals.length===1?"":"s"} in this week’s score.`;
  });
}

function buildTodoRows(person,date,listEl,percentEl){
  const list=ensureTodos(person,date);
  listEl.innerHTML="";
  if(!list.length) listEl.innerHTML='<div class="empty-state">Nothing on the list yet.</div>';
  list.forEach(task=>{
    const row=document.createElement("div"); row.className=`todo-item ${task.done?"done":""}`;
    row.innerHTML='<input class="todo-check" type="checkbox" aria-label="Complete task"><span class="todo-text"></span><button class="delete-btn" aria-label="Delete task">×</button>';
    const check=row.querySelector(".todo-check"); check.checked=!!task.done;
    row.querySelector(".todo-text").textContent=task.text;
    check.addEventListener("change",()=>{ task.done=check.checked; saveData({type:"todo.upsert",payload:{person,date,task:clone(task)}}); });
    row.querySelector(".delete-btn").addEventListener("click",()=>{ data.people[person].todos[date]=list.filter(x=>x.id!==task.id); saveData({type:"todo.delete",payload:{person,date,taskId:task.id}}); });
    listEl.appendChild(row);
  });
  percentEl.textContent=`${todoPercent(person,date)}%`;
}
function renderHomeTodos(person){ buildTodoRows(person,todayKey(),document.getElementById(`${person}TodoList`),document.getElementById(`${person}TodoPercent`)); }
function renderPersonTodos(person){
  const date=activeDates[person];
  buildTodoRows(person,date,document.getElementById(`${person}TodoPageList`),document.getElementById(`${person}TodoPagePercent`));
  document.getElementById(`${person}TodoPageHeading`).textContent=date===todayKey()?"Today":fmtDate(date,{weekday:"short",month:"short",day:"numeric"});
}
function addTodo(person,date,text){ text=text.trim(); if(!text) return; const task={id:uid("todo"),text,done:false}; ensureTodos(person,date).push(task); saveData({type:"todo.upsert",payload:{person,date,task:clone(task)}}); }

document.getElementById("roseTodoForm").addEventListener("submit",e=>{ e.preventDefault(); const i=document.getElementById("roseTodoInput"); addTodo("rose",todayKey(),i.value); i.value=""; });
document.getElementById("adrianTodoForm").addEventListener("submit",e=>{ e.preventDefault(); const i=document.getElementById("adrianTodoInput"); addTodo("adrian",todayKey(),i.value); i.value=""; });
document.querySelectorAll(".person-todo-form").forEach(form=>form.addEventListener("submit",e=>{
  e.preventDefault(); const person=form.dataset.person, input=form.querySelector(".person-todo-input"); addTodo(person,activeDates[person],input.value); input.value="";
}));

function renderMood(person,elId,date=todayKey()){
  const wrap=document.getElementById(elId); wrap.innerHTML="";
  const selected=Number(data.people[person].moods[date]||0);
  const buttons=[];
  const paint=level=>buttons.forEach((b,idx)=>b.classList.toggle("lit",idx<level));
  for(let i=1;i<=5;i++){
    const b=document.createElement("button"); b.className="mood-btn"; b.type="button"; b.textContent="🍓";
    b.title=["Rough","Meh","Okay","Good","Great"][i-1];
    b.addEventListener("mouseenter",()=>paint(i));
    b.addEventListener("focus",()=>paint(i));
    b.addEventListener("click",()=>{ data.people[person].moods[date]=i; saveData({type:"mood.set",payload:{person,date,value:i}}); });
    buttons.push(b); wrap.appendChild(b);
  }
  wrap.addEventListener("mouseleave",()=>paint(selected));
  wrap.addEventListener("focusout",e=>{ if(!wrap.contains(e.relatedTarget)) paint(selected); });
  paint(selected);
}

function trackingLabel(goal){
  const t=Number(goal.target||0);
  if(goal.type==="daily_checkbox") return "Daily checkbox";
  if(goal.type==="days_per_week") return `${t} days per week`;
  if(goal.type==="max_weekly") return `Maximum ${t}${goal.unit==="minutes"?" minutes":""} per week`;
  if(goal.type==="min_weekly") return `Minimum ${t} per week`;
  if(goal.type==="daily_percentage") return `${t}% daily target`;
  return "";
}
function todayGoalNote(person,goal){
  if(viewWeekOffset!==0) return "";
  const date=todayKey(), c=data.people[person].checkins[date]||{};
  if(goal.weekdayOnly&&[0,6].includes(new Date().getDay())) return "Today: off";
  if(goal.input==="todo_percentage") return `Today: ${todoPercent(person,date)}%`;
  if(goal.input==="checkbox"||goal.input==="checkbox_count"||goal.type==="daily_checkbox") return `Today: ${c[goal.id]?"🍓":"○"}`;
  if(c[goal.id]===undefined||c[goal.id]==="") return "Today: —";
  return `Today: ${c[goal.id]}${goal.unit==="minutes"?" min":""}`;
}

function renderCheckin(person){
  const date=activeDates[person], el=document.getElementById(`${person}Checkin`), isToday=date===todayKey();
  document.getElementById(`${person}CheckinDate`).textContent=fmtDate(date);
  document.getElementById(`${person}DatePicker`).value=date;
  document.getElementById(`${person}DateBadge`).classList.toggle("hidden",!isToday);
  document.getElementById(`${person}MoodHeading`).textContent=isToday?"Today":fmtDate(date,{weekday:"short",month:"short",day:"numeric"});
  el.innerHTML="";
  const goals=activeGoals(person);
  if(!goals.length){ el.innerHTML='<div class="empty-state">No active goals yet. Add one below when you’re ready.</div>'; return; }
  goals.forEach(goal=>{
    if(goal.weekdayOnly&&[0,6].includes(parseLocalDate(date).getDay())) return;
    const c=ensureCheckin(person,date), card=document.createElement("div");
    card.className=`checkin-card ${isToday?"today-check":""}`;
    card.innerHTML='<h4></h4><div class="goal-meta"></div><div class="check-line"><span class="muted small"></span><div class="input-slot"></div></div>';
    card.querySelector("h4").textContent=goal.name;
    card.querySelector(".goal-meta").textContent=trackingLabel(goal);
    const label=card.querySelector(".check-line span"), slot=card.querySelector(".input-slot");

    if(goal.input==="todo_percentage"){
      const pct=todoPercent(person,date); label.textContent=`To-do list: ${pct}% complete`;
      const berry=document.createElement("span"); berry.textContent=pct>=goal.target?"🍓":"○"; berry.style.fontSize="28px"; slot.appendChild(berry);
    }else if(goal.input==="checkbox"||goal.input==="checkbox_count"||goal.type==="daily_checkbox"){
      label.textContent=goal.id==="wake8"?"Up by 8?":"Done today";
      const inp=document.createElement("input"); inp.type="checkbox"; inp.className="big-checkbox"; inp.checked=!!c[goal.id];
      inp.setAttribute("aria-label",`${goal.name} ${fmtDate(date)}`);
      inp.addEventListener("change",()=>{ c[goal.id]=inp.checked; saveData({type:"checkin.set",payload:{person,date,goalId:goal.id,value:inp.checked}}); }); slot.appendChild(inp);
    }else{
      label.textContent=goal.unit?`Enter ${goal.unit}`:"Enter amount";
      const inp=document.createElement("input"); inp.type="number"; inp.min="0"; inp.step="0.01"; inp.className="number-entry"; inp.value=c[goal.id]??"";
      inp.addEventListener("change",()=>{ c[goal.id]=inp.value===""?undefined:Number(inp.value); saveData({type:"checkin.set",payload:{person,date,goalId:goal.id,value:c[goal.id]??null}}); }); slot.appendChild(inp);
    }
    el.appendChild(card);
  });
}

function renderGoalOverview(person){
  const wrap=document.getElementById(`${person}GoalsOverview`); wrap.innerHTML="";
  const goals=activeGoals(person);
  if(!goals.length){ wrap.innerHTML='<div class="empty-state">No active goals added yet.</div>'; return; }
  goals.forEach(goal=>{
    const p=goalProgress(person,goal,viewedWeekDate()), row=document.createElement("div");
    row.className=`goal-progress-row ${viewWeekOffset===0?"today-week":""}`;
    row.innerHTML='<div><div class="goal-name"></div><div class="goal-sub"></div></div><div class="berry-track"></div><div class="goal-value"></div>';
    row.querySelector(".goal-name").textContent=goal.name;
    const todayNote=todayGoalNote(person,goal);
    row.querySelector(".goal-sub").textContent=`${trackingLabel(goal)}${todayNote?` · ${todayNote}`:""}`;
    const track=row.querySelector(".berry-track"), filled=Math.round((p.pct/100)*5);
    for(let i=0;i<5;i++){ const s=document.createElement("span"); s.className=`berry-dot ${i<filled?"filled":""}`; s.textContent="🍓"; track.appendChild(s); }
    row.querySelector(".goal-value").textContent=`${p.pct}% · ${p.label}`;
    wrap.appendChild(row);
  });
}

function moveGoal(person,fromIndex,toIndex){
  const goals=data.people[person].goals;
  if(fromIndex<0||toIndex<0||fromIndex>=goals.length||toIndex>=goals.length||fromIndex===toIndex) return;
  const [item]=goals.splice(fromIndex,1); goals.splice(toIndex,0,item); saveData({type:"goal.reorder",payload:{person,ids:goals.map(g=>g.id)}});
}
function renderGoalManager(person){
  const wrap=document.getElementById(`${person}GoalManager`); wrap.innerHTML="";
  const list=document.createElement("div"); list.className="goal-manager-list";
  const goals=data.people[person].goals||[];
  if(!goals.length) list.innerHTML='<div class="empty-state">No goals yet.</div>';
  goals.forEach((goal,index)=>{
    const row=document.createElement("div"); row.className=`goal-manage-row ${goal.active===false?"paused":""}`; row.draggable=true; row.dataset.goalId=goal.id;
    row.innerHTML='<button class="drag-handle" type="button" title="Drag to reorder">⋮⋮</button><div><div class="goal-name"></div><div class="goal-sub"></div></div><div class="goal-actions"><div class="reorder-mobile"><button class="tiny-btn move-up" type="button">↑</button><button class="tiny-btn move-down" type="button">↓</button></div><button class="tiny-btn pause-goal" type="button"></button><button class="delete-btn" type="button" aria-label="Delete goal">×</button></div>';
    row.querySelector(".goal-name").textContent=goal.name;
    row.querySelector(".goal-sub").innerHTML=`${trackingLabel(goal)}${goal.active===false?'<span class="pause-badge">Paused</span>':""}`;
    const pause=row.querySelector(".pause-goal"); pause.textContent=goal.active===false?"Resume":"Pause";
    pause.addEventListener("click",()=>{ goal.active=goal.active===false; saveData({type:"goal.upsert",payload:{person,goal:clone(goal)}}); });
    row.querySelector(".delete-btn").addEventListener("click",()=>{ if(confirm(`Delete "${goal.name}"?`)){ data.people[person].goals=goals.filter(g=>g.id!==goal.id); saveData({type:"goal.delete",payload:{person,goalId:goal.id}}); } });
    row.querySelector(".move-up").disabled=index===0; row.querySelector(".move-down").disabled=index===goals.length-1;
    row.querySelector(".move-up").addEventListener("click",()=>moveGoal(person,index,index-1));
    row.querySelector(".move-down").addEventListener("click",()=>moveGoal(person,index,index+1));
    row.addEventListener("dragstart",()=>{ draggedGoal={person,id:goal.id}; row.classList.add("dragging"); });
    row.addEventListener("dragend",()=>{ draggedGoal=null; row.classList.remove("dragging"); });
    row.addEventListener("dragover",e=>e.preventDefault());
    row.addEventListener("drop",e=>{
      e.preventDefault(); if(!draggedGoal||draggedGoal.person!==person||draggedGoal.id===goal.id) return;
      const from=goals.findIndex(g=>g.id===draggedGoal.id), to=goals.findIndex(g=>g.id===goal.id); moveGoal(person,from,to);
    });
    list.appendChild(row);
  });
  wrap.appendChild(list);
}

["rose","adrian"].forEach(person=>{
  document.getElementById(`${person}DatePicker`).addEventListener("change",e=>{
    activeDates[person]=e.target.value; renderCheckin(person); renderMood(person,`${person}MoodPage`,activeDates[person]); renderPersonTodos(person);
  });
});
document.querySelectorAll("[data-add-goal]").forEach(btn=>btn.addEventListener("click",()=>openGoalDialog(btn.dataset.addGoal)));

const goalDialog=document.getElementById("goalDialog");
function openGoalDialog(person){
  document.getElementById("goalPerson").value=person;
  document.getElementById("goalDialogTitle").textContent=`Add a goal for ${person[0].toUpperCase()+person.slice(1)}`;
  document.getElementById("goalName").value=""; document.getElementById("goalType").value="daily_checkbox"; document.getElementById("goalTarget").value="1"; updateTargetHint(); goalDialog.showModal();
}
function updateTargetHint(){
  const type=document.getElementById("goalType").value;
  const hints={daily_checkbox:"Use 1 for a simple done/not-done goal.",days_per_week:"Example: 5 means five days each week.",max_weekly:"Example: 180 for a maximum of 180 minutes each week.",min_weekly:"Example: 4 for at least four total units each week.",daily_percentage:"Example: 75 means a daily target of 75%."};
  document.getElementById("targetHint").textContent=hints[type];
}
document.getElementById("goalType").addEventListener("change",updateTargetHint);
document.getElementById("goalForm").addEventListener("submit",e=>{
  e.preventDefault(); const person=document.getElementById("goalPerson").value, type=document.getElementById("goalType").value;
  const goal={id:uid("goal"),name:document.getElementById("goalName").value.trim(),type,target:Number(document.getElementById("goalTarget").value||0),input:(type==="daily_checkbox"||type==="days_per_week")?"checkbox":"number",active:true};
  data.people[person].goals.push(goal); goalDialog.close(); saveData({type:"goal.upsert",payload:{person,goal:clone(goal)}});
});
document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>document.getElementById(btn.dataset.close).close()));

const eventDialog=document.getElementById("eventDialog");
const repeatSelect=document.getElementById("eventRepeat");
function updateRepeatUI(){
  const val=repeatSelect.value;
  document.getElementById("repeatExtra").classList.toggle("hidden",val==="none");
  document.getElementById("customDays").classList.toggle("hidden",val!=="custom");
}
repeatSelect.addEventListener("change",updateRepeatUI);
document.getElementById("eventEditScope").addEventListener("change",updateEditScopeUI);
function updateEditScopeUI(){
  const repeating=!document.getElementById("eventEditScopeWrap").classList.contains("hidden");
  const scope=document.getElementById("eventEditScope").value;
  const occurrenceOnly=repeating&&scope==="occurrence";
  document.getElementById("eventRecurrenceFields").classList.toggle("hidden",occurrenceOnly);
  document.getElementById("eventDate").disabled=occurrenceOnly;
  document.getElementById("eventScopeHint").textContent=occurrenceOnly?"This changes only this date. To move it to another day, delete this occurrence and add a one-time event.":"Changes will update every occurrence in this series.";
}
function setCustomDays(days=[]){
  document.querySelectorAll("#customDays input").forEach(inp=>inp.checked=days.map(Number).includes(Number(inp.value)));
}
function getCustomDays(){ return [...document.querySelectorAll("#customDays input:checked")].map(x=>Number(x.value)); }
function recurrenceFromForm(){
  const type=repeatSelect.value;
  if(type==="none") return null;
  const recurrence={type,until:document.getElementById("eventRepeatUntil").value||""};
  if(type==="custom") recurrence.days=getCustomDays();
  return recurrence;
}
function populateRecurrence(recurrence){
  repeatSelect.value=recurrence?.type||"none";
  document.getElementById("eventRepeatUntil").value=recurrence?.until||"";
  setCustomDays(recurrence?.days||[]); updateRepeatUI();
}
function baseEventById(id){ return data.events.find(e=>e.id===id); }
function openAddEvent(date=todayKey()){
  document.getElementById("eventId").value=""; document.getElementById("eventOccurrenceDate").value="";
  document.getElementById("eventDialogTitle").textContent="Add something"; document.getElementById("eventSubmitBtn").textContent="Add to calendar";
  document.getElementById("deleteEventInModal").classList.add("hidden"); document.getElementById("eventEditScopeWrap").classList.add("hidden");
  document.getElementById("eventRecurrenceFields").classList.remove("hidden"); document.getElementById("eventDate").disabled=false;
  document.getElementById("eventTitle").value=""; document.getElementById("eventPerson").value="rose"; document.getElementById("eventDate").value=date; document.getElementById("eventStart").value="18:00"; document.getElementById("eventEnd").value="19:00";
  populateRecurrence(null); eventDialog.showModal();
}
function openEditOccurrence(occ){
  const base=baseEventById(occ.seriesId||occ.id); if(!base) return;
  document.getElementById("eventId").value=base.id; document.getElementById("eventOccurrenceDate").value=occ.occurrenceDate||occ.date;
  document.getElementById("eventDialogTitle").textContent=occ.isRecurring?"Edit repeating plan":"Edit plan"; document.getElementById("eventSubmitBtn").textContent="Save changes";
  document.getElementById("deleteEventInModal").classList.remove("hidden");
  document.getElementById("eventTitle").value=occ.title; document.getElementById("eventPerson").value=occ.person; document.getElementById("eventDate").value=occ.date; document.getElementById("eventStart").value=occ.start; document.getElementById("eventEnd").value=occ.end;
  populateRecurrence(base.recurrence);
  document.getElementById("eventEditScopeWrap").classList.toggle("hidden",!occ.isRecurring);
  document.getElementById("eventEditScope").value=occ.isRecurring?"occurrence":"series";
  document.getElementById("eventRecurrenceFields").classList.toggle("hidden",occ.isRecurring);
  document.getElementById("eventDate").disabled=occ.isRecurring;
  updateEditScopeUI(); eventDialog.showModal();
}
function deleteOpenedEvent(){
  const id=document.getElementById("eventId").value, base=baseEventById(id); if(!base) return;
  const occurrenceDate=document.getElementById("eventOccurrenceDate").value;
  const repeating=!!base.recurrence&&!!occurrenceDate;
  const scope=repeating?document.getElementById("eventEditScope").value:"series";
  if(scope==="occurrence"){
    if(!confirm(`Delete just this occurrence of "${base.title}"?`)) return;
    base.exceptions=Array.from(new Set([...(base.exceptions||[]),occurrenceDate]));
    if(base.overrides) delete base.overrides[occurrenceDate];
    eventDialog.close(); saveData({type:"event.exception",payload:{seriesId:base.id,date:occurrenceDate}});
  }else{
    if(!confirm(`Delete ${base.recurrence?"the entire repeating series":"\""+base.title+"\""}?`)) return;
    data.events=data.events.filter(e=>e.id!==base.id); eventDialog.close(); saveData({type:"event.delete",payload:{eventId:base.id}});
  }
}
document.getElementById("addEventBtn").addEventListener("click",()=>openAddEvent());
document.getElementById("deleteEventInModal").addEventListener("click",deleteOpenedEvent);
document.getElementById("eventForm").addEventListener("submit",e=>{
  e.preventDefault();
  const start=document.getElementById("eventStart").value,end=document.getElementById("eventEnd").value;
  if(end<=start){ alert("End time needs to be after start time."); return; }
  if(repeatSelect.value==="custom"&&!getCustomDays().length){ alert("Choose at least one day for the custom repeat."); return; }
  const id=document.getElementById("eventId").value;
  const occurrenceDate=document.getElementById("eventOccurrenceDate").value;
  const existing=id?baseEventById(id):null;
  const isRecurringEdit=!!existing?.recurrence&&!!occurrenceDate;
  const scope=isRecurringEdit?document.getElementById("eventEditScope").value:"series";
  const values={title:document.getElementById("eventTitle").value.trim(),person:document.getElementById("eventPerson").value,date:document.getElementById("eventDate").value,start,end};
  if(isRecurringEdit&&scope==="occurrence"){
    existing.overrides=existing.overrides||{};
    existing.overrides[occurrenceDate]={title:values.title,person:values.person,start:values.start,end:values.end};
    existing.exceptions=(existing.exceptions||[]).filter(d=>d!==occurrenceDate);
    eventDialog.close(); saveData({type:"event.override",payload:{seriesId:existing.id,date:occurrenceDate,changes:clone(existing.overrides[occurrenceDate])}}); return;
  }
  const recurrence=recurrenceFromForm();
  if(existing){
    Object.assign(existing,values,{recurrence,exceptions:existing.exceptions||[],overrides:existing.overrides||{}});
    eventDialog.close(); saveData({type:"event.upsert",payload:{event:clone(existing)}});
  }else{
    const ev={id:uid("event"),...values,recurrence,exceptions:[],overrides:{}};
    data.events.push(ev); eventDialog.close(); saveData({type:"event.upsert",payload:{event:clone(ev)}});
  }
});

document.getElementById("prevMonth").addEventListener("click",()=>{ calendarCursor.setMonth(calendarCursor.getMonth()-1); renderCalendar(); });
document.getElementById("nextMonth").addEventListener("click",()=>{ calendarCursor.setMonth(calendarCursor.getMonth()+1); renderCalendar(); });

function mins(t){ const [h,m]=t.split(":").map(Number); return h*60+m; }
function timeStr(min){ const h=Math.floor(min/60),m=min%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }
function prettyTime(t){ const [h,m]=t.split(":").map(Number),ap=h>=12?"PM":"AM",hh=((h+11)%12)+1; return `${hh}:${String(m).padStart(2,"0")} ${ap}`; }
function roundUp15(min){ return Math.ceil(min/15)*15; }
function addDaysKey(key,n){ const d=parseLocalDate(key); d.setDate(d.getDate()+n); return todayKey(d); }
function recurrenceMatches(ev,date){
  if(!ev.recurrence) return date===ev.date;
  if(date<ev.date) return false;
  if(ev.recurrence.until&&date>ev.recurrence.until) return false;
  const dt=parseLocalDate(date), day=dt.getDay(), type=ev.recurrence.type;
  if(type==="daily") return true;
  if(type==="weekdays") return day>=1&&day<=5;
  if(type==="weekly") return day===parseLocalDate(ev.date).getDay();
  if(type==="custom") return (ev.recurrence.days||[]).map(Number).includes(day);
  return false;
}
function occurrencesBetween(startDate,endDate){
  const out=[];
  data.events.forEach(ev=>{
    if(!ev.recurrence){ if(ev.date>=startDate&&ev.date<=endDate) out.push({...ev,seriesId:ev.id,occurrenceDate:ev.date,isRecurring:false}); return; }
    const loopStart=ev.date>startDate?ev.date:startDate;
    for(let key=loopStart;key<=endDate;key=addDaysKey(key,1)){
      if(!recurrenceMatches(ev,key)) continue;
      if((ev.exceptions||[]).includes(key)) continue;
      const override=(ev.overrides||{})[key]||{};
      out.push({...ev,...override,date:key,seriesId:ev.id,occurrenceDate:key,isRecurring:true,baseRecurrence:ev.recurrence});
    }
  });
  return out.sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
}
function occurrencesOnDate(date){ return occurrencesBetween(date,date); }
function personBusyOn(person,date){ return occurrencesOnDate(date).filter(e=>e.person===person||e.person==="both").map(e=>[mins(e.start),mins(e.end)]).sort((a,b)=>a[0]-b[0]); }
function merged(intervals){ const out=[]; intervals.forEach(i=>{ if(!out.length||i[0]>out[out.length-1][1]) out.push([...i]); else out[out.length-1][1]=Math.max(out[out.length-1][1],i[1]); }); return out; }
function combinedBusy(date){ return merged([...personBusyOn("rose",date),...personBusyOn("adrian",date)].sort((a,b)=>a[0]-b[0])); }
function dayBounds(date){
  const dt=parseLocalDate(date),weekend=[0,6].includes(dt.getDay()); let start=weekend?10*60:17*60,end=22*60;
  if(date===todayKey()){ const now=new Date(),current=roundUp15(now.getHours()*60+now.getMinutes()+15); start=Math.max(start,current); }
  return [start,end];
}
function freeWindows(date){
  if(date<todayKey()) return [];
  const [start,end]=dayBounds(date); if(start>=end) return [];
  const busy=combinedBusy(date).filter(([s,e])=>e>start&&s<end).map(([s,e])=>[Math.max(s,start),Math.min(e,end)]);
  const result=[]; let cursor=start;
  busy.forEach(([s,e])=>{ if(s-cursor>=90) result.push([cursor,s]); cursor=Math.max(cursor,e); });
  if(end-cursor>=90) result.push([cursor,end]); return result;
}
function smartWindowLabel(date,start,end){
  const [boundStart,boundEnd]=dayBounds(date);
  if(start<=boundStart&&end>=boundEnd) return `open ${prettyTime(timeStr(start))}–${prettyTime(timeStr(end))}`;
  if(end>=boundEnd) return `free after ${prettyTime(timeStr(start))}`;
  if(start<=boundStart) return `free until ${prettyTime(timeStr(end))}`;
  return `${prettyTime(timeStr(start))}–${prettyTime(timeStr(end))}`;
}
function repeatLabel(ev){
  if(!ev.isRecurring&&!ev.recurrence) return "";
  const r=ev.baseRecurrence||ev.recurrence;
  if(!r) return "";
  if(r.type==="daily") return "Repeats daily";
  if(r.type==="weekdays") return "Repeats weekdays";
  if(r.type==="weekly") return "Repeats weekly";
  if(r.type==="custom") return "Repeats on selected days";
  return "Repeating";
}
function closeEventMenus(){ document.querySelectorAll(".event-menu.open").forEach(m=>m.classList.remove("open")); }
document.addEventListener("click",e=>{ if(!e.target.closest(".event-menu-wrap")) closeEventMenus(); });

function renderCalendar(){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  document.getElementById("calendarMonth").textContent=calendarCursor.toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const grid=document.getElementById("calendarGrid"); grid.innerHTML="";
  const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());
  const startKey=todayKey(start),endObj=new Date(start); endObj.setDate(start.getDate()+41); const endKey=todayKey(endObj);
  const occs=occurrencesBetween(startKey,endKey),byDate={}; occs.forEach(o=>(byDate[o.date]||(byDate[o.date]=[])).push(o));
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const key=todayKey(d),free=freeWindows(key),dayEvents=byDate[key]||[];
    const cell=document.createElement("div");
    cell.className=`calendar-day ${d.getMonth()!==m?"muted-day":""} ${key===todayKey()?"today":""} ${free.length?"free-day":""}`;
    cell.innerHTML=`<div class="day-head"><span class="day-number">${d.getDate()}</span>${free.length&&d.getMonth()===m?'<span class="free-berry" title="You both have an open window">🍓</span>':""}</div>`;
    dayEvents.slice(0,3).forEach(occ=>{
      const chip=document.createElement("button"); chip.type="button"; chip.className=`event-chip ${occ.person}`;
      chip.innerHTML=`${occ.isRecurring?'<span class="recur-mark">↻</span>':""}${prettyTime(occ.start)} `;
      chip.append(document.createTextNode(occ.title)); chip.title=`Edit ${occ.title}`;
      chip.addEventListener("click",e=>{ e.stopPropagation(); openEditOccurrence(occ); }); cell.appendChild(chip);
    });
    if(dayEvents.length>3){ const more=document.createElement("div"); more.className="more-events"; more.textContent=`+${dayEvents.length-3} more`; cell.appendChild(more); }
    cell.addEventListener("click",()=>openAddEvent(key)); grid.appendChild(cell);
  }
  renderEventList(); renderHangoutSuggestions();
}
function renderEventList(){
  const wrap=document.getElementById("eventList"); wrap.innerHTML="";
  const end=addDaysKey(todayKey(),60),upcoming=occurrencesBetween(todayKey(),end).slice(0,40);
  if(!upcoming.length){ wrap.innerHTML='<div class="empty-state">Nothing on the calendar yet.</div>'; return; }
  upcoming.forEach(occ=>{
    const row=document.createElement("div"); row.className=`event-row ${occ.person}`;
    row.innerHTML='<span class="event-dot"></span><div class="event-body"><div class="event-title"></div><div class="event-meta"></div></div><div class="event-menu-wrap"><button class="menu-btn" type="button" aria-label="Event options">⋯</button><div class="event-menu"><button class="menu-edit" type="button">Edit</button><button class="menu-delete" type="button">Delete</button></div></div>';
    row.querySelector(".event-title").textContent=occ.title;
    const recurring=repeatLabel(occ);
    row.querySelector(".event-meta").textContent=`${fmtDate(occ.date,{weekday:"short",month:"short",day:"numeric"})} · ${prettyTime(occ.start)}–${prettyTime(occ.end)} · ${occ.person==="both"?"Both":occ.person[0].toUpperCase()+occ.person.slice(1)}${recurring?` · ${recurring}`:""}`;
    row.querySelector(".event-body").addEventListener("click",()=>openEditOccurrence(occ));
    const menu=row.querySelector(".event-menu"),menuBtn=row.querySelector(".menu-btn");
    menuBtn.addEventListener("click",e=>{ e.stopPropagation(); const wasOpen=menu.classList.contains("open"); closeEventMenus(); if(!wasOpen) menu.classList.add("open"); });
    row.querySelector(".menu-edit").addEventListener("click",()=>{ closeEventMenus(); openEditOccurrence(occ); });
    row.querySelector(".menu-delete").addEventListener("click",()=>{ closeEventMenus(); openEditOccurrence(occ); setTimeout(()=>document.getElementById("deleteEventInModal").focus(),50); });
    wrap.appendChild(row);
  });
}
function renderHangoutSuggestions(){
  const wrap=document.getElementById("hangoutSuggestions"); wrap.innerHTML=""; const suggestions=[];
  for(let i=0;i<14;i++){
    const key=addDaysKey(todayKey(),i),windows=freeWindows(key); windows.forEach(win=>suggestions.push({date:key,start:win[0],end:win[1]}));
    if(suggestions.length>=7) break;
  }
  if(!suggestions.length){ wrap.innerHTML='<div class="empty-state">No 90-minute open windows found in the next two weeks.</div>'; document.getElementById("nextHangout").textContent="No obvious opening in the next two weeks."; return; }
  suggestions.slice(0,5).forEach(s=>{
    const div=document.createElement("div"); div.className="suggestion"; div.innerHTML='<strong></strong><span class="muted small"></span>';
    div.querySelector("strong").textContent=fmtDate(s.date,{weekday:"long",month:"short",day:"numeric"}); div.querySelector("span").textContent=smartWindowLabel(s.date,s.start,s.end); wrap.appendChild(div);
  });
  const n=suggestions[0]; document.getElementById("nextHangout").textContent=`${fmtDate(n.date,{weekday:"long",month:"long",day:"numeric"})} · ${smartWindowLabel(n.date,n.start,n.end)}`;
}

function renderWeekLabels(){
  const dates=viewedWeekDates(),range=`${fmtDate(dates[0],{month:"short",day:"numeric"})} – ${fmtDate(dates[6],{month:"short",day:"numeric"})}`;
  document.getElementById("weekLabel").textContent=range;
  document.getElementById("roseGoalWeekLabel").textContent=range; document.getElementById("adrianGoalWeekLabel").textContent=range;
  document.getElementById("weekStatusBadge").textContent=viewWeekOffset===0?"This week":viewWeekOffset===-1?"Last week":`${Math.abs(viewWeekOffset)} weeks ago`;
  document.querySelectorAll("[data-this-week]").forEach(btn=>btn.disabled=viewWeekOffset===0);
  document.getElementById("todayLabel").textContent=fmtDate(todayKey(),{weekday:"short",month:"short",day:"numeric"});
}

function renderAll(){
  renderWeekLabels(); renderScores();
  renderHomeTodos("rose"); renderHomeTodos("adrian");
  renderMood("rose","roseMood"); renderMood("adrian","adrianMood");
  ["rose","adrian"].forEach(person=>{
    renderMood(person,`${person}MoodPage`,activeDates[person]); renderCheckin(person); renderPersonTodos(person); renderGoalOverview(person); renderGoalManager(person);
  });
  renderCalendar();
}

const syncDialog=document.getElementById("syncDialog");
document.getElementById("syncStatusBtn").addEventListener("click",()=>{
  document.getElementById("backendUrlInput").value=backendUrl;
  document.getElementById("accessCodeInput").value=accessCode;
  document.getElementById("disconnectSyncBtn").classList.toggle("hidden",!backendUrl);
  setSyncStatus(bridgeReady?"connected":backendUrl?"error":"local",bridgeReady?"Shared ✓":backendUrl?"Sync offline":"Local only");
  syncDialog.showModal();
});
document.getElementById("syncForm").addEventListener("submit",e=>{
  e.preventDefault();
  const url=document.getElementById("backendUrlInput").value.trim().replace(/\/$/,"");
  const code=document.getElementById("accessCodeInput").value.trim().toUpperCase();
  if(!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(url)){ alert("Paste the deployed Apps Script web app URL ending in /exec."); return; }
  if(code.length<4){ alert("Enter the shared access code from the Better Together Settings sheet."); return; }
  backendUrl=url; accessCode=code; localStorage.setItem(BACKEND_URL_KEY,backendUrl); localStorage.setItem(ACCESS_CODE_KEY,accessCode);
  document.getElementById("disconnectSyncBtn").classList.remove("hidden"); configureBridge();
});
document.getElementById("disconnectSyncBtn").addEventListener("click",()=>{
  if(!confirm("Disconnect shared sync on this phone? Your current copy will stay on this phone.")) return;
  backendUrl=""; accessCode=""; pendingMutations=[]; savePending();
  localStorage.removeItem(BACKEND_URL_KEY); localStorage.removeItem(ACCESS_CODE_KEY); localStorage.removeItem(FRESH_SHARED_KEY); teardownBridge();
  if(syncPollTimer) clearInterval(syncPollTimer); syncPollTimer=null; syncDialog.close(); setSyncStatus("local","Local only");
});

renderAll();
initSharedSync();
