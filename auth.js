(() => {
  const USERS = 'healthsync_users_v1';
  const SESSION = 'healthsync_session_v1';
  const REQUESTS = 'healthsync_requests_v1';

  const demoUsers = [
    {id:'demo-patient',name:'Demo Patient',email:'patient@healthsync.demo',password:'Patient@123',role:'patient'},
    {id:'demo-doctor',name:'Dr. Demo Consultant',email:'doctor@healthsync.demo',password:'Doctor@123',role:'doctor',specialty:'General Medicine',available:true},
    {id:'demo-pharmacy',name:'Demo Pharmacy',email:'pharmacy@healthsync.demo',password:'Pharmacy@123',role:'pharmacy',location:'Agartala',available:true}
  ];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
  const put = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const id = () => crypto.randomUUID ? crypto.randomUUID() : 'hs-' + Date.now();

  async function hash(value) {
    const data = new TextEncoder().encode(value);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2,'0')).join('');
  }

  async function initUsers() {
    let list = get(USERS, []);
    if (!list.length) list = demoUsers;
    for (const u of list) if (!u.passwordHash) { u.passwordHash = await hash(u.password || ''); delete u.password; }
    put(USERS, list);
    return list;
  }

  const session = () => get(SESSION, null);
  const requests = () => get(REQUESTS, []);

  function toast(message, error=false) {
    const el = document.createElement('div');
    el.className = 'fixed bottom-5 right-5 z-[120] px-5 py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold shadow-2xl';
    el.innerHTML = '<span class="' + (error ? 'text-rose-300' : 'text-emerald-300') + '">' + esc(message) + '</span>';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function auth(mode='login') {
    document.getElementById('hs-auth')?.remove();
    const signup = mode === 'signup';
    const root = document.createElement('div');
    root.id = 'hs-auth';
    root.className = 'fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4';
    root.innerHTML = '<div class="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">' +
      '<div class="p-7 border-b border-slate-100 flex justify-between items-start"><div><div class="text-xs font-bold uppercase tracking-widest text-rose-600">HealthSync</div><h2 class="text-2xl font-extrabold text-slate-900 mt-1">' + (signup?'Create your account':'Sign in') + '</h2><p class="text-sm text-slate-500 mt-1">' + (signup?'Choose your portal.':'Access your healthcare portal.') + '</p></div><button id="hs-close" class="w-10 h-10 rounded-xl bg-slate-100"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<form id="hs-auth-form" class="p-7 space-y-4">' +
      (signup?'<input name="name" required placeholder="Full name" class="w-full px-4 py-3 rounded-xl border border-slate-200">':'') +
      '<input name="email" type="email" required placeholder="Email address" class="w-full px-4 py-3 rounded-xl border border-slate-200">' +
      '<input name="password" type="password" required minlength="8" placeholder="Password (8+ characters)" class="w-full px-4 py-3 rounded-xl border border-slate-200">' +
      (signup?'<select name="role" id="hs-role" class="w-full px-4 py-3 rounded-xl border border-slate-200"><option value="patient">Patient</option><option value="doctor">Medical Consultant</option><option value="pharmacy">Pharmacy</option></select><input id="hs-specialty" name="specialty" class="hidden w-full px-4 py-3 rounded-xl border border-slate-200" placeholder="Medical specialty"><input id="hs-location" name="location" class="hidden w-full px-4 py-3 rounded-xl border border-slate-200" placeholder="City / locality">':'') +
      '<p id="hs-msg" class="text-xs font-semibold text-rose-600 min-h-4"></p>' +
      '<button class="w-full py-3.5 rounded-xl bg-rose-600 text-white font-bold">' + (signup?'Create account':'Sign in') + '</button>' +
      (!signup?'<button type="button" id="hs-reset" class="w-full text-xs font-semibold text-slate-500">Forgot password?</button>':'') +
      '<p class="text-center text-sm text-slate-500">' + (signup?'Already registered? ':'New here? ') + '<button type="button" id="hs-switch" class="font-bold text-rose-600">' + (signup?'Sign in':'Create account') + '</button></p>' +
      '<p class="text-[11px] leading-relaxed text-slate-400">Prototype mode: credentials are stored locally. Do not enter real patient or medical information until production authentication and secure backend storage are connected.</p>' +
      '</form></div>';

    document.body.appendChild(root);
    root.querySelector('#hs-close').onclick = () => root.remove();
    root.querySelector('#hs-switch').onclick = () => auth(signup?'login':'signup');
    root.addEventListener('click', e => { if (e.target === root) root.remove(); });

    const role = root.querySelector('#hs-role');
    if (role) role.onchange = () => {
      root.querySelector('#hs-specialty').classList.toggle('hidden', role.value !== 'doctor');
      root.querySelector('#hs-location').classList.toggle('hidden', role.value !== 'pharmacy');
    };

    root.querySelector('#hs-auth-form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = String(fd.get('email')).trim().toLowerCase();
      const password = String(fd.get('password'));
      const msg = root.querySelector('#hs-msg');
      const list = await initUsers();
      if (!/^\S+@\S+\.\S+$/.test(email)) return msg.textContent='Enter a valid email.';
      if (password.length < 8) return msg.textContent='Password must be at least 8 characters.';
      const passwordHash = await hash(password);

      if (signup) {
        const name = String(fd.get('name') || '').trim();
        if (name.length < 2) return msg.textContent='Enter your full name.';
        if (list.some(u => u.email === email)) return msg.textContent='An account already exists for this email.';
        const user = {id:id(),name,email,passwordHash,role:String(fd.get('role')),available:true,createdAt:new Date().toISOString()};
        if (user.role === 'doctor') user.specialty = String(fd.get('specialty') || 'General Medicine');
        if (user.role === 'pharmacy') user.location = String(fd.get('location') || '');
        list.push(user); put(USERS,list); put(SESSION,{id:user.id,name:user.name,email:user.email,role:user.role});
        root.remove(); toast('Account created successfully.'); dashboard(); return;
      }

      const user = list.find(u => u.email === email && u.passwordHash === passwordHash);
      if (!user) return msg.textContent='Incorrect email or password.';
      put(SESSION,{id:user.id,name:user.name,email:user.email,role:user.role});
      root.remove(); toast('Signed in successfully.'); dashboard();
    };

    root.querySelector('#hs-reset')?.addEventListener('click', () => toast('Password reset requires a secure email backend in production.', true));
  }

  function card(label,value,icon) {
    return '<div class="bg-white rounded-2xl border border-slate-200 p-5"><div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><i class="fa-solid '+icon+'"></i></div><div class="text-2xl font-extrabold mt-4">'+esc(value)+'</div><div class="text-xs font-semibold text-slate-500 mt-1">'+esc(label)+'</div></div>';
  }

  function requestCards(me, role) {
    const list = requests();
    const rows = role==='patient' ? list.filter(r=>r.patientId===me.id) : role==='doctor' ? list.filter(r=>r.type==='consultation' && r.status==='pending' && r.specialty===me.specialty) : list.filter(r=>r.type==='pharmacy' && r.status==='pending');
    if (!rows.length) return '<div class="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-sm text-slate-500">No active requests.</div>';
    return rows.map(r => '<div class="p-5 rounded-2xl border border-slate-200 mb-3"><div class="flex justify-between gap-3"><div><b>'+esc(r.specialty)+'</b><div class="text-xs text-slate-500 mt-1">'+esc(r.location)+' • '+new Date(r.createdAt).toLocaleString()+'</div></div><span class="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-bold">'+esc(r.status)+'</span></div><p class="text-sm text-slate-600 mt-3">'+esc(r.notes)+'</p>' +
      (role!=='patient' && r.status==='pending'?'<div class="flex gap-2 mt-4"><button data-accept="'+r.id+'" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Accept</button><button data-decline="'+r.id+'" class="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">Decline</button></div>':'') +
      '</div>').join('');
  }

  function dashboard() {
    const me = session();
    if (!me) return;
    document.getElementById('hs-dashboard')?.remove();
    const root = document.createElement('div');
    root.id='hs-dashboard';
    root.className='fixed inset-0 z-[100] bg-slate-50 overflow-auto';
    let body='';

    if (me.role==='patient') {
      const mine=requests().filter(r=>r.patientId===me.id);
      body='<div class="grid md:grid-cols-3 gap-4 mb-6">'+card('My requests',mine.length,'fa-notes-medical')+card('Care status',mine.some(r=>r.status==='accepted')?'Provider accepted':'Awaiting match','fa-user-doctor')+card('Emergency support','Escalation only','fa-triangle-exclamation')+'</div>' +
      '<div class="bg-white rounded-3xl border border-slate-200 p-6 mb-6"><h3 class="text-xl font-extrabold">Request a consultation</h3><p class="text-sm text-slate-500 mt-1">Requests are routed by specialty, availability and location. Diagnosis and treatment remain with licensed clinicians.</p><form id="hs-request" class="grid md:grid-cols-2 gap-4 mt-5"><select name="specialty" required class="px-4 py-3 rounded-xl border border-slate-200"><option value="">Specialty</option><option>General Medicine</option><option>Cardiology</option><option>Dermatology</option><option>Pediatrics</option><option>Gynecology</option><option>Orthopedics</option></select><input name="location" required placeholder="City / locality" class="px-4 py-3 rounded-xl border border-slate-200"><textarea name="notes" required placeholder="Briefly describe what you need help with" class="md:col-span-2 min-h-28 px-4 py-3 rounded-xl border border-slate-200"></textarea><button class="md:col-span-2 px-5 py-3 rounded-xl bg-rose-600 text-white font-bold">Send consultation request</button></form><div id="hs-request-status" class="mt-4"></div></div>' +
      '<h3 class="text-xl font-extrabold mb-3">My requests</h3>'+requestCards(me,'patient');
    } else if (me.role==='doctor') {
      const pending=requests().filter(r=>r.type==='consultation'&&r.status==='pending'&&r.specialty===me.specialty);
      body='<div class="grid md:grid-cols-3 gap-4 mb-6">'+card('Pending requests',pending.length,'fa-bell')+card('Specialty',me.specialty,'fa-stethoscope')+card('Availability',me.available===false?'Offline':'Available','fa-circle')+'</div>' +
      '<div class="bg-white rounded-3xl border border-slate-200 p-6"><div class="flex justify-between items-center mb-5"><div><h3 class="text-xl font-extrabold">Consultation queue</h3><p class="text-sm text-slate-500 mt-1">Requests appear when the specialty matches your profile.</p></div><button id="hs-toggle" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Toggle availability</button></div>'+requestCards(me,'doctor')+'</div>';
    } else {
      const pending=requests().filter(r=>r.type==='pharmacy'&&r.status==='pending');
      body='<div class="grid md:grid-cols-3 gap-4 mb-6">'+card('Open pharmacy requests',pending.length,'fa-prescription-bottle-medical')+card('Location',me.location||'Not configured','fa-location-dot')+card('Status',me.available===false?'Closed':'Open','fa-store')+'</div><div class="bg-white rounded-3xl border border-slate-200 p-6"><h3 class="text-xl font-extrabold">Pharmacy coordination</h3><p class="text-sm text-slate-500 mt-1 mb-5">This workflow coordinates availability/contact; it does not prescribe medication.</p>'+requestCards(me,'pharmacy')+'</div>';
    }

    root.innerHTML='<header class="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200"><div class="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center"><div><div class="text-xs font-bold uppercase tracking-widest text-rose-600">HealthSync Portal</div><div class="font-extrabold text-slate-900">'+esc(me.name)+'</div></div><div class="flex gap-2 items-center"><span class="px-3 py-1 rounded-full bg-slate-100 text-xs font-bold">'+esc(me.role)+'</span><button id="hs-logout" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Logout</button></div></div></header><main class="max-w-6xl mx-auto px-4 py-8">'+body+'<div class="mt-8 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800"><b>Safety:</b> This prototype coordinates access to professionals. It does not diagnose, prescribe, or replace emergency services.</div></main>';
    document.body.appendChild(root);

    root.querySelector('#hs-logout').onclick=()=>{localStorage.removeItem(SESSION);root.remove();toast('Signed out.');};
    root.querySelector('#hs-request')?.addEventListener('submit',e=>{
      e.preventDefault(); const fd=new FormData(e.target);
      const list=requests(); list.unshift({id:id(),patientId:me.id,type:'consultation',specialty:String(fd.get('specialty')),location:String(fd.get('location')),notes:String(fd.get('notes')),status:'pending',createdAt:new Date().toISOString()}); put(REQUESTS,list);
      root.querySelector('#hs-request-status').innerHTML='<div class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-800">Request sent. Matching consultants will receive it in their portal.</div>';
      setTimeout(dashboard,800);
    });
    root.querySelector('#hs-toggle')?.addEventListener('click',async()=>{const list=await initUsers();const u=list.find(x=>x.id===me.id);u.available=u.available===false;put(USERS,list);toast(u.available?'Availability enabled.':'Availability paused.');dashboard();});
    root.querySelectorAll('[data-accept],[data-decline]').forEach(btn=>btn.onclick=()=>{
      const list=requests(), r=list.find(x=>x.id===(btn.dataset.accept||btn.dataset.decline)); if(!r)return;
      r.status=btn.dataset.accept?'accepted':'declined';r.providerId=me.id;r.providerName=me.name;put(REQUESTS,list);toast(btn.dataset.accept?'Request accepted.':'Request declined.');dashboard();
    });
  }

  function addHeaderButtons() {
    const action = document.querySelector('header .flex.items-center.space-x-3');
    if (!action || action.querySelector('[data-hs-auth]')) return;
    const box=document.createElement('div'); box.className='flex gap-2 ml-2'; box.dataset.hsAuth='1';
    box.innerHTML='<button id="hs-login" class="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-sm">Login</button><button id="hs-signup" class="px-4 py-2.5 rounded-xl bg-rose-600 text-white font-semibold text-sm">Sign up</button>';
    action.prepend(box);
    box.querySelector('#hs-login').onclick=()=>auth('login');
    box.querySelector('#hs-signup').onclick=()=>auth('signup');
  }

  async function boot() { await initUsers(); addHeaderButtons(); window.HealthSync={auth,dashboard}; }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();