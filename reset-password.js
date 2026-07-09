import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);

async function submitReset(){
  const password = $("newPasswordInput").value;
  if(password.length < 6){
    $("resetError").textContent = "Use at least 6 characters.";
    return;
  }

  $("resetError").textContent = "Updating…";
  const { error } = await supabase.auth.updateUser({ password });

  if(error){
    $("resetError").textContent = error.message;
    return;
  }

  $("resetError").textContent = "Password updated. Redirecting…";
  sessionStorage.removeItem("minddrop-unlocked");
  setTimeout(() => { location.href = "./index.html"; }, 1200);
}

$("newPasswordInput").onkeydown = e => { if(e.key === "Enter") submitReset(); };
$("resetSubmit").onclick = submitReset;
