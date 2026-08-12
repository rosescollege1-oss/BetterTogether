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
function saveData(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); renderAll(); }

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
    check.addEventListener("change",()=>{ task.done=check.checked; saveData(); });
    row.querySelector(".delete-btn").addEventListener("click",()=>{ data.people[person].todos[date]=list.filter(x=>x.id!==task.id); saveData(); });
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
function addTodo(person,date,text){ text=text.trim(); if(!text) return; ensureTodos(person,date).push({id:uid("todo"),text,done:false}); saveData(); }

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
    b.addEventListener("click",()=>{ data.people[person].moods[date]=i; saveData(); });
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
      inp.addEventListener("change",()=>{ c[goal.id]=inp.checked; saveData(); }); slot.appendChild(inp);
    }else{
      label.textContent=goal.unit?`Enter ${goal.unit}`:"Enter amount";
      const inp=document.createElement("input"); inp.type="number"; inp.min="0"; inp.step="0.01"; inp.className="number-entry"; inp.value=c[goal.id]??"";
      inp.addEventListener("change",()=>{ c[goal.id]=inp.value===""?undefined:Number(inp.value); saveData(); }); slot.appendChild(inp);
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
  const [item]=goals.splice(fromIndex,1); goals.splice(toIndex,0,item); saveData();
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
    pause.addEventListener("click",()=>{ goal.active=goal.active===false; saveData(); });
    row.querySelector(".delete-btn").addEventListener("click",()=>{ if(confirm(`Delete "${goal.name}"?`)){ data.people[person].goals=goals.filter(g=>g.id!==goal.id); saveData(); } });
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
  data.people[person].goals.push(goal); goalDialog.close(); saveData();
});
document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>document.getElementById(btn.dataset.close).close()));

const eventDialog=document.getElementById("eventDialog");
function openAddEvent(date=todayKey()){
  document.getElementById("eventId").value=""; document.getElementById("eventDialogTitle").textContent="Add something"; document.getElementById("eventSubmitBtn").textContent="Add to calendar";
  document.getElementById("deleteEventInModal").classList.add("hidden");
  document.getElementById("eventTitle").value=""; document.getElementById("eventPerson").value="rose"; document.getElementById("eventDate").value=date; document.getElementById("eventStart").value="18:00"; document.getElementById("eventEnd").value="19:00";
  eventDialog.showModal();
}
function openEditEvent(id){
  const ev=data.events.find(e=>e.id===id); if(!ev) return;
  document.getElementById("eventId").value=ev.id; document.getElementById("eventDialogTitle").textContent="Edit plan"; document.getElementById("eventSubmitBtn").textContent="Save changes";
  document.getElementById("deleteEventInModal").classList.remove("hidden");
  document.getElementById("eventTitle").value=ev.title; document.getElementById("eventPerson").value=ev.person; document.getElementById("eventDate").value=ev.date; document.getElementById("eventStart").value=ev.start; document.getElementById("eventEnd").value=ev.end;
  eventDialog.showModal();
}
function deleteEvent(id){
  const ev=data.events.find(e=>e.id===id); if(!ev) return;
  if(confirm(`Delete "${ev.title}"?`)){ data.events=data.events.filter(e=>e.id!==id); if(eventDialog.open) eventDialog.close(); saveData(); }
}
document.getElementById("addEventBtn").addEventListener("click",()=>openAddEvent());
document.getElementById("deleteEventInModal").addEventListener("click",()=>deleteEvent(document.getElementById("eventId").value));
document.getElementById("eventForm").addEventListener("submit",e=>{
  e.preventDefault(); const start=document.getElementById("eventStart").value,end=document.getElementById("eventEnd").value;
  if(end<=start){ alert("End time needs to be after start time."); return; }
  const payload={title:document.getElementById("eventTitle").value.trim(),person:document.getElementById("eventPerson").value,date:document.getElementById("eventDate").value,start,end};
  const id=document.getElementById("eventId").value;
  if(id){ const ev=data.events.find(x=>x.id===id); if(ev) Object.assign(ev,payload); }
  else data.events.push({id:uid("event"),...payload});
  data.events.sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)); eventDialog.close(); saveData();
});

document.getElementById("prevMonth").addEventListener("click",()=>{ calendarCursor.setMonth(calendarCursor.getMonth()-1); renderCalendar(); });
document.getElementById("nextMonth").addEventListener("click",()=>{ calendarCursor.setMonth(calendarCursor.getMonth()+1); renderCalendar(); });

