import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { ICON_MOON, ICON_SUN } from "./icons.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
const screens = [
  "loadingScreen","helloScreen","nameScreen","welcomeScreen","emailScreen",
  "passwordScreen","signInEmailScreen","signInPasswordScreen",
  "pinSetupScreen","pinUnlockScreen"
];

let session = null;
let profile = null;
let newName = "";
let newEmail = "";
let forcePinReset = false;

function show(id){ screens.forEach(x => $(x).classList.toggle("active", x === id)); }
function focusSoon(el){ setTimeout(() => el?.focus(), 420); }
function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function clearPins(selector){ document.querySelectorAll(selector).forEach(x => x.value = ""); }

function applyTheme(theme){
  document.documentElement.dataset.theme = theme;
  $("themeToggle").innerHTML = theme === "light" ? ICON_MOON : ICON_SUN;
  localStorage.setItem("minddrop-theme", theme);
}
$("themeToggle").onclick = () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
applyTheme(localStorage.getItem("minddrop-theme") || "light");

function connectPins(selector, complete){
  const list = [...document.querySelectorAll(selector)];
  list.forEach((input,index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g,"");
      if(input.value && list[index+1]) list[index+1].focus();
      if(list.every(x => x.value)) complete(list.map(x => x.value).join(""));
    });
    input.addEventListener("keydown", e => {
      if(e.key === "Backspace" && !input.value && list[index-1]) list[index-1].focus();
    });
  });
}

async function getProfile(){
  const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  if(error) throw error;
  profile = data;
}

function goToApp(){
  sessionStorage.setItem("minddrop-unlocked","yes");
  location.href = "./app.html";
}

async function routeSession(){
  if(!session){
    show("helloScreen");
    setTimeout(() => { show("nameScreen"); focusSoon($("nameInput")); },2100);
    return;
  }

  await getProfile();

  if(!profile?.pin_hash){
    show("pinSetupScreen");
    focusSoon(document.querySelector(".setup-pin"));
    return;
  }

  if(sessionStorage.getItem("minddrop-unlocked") === "yes"){
    goToApp();
    return;
  }

  $("pinGreeting").textContent = `welcome back, ${profile.name}`;
  show("pinUnlockScreen");
  focusSoon(document.querySelector(".unlock-pin"));
}

function submitName(){
  newName = $("nameInput").value.trim();
  if(!newName) return $("nameError").textContent = "Enter your name.";
  $("nameError").textContent = "";
  $("welcomeTitle").textContent = `oh, ${newName} — you’re new`;
  show("welcomeScreen");
  setTimeout(() => { show("emailScreen"); focusSoon($("emailInput")); },1800);
}
$("nameInput").onkeydown = e => { if(e.key === "Enter") submitName(); };
$("nameContinue").onclick = submitName;

function submitEmail(){
  newEmail = $("emailInput").value.trim();
  if(!validEmail(newEmail)) return $("emailError").textContent = "Enter a valid email.";
  $("emailError").textContent = "";
  show("passwordScreen");
  focusSoon($("passwordInput"));
}
$("emailInput").onkeydown = e => { if(e.key === "Enter") submitEmail(); };
$("emailContinue").onclick = submitEmail;

async function submitPassword(){
  const password = $("passwordInput").value;
  if(password.length < 6) return $("passwordError").textContent = "Use at least 6 characters.";

  $("passwordError").textContent = "Creating your account…";
  const { data, error } = await supabase.auth.signUp({
    email:newEmail,
    password,
    options:{data:{name:newName}}
  });

  if(error){
    $("passwordError").textContent = error.message;
    return;
  }

  if(!data.session){
    $("passwordError").textContent = "Email confirmation is still enabled in Supabase.";
    return;
  }

  session = data.session;
  $("passwordError").textContent = "";
  await getProfile();
  show("pinSetupScreen");
  focusSoon(document.querySelector(".setup-pin"));
}
$("passwordInput").onkeydown = e => { if(e.key === "Enter") submitPassword(); };
$("passwordContinue").onclick = submitPassword;

$("showSignIn").onclick = () => {
  show("signInEmailScreen");
  focusSoon($("signInEmail"));
};

function submitSignInEmail(){
  if(!validEmail($("signInEmail").value.trim())){
    $("signInEmailError").textContent = "Enter a valid email.";
    return;
  }
  $("signInEmailError").textContent = "";
  show("signInPasswordScreen");
  focusSoon($("signInPassword"));
}
$("signInEmail").onkeydown = e => { if(e.key === "Enter") submitSignInEmail(); };
$("signInEmailContinue").onclick = submitSignInEmail;

async function submitSignInPassword(){
  const { data,error } = await supabase.auth.signInWithPassword({
    email:$("signInEmail").value.trim(),
    password:$("signInPassword").value
  });

  if(error){
    $("signInPasswordError").textContent = error.message;
    return;
  }

  session = data.session;
  $("signInPasswordError").textContent = "";

  if(forcePinReset){
    forcePinReset = false;
    show("pinSetupScreen");
    focusSoon(document.querySelector(".setup-pin"));
    return;
  }

  await routeSession();
}
$("signInPassword").onkeydown = e => { if(e.key === "Enter") submitSignInPassword(); };
$("signInPasswordContinue").onclick = submitSignInPassword;

$("forgotPassword").onclick = async () => {
  const email = $("signInEmail").value.trim();
  if(!validEmail(email)){
    $("signInPasswordError").textContent = "Enter your email above first.";
    return;
  }
  $("signInPasswordError").textContent = "Sending reset link…";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("./reset-password.html", location.href).toString()
  });
  $("signInPasswordError").textContent = error ? error.message : "Check your email for a reset link.";
};

connectPins(".setup-pin", async pin => {
  $("pinSetupError").textContent = "Saving…";
  const { error } = await supabase.rpc("set_my_pin",{new_pin:pin});
  if(error){
    $("pinSetupError").textContent = error.message;
    clearPins(".setup-pin");
    return;
  }
  goToApp();
});

connectPins(".unlock-pin", async pin => {
  const { data,error } = await supabase.rpc("verify_my_pin",{entered_pin:pin});
  if(error || !data){
    $("unlockError").textContent = error?.message || "That PIN is not correct.";
    clearPins(".unlock-pin");
    focusSoon(document.querySelector(".unlock-pin"));
    return;
  }
  $("unlockError").textContent = "";
  goToApp();
});

$("useAnotherAccount").onclick = async () => {
  sessionStorage.removeItem("minddrop-unlocked");
  await supabase.auth.signOut();
  session = null;
  show("signInEmailScreen");
  focusSoon($("signInEmail"));
};

$("forgotPin").onclick = async () => {
  const email = session?.user?.email || "";
  forcePinReset = true;
  sessionStorage.removeItem("minddrop-unlocked");
  await supabase.auth.signOut();
  session = null;
  $("signInEmail").value = email;
  $("signInPasswordError").textContent = "";
  if(email){
    show("signInPasswordScreen");
    focusSoon($("signInPassword"));
  } else {
    show("signInEmailScreen");
    focusSoon($("signInEmail"));
  }
};

const { data:{session:initialSession} } = await supabase.auth.getSession();
session = initialSession;

try{
  await routeSession();
}catch(error){
  $("loadingScreen").innerHTML = `<div class="error">${error.message}</div>`;
}
