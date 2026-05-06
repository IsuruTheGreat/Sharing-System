/**
 * Auth.js – WhatsApp login, user registration, session management
 *
 * Fixes applied:
 *  - Resend OTP link in OTP screen
 *  - Auto-logout after 30 minutes of inactivity, reset on activity
 *  - Project picker: auto-select if only 1 project (new users skip picker)
 *  - Add-project section inside project picker screen
 *  - No duplicate admin buttons (_showMainApp shows only navAdminBtn in nav)
 */

let activeSession = null;
let _autoLogoutTimer = null;
const AUTO_LOGOUT_MINUTES = 30;

// ---------------------------------------------------------------------------
// Auto-logout timer
// ---------------------------------------------------------------------------

function resetAutoLogoutTimer() {
  if (_autoLogoutTimer) clearTimeout(_autoLogoutTimer);
  _autoLogoutTimer = setTimeout(() => {
    clearSession();
    location.reload();
  }, AUTO_LOGOUT_MINUTES * 60 * 1000);
}

function startActivityTracking() {
  resetAutoLogoutTimer();
  ["click", "keydown", "touchstart", "mousemove"].forEach(evt => {
    document.addEventListener(evt, resetAutoLogoutTimer, { passive: true });
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initAuth() {
  const stored = sessionStorage.getItem("auth");
  if (stored) {
    try {
      activeSession = JSON.parse(stored);
      const tokenValid = await verifyToken(activeSession.token);
      if (tokenValid) {
        startActivityTracking();
        if (activeSession.isNew) {
          showRegistrationScreen();
        } else if (activeSession.role === "owner" || activeSession.role === "admin") {
          showAdminChoiceScreen();
        } else {
          showProjectPicker();
        }
        return;
      }
    } catch(e) { console.error(e); }
    sessionStorage.removeItem("auth");
  }
  showPhoneScreen();
}

async function verifyToken(token) {
  return true;
}

// ---------------------------------------------------------------------------
// Screen transitions
// ---------------------------------------------------------------------------

function showPhoneScreen() {
  document.getElementById("phoneScreen").classList.remove("hidden");
  document.getElementById("otpScreen").classList.add("hidden");
  document.getElementById("registerScreen").classList.add("hidden");
  document.getElementById("projectPickerScreen").classList.add("hidden");
  document.getElementById("mainSubmitForm").classList.add("hidden");
  const adminChoice = document.getElementById("adminChoiceScreen");
  if (adminChoice) adminChoice.classList.add("hidden");
}

function showOtpScreen(phone) {
  document.getElementById("phoneScreen").classList.add("hidden");
  document.getElementById("otpScreen").classList.remove("hidden");
  document.getElementById("otpPhoneSpan").innerText = phone.replace(/(\d{3})\d{4}(\d{3})/, "$1***$2");
  document.getElementById("otpPhone").value = phone;
}

function showRegistrationScreen() {
  document.getElementById("otpScreen").classList.add("hidden");
  document.getElementById("registerScreen").classList.remove("hidden");
  if (projectRows.length === 0) addProjectRow("", "");
}

function showProjectPicker() {
  ["phoneScreen","otpScreen","registerScreen","mainSubmitForm"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add("hidden"); });
  const adminChoice = document.getElementById("adminChoiceScreen");
  if (adminChoice) adminChoice.classList.add("hidden");
  document.getElementById("projectPickerScreen").classList.remove("hidden");
  loadProjectPicker();
}

// ---------------------------------------------------------------------------
// Admin / owner choice screen
// ---------------------------------------------------------------------------

function showAdminChoiceScreen() {
  ["phoneScreen","otpScreen","registerScreen","projectPickerScreen","mainSubmitForm"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add("hidden"); });

  let screen = document.getElementById("adminChoiceScreen");
  if (!screen) {
    screen = document.createElement("div");
    screen.id = "adminChoiceScreen";
    screen.className = "login-screen";
    screen.innerHTML = `
      <h2><i class="fas fa-user-shield"></i> Welcome, ${escapeHtml(activeSession.name || "Admin")}</h2>
      <p style="color:#8a6a5a;margin-bottom:1.5rem;">Where would you like to go?</p>
      <button id="choiceSubmitBtn" class="project-picker-item">
        <i class="fas fa-feather-alt"></i> Submit Post Form
      </button>
      <button id="choiceAdminBtn" class="project-picker-item" style="background:#fff0e3;border-color:#b34e1a;">
        <i class="fas fa-cog"></i> Admin Panel
      </button>
      <button id="choiceLogoutBtn"><i class="fas fa-sign-out-alt"></i> Log out</button>
    `;
    document.body.insertBefore(screen, document.body.firstChild);
  } else {
    screen.classList.remove("hidden");
  }

  document.getElementById("choiceSubmitBtn").onclick = () => {
    screen.classList.add("hidden");
    document.getElementById("projectPickerScreen").classList.remove("hidden");
    loadProjectPicker();
  };
  document.getElementById("choiceAdminBtn").onclick = () => {
    window.location.href = "../Admin/Admin.html";
  };
  document.getElementById("choiceLogoutBtn").onclick = () => {
    sessionStorage.removeItem("auth");
    location.reload();
  };
}

function showSubmitForm(selectedProject, selectedRole) {
  document.getElementById("projectPickerScreen").classList.add("hidden");
  activeSession.activeProject = { project: selectedProject, role: selectedRole };
  sessionStorage.setItem("auth", JSON.stringify(activeSession));
  if (typeof _showMainApp === "function") _showMainApp(activeSession);
}

// ---------------------------------------------------------------------------
// Phone screen — send OTP
// ---------------------------------------------------------------------------

document.getElementById("sendOtpBtn")?.addEventListener("click", () => sendOtp());

async function sendOtp() {
  let phone = document.getElementById("phoneNumber").value.trim();
  if (!phone) { alert("Enter WhatsApp number"); return; }
  phone = phone.replace(/\D/g, "");
  if (phone.length < 7) { alert("Invalid number"); return; }
  if (phone.startsWith("0") && phone.length === 10) {
    phone = "94" + phone.slice(1);
  }
  showLoading();
  try {
    const res  = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "sendOtp", phone })
    });
    const data = await res.json();
    if (data.success) showOtpScreen(phone);
    else alert(data.error);
  } catch(e) { alert("Network error"); }
  hideLoading();
}

