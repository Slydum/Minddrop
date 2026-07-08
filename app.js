import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
const motivations = [
  "You only need to do the next small thing.",
  "Done imperfectly is still done.",
  "Your brain does not have to hold everything.",
  "Pause, breathe, choose one thing."
];

let session = null;
let profile = null;
let routines = [];
let tasks = [];
let activeRoutineFrequency = "daily";
let realtimeChannel = null;

function escapeHtml(v){
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function applyTheme(theme){
  document.documentElement.dataset.theme = theme;
  $("themeToggle").textContent = theme === "light" ? "☾" : "☼";
  localStorage.setItem("minddrop-theme", theme);
}
$("themeToggle").onclick = () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
applyTheme(localStorage.getItem("minddrop-theme") || "light");

async function loadProfile(){
  const { data,error } = await supabase.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
  if(error) throw error;
  profile = data;
}

async function loadData(){
  const [r,t] = await Promise.all([
    supabase.from("routines").select("*").order("time_of_day"),
    supabase.from("tasks").select("*").order("created_at",{ascending:false})
  ]);
  if(r.error) throw r.error;
  if(t.error) throw t.error;
  routines = r.data || [];
  tasks = t.data || [];
  renderRoutines();
  renderTasks();
  renderUpcoming();
}

function realtimeStart(){
  if(realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel(`minddrop-${session.user.id}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"tasks",filter:`user_id=eq.${session.user.id}`},loadData)
    .on("postgres_changes",{event:"*",schema:"public",table:"routines",filter:`user_id=eq.${session.user.id}`},loadData)
    .subscribe(status => $("syncState").textContent = status === "SUBSCRIBED" ? "live sync" : "connecting…");
}

function formatTime(v){
  const [h,m]=v.slice(0,5).split(":").map(Number);
  const d=new Date();
  d.setHours(h,m);
  return d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
}

function routineOccursToday(routine){
  const now = new Date();
  if(routine.frequency === "daily") return true;
  if(routine.frequency === "weekly") return routine.weekday === now.getDay();
  if(routine.frequency === "monthly") return routine.monthday === now.getDate();
  return false;
}

function frequencyLabel(routine){
  if(routine.frequency === "daily") return "every day";
  if(routine.frequency === "weekly"){
    return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][routine.weekday] || "weekly";
  }
  if(routine.frequency === "monthly") return `day ${routine.monthday} of each month`;
  return routine.frequency;
}

function renderRoutines(){
  const today = new Date().toISOString().slice(0,10);
  const filtered = routines.filter(r => r.frequency === activeRoutineFrequency);
  $("routineHeading").textContent = `${activeRoutineFrequency} routine`;

  $("routineList").innerHTML = filtered.length ? filtered.map(r=>{
    const done = r.completion_date === today;
    const dueToday = routineOccursToday(r);
    return `<div class="routine-item">
      <div class="time">${formatTime(r.time_of_day)}</div>
      <div>
        <div class="task-title" style="${done ? "text-decoration:line-through;opacity:.55" : ""}">${escapeHtml(r.title)}</div>
        <div class="routine-frequency">${escapeHtml(frequencyLabel(r))}${dueToday ? " · due today" : ""}</div>
      </div>
      <button class="check ${done ? "done" : ""}" data-routine="${r.id}" data-done="${done}"></button>
    </div>`;
  }).join("") : `<div class="empty">No ${activeRoutineFrequency} routines yet. Add one when you’re ready.</div>`;

  document.querySelectorAll("[data-routine]").forEach(b=>{
    b.onclick=()=>toggleRoutine(b.dataset.routine,b.dataset.done==="true");
  });
}

function renderTasks(){
  const visible = tasks.filter(t=>!t.completed);
  $("taskList").innerHTML = visible.length ? visible.map(t=>`<div class="task-item">
    <button class="check" data-task="${t.id}"></button>
    <div><div class="task-title">${escapeHtml(t.title)}</div><div class="task-meta">captured task</div></div>
    <button class="delete" data-delete="${t.id}">×</button>
  </div>`).join("") : `<div class="empty">Nothing captured yet.</div>`;

  document.querySelectorAll("[data-task]").forEach(b=>b.onclick=()=>toggleTask(b.dataset.task,false));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteTask(b.dataset.delete));
}


function localDateKey(date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,"0");
  const day=String(date.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

function routineOccursOnDate(routine,date){
  if(routine.frequency === "daily") return true;
  if(routine.frequency === "weekly") return Number(routine.weekday) === date.getDay();
  if(routine.frequency === "monthly") return Number(routine.monthday) === date.getDate();
  return false;
}

function renderUpcoming(){
  const container = $("upcomingList");
  if(!container) return;

  const items=[];
  for(let offset=0; offset<7; offset++){
    const date=new Date();
    date.setHours(0,0,0,0);
    date.setDate(date.getDate()+offset);
    const dateKey=localDateKey(date);

    routines.filter(r=>routineOccursOnDate(r,date)).forEach(r=>items.push({
      date, title:r.title, detail:`routine · ${formatTime(r.time_of_day)}`
    }));

    tasks.filter(t=>!t.completed && t.due_date===dateKey).forEach(t=>items.push({
      date, title:t.title, detail:"scheduled task"
    }));
  }

  items.sort((a,b)=>a.date-b.date);
  const visible=items.slice(0,5);

  container.innerHTML=visible.length ? visible.map(item=>`
    <div class="upcoming-item">
      <div class="time">${item.date.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"})}</div>
      <div>
        <div class="task-title">${escapeHtml(item.title)}</div>
        <div class="task-meta">${escapeHtml(item.detail)}</div>
      </div>
    </div>
  `).join("") : `<div class="empty">Nothing scheduled for the next seven days.</div>`;
}

async function toggleRoutine(id,done){
  const routine = routines.find(item => item.id === id);
  if(!routine) return;

  const previousDate = routine.completion_date;
  const nextDate = done ? null : new Date().toISOString().slice(0,10);

  // Update the interface immediately.
  routine.completion_date = nextDate;
  renderRoutines();

  const { error } = await supabase
    .from("routines")
    .update({ completion_date: nextDate })
    .eq("id", id);

  // Roll back the visual change if syncing fails.
  if(error){
    routine.completion_date = previousDate;
    renderRoutines();
    alert(error.message);
  }
}

async function toggleTask(id,done){
  const task = tasks.find(item => item.id === id);
  if(!task) return;

  const previousValue = task.completed;
  task.completed = !done;
  renderTasks();
  renderUpcoming();

  const { error } = await supabase
    .from("tasks")
    .update({ completed: !done })
    .eq("id", id);

  if(error){
    task.completed = previousValue;
    renderTasks();
    renderUpcoming();
    alert(error.message);
  }
}

async function deleteTask(id){
  const previous=[...tasks];
  tasks=tasks.filter(task=>task.id!==id);
  renderTasks();
  renderUpcoming();

  const {error}=await supabase.from("tasks").delete().eq("id",id);
  if(error){
    tasks=previous;
    renderTasks();
    renderUpcoming();
    alert(error.message);
  }
}

$("taskInput").onkeydown = async e => {
  if(e.key !== "Enter") return;
  const title = $("taskInput").value.trim();
  if(!title) return;
  const { error } = await supabase.from("tasks").insert({user_id:session.user.id,title});
  if(error){ alert(error.message); return; }
  $("taskInput").value = "";
};

document.querySelectorAll(".routine-tab").forEach(button => {
  button.onclick = () => {
    activeRoutineFrequency = button.dataset.frequency;
    document.querySelectorAll(".routine-tab").forEach(x => x.classList.toggle("active", x === button));
    renderRoutines();
  };
});

function updateRoutineFields(){
  const frequency = $("routineFrequencyInput").value;
  $("weekdayField").classList.toggle("hidden", frequency !== "weekly");
  $("monthdayField").classList.toggle("hidden", frequency !== "monthly");
}

$("routineFrequencyInput").onchange = updateRoutineFields;

$("addRoutineButton").onclick = () => {
  $("routineForm").reset();
  $("routineTimeInput").value = "09:00";
  $("routineFrequencyInput").value = activeRoutineFrequency;
  updateRoutineFields();
  $("routineDialogError").textContent = "";
  $("routineDialog").showModal();
  setTimeout(() => $("routineTitleInput").focus(),250);
};

$("cancelRoutineButton").onclick = () => $("routineDialog").close();

$("routineForm").onsubmit = async event => {
  event.preventDefault();

  const title = $("routineTitleInput").value.trim();
  const frequency = $("routineFrequencyInput").value;
  const weekday = frequency === "weekly" ? Number($("routineWeekdayInput").value) : null;
  const monthday = frequency === "monthly" ? Number($("routineMonthdayInput").value) : null;

  if(!title){
    $("routineDialogError").textContent = "Enter a routine name.";
    return;
  }

  const { error } = await supabase.from("routines").insert({
    user_id:session.user.id,
    title,
    time_of_day:$("routineTimeInput").value,
    frequency,
    weekday,
    monthday,
    sort_order:routines.length
  });

  if(error){
    $("routineDialogError").textContent = error.message;
    return;
  }

  activeRoutineFrequency = frequency;
  document.querySelectorAll(".routine-tab").forEach(x => {
    x.classList.toggle("active", x.dataset.frequency === frequency);
  });

  $("routineDialog").close();
};

$("lockButton").onclick = () => {
  sessionStorage.removeItem("minddrop-unlocked");
  location.href = "./index.html";
};

const { data:{session:initialSession} } = await supabase.auth.getSession();
session = initialSession;

if(!session || sessionStorage.getItem("minddrop-unlocked") !== "yes"){
  location.href = "./index.html";
}else{
  await loadProfile();
  $("dashboardGreeting").textContent = `hey, ${profile.name}`;
  $("dashboardMotivation").textContent = motivations[Math.floor(Math.random()*motivations.length)];
  await loadData();
  realtimeStart();
}