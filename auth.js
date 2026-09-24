(() => {
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";
  let realtimeChannels = [];

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

  const statusLabel = status => ({
    pending: "Matching",
    accepted: "Accepted",
    declined: "Declined",
    cancelled: "Cancelled",
    completed: "Completed"
  }[status] || status || "Unknown");

  const statusClass = status => ({
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
    declined: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
    completed: "bg-blue-50 text-blue-700 border-blue-200"
  }[status] || "bg-slate-100 text-slate-600 border-slate-200");

  const formatDate = value => value
    ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "—";

  const showToast = (message, type = "info") => {
    document.getElementById("healthsync-toast")?.remove();
    const el = document.createElement("div");
    el.id = "healthsync-toast";
    el.className = "fixed right-5 bottom-5 z-[120] max-w-sm rounded-2xl px-5 py-4 shadow-2xl text-sm font-semibold " +
      (type === "error" ? "bg-red-600 text-white" : type === "success" ? "bg-emerald-600 text-white" : "bg-slate-900 text-white");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  };

  const modal = (content, title = "HealthSync") => {
    document.getElementById("healthsync-modal")?.remove();
    const wrap = document.createElement("div");
    wrap.id = "healthsync-modal";
    wrap.className = "fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto";
    wrap.innerHTML = `
      <div class="min-h-full flex items-center justify-center">
        <div class="w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
          <div class="px-6 py-5 border-b flex items-center justify-between">
            <div>
              <h2 class="text-xl font-extrabold text-slate-900">${escapeHtml(title)}</h2>
              <p class="text-xs text-slate-500 mt-1">Health coordination workspace</p>
            </div>
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
      modal(`<div class="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
        <strong>Supabase is not configured yet.</strong><br>Add the Project URL and publishable key to <code>supabase-config.js</code>.
      </div>`, "Connect HealthSync");
      return;
    }

    const root = modal(authForm(mode), mode === "signup" ? "Create your HealthSync account" : "Welcome back");
    const bindTabs = () => root.querySelectorAll(".hs-auth-tab").forEach(btn => {
      btn.onclick = () => {
        root.querySelector(".p-6").innerHTML = authForm(btn.dataset.mode);
        bindTabs();
        bindAuthForm(root, btn.dataset.mode);
      };
    });
    bindTabs();
    bindAuthForm(root, mode);
  };

  const bindAuthForm = (root, mode) => {
    root.querySelector("#hs-auth-form").onsubmit = async e => {
      e.preventDefault();
      const message = root.querySelector("#hs-auth-message");
      const supabase = await loadSupabase();
      if (!supabase) return;
      message.textContent = "Working…";
      message.className = "text-sm text-center text-slate-500";

      try {
        if (mode === "signup") {
          const role = root.querySelector("#hs-role").value;
          const fullName = root.querySelector("#hs-name").value.trim();
          const email = root.querySelector("#hs-email").value.trim();
          const password = root.querySelector("#hs-password").value;
          const { data, error } = await supabase.auth.signUp({
            email, password, options: { data: { role, full_name: fullName } }
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
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
            if (error.message?.toLowerCase().includes("email not confirmed")) {
              message.innerHTML = "Your email is not confirmed yet. <button type="button" id="hs-resend-confirm" class="underline font-bold">Resend confirmation email</button>";
              message.className = "text-sm text-center text-amber-700";
              root.querySelector("#hs-resend-confirm").onclick = async () => {
                const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
                if (resendError) throw resendError;
                message.textContent = "Confirmation email sent. Check your inbox and then sign in again.";
              };
              return;
            }
            throw error;
          }
          if (!data.session) {
            message.textContent = "Sign-in succeeded but no active session was returned. Check your email confirmation and try again.";
            message.className = "text-sm text-center text-amber-700";
            return;
          }
          root.remove();
          await renderSession();
        }
      } catch (err) {
        message.textContent = err.message || "Authentication failed.";
        message.className = "text-sm text-center text-red-600";
      }
    };
  };

  const getSessionData = async supabase => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (error || !profile) return null;
    return { user, profile };
  };

  const invokeCare = async (payload) => {
    const supabase = await loadSupabase();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.functions.invoke("healthsync-care", { body: payload });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const getLocation = () => new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
  });

  const requestForm = async () => {
    const supabase = await loadSupabase();
    const { data: specialties, error } = await supabase.from("specialties").select("id,name").eq("active", true).order("name");
    if (error) throw error;

    const root = modal(`
      <form id="hs-care-form" class="space-y-5">
        <div class="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-sm text-rose-900">
          <strong>Need emergency care?</strong> HealthSync is a coordination platform, not an emergency treatment service. If this is a medical emergency, contact local emergency services or go to the nearest emergency department.
        </div>
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-bold mb-1">Specialty</label>
            <select id="hs-care-specialty" required class="w-full rounded-xl border border-slate-300 px-4 py-3">
              <option value="">Select specialty</option>
              ${(specialties || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="block text-sm font-bold mb-1">Urgency</label>
            <select id="hs-care-urgency" class="w-full rounded-xl border border-slate-300 px-4 py-3">
              <option value="routine">Routine</option>
              <option value="priority">Priority</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-bold mb-1">What do you need help with?</label>
          <textarea id="hs-care-description" required minlength="8" rows="5" class="w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="Describe your concern clearly. Avoid unnecessary sensitive information."></textarea>
        </div>
        <div class="grid md:grid-cols-3 gap-4">
          <input id="hs-care-city" class="rounded-xl border border-slate-300 px-4 py-3" placeholder="City">
          <input id="hs-care-district" class="rounded-xl border border-slate-300 px-4 py-3" placeholder="District">
          <input id="hs-care-state" class="rounded-xl border border-slate-300 px-4 py-3" placeholder="State">
        </div>
        <div class="rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-4">
          <div>
            <p class="font-bold text-slate-900">Use my approximate location</p>
            <p id="hs-location-status" class="text-xs text-slate-500 mt-1">Location is optional and used for provider matching.</p>
          </div>
          <button type="button" id="hs-get-location" class="shrink-0 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50">Use location</button>
        </div>
        <div>
          <label class="block text-sm font-bold mb-1">Communication preference</label>
          <select id="hs-care-communication" class="w-full rounded-xl border border-slate-300 px-4 py-3">
            <option value="secure_chat">Secure chat</option>
            <option value="voice">Voice</option>
            <option value="video">Video</option>
          </select>
        </div>
        <button type="submit" class="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white py-3 font-extrabold">Find available consultant</button>
        <p id="hs-care-message" class="text-sm text-center text-slate-500"></p>
      </form>`, "Request care");

    let coords = null;
    root.querySelector("#hs-get-location").onclick = async () => {
      const status = root.querySelector("#hs-location-status");
      status.textContent = "Requesting location permission…";
      coords = await getLocation();
      status.textContent = coords ? "Location captured for matching." : "Location was not available. You can continue with city/district/state.";
    };

    root.querySelector("#hs-care-form").onsubmit = async e => {
      e.preventDefault();
      const message = root.querySelector("#hs-care-message");
      message.textContent = "Creating request and finding available consultants…";
      try {
        if (!coords) coords = await getLocation();
        const data = await invokeCare({
          action: "create",
          specialty_id: root.querySelector("#hs-care-specialty").value,
          urgency: root.querySelector("#hs-care-urgency").value,
          description: root.querySelector("#hs-care-description").value.trim(),
          city: root.querySelector("#hs-care-city").value.trim(),
          district: root.querySelector("#hs-care-district").value.trim(),
          state: root.querySelector("#hs-care-state").value.trim(),
          communication_preference: root.querySelector("#hs-care-communication").value,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null
        });
        root.remove();
        showToast(data.message || "Care request created.", "success");
        await openDashboard();
      } catch (err) {
        message.textContent = err.message || "Could not create the care request.";
        message.className = "text-sm text-center text-red-600";
      }
    };
  };

  const fetchPatientRequests = async supabase => {
    const data = await invokeCare({ action: "workspace" });
    return data?.requests || [];
  };

  const fetchConsultantQueue = async supabase => {
    const { data, error } = await supabase
      .from("consultation_assignments")
      .select("id,request_id,status,responded_at,created_at,consultation_requests!inner(id,description,urgency,status,city,district,state,communication_preference,created_at,specialties(name))")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data || [];
  };

  const fetchConsultantActive = async supabase => {
    const { data, error } = await supabase
      .from("consultation_assignments")
      .select("id,request_id,status,responded_at,created_at,consultation_requests!inner(id,description,urgency,status,city,district,state,communication_preference,created_at,specialties(name))")
      .eq("status", "accepted")
      .order("responded_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data || [];
  };

  const fetchNotifications = async supabase => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id,type,title,body,entity_id,read_at,created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return data || [];
  };

  const requestStage = status => ({
    pending: ["Submitted", "Matching", "Consultant notified"],
    accepted: ["Submitted", "Matching", "Consultant notified", "Accepted"],
    completed: ["Submitted", "Matching", "Consultant notified", "Accepted", "Completed"],
    cancelled: ["Submitted", "Cancelled"],
    declined: ["Submitted", "Matching", "No consultant accepted"]
  }[status] || ["Submitted"]);

  const renderTimeline = status => {
    const stages = ["Submitted", "Matching", "Consultant notified", "Accepted", "Completed"];
    const reached = requestStage(status);
    return `<div class="grid grid-cols-5 gap-1 mt-4">${stages.map(stage => `<div class="text-center"><div class="h-1.5 rounded-full ${reached.includes(stage) ? "bg-emerald-500" : "bg-slate-200"}"></div><p class="text-[9px] mt-1">${stage}</p></div>`).join("")}</div>`;
  };

  const consultationWorkspace = async (supabase, request, profile) => {
    const specialty = request.specialties?.name || "Healthcare";
    const assignment = request.assignments?.find(a => a.status === "accepted") || request.assignments?.[0];
    const consultant = assignment?.consultant;
    const { data: messages, error } = await supabase.from("consultation_messages").select("id,sender_id,body,created_at").eq("request_id", request.id).order("created_at", { ascending: true });
    if (error) throw error;
    const renderMessages = rows => (rows || []).map(m => `<div class="flex ${m.sender_id === profile.id ? "justify-end" : "justify-start"}"><div class="max-w-[80%] rounded-2xl px-4 py-2 ${m.sender_id === profile.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}"><p class="text-sm whitespace-pre-wrap">${escapeHtml(m.body)}</p><p class="text-[10px] opacity-60 mt-1">${formatDate(m.created_at)}</p></div></div>`).join("") || '<p class="text-sm text-slate-500 text-center py-12">No messages yet. Start the secure conversation.</p>';
    const root = modal(`
      <div class="space-y-5">
        <div class="rounded-2xl bg-slate-50 border border-slate-200 p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><p class="text-xs uppercase font-bold text-slate-500">Active consultation</p><h3 class="text-xl font-extrabold mt-1">${escapeHtml(specialty)}</h3><p class="text-xs text-slate-500 mt-1">Request ID: ${escapeHtml(request.id)}</p></div>
            <span class="rounded-full border px-3 py-1 text-xs font-bold ${statusClass(request.status)}">${statusLabel(request.status)}</span>
          </div>
          <p class="text-sm text-slate-600 mt-3">${escapeHtml(request.description)}</p>
          ${consultant ? `<div class="mt-4 rounded-xl bg-white border p-3 text-sm"><span class="font-bold">Consultant:</span> ${escapeHtml(consultant.full_name || "Assigned consultant")} ${consultant.city ? "• " + escapeHtml(consultant.city) : ""}</div>` : ""}
        </div>
        <div id="hs-chat-list" class="h-72 overflow-y-auto rounded-2xl border border-slate-200 p-4 bg-white space-y-3">${renderMessages(messages)}</div>
        <form id="hs-chat-form" class="flex gap-2"><input id="hs-chat-input" maxlength="4000" required class="flex-1 rounded-xl border border-slate-300 px-4 py-3" placeholder="Write a message…"><button class="rounded-xl bg-slate-900 text-white px-5 font-bold">Send</button></form>
        <div class="flex flex-wrap gap-2">
          ${request.status === "accepted" ? '<button id="hs-complete-request" class="rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-bold">Mark consultation completed</button>' : ""}
          ${["pending","accepted"].includes(request.status) ? '<button id="hs-cancel-request" class="rounded-xl border border-red-200 text-red-700 px-4 py-2.5 text-sm font-bold">Cancel request</button>' : ""}
        </div>
        <p class="text-[11px] text-slate-500">HealthSync coordinates access and communication. Clinical diagnosis, treatment and prescribing remain with licensed professionals. Do not use chat for emergencies.</p>
      </div>`, "Secure consultation workspace");
    const list = root.querySelector("#hs-chat-list");
    list.scrollTop = list.scrollHeight;
    const refreshMessages = async () => {
      const latest = await supabase.from("consultation_messages").select("id,sender_id,body,created_at").eq("request_id", request.id).order("created_at", { ascending: true });
      list.innerHTML = renderMessages(latest.data);
      list.scrollTop = list.scrollHeight;
    };
    root.querySelector("#hs-chat-form").onsubmit = async e => {
      e.preventDefault();
      const input = root.querySelector("#hs-chat-input");
      const body = input.value.trim();
      if (!body) return;
      input.disabled = true;
      try { await invokeCare({ action: "send_message", request_id: request.id, body }); input.value = ""; await refreshMessages(); }
      catch (err) { showToast(err.message || "Could not send message.", "error"); }
      input.disabled = false; input.focus();
    };
    const action = async type => {
      try { await invokeCare({ action: type, request_id: request.id }); root.remove(); await openDashboard(); showToast(type === "complete" ? "Consultation completed." : "Request cancelled.", "success"); }
      catch (err) { showToast(err.message || "Could not update consultation.", "error"); }
    };
    root.querySelector("#hs-complete-request")?.addEventListener("click", () => action("complete"));
    root.querySelector("#hs-cancel-request")?.addEventListener("click", () => action("cancel"));
    const channel = supabase.channel(`healthsync-chat-${request.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "consultation_messages", filter: `request_id=eq.${request.id}` }, refreshMessages).subscribe();
    const close = root.querySelector("#hs-modal-close");
    close?.addEventListener("click", () => supabase.removeChannel(channel));
    root.addEventListener("click", e => { if (e.target === root) supabase.removeChannel(channel); });
  };

  const patientDashboard = async (supabase, profile) => {
    const [requests, notifications] = await Promise.all([fetchPatientRequests(supabase), fetchNotifications(supabase)]);
    return `
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><p class="text-sm text-slate-500">Patient workspace</p><h3 class="text-2xl font-extrabold text-slate-900">Welcome, ${escapeHtml(profile.full_name)}</h3></div>
        <button id="hs-request-care" class="rounded-xl bg-rose-600 text-white px-4 py-3 text-sm font-extrabold hover:bg-rose-700"><i class="fa-solid fa-hand-holding-medical mr-2"></i>Request care</button>
      </div>
      <div class="grid md:grid-cols-3 gap-4 mb-7">
        <div class="rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-bold text-slate-500">Requests</p><p class="text-3xl font-black mt-2">${requests.length}</p></div>
        <div class="rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-bold text-slate-500">Active</p><p class="text-3xl font-black mt-2">${requests.filter(r => ["pending","accepted"].includes(r.status)).length}</p></div>
        <div class="rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-bold text-slate-500">Unread</p><p class="text-3xl font-black mt-2">${notifications.filter(n => !n.read_at).length}</p></div>
      </div>
      <div class="rounded-2xl bg-rose-50 border border-rose-100 p-4 mb-5 text-sm text-rose-900"><strong>Emergency:</strong> HealthSync is not an emergency service. Contact local emergency services or go to the nearest emergency department for medical emergencies.</div>
      <div class="space-y-4">
        ${requests.length ? requests.map(r => {
          const specialty = r.specialties?.name || "Healthcare";
          const assignment = r.assignments?.find(a => a.status === "accepted") || r.assignments?.find(a => a.status === "pending") || r.assignments?.[0];
          const consultant = assignment?.consultant;
          return `<article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div><div class="flex items-center gap-2"><h4 class="font-extrabold">${escapeHtml(specialty)}</h4><span class="text-[11px] uppercase font-bold rounded-full border px-2 py-1 ${statusClass(r.status)}">${statusLabel(r.status)}</span></div><p class="text-sm text-slate-600 mt-2">${escapeHtml(r.description)}</p></div>
              <div class="text-right"><p class="text-xs text-slate-400">Request ID</p><p class="text-[11px] font-mono text-slate-600">${escapeHtml(r.id)}</p><p class="text-xs text-slate-400 mt-1">${formatDate(r.created_at)}</p></div>
            </div>
            ${renderTimeline(r.status)}
            <div class="mt-4 grid sm:grid-cols-3 gap-3 text-xs text-slate-600"><div><span class="font-bold">Urgency:</span> ${escapeHtml(r.urgency)}</div><div><span class="font-bold">Area:</span> ${escapeHtml([r.city,r.district,r.state].filter(Boolean).join(", ") || "Not provided")}</div><div><span class="font-bold">Consultant:</span> ${escapeHtml(consultant?.full_name || (assignment ? "Awaiting response" : "Matching"))}</div></div>
            <div class="mt-4 flex flex-wrap gap-2">
              ${r.status === "accepted" ? '<button data-open-consultation="' + r.id + '" class="hs-open-consultation rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-bold">Open consultation</button>' : ""}
              ${["pending","accepted"].includes(r.status) ? '<button data-cancel-request="' + r.id + '" class="hs-cancel-request rounded-xl border border-red-200 text-red-700 px-4 py-2.5 text-sm font-bold">Cancel request</button>' : ""}
            </div>
          </article>`;
        }).join("") : '<div class="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No care requests yet. Start by requesting a consultant.</div>'}
      </div>
      <aside class="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-5"><h4 class="font-extrabold mb-3">Recent notifications</h4>${notifications.length ? notifications.slice(0,5).map(n => `<div class="py-2 border-b last:border-0 border-slate-200"><p class="text-sm font-bold">${escapeHtml(n.title)}</p><p class="text-xs text-slate-600 mt-1">${escapeHtml(n.body)}</p><p class="text-[10px] text-slate-400 mt-1">${formatDate(n.created_at)}</p></div>`).join("") : '<p class="text-sm text-slate-500">No notifications yet.</p>'}</aside>`;
  };

  const consultantDashboard = async (supabase, profile) => {
    const [queue, active, notifications] = await Promise.all([fetchConsultantQueue(supabase), fetchConsultantActive(supabase), fetchNotifications(supabase)]);
    const { data: consultantProfile } = await supabase.from("consultant_profiles").select("specialty,is_available,verification_status,service_radius_km").eq("user_id", profile.id).single();
    return `
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><p class="text-sm text-slate-500">Consultant workspace</p><h3 class="text-2xl font-extrabold text-slate-900">Consultation queue</h3></div>
        <div class="flex items-center gap-2"><span class="rounded-full border px-3 py-2 text-xs font-bold ${consultantProfile?.verification_status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}">${consultantProfile?.verification_status === "active" ? "Verified" : "Verification pending"}</span><button id="hs-toggle-availability" class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold">${consultantProfile?.is_available ? "Available" : "Set available"}</button></div>
      </div>
      <div class="grid md:grid-cols-3 gap-4 mb-7">
        <div class="rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-bold text-slate-500">Pending queue</p><p class="text-3xl font-black mt-2">${queue.length}</p></div>
        <div class="rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-bold text-slate-500">Active consultations</p><p class="text-3xl font-black mt-2">${active.length}</p></div>
        <div class="rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-bold text-slate-500">Service radius</p><p class="text-lg font-extrabold mt-2">${escapeHtml(consultantProfile?.service_radius_km || 25)} km</p></div>
      </div>
      <div class="space-y-3">
        ${queue.length ? queue.map(a => {
          const r = Array.isArray(a.consultation_requests) ? a.consultation_requests[0] : a.consultation_requests;
          return `<article class="rounded-2xl border border-slate-200 p-5 bg-white"><div class="flex flex-wrap items-start justify-between gap-3"><div><div class="flex items-center gap-2"><h4 class="font-extrabold">${escapeHtml(r?.specialties?.name || consultantProfile?.specialty || "Consultation")}</h4><span class="text-[11px] uppercase font-bold rounded-full border px-2 py-1 ${statusClass(r?.urgency)}">${escapeHtml(r?.urgency || "routine")}</span></div><p class="text-sm text-slate-600 mt-2">${escapeHtml(r?.description || "Request details unavailable")}</p></div><span class="text-xs text-slate-500">${formatDate(r?.created_at)}</span></div><div class="mt-4 flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-slate-500">Area: ${escapeHtml([r?.city,r?.district,r?.state].filter(Boolean).join(", ") || "Not provided")}</p><div class="flex gap-2"><button data-assignment="${a.id}" data-decision="decline" class="hs-assignment-action rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold">Decline</button><button data-assignment="${a.id}" data-decision="accept" class="hs-assignment-action rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-bold">Accept</button></div></div></article>`;
        }).join("") : '<div class="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No matching requests are waiting for you.</div>'}
      </div>
      <div class="mt-7"><h4 class="font-extrabold mb-3">Active consultations</h4><div class="space-y-3">
        ${active.length ? active.map(a => { const r=Array.isArray(a.consultation_requests)?a.consultation_requests[0]:a.consultation_requests; return `<article class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div class="flex items-start justify-between gap-3"><div><h4 class="font-extrabold">${escapeHtml(r?.specialties?.name || consultantProfile?.specialty || "Consultation")}</h4><p class="text-sm text-slate-600 mt-1">${escapeHtml(r?.description || "")}</p></div><span class="text-xs text-emerald-700 font-bold">Accepted</span></div><div class="mt-4 flex justify-between items-center"><span class="text-xs text-slate-500">${formatDate(r?.created_at)}</span><button data-consultation-request="${r?.id}" class="hs-consultation-open rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-bold">Open consultation</button></div></article>`; }).join("") : '<p class="text-sm text-slate-500">No active consultations.</p>'}
      </div></div>
      <div class="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-5"><h4 class="font-extrabold mb-2">Notifications</h4>${notifications.slice(0,4).map(n => `<div class="py-2 border-b last:border-0 border-slate-200"><p class="text-sm font-bold">${escapeHtml(n.title)}</p><p class="text-xs text-slate-600">${escapeHtml(n.body)}</p></div>`).join("") || '<p class="text-sm text-slate-500">No notifications yet.</p>'}</div>`;
  };

  const toggleAvailability = async (supabase, userId, nextValue) => {
    const { error } = await supabase.from("consultant_profiles").update({ is_available: nextValue }).eq("user_id", userId);
    if (error) throw error;
  };

  const dashboardContent = (role, profile) => `
    <div class="flex items-center justify-between gap-4 mb-7">
      <div><p class="text-sm text-slate-500">Signed in as</p><h2 class="text-2xl font-extrabold text-slate-900">${escapeHtml(profile?.full_name || "there")}</h2><span class="inline-flex mt-2 rounded-full bg-rose-50 text-rose-700 px-3 py-1 text-xs font-bold">${roleLabel(role)}</span></div>
      <button id="hs-logout" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50">Sign out</button>
    </div>
    <div id="hs-dashboard-body" class="min-h-[180px]"><div class="text-center py-10 text-slate-500">Loading your workspace…</div></div>`;

  const subscribeRealtime = async (supabase, profile, refresh) => {
    realtimeChannels.forEach(ch => supabase.removeChannel(ch));
    realtimeChannels = [];
    const userId = profile.id;

    const channel = supabase.channel(`healthsync-user-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "consultation_assignments", filter: `consultant_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "consultation_requests", filter: `patient_id=eq.${userId}` }, refresh)
      .subscribe();
    realtimeChannels.push(channel);
  };

  const openDashboard = async () => {
    const supabase = await loadSupabase();
    if (!supabase) return openAuth("login");
    const session = await getSessionData(supabase);
    if (!session) {
      showToast("Your account is signed in, but the profile is not available yet.", "error");
      return;
    }

    const root = modal(dashboardContent(session.profile.role, session.profile), "HealthSync Dashboard");
    root.querySelector("#hs-logout").onclick = async () => {
      realtimeChannels.forEach(ch => supabase.removeChannel(ch));
      realtimeChannels = [];
      await supabase.auth.signOut();
      root.remove();
      updateHeader(null);
      showToast("You have been signed out.");
    };

    const body = root.querySelector("#hs-dashboard-body");
    const refresh = async () => {
      try {
        if (session.profile.role === "patient") {
          const requests = await fetchPatientRequests(supabase);
          body.innerHTML = await patientDashboard(supabase, session.profile);
          root.querySelector("#hs-request-care").onclick = requestForm;
          root.querySelectorAll(".hs-open-consultation").forEach(btn => btn.onclick = async () => {
            const request = requests.find(r => r.id === btn.dataset.openConsultation);
            if (request) await consultationWorkspace(supabase, request, session.profile);
          });
          root.querySelectorAll(".hs-cancel-request").forEach(btn => btn.onclick = async () => {
            try { await invokeCare({ action: "cancel", request_id: btn.dataset.cancelRequest }); showToast("Request cancelled.", "success"); await refresh(); }
            catch (err) { showToast(err.message || "Could not cancel request.", "error"); }
          });
        } else if (session.profile.role === "consultant") {
          const activeConsultations = await fetchConsultantActive(supabase);
          body.innerHTML = await consultantDashboard(supabase, session.profile);
          root.querySelectorAll(".hs-consultation-open").forEach(btn => btn.onclick = async () => {
            const item = activeConsultations.find(a => a.request_id === btn.dataset.consultationRequest);
            if (!item) return;
            const request = Array.isArray(item.consultation_requests) ? item.consultation_requests[0] : item.consultation_requests;
            await consultationWorkspace(supabase, { ...request, id: request.id, assignments: [{ id: item.id, request_id: item.request_id, status: "accepted" }] }, session.profile);
          });
          root.querySelector("#hs-toggle-availability").onclick = async () => {
            try {
              const { data } = await supabase.from("consultant_profiles").select("is_available").eq("user_id", session.profile.id).single();
              await toggleAvailability(supabase, session.profile.id, !data?.is_available);
              await refresh();
              showToast("Availability updated.", "success");
            } catch (err) { showToast(err.message || "Could not update availability.", "error"); }
          };
          root.querySelectorAll(".hs-assignment-action").forEach(btn => {
            btn.onclick = async () => {
              btn.disabled = true;
              try {
                const result = await invokeCare({ action: "respond", assignment_id: btn.dataset.assignment, decision: btn.dataset.decision });
                showToast(result.status === "accepted" ? "Request accepted." : "Request declined.", result.status === "accepted" ? "success" : "info");
                await refresh();
              } catch (err) {
                btn.disabled = false;
                showToast(err.message || "Could not update request.", "error");
              }
            };
          });
        } else {
          body.innerHTML = `
            <div class="grid md:grid-cols-3 gap-4">
              <div class="rounded-2xl border p-5"><h3 class="font-extrabold">Provider verification</h3><p class="text-sm text-slate-600 mt-2">Review provider accounts and activate verified consultants/pharmacies.</p></div>
              <div class="rounded-2xl border p-5"><h3 class="font-extrabold">Platform activity</h3><p class="text-sm text-slate-600 mt-2">Audit operational events as the platform grows.</p></div>
              <div class="rounded-2xl border p-5"><h3 class="font-extrabold">Safety controls</h3><p class="text-sm text-slate-600 mt-2">Manage access and account status.</p></div>
            </div>`;
          };
        }
      } catch (err) {
        body.innerHTML = `<div class="rounded-2xl bg-red-50 border border-red-200 p-5 text-sm text-red-700">${escapeHtml(err.message || "Could not load dashboard.")}</div>`;
      }
    };

    await refresh();
    await subscribeRealtime(supabase, session.profile, refresh);
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
    if (!supabase) return updateHeader(null);
    supabase.auth.onAuthStateChange((_event, session) => updateHeader(session));
    await renderSession();
  };

  window.HealthSyncAuth = { openAuth, openDashboard, requestCare: requestForm };
  init();
})();