// ---------------------------------------------------------------------------
// OTP screen — verify + resend
// ---------------------------------------------------------------------------

document.getElementById("verifyOtpBtn")?.addEventListener("click", async () => {
  const phone = document.getElementById("otpPhone").value;
  const code  = document.getElementById("otpCode").value.trim();
  if (!code) return;
  showLoading();
  try {
    const res  = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "verifyOtp", phone, code })
    });
    const data = await res.json();
    if (data.success) {
      if (data.isNew) {
        activeSession = { phone: data.phone, role: data.role, isNew: true };
        sessionStorage.setItem("auth", JSON.stringify(activeSession));
        showRegistrationScreen();
      } else {
        activeSession = {
          token:    data.token,
          phone:    data.user.phone,
          name:     data.user.name,
          role:     data.user.role,
          projects: data.user.projects,
          isNew:    false
        };
        sessionStorage.setItem("auth", JSON.stringify(activeSession));
        startActivityTracking();
        if (data.user.role === "owner" || data.user.role === "admin") {
          showAdminChoiceScreen();
        } else {
          showProjectPicker();
        }
      }
    } else {
      alert(data.error);
    }
  } catch(e) { alert("Network error"); }
  hideLoading();
});

// Resend OTP link
document.getElementById("resendOtpLink")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const phone = document.getElementById("otpPhone").value;
  if (!phone) return;
  showLoading();
  try {
    const res  = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "sendOtp", phone })
    });
    const data = await res.json();
    if (data.success) alert("Code resent!");
    else alert(data.error || "Could not resend.");
  } catch(e) { alert("Network error"); }
  hideLoading();
});

// ---------------------------------------------------------------------------
// Registration — dynamic project rows
// ---------------------------------------------------------------------------

let projectRows = [];

function addProjectRow(projectName, projectRole) {
  const container = document.getElementById("projectsRowsContainer");
  const index = projectRows.length;
  const rowDiv = document.createElement("div");
  rowDiv.className = "project-row";
  rowDiv.innerHTML = `
    <select class="projSelect" data-index="${index}">
      <option value="">-- Project --</option>
    </select>
    <input type="text" class="roleInput" placeholder="Role (Director, Chair…)" value="${escapeHtml(projectRole || '')}">
    <button type="button" class="removeProjBtn" data-index="${index}"><i class="fas fa-trash"></i></button>
  `;
  container.appendChild(rowDiv);
  populateSelect(rowDiv.querySelector(".projSelect"), projectName);
  projectRows.push({ div: rowDiv, project: projectName, role: projectRole });
  rowDiv.querySelector(".removeProjBtn").addEventListener("click", () => removeProjectRow(index));
}