function mins(t){ const [h,m]=t.split(":").map(Number); return h*60+m; }
function timeStr(min){ const h=Math.floor(min/60),m=min%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }
function prettyTime(t){ const [h,m]=t.split(":").map(Number),ap=h>=12?"PM":"AM",hh=((h+11)%12)+1; return `${hh}:${String(m).padStart(2,"0")} ${ap}`; }
function roundUp15(min){ return Math.ceil(min/15)*15; }
function personBusyOn(person,date){ return data.events.filter(e=>e.date===date&&(e.person===person||e.person==="both")).map(e=>[mins(e.start),mins(e.end)]).sort((a,b)=>a[0]-b[0]); }
function merged(intervals){
  const out=[]; intervals.forEach(i=>{ if(!out.length||i[0]>out[out.length-1][1]) out.push([...i]); else out[out.length-1][1]=Math.max(out[out.length-1][1],i[1]); }); return out;
}
function combinedBusy(date){ return merged([...personBusyOn("rose",date),...personBusyOn("adrian",date)].sort((a,b)=>a[0]-b[0])); }
function dayBounds(date){ const dt=parseLocalDate(date),weekend=[0,6].includes(dt.getDay()); let start=weekend?10*60:17*60,end=22*60;
  if(date===todayKey()){ const now=new Date(), current=roundUp15(now.getHours()*60+now.getMinutes()+15); start=Math.max(start,current); }
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

function closeEventMenus(){ document.querySelectorAll(".event-menu.open").forEach(m=>m.classList.remove("open")); }
document.addEventListener("click",e=>{ if(!e.target.closest(".event-menu-wrap")) closeEventMenus(); });

function renderCalendar(){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  document.getElementById("calendarMonth").textContent=calendarCursor.toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const grid=document.getElementById("calendarGrid"); grid.innerHTML="";
  const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const key=todayKey(d),free=freeWindows(key);
    const cell=document.createElement("div");
    cell.className=`calendar-day ${d.getMonth()!==m?"muted-day":""} ${key===todayKey()?"today":""} ${free.length?"free-day":""}`;
    cell.innerHTML=`<div class="day-head"><span class="day-number">${d.getDate()}</span>${free.length&&d.getMonth()===m?'<span class="free-berry" title="You both have an open window">🍓</span>':""}</div>`;
    data.events.filter(e=>e.date===key).slice(0,3).forEach(ev=>{
      const chip=document.createElement("button"); chip.type="button"; chip.className=`event-chip ${ev.person}`; chip.textContent=`${prettyTime(ev.start)} ${ev.title}`; chip.title=`Edit ${ev.title}`;
      chip.addEventListener("click",e=>{ e.stopPropagation(); openEditEvent(ev.id); }); cell.appendChild(chip);
    });
    cell.addEventListener("click",()=>openAddEvent(key)); grid.appendChild(cell);
  }
  renderEventList(); renderHangoutSuggestions();
}
function renderEventList(){
  const wrap=document.getElementById("eventList"); wrap.innerHTML="";
  const upcoming=data.events.filter(e=>e.date>=todayKey()).slice(0,30);
  if(!upcoming.length){ wrap.innerHTML='<div class="empty-state">Nothing on the calendar yet.</div>'; return; }
  upcoming.forEach(ev=>{
    const row=document.createElement("div"); row.className=`event-row ${ev.person}`;
    row.innerHTML='<span class="event-dot"></span><div class="event-body"><div class="event-title"></div><div class="event-meta"></div></div><div class="event-menu-wrap"><button class="menu-btn" type="button" aria-label="Event options">⋯</button><div class="event-menu"><button class="menu-edit" type="button">Edit</button><button class="menu-delete" type="button">Delete</button></div></div>';
    row.querySelector(".event-title").textContent=ev.title;
    row.querySelector(".event-meta").textContent=`${fmtDate(ev.date,{weekday:"short",month:"short",day:"numeric"})} · ${prettyTime(ev.start)}–${prettyTime(ev.end)} · ${ev.person==="both"?"Both":ev.person[0].toUpperCase()+ev.person.slice(1)}`;
    row.querySelector(".event-body").addEventListener("click",()=>openEditEvent(ev.id));
    const menu=row.querySelector(".event-menu"),menuBtn=row.querySelector(".menu-btn");
    menuBtn.addEventListener("click",e=>{ e.stopPropagation(); const wasOpen=menu.classList.contains("open"); closeEventMenus(); if(!wasOpen) menu.classList.add("open"); });
    row.querySelector(".menu-edit").addEventListener("click",()=>{ closeEventMenus(); openEditEvent(ev.id); });
    row.querySelector(".menu-delete").addEventListener("click",()=>{ closeEventMenus(); deleteEvent(ev.id); });
    wrap.appendChild(row);
  });
}
function renderHangoutSuggestions(){
  const wrap=document.getElementById("hangoutSuggestions"); wrap.innerHTML=""; const suggestions=[];
  for(let i=0;i<14;i++){
    const d=new Date(); d.setDate(d.getDate()+i); const key=todayKey(d),windows=freeWindows(key);
    windows.forEach(win=>suggestions.push({date:key,start:win[0],end:win[1]}));
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

document.getElementById("resetDemoBtn").addEventListener("click",()=>{
  if(confirm("Reset Better Together and erase everything saved in this browser?")){ data=clone(defaultData); localStorage.removeItem(STORAGE_KEY); activeDates={rose:todayKey(),adrian:todayKey()}; viewWeekOffset=0; renderAll(); }
});

renderAll();
