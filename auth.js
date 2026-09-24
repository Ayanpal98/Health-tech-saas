(() => {
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

  const loadSupabase = async () => {
    if (window.supabaseClient) return window.supabaseClient;
    const config = window.HEALTHSYNC_SUPABASE || {};
    if (!config.url || !config.anonKey) return null;
    const { createClient } = await import(SUPABASE_CDN);
    window.supabaseClient = createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return window.supabaseClient;
  };

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[ch]));

  const roleLabel = role => ({
    patient: "Patient",
    consultant: "Medical Consultant",
    pharmacy: "Pharmacy",
    admin: "Administrator"
  }[role] || "Account");

  const showToast = (message, type = "info") => {
    const old = document.getElementById("healthsync-toast");
    if (old) old.remove();
    const el = document.createElement("div");
    el.id = "healthsync-toast";
    el.className = "fixed right-5 bottom-5 z-[100] max-w-sm rounded-2xl px-5 py-4 shadow-2xl text-sm font-semibold " +
      (type === "error" ? "bg-red-600 text-white" : "bg-slate-900 text-white");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  };

  const modal = (content, title = "HealthSync") => {
    document.getElementById("healthsync-modal")?.remove();
    const wrap = document.createElement("div");
    wrap.id = "healthsync-modal";
    wrap.className = "fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto";
    wrap.innerHTML = `
      <div class="min-h-full flex items-center justify-center">
        <div class="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
          <div class="px-6 py-5 border-b flex items-center justify-between">
            <div><h2 class="text-xl font-extrabold text-slate-900">${escapeHtml(title)}</h2><p class="text-xs text-slate-500 mt-1">Secure account access</p></div>
            <button id="hs-modal-close" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600" aria-label="Close">×</button>
          </div>
          <div class="p-6">${content}</div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    document.getElementById("hs-modal-close").onclick = () => wrap.remove();
    wrap.addEventListener("click", e => { if (e.target === wrap) wrap.remove(); });
    return wrap;
  };

  const configReady = () => {
    const c = window.HEALTHSYNC_SUPABASE || {};
    return Boolean(c.url && c.anonKey);
  };

  const authForm = (mode = "login") => {
    const signup = mode === "signup";
    return `
      <div class="flex rounded-xl bg-slate-100 p-1 mb-5">
        <button type="button" data-mode="login" class="hs-auth-tab flex-1 rounded-lg py-2 text-sm font-bold ${signup ? "text-slate-500" : "bg-white shadow text-slate-900"}">Sign in</button>
        <button type="button" data-mode="signup" class="hs-auth-tab flex-1 rounded-lg py-2 text-sm font-bold ${signup ? "bg-white shadow text-slate-900" : "text-slate-500"}">Create account</button>
      </div>
      <form id="hs-auth-form" class="space-y-4">
        ${signup ? `
          <div>
            <label class="block text-sm font-semibold mb-1">Account type</label>
            <select id="hs-role" required class="w-full rounded-xl border border-slate-300 px-4 py-3">
              <option value="patient">Patient</option>
              <option value="consultant">Medical Consultant</option>
              <option value="pharmacy">Pharmacy</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-semibold mb-1">Full name</label>
            <input id="hs-name" required autocomplete="name" class="w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="Your full name">
          </div>` : ""}
        <div>
          <label class="block text-sm font-semibold mb-1">Email</label>
          <input id="hs-email" type="email" required autocomplete="email" class="w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="you@example.com">
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">Password</label>
          <input id="hs-password" type="password" required minlength="8" autocomplete="${signup ? "new-password" : "current-password"}" class="w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="At least 8 characters">
        </div>
        <button class="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white py-3 font-extrabold shadow-lg" type="submit">
          ${signup ? "Create secure account" : "Sign in"}
        </button>
        <p id="hs-auth-message" class="text-sm text-center text-slate-500"></p>
      </form>`;
  };

  const openAuth = async (mode = "login") => {
    if (!configReady()) {
      modal(`
        <div class="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          <strong>Supabase is not configured yet.</strong><br>
          Add the Project URL and anon/publishable key to <code>supabase-config.js</code>, then redeploy.
        </div>`, "Connect HealthSync");
      return;
    }

    const root = modal(authForm(mode), mode === "signup" ? "Create your HealthSync account" : "Welcome back");
    root.querySelectorAll(".hs-auth-tab").forEach(btn => {
      btn.onclick = () => {
        root.querySelector(".p-6").innerHTML = authForm(btn.dataset.mode);
        bindAuthForm(root, btn.dataset.mode);
      };
    });
    bindAuthForm(root, mode);
  };

  const bindAuthForm = (root, mode) => {
    root.querySelector("#hs-auth-form").onsubmit = async e => {
      e.preventDefault();
      const message = root.querySelector("#hs-auth-message");
      const supabase = await loadSupabase();
      if (!supabase) return;
      message.textContent = "Working…";

      try {
        if (mode === "signup") {
          const role = root.querySelector("#hs-role").value;
          const fullName = root.querySelector("#hs-name").value.trim();
          const email = root.querySelector("#hs-email").value.trim();
          const password = root.querySelector("#hs-password").value;

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { role, full_name: fullName } }
          });
          if (error) throw error;

          if (!data.session) {
            message.textContent = "Account created. Check your email to confirm your address, then sign in.";
          } else {
            root.remove();
            await renderSession();
          }
        } else {
          const email = root.querySelector("#hs-email").value.trim();
          const password = root.querySelector("#hs-password").value;
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          root.remove();
          await renderSession();
        }
      } catch (err) {
        message.textContent = err.message || "Authentication failed.";
        message.className = "text-sm text-center text-red-600";
      }
    };
  };

  const fetchProfile = async supabase => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (error) {
      console.error("Profile lookup failed:", error);
      return null;
    }
    return { user, profile: data };
  };

  const dashboardContent = (role, profile) => {
    const name = escapeHtml(profile?.full_name || "there");
    const common = `
      <div class="flex items-center justify-between gap-4 mb-7">
        <div><p class="text-sm text-slate-500">Signed in as</p><h2 class="text-2xl font-extrabold text-slate-900">${name}</h2><span class="inline-flex mt-2 rounded-full bg-rose-50 text-rose-700 px-3 py-1 text-xs font-bold">${roleLabel(role)}</span></div>
        <button id="hs-logout" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50">Sign out</button>
      </div>`;

    const cards = {
      patient: [
        ["Request care", "Create a consultation request and share only the information needed for provider matching.", "fa-hand-holding-medical"],
        ["Find consultants", "Future matching will use specialty, availability and service location.", "fa-user-doctor"],
        ["Track requests", "View consultation status and provider responses from one dashboard.", "fa-clock"]
      ],
      consultant: [
        ["Consultation queue", "Review eligible patient requests routed to your specialty and service area.", "fa-inbox"],
        ["Availability", "Control whether your profile can receive new consultation requests.", "fa-toggle-on"],
        ["Patient communication", "Secure consultation workflows will be added in the next build.", "fa-comments"]
      ],
      pharmacy: [
        ["Local requests", "Receive pharmacy coordination requests routed to your service area.", "fa-prescription-bottle-medical"],
        ["Store profile", "Keep your operating details and service location up to date.", "fa-store"],
        ["Fulfilment", "Track pharmacy coordination status as the workflow is expanded.", "fa-truck-medical"]
      ],
      admin: [
        ["Provider verification", "Review consultant and pharmacy account status.", "fa-user-shield"],
        ["Platform activity", "Monitor operational events and audit activity.", "fa-chart-line"],
        ["Safety controls", "Manage account status and platform access.", "fa-shield-halved"]
      ]
    }[role] || [];

    return common + `
      <div class="grid md:grid-cols-3 gap-4">
        ${cards.map(([title, desc, icon]) => `
          <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div class="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-rose-600 mb-4"><i class="fa-solid ${icon}"></i></div>
            <h3 class="font-extrabold text-slate-900 mb-2">${title}</h3>
            <p class="text-sm leading-6 text-slate-600">${desc}</p>
          </div>`).join("")}
      </div>
      <div class="mt-6 rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm text-rose-900">
        <strong>Build 1:</strong> Authentication and role-based access are connected to Supabase. Clinical diagnosis, prescribing and emergency response are not automated by this platform.
      </div>`;
  };

  const openDashboard = async () => {
    const supabase = await loadSupabase();
    if (!supabase) return openAuth("login");
    const session = await fetchProfile(supabase);
    if (!session) {
      showToast("Your account is signed in, but the profile is not available yet.", "error");
      return;
    }
    const root = modal(dashboardContent(session.profile.role, session.profile), "HealthSync Dashboard");
    root.querySelector("#hs-logout").onclick = async () => {
      await supabase.auth.signOut();
      root.remove();
      updateHeader(null);
      showToast("You have been signed out.");
    };
  };

  const updateHeader = session => {
    const container = document.querySelector("[data-healthsync-auth]");
    if (!container) return;
    container.innerHTML = session
      ? `<button id="hs-dashboard" class="rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-bold hover:bg-slate-800">Dashboard</button>`
      : `<button id="hs-login" class="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50">Sign in</button>
         <button id="hs-signup" class="rounded-xl bg-rose-600 text-white px-4 py-2.5 text-sm font-bold hover:bg-rose-700">Get started</button>`;

    container.querySelector("#hs-login")?.addEventListener("click", () => openAuth("login"));
    container.querySelector("#hs-signup")?.addEventListener("click", () => openAuth("signup"));
    container.querySelector("#hs-dashboard")?.addEventListener("click", openDashboard);
  };

  const renderSession = async () => {
    const supabase = await loadSupabase();
    if (!supabase) return updateHeader(null);
    const { data: { session } } = await supabase.auth.getSession();
    updateHeader(session);
  };

  const init = async () => {
    const host = document.querySelector("[data-healthsync-auth]");
    if (!host) return;

    const supabase = await loadSupabase();
    if (!supabase) {
      updateHeader(null);
      return;
    }

    supabase.auth.onAuthStateChange((_event, session) => updateHeader(session));
    await renderSession();
  };

  window.HealthSyncAuth = { openAuth, openDashboard };
  init();
})();