function removeProjectRow(idx) {
  projectRows[idx].div.remove();
  projectRows.splice(idx, 1);
  projectRows.forEach((r, i) => {
    r.div.querySelector(".projSelect").dataset.index = i;
    r.div.querySelector(".removeProjBtn").dataset.index = i;
  });
}

async function populateSelect(selectEl, selectedVal) {
  try {
    const res      = await fetch(`${CONFIG.SCRIPT_URL}?action=getProjects`);
    const projects = await res.json();
    selectEl.innerHTML = '<option value="">-- Project --</option>' +
      projects.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join("");
    if (selectedVal) selectEl.value = selectedVal;
  } catch(e) { console.error("populateSelect error", e); }
}

document.getElementById("addProjectRowBtn")?.addEventListener("click", () => addProjectRow("", ""));

document.getElementById("registerConfirmBtn")?.addEventListener("click", async () => {
  const name = document.getElementById("regName").value.trim();
  if (!name) { alert("Enter your name"); return; }
  const projects = [];
  for (let row of projectRows) {
    const projSelect = row.div.querySelector(".projSelect");
    const roleInput  = row.div.querySelector(".roleInput");
    const project    = projSelect.value;
    const role       = roleInput.value.trim();
    if (!project || !role) { alert("Fill all project rows"); return; }
    projects.push({ project, role });
  }
  if (!projects.length) { alert("Add at least one project"); return; }
  showLoading();
  try {
    const res  = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "saveUser", name, projects, token: activeSession.token, phone: activeSession.phone })
    });
    const data = await res.json();
    if (data.success) {
      activeSession.token    = data.token;
      activeSession.name     = name;
      activeSession.projects = projects;
      activeSession.isNew    = false;
      sessionStorage.setItem("auth", JSON.stringify(activeSession));
      startActivityTracking();
      // Skip picker if only 1 project — go straight to form
      if (projects.length === 1) {
        showSubmitForm(projects[0].project, projects[0].role);
      } else {
        showProjectPicker();
      }
    } else {
      alert(data.error);
    }
  } catch(e) { alert("Network error"); }
  hideLoading();
});

// ---------------------------------------------------------------------------
// Project picker
// ---------------------------------------------------------------------------

async function loadProjectPicker() {
  const container = document.getElementById("projectPickerList");
  container.innerHTML = "";
  const projects = activeSession.projects || [];
  if (!projects.length) { showRegistrationScreen(); return; }

  // Auto-select if only 1 project (skip the picker)
  if (projects.length === 1) {
    showSubmitForm(projects[0].project, projects[0].role);
    return;
  }

  projects.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "project-picker-item";
    btn.innerHTML = `<i class="fas fa-folder"></i> ${escapeHtml(p.project)} — ${escapeHtml(p.role)}`;
    btn.addEventListener("click", () => showSubmitForm(p.project, p.role));
    container.appendChild(btn);
  });

  // Populate the add-project dropdowns in the picker
  const pickerSelect = document.getElementById("pickerAddProjectSelect");
  if (pickerSelect) populateSelect(pickerSelect, "");
}

// Add project from picker screen
document.getElementById("pickerAddProjectBtn")?.addEventListener("click", async () => {
  const projSelect = document.getElementById("pickerAddProjectSelect");
  const roleInput  = document.getElementById("pickerAddRoleInput");
  const project    = projSelect?.value;
  const role       = roleInput?.value.trim();
  if (!project || !role) { alert("Please fill project and role."); return; }
  showLoading();
  try {
    const updatedProjects = [...(activeSession.projects || []), { project, role }];
    const res  = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action:   "saveUser",
        name:     activeSession.name,
        projects: updatedProjects,
        token:    activeSession.token,
        phone:    activeSession.phone
      })
    });
    const data = await res.json();
    if (data.success) {
      activeSession.token    = data.token;
      activeSession.projects = updatedProjects;
      sessionStorage.setItem("auth", JSON.stringify(activeSession));
      if (roleInput) roleInput.value = "";
      if (projSelect) projSelect.value = "";
      loadProjectPicker();
    } else {
      alert(data.error);
    }
  } catch(e) { alert("Network error"); }
  hideLoading();
});

document.getElementById("backToLoginFromPicker")?.addEventListener("click", () => {
  sessionStorage.removeItem("auth");
  showPhoneScreen();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getSession() {
  try { return JSON.parse(sessionStorage.getItem("auth")); } catch(e) { return null; }
}

function clearSession() {
  sessionStorage.removeItem("auth");
  activeSession = null;
  if (_autoLogoutTimer) clearTimeout(_autoLogoutTimer);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
initAuth();