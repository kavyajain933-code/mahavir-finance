// ==================== FIREBASE ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDUNpVHZibSLefk75oxDwZbHgabUMsu9xo",
  authDomain: "mahavir-finance-5bc9a.firebaseapp.com",
  projectId: "mahavir-finance-5bc9a",
  storageBucket: "mahavir-finance-5bc9a.firebasestorage.app",
  messagingSenderId: "34469980989",
  appId: "1:34469980989:web:cbad3f39ebf3564faeb354"
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const storage  = getStorage(app);

// ==================== DB ====================
// Per-user document: data/{uid}
// Falls back to shared data/mahavir for migration
let _uid   = null;
let _cache = null;
let _pimg  = {}; // pending images keyed by form prefix

function userDoc() { return doc(db, 'data', _uid); }
function sharedDoc() { return doc(db, 'data', 'mahavir'); }

async function loadDB() {
  if (_cache) return _cache;
  try {
    // Load from user's own document
    const snap = await getDoc(userDoc());
    if (snap.exists()) {
      const d = snap.data();
      d.sk_payments  = d.sk_payments  || [];
      d.customers    = d.customers    || [];
      d.loans        = d.loans        || [];
      d.transactions = d.transactions || [];
      _cache = d;
    } else {
      // Try shared (old) document for migration
      // Only migrate if: old doc exists, has data, and has NOT been claimed by another user
      try {
        const oldSnap = await getDoc(sharedDoc());
        if (oldSnap.exists()) {
          const d = oldSnap.data();
          // If old doc has an _owner field, it was already migrated — don't give to new users
          if (d._owner && d._owner !== _uid) {
            // Already claimed by someone else — start fresh
            _cache = { customers:[], loans:[], transactions:[], sk_payments:[] };
          } else {
            // Either no owner (first migration) or same user — migrate
            d.sk_payments  = d.sk_payments  || [];
            d.customers    = d.customers    || [];
            d.loans        = d.loans        || [];
            d.transactions = d.transactions || [];
            d._owner = _uid; // mark as claimed
            _cache = d;
            await setDoc(userDoc(), d); // save to user's own doc
            // Mark old shared doc as migrated so no other user gets it
            await setDoc(sharedDoc(), { _owner: _uid, _migrated: true });
            showToast('<i class="fas fa-check-circle"></i> Data migrated to your account!');
          }
        } else {
          _cache = { customers:[], loans:[], transactions:[], sk_payments:[] };
        }
      } catch(e2) {
        _cache = { customers:[], loans:[], transactions:[], sk_payments:[] };
      }
    }
  } catch(e) {
    console.error('loadDB error:', e);
    _cache = { customers:[], loans:[], transactions:[], sk_payments:[] };
  }
  return _cache;
}

async function saveDB(data) {
  _cache = data;
  showSync(true);
  try {
    await setDoc(userDoc(), data);
  } catch(e) {
    console.error('saveDB error:', e.code, e.message);
    if (e.message && e.message.includes('maximum allowed size')) {
      showToast('⚠️ Document too large! Photos should now go to Storage — try refreshing.');
    } else {
      showToast('⚠️ Save failed: ' + e.message);
    }
  } finally {
    showSync(false);
  }
}

function getDB() { return _cache || { customers:[], loans:[], transactions:[], sk_payments:[] }; }

function showSync(on) {
  let el = document.getElementById('sync-ind');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-ind';
    el.style.cssText = 'position:fixed;top:10px;right:14px;font-size:0.75rem;font-weight:700;z-index:9999;padding:4px 12px;border-radius:20px;transition:opacity .4s;display:flex;align-items:center;gap:6px;';
    document.body.appendChild(el);
  }
  if (on) {
    el.style.opacity = '1';
    el.style.background = 'rgba(232,190,90,0.15)';
    el.style.color = 'var(--gold)';
    el.style.border = '1px solid var(--gold)';
    el.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Saving...';
  } else {
    el.style.background = 'rgba(34,216,122,0.12)';
    el.style.color = 'var(--green)';
    el.style.border = '1px solid var(--green)';
    el.innerHTML = '<i class="fas fa-check"></i> Saved';
    setTimeout(() => el.style.opacity = '0', 1800);
  }
}

// ==================== AUTH ====================
async function doLogin() {
  const email = document.getElementById('li-email').value.trim();
  const pass  = document.getElementById('li-pass').value;
  const err   = document.getElementById('li-err');
  const btn   = document.getElementById('li-btn');
  if (!email || !pass) { err.textContent = 'Enter email and password.'; err.classList.remove('hidden'); return; }
  err.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(e) {
    const msgs = {
      'auth/invalid-credential':'Wrong email or password.',
      'auth/user-not-found':'No account found.',
      'auth/wrong-password':'Wrong password.',
      'auth/too-many-requests':'Too many attempts. Wait a few minutes.',
      'auth/network-request-failed':'No internet connection.'
    };
    err.textContent = msgs[e.code] || ('Error: ' + e.message);
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
  }
}

async function doLogout() {
  if (!confirm('Sign out?')) return;
  _cache = null; _uid = null;
  await signOut(auth);
}

window.doLogin  = doLogin;
window.doLogout = doLogout;

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const ls = document.getElementById('login-screen');
    if (ls && ls.style.display !== 'none') doLogin();
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    _uid   = user.uid;
    _cache = null;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').classList.remove('hidden');
    document.getElementById('sb-email').textContent = user.email;
    const se = document.getElementById('settings-email');
    if (se) se.textContent = user.email;
    initApp();
    await loadDB();
    renderDashboard();
  } else {
    _uid   = null;
    _cache = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-screen').classList.add('hidden');
    const btn = document.getElementById('li-btn');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In'; }
  }
});

// ==================== INIT ====================
function initApp() {
  history.pushState(null, '', location.href);
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(el.dataset.page);
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sb-overlay').classList.remove('active');
      }
    });
  });
  document.getElementById('hamburger').addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sb-overlay');
    if (window.innerWidth <= 768) { sb.classList.toggle('open'); ov.classList.toggle('active'); }
    else { sb.classList.toggle('collapsed'); document.querySelector('.main-wrapper').classList.toggle('full'); }
  });
  document.getElementById('sb-overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sb-overlay').classList.remove('active');
  });
  window.addEventListener('popstate', (e) => {
    e.preventDefault();
    const lm = document.getElementById('loan-modal');
    const cm = document.getElementById('close-modal');
    const em = document.getElementById('edit-modal');
    if (lm  && !lm.classList.contains('hidden'))  { closeLoanModal();  history.pushState(null,'',location.href); return; }
    if (cm  && !cm.classList.contains('hidden'))  { closeCloseModal(); history.pushState(null,'',location.href); return; }
    if (em  && !em.classList.contains('hidden'))  { closeEditModal();  history.pushState(null,'',location.href); return; }
    if (_navHistory.length > 0) { goBack(); history.pushState(null,'',location.href); }
  });
  injectEditModal();
  document.getElementById('nl-start-date').value = new Date().toISOString().split('T')[0];
}

// ==================== NAVIGATION ====================
const pageMap = {
  dashboard:'Dashboard', index:'Index', 'new-loan':'New Loan',
  'topup-loan':'Top-Up Loan', 'partial-repayment':'Partial Repayment',
  'interest-received':'Interest Received', 'live-loans':'Live Loans',
  'closed-loans':'Closed Loans', favourites:'Favourites',
  'sk-gold':'SK Gold', history:'History', customers:'Customers', settings:'Settings'
};
const _navHistory = [];

function navigateTo(page, addHistory=true) {
  const cur = document.querySelector('.page.active')?.id?.replace('page-','');
  if (addHistory && cur && cur !== page) _navHistory.push(cur);
  const backBtn = document.getElementById('back-btn');
  if (backBtn) backBtn.classList.toggle('visible', _navHistory.length > 0);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');
  document.getElementById('topbar-title').textContent = pageMap[page] || page;
  // Always close sidebar on mobile/tablet when navigating
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sb-overlay').classList.remove('active');
  }
  // Reset history filter when navigating away from history
  const cur2 = document.querySelector('.page.active')?.id?.replace('page-','');
  if (cur2 === 'history' && page !== 'history') {
    const hf = document.getElementById('hist-filter');
    if (hf) hf.value = 'all';
  }
  // Special: history-interest sets filter before rendering
  if (page === 'history-interest') {
    page = 'history';
    setTimeout(()=>{ const hf=document.getElementById('hist-filter'); if(hf){hf.value='interest';renderHistory();} },50);
  }
  const renders = {
    dashboard: renderDashboard, index: renderIndex, 'live-loans': renderLiveLoans,
    'closed-loans': renderClosedLoans, favourites: renderFavourites,
    history: renderHistory, customers: renderCustomers, 'sk-gold': renderSkGold,
    'other-mediator': renderOtherMediator, 'payment-info': renderPaymentInfo
  };
  if (renders[page]) renders[page]();
}

function goBack() {
  if (_navHistory.length > 0) { const p = _navHistory.pop(); navigateTo(p, false); }
}

// ==================== HELPERS ====================
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }
function genAccNo(db) {
  let n = db.customers.length + 1;
  let a = 'MF' + String(n).padStart(4,'0');
  while (db.customers.find(c => c.account === a)) { n++; a = 'MF' + String(n).padStart(4,'0'); }
  return a;
}
// ==================== PAYMENT METHODS ====================
// payment = { cash:0, bank:0, sk_outstanding:0, other_outstanding:0 }
function emptyPayment() { return {cash:0, bank:0, sk_outstanding:0, other_outstanding:0}; }
function totalPayment(p) { if(!p) return 0; return (p.cash||0)+(p.bank||0)+(p.sk_outstanding||0)+(p.other_outstanding||0); }
function fmtPayment(p) {
  if(!p) return '—';
  const parts=[];
  if(p.cash>0) parts.push(`Cash: ${fmtMoney(p.cash)}`);
  if(p.bank>0) parts.push(`Bank: ${fmtMoney(p.bank)}`);
  if(p.sk_outstanding>0) parts.push(`SK: ${fmtMoney(p.sk_outstanding)}`);
  if(p.other_outstanding>0) parts.push(`Mediator: ${fmtMoney(p.other_outstanding)}`);
  return parts.length ? parts.join(' + ') : '—';
}

// SK Outstanding: sum of all amounts that SK owes us
// +interest collected via SK customers, +close loan via SK, +interest via SK
// -capital given via SK outstanding (we used SK credit), -SK settlements received
function calcSkOutstanding(db) {
  let total = 0;
  // Interest collected from SK customers (they still need to pay us)
  db.transactions.forEach(t => {
    if (t.type === 'interest') {
      const pmt = t.payment || {};
      total += (pmt.sk_outstanding||0);
    }
    if (t.type === 'closure') {
      const pmt = t.payment || {};
      total += (pmt.sk_outstanding||0);
    }
    if (t.type === 'loan') {
      // Capital given via SK means SK paid on our behalf — SK owes us less
      const pmt = t.payment || {};
      total -= (pmt.sk_outstanding||0);
    }
    if (t.type === 'sk_payment') {
      total -= (t.amount||0); // settlements reduce outstanding
    }
    if (t.type === 'topup') {
      const pmt = t.payment || {};
      total -= (pmt.sk_outstanding||0);
    }
  });
  return total;
}

// Other mediator outstanding per mediator name
function calcMediatorOutstanding(db, mediatorName) {
  let total = 0;
  db.transactions.forEach(t => {
    if (t.mediatorName !== mediatorName) return;
    if (t.type === 'interest' || t.type === 'closure') {
      const pmt = t.payment || {};
      total += (pmt.other_outstanding||0);
    }
    if (t.type === 'loan' || t.type === 'topup') {
      const pmt = t.payment || {};
      total -= (pmt.other_outstanding||0);
    }
    if (t.type === 'mediator_payment') {
      total -= (t.amount||0);
    }
  });
  return total;
}

function getAllMediators(db) {
  const names = new Set();
  db.loans.forEach(l => { if(l.viaSk==='other'&&l.viaOtherName) names.add(l.viaOtherName); });
  return [...names];
}

function fmtMoney(n) {
  if (n===null||n===undefined||n===''||isNaN(n)) return '—';
  return '₹' + Number(n).toLocaleString('en-IN');
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return dt.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDuration(s, e) {
  const from = new Date(s + 'T00:00:00'), to = new Date(e + 'T00:00:00');
  let m = (to.getFullYear()-from.getFullYear())*12 + (to.getMonth()-from.getMonth());
  let d = to.getDate() - from.getDate();
  if (d < 0) { m--; d += new Date(to.getFullYear(), to.getMonth(), 0).getDate(); }
  if (m < 0) m = 0;
  if (m===0 && d===0) return 'today';
  const parts = [];
  if (m>0) parts.push(m + (m===1?' month':' months'));
  if (d>0) parts.push(d + (d===1?' day':' days'));
  return parts.join(' ') + ' ago';
}
function calcMonths(f, t) {
  const from = new Date(f+'T00:00:00'), to = new Date(t+'T00:00:00');
  let m = (to.getFullYear()-from.getFullYear())*12+(to.getMonth()-from.getMonth());
  let x = to.getDate()-from.getDate();
  if (x<0) { m--; x+=new Date(to.getFullYear(),to.getMonth(),0).getDate(); }
  if (x>0&&x<=15) m+=0.5; else if (x>15) m+=1;
  return Math.max(0,m);
}
function calcInt(p,r,m) { return Math.round(p*(r/100)*m); }
function isSkLoan(l)     { return l.viaSk==='sk'||l.viaSk==='yes'; }
function isDirectLoan(l) { return l.viaSk==='direct'||l.viaSk==='no'; }
function isOtherLoan(l)  { return l.viaSk==='other'; }
function srcLabel(l) {
  if (isSkLoan(l))     return 'SK Gold';
  if (isOtherLoan(l))  return l.viaOtherName||'Other';
  return 'Direct';
}
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t=document.createElement('div'); t.id='toast'; t.style.cssText='position:fixed;bottom:24px;right:24px;padding:11px 18px;border-radius:9px;font-size:0.9rem;font-weight:600;z-index:9999;transition:opacity .4s;background:rgba(34,216,122,0.12);color:var(--green);border:1px solid var(--green);'; document.body.appendChild(t); }
  t.innerHTML=msg; t.style.opacity='1'; clearTimeout(t._t); t._t=setTimeout(()=>t.style.opacity='0',3000);
}
function toggleOtherSourceField(prefix) {
  const v = document.getElementById(prefix+'-via-sk').value;
  const g = document.getElementById(prefix+'-other-name-group');
  if (g) g.classList.toggle('hidden', v!=='other');
}

// ==================== LOAN CALCS ====================
function getLoanTotal(loan) {
  const db=getDB();
  const tu=db.transactions.filter(t=>t.type==='topup'&&t.loanId===loan.id).reduce((s,t)=>s+t.amount,0);
  const pr=db.transactions.filter(t=>t.type==='partial_repayment'&&t.loanId===loan.id).reduce((s,t)=>s+t.amount,0);
  return loan.amount+tu-pr;
}
function getLoanIntReceived(loan) { return getDB().transactions.filter(t=>t.type==='interest'&&t.loanId===loan.id).reduce((s,t)=>s+(t.received||0),0); }
function getLoanDiscount(loan)    { return getDB().transactions.filter(t=>t.type==='interest'&&t.loanId===loan.id).reduce((s,t)=>s+(t.discount||0),0); }
function getLoanPending(loan)     { return getDB().transactions.filter(t=>t.type==='interest'&&t.loanId===loan.id).reduce((s,t)=>s+(t.shortfall||0),0); }
function getLoanPartial(loan)     { return getDB().transactions.filter(t=>t.type==='partial_repayment'&&t.loanId===loan.id).reduce((s,t)=>s+t.amount,0); }
function getLastIntDate(loanId) {
  const db=getDB();
  const pmts=db.transactions.filter(t=>t.type==='interest'&&t.loanId===loanId).sort((a,b)=>new Date(b.toDate||b.date)-new Date(a.toDate||a.date));
  if (pmts.length) return pmts[0].toDate||pmts[0].date;
  const l=db.loans.find(x=>x.id===loanId);
  return l?(l.trackingStartDate||l.startDate):null;
}
function calcSkPending(db) { return db.transactions.filter(t=>t.type==='interest'&&(t.viaSk==='sk'||t.viaSk==='yes')).reduce((s,t)=>s+(t.received||0),0); }
function calcSegInt(loanId, fromDate, toDate) {
  const db=getDB(); const loan=db.loans.find(l=>l.id===loanId);
  if (!loan||!fromDate||!toDate) return {totalInterest:0,segments:[],rate:0};
  const evs=db.transactions.filter(t=>t.loanId===loanId&&(t.type==='partial_repayment'||t.type==='topup'))
    .map(t=>({date:t.date,delta:t.type==='topup'?t.amount:-t.amount})).sort((a,b)=>new Date(a.date)-new Date(b.date));
  let p=loan.amount;
  for (const ev of evs) { if (ev.date<fromDate) p+=ev.delta; }
  p=Math.max(0,p);
  const segs=[]; let seg=fromDate;
  for (const ev of evs) {
    if (ev.date>seg&&ev.date<toDate) {
      const m=calcMonths(seg,ev.date); const i=calcInt(p,loan.rate,m);
      segs.push({from:seg,to:ev.date,principal:p,months:m,interest:i});
      seg=ev.date; p=Math.max(0,p+ev.delta);
    }
  }
  const m=calcMonths(seg,toDate); const i=calcInt(p,loan.rate,m);
  segs.push({from:seg,to:toDate,principal:p,months:m,interest:i});
  const totalInterest=segs.reduce((s,x)=>s+x.interest,0);
  return {totalInterest,segments:segs,rate:loan.rate};
}

// ==================== DASHBOARD ====================
function renderDashboard() {
  const db=getDB(); const today=new Date().toISOString().split('T')[0];
  const active=db.loans.filter(l=>l.status==='active');
  const closed=db.loans.filter(l=>l.status==='closed');
  const allInt=db.transactions.filter(t=>t.type==='interest');
  const totalCap=active.reduce((s,l)=>s+getLoanTotal(l),0);
  const totalInt=allInt.reduce((s,t)=>s+(t.received||0),0);
  const totalDisc=allInt.reduce((s,t)=>s+(t.discount||0),0);
  const skLoans=active.filter(l=>isSkLoan(l));
  const dirLoans=active.filter(l=>isDirectLoan(l));
  const othLoans=active.filter(l=>isOtherLoan(l));
  const skCap=skLoans.reduce((s,l)=>s+getLoanTotal(l),0);
  const dirCap=dirLoans.reduce((s,l)=>s+getLoanTotal(l),0);
  const othCap=othLoans.reduce((s,l)=>s+getLoanTotal(l),0);
  const skPend=calcSkPending(db); const skRcvd=db.sk_payments.reduce((s,p)=>s+p.amount,0); const skNet=Math.max(0,skPend-skRcvd);
  const monthly=active.reduce((s,l)=>s+calcInt(getLoanTotal(l),l.rate,1),0);
  const partials=db.transactions.filter(t=>t.type==='partial_repayment').reduce((s,t)=>s+t.amount,0);
  const intDue=active.reduce((s,l)=>{
    const li=getLastIntDate(l.id); const nd=calcSegInt(l.id,li,today).totalInterest; const cf=getLoanPending(l);
    return s+nd+cf;
  },0);
  const stats=[
    {icon:'fas fa-layer-group', label:'Active Loans',          val:active.length,        sub:closed.length+' closed',           c:'',             act:'live-loans'},
    {icon:'fas fa-rupee-sign',  label:'Capital Out (Total)',   val:fmtMoney(totalCap),   sub:'All active loans',                c:'var(--gold)',  act:'index'},
    {icon:'fas fa-users',       label:'Customers',             val:db.customers.length,  sub:active.length+' active borrowers', c:'',             act:'customers'},
    {icon:'fas fa-hourglass-half',label:'Interest Due',        val:fmtMoney(intDue),     sub:'Uncollected across all loans',    c:'#e6a817',      act:'index'},
    {icon:'fas fa-coins',       label:'Interest Collected',    val:fmtMoney(totalInt),   sub:fmtMoney(totalDisc)+' discount',  c:'var(--green)', act:'history-interest'},
    {icon:'fas fa-chart-line',  label:'Est. Monthly Income',   val:fmtMoney(monthly),    sub:'Based on active loans',           c:'var(--gold)',  act:null},
    {icon:'fas fa-lock',        label:'Closed Loans',          val:closed.length,        sub:'Tap to view all',                 c:'var(--red)',   act:'closed-loans'},
    {icon:'fas fa-building-columns',label:'Mahavir Gold Capital',val:fmtMoney(dirCap),  sub:dirLoans.length+' direct loans',   c:'#f39c12',      act:'live-loans'},
    {icon:'fas fa-handshake',   label:'SK Gold Capital',       val:fmtMoney(skCap),      sub:skLoans.length+' via SK',         c:'#a07af5',      act:'sk-gold'},
    {icon:'fas fa-clock',       label:'SK Pending',            val:fmtMoney(skNet),      sub:'Due from SK Gold',                c:skNet>0?'var(--red)':'var(--green)', act:'sk-gold'},
    {icon:'fas fa-user-tie',    label:'Other Mediator Capital',val:fmtMoney(othCap),     sub:othLoans.length+' via other',     c:'#22d87a',      act:'live-loans'},
    {icon:'fas fa-gem',         label:'Gold In Custody',       val:active.length,        sub:'Packages held',                   c:'',             act:'live-loans'},
    {icon:'fas fa-rotate-left', label:'Partial Repayments',    val:fmtMoney(partials),   sub:'Principal returned',              c:'#4f8ef7',      act:'history'},
  ];
  document.getElementById('stats-grid').innerHTML = stats.map(s=>`
    <div class="stat-card ${s.act?'clickable':''}" ${s.act?`onclick="navigateTo('${s.act}')"`:''}>
      ${s.act?'<i class="fas fa-arrow-right stat-arrow"></i>':''}
      <div class="stat-icon" style="${s.c?'color:'+s.c:''}"><i class="${s.icon}"></i></div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-value" style="${s.c?'color:'+s.c:''}">${s.val}</div>
      <div class="stat-sub">${s.sub}</div>
    </div>`).join('');
  const recent=[...db.transactions].sort((a,b)=>new Date(b.createdAt||b.date)-new Date(a.createdAt||a.date)).slice(0,8);
  const imap={loan:'fas fa-plus',topup:'fas fa-arrow-up',interest:'fas fa-coins',closure:'fas fa-lock',sk_payment:'fas fa-handshake',partial_repayment:'fas fa-rotate-left'};
  const lmap={loan:'New Loan',topup:'Top-Up',interest:'Interest',closure:'Closed',sk_payment:'SK Payment',partial_repayment:'Partial Repayment'};
  document.getElementById('recent-list').innerHTML = recent.length ? recent.map(t=>{
    const loan=db.loans.find(l=>l.id===t.loanId); const cust=loan?db.customers.find(c=>c.id===loan.customerId):null;
    const name=t.type==='sk_payment'?'SK Gold':(cust?cust.name:'Unknown');
    const amt=t.type==='interest'?fmtMoney(t.received):fmtMoney(t.amount);
    return `<div class="activity-item"><div class="activity-icon ${t.type}"><i class="${imap[t.type]||'fas fa-circle'}"></i></div><div class="activity-text"><div class="activity-name">${name}</div><div class="activity-meta">${lmap[t.type]||t.type} · ${fmtDate(t.date)}</div></div><div class="activity-amount">${amt}</div></div>`;
  }).join('') + `<div style="text-align:center;padding:12px 0"><button class="btn-ghost btn-sm" onclick="navigateTo('history')" style="width:100%"><i class="fas fa-clock-rotate-left"></i> See More in History</button></div>` : '<div class="empty-state"><i class="fas fa-inbox"></i><p>No activity yet</p></div>';
  document.getElementById('sk-summary').innerHTML=`
    <div class="sk-summary-list">
      <div class="sk-sum-row"><span>Interest via SK</span><span style="color:#a07af5;font-weight:700">${fmtMoney(skPend)}</span></div>
      <div class="sk-sum-row"><span>Received from SK</span><span style="color:var(--green);font-weight:700">${fmtMoney(skRcvd)}</span></div>
      <div class="sk-sum-row highlight"><span>Net Pending</span><span style="color:var(--gold);font-weight:700">${fmtMoney(skNet)}</span></div>
      <div class="sk-sum-row"><span>SK Loans</span><span style="font-weight:700">${skLoans.length}</span></div>
      <div class="sk-sum-row"><span>SK Capital</span><span style="color:#a07af5;font-weight:700">${fmtMoney(skCap)}</span></div>
      <div class="sk-sum-row"><span>Direct Capital</span><span style="color:#f39c12;font-weight:700">${fmtMoney(dirCap)}</span></div>
    </div>`;
}

// ==================== INDEX ====================
function renderIndex() {
  const db=getDB(); const today=new Date().toISOString().split('T')[0];
  const q=(document.getElementById('idx-search')||{value:''}).value.toLowerCase();
  const skF=(document.getElementById('idx-filter-sk')||{value:'all'}).value;
  let loans=db.loans.filter(l=>l.status==='active');
  if (skF==='sk') loans=loans.filter(l=>isSkLoan(l));
  else if (skF==='direct') loans=loans.filter(l=>isDirectLoan(l));
  else if (skF==='other') loans=loans.filter(l=>isOtherLoan(l));
  loans=loans.filter(l=>{ const c=db.customers.find(x=>x.id===l.customerId); if(!c) return false; if(!q) return true; return c.name.toLowerCase().includes(q)||(c.mobile||'').includes(q)||c.account.toLowerCase().includes(q); });
  const idxSort=(document.getElementById('idx-sort')||{value:'account'}).value;
  loans.sort((a,b)=>{
    const ca=db.customers.find(c=>c.id===a.customerId); const cb=db.customers.find(c=>c.id===b.customerId);
    const pa=getLoanTotal(a); const pb=getLoanTotal(b);
    const lia=getLastIntDate(a.id); const lib=getLastIntDate(b.id);
    const ida=calcSegInt(a.id,lia,today).totalInterest+getLoanPending(a);
    const idb=calcSegInt(b.id,lib,today).totalInterest+getLoanPending(b);
    switch(idxSort) {
      case 'account': return (ca?.account||'').localeCompare(cb?.account||'', undefined, {numeric:true});
      case 'name': return (ca?.name||'').localeCompare(cb?.name||'');
      case 'amount_high': return pb-pa;
      case 'amount_low': return pa-pb;
      case 'int_high': return idb-ida;
      case 'int_low': return ida-idb;
      case 'owed_high': return (pb+idb)-(pa+ida);
      case 'owed_low': return (pa+ida)-(pb+idb);
      case 'date_new': return new Date(b.startDate)-new Date(a.startDate);
      case 'date_old': return new Date(a.startDate)-new Date(b.startDate);
      case 'rate_high': return b.rate-a.rate;
      case 'duration_long': return new Date(a.startDate)-new Date(b.startDate);
      default: return (ca?.account||'').localeCompare(cb?.account||'', undefined, {numeric:true});
    }
  });
  const el=document.getElementById('idx-tbody');
  if (!loans.length) { el.innerHTML=`<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)"><i class="fas fa-inbox" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:.4"></i>No active loans found</td></tr>`; document.getElementById('idx-count').textContent='0 loans'; return; }
  document.getElementById('idx-count').textContent=loans.length+' active loan'+(loans.length!==1?'s':'');
  let sr=1;
  el.innerHTML=loans.map(l=>{
    const c=db.customers.find(x=>x.id===l.customerId);
    const p=getLoanTotal(l); const li=getLastIntDate(l.id);
    const id=calcSegInt(l.id,li,today).totalInterest; const pend=getLoanPending(l); const due=id+pend;
    const owed=p+due;
    const partial=getLoanPartial(l);
    const tu=db.transactions.filter(t=>t.type==='topup'&&t.loanId===l.id).reduce((s,t)=>s+t.amount,0);
    const dur=fmtDuration(l.startDate,today).replace(' ago','');
    const sk=isSkLoan(l); const oth=isOtherLoan(l);
    const rc=sk?'idx-row-sk':oth?'idx-row-other':(due>p*0.05?'idx-row-warn':'');
    return `<tr class="${rc}" onclick="openLoanModal('${l.id}')" style="cursor:pointer">
      <td class="idx-sr">${sr++}</td>
      <td class="idx-acc">${c.account}</td>
      <td class="idx-name"><div class="idx-name-main">${c.name}</div>${c.mobile?`<div class="idx-name-sub">${c.mobile}</div>`:''} ${sk?'<span class="badge badge-sk">SK</span>':oth?`<span class="badge badge-other">${l.viaOtherName||'Other'}</span>`:''}</td>
      <td class="idx-date">${fmtDate(l.startDate)}</td>
      <td>${dur}</td>
      <td>${l.rate}%</td>
      <td class="idx-amount">${fmtMoney(p)}</td>
      <td class="idx-int ${due>0?'idx-int-due':''}">${fmtMoney(due)}${pend>0?`<div class="idx-pending-label">incl. ₹${pend.toLocaleString('en-IN')} carry-fwd</div>`:''}</td>
      <td style="color:var(--gold);font-weight:800">${fmtMoney(owed)}</td>
      <td>${tu>0?`<div class="idx-misc-row topup-row"><i class="fas fa-arrow-up"></i> ${fmtMoney(tu)}</div>`:''}${partial>0?`<div class="idx-misc-row repaid-row"><i class="fas fa-arrow-down"></i> ${fmtMoney(partial)}</div>`:''} ${!tu&&!partial?'<span style="color:var(--text3)">—</span>':''}</td>
    </tr>`;
  }).join('');
}

// ==================== PAYMENT INPUT UI ====================
function renderPaymentInputUI(prefix, amount, label='Payment Method') {
  return `
    <div class="form-group full-width payment-method-group" id="${prefix}-pmt-group">
      <label style="color:var(--gold)"><i class="fas fa-wallet"></i> ${label}</label>
      <div class="payment-split-toggle">
        <label class="split-toggle-label">
          <input type="checkbox" id="${prefix}-split" onchange="toggleSplitPayment('${prefix}')"/>
          <span>Split Payment</span>
        </label>
      </div>
      <div id="${prefix}-pmt-simple">
        <select id="${prefix}-pmt-type" class="input-field" onchange="updateSimplePayment('${prefix}')">
          <option value="cash">💵 Cash</option>
          <option value="bank">🏦 Bank Transfer</option>
          <option value="sk_outstanding">🤝 SK Gold Outstanding</option>
          <option value="other_outstanding">👤 Other Mediator Outstanding</option>
        </select>
      </div>
      <div id="${prefix}-pmt-split" class="hidden">
        <div class="split-payment-grid">
          <div class="form-group"><label>💵 Cash (₹)</label><input type="number" id="${prefix}-pmt-cash" class="input-field" placeholder="0" oninput="updateSplitPayment('${prefix}')"/></div>
          <div class="form-group"><label>🏦 Bank (₹)</label><input type="number" id="${prefix}-pmt-bank" class="input-field" placeholder="0" oninput="updateSplitPayment('${prefix}')"/></div>
          <div class="form-group"><label>🤝 SK Gold (₹)</label><input type="number" id="${prefix}-pmt-sk" class="input-field" placeholder="0" oninput="updateSplitPayment('${prefix}')"/></div>
          <div class="form-group"><label>👤 Other Mediator (₹)</label><input type="number" id="${prefix}-pmt-other" class="input-field" placeholder="0" oninput="updateSplitPayment('${prefix}')"/></div>
        </div>
        <div id="${prefix}-pmt-split-total" class="payment-split-total"></div>
      </div>
    </div>`;
}

function toggleSplitPayment(prefix) {
  const isSplit = document.getElementById(prefix+'-split').checked;
  document.getElementById(prefix+'-pmt-simple').classList.toggle('hidden', isSplit);
  document.getElementById(prefix+'-pmt-split').classList.toggle('hidden', !isSplit);
}

function updateSimplePayment(prefix) { /* just reads on save */ }

function updateSplitPayment(prefix) {
  const cash = parseFloat(document.getElementById(prefix+'-pmt-cash')?.value)||0;
  const bank = parseFloat(document.getElementById(prefix+'-pmt-bank')?.value)||0;
  const sk   = parseFloat(document.getElementById(prefix+'-pmt-sk')?.value)||0;
  const oth  = parseFloat(document.getElementById(prefix+'-pmt-other')?.value)||0;
  const tot  = cash+bank+sk+oth;
  const el   = document.getElementById(prefix+'-pmt-split-total');
  if(el) el.innerHTML = `<span style="color:var(--gold);font-weight:700">Total: ${fmtMoney(tot)}</span>`;
}

function getPaymentObj(prefix, totalAmount) {
  const isSplit = document.getElementById(prefix+'-split')?.checked;
  if (!isSplit) {
    const type = document.getElementById(prefix+'-pmt-type')?.value || 'cash';
    const p = emptyPayment();
    p[type] = totalAmount;
    return p;
  } else {
    return {
      cash: parseFloat(document.getElementById(prefix+'-pmt-cash')?.value)||0,
      bank: parseFloat(document.getElementById(prefix+'-pmt-bank')?.value)||0,
      sk_outstanding: parseFloat(document.getElementById(prefix+'-pmt-sk')?.value)||0,
      other_outstanding: parseFloat(document.getElementById(prefix+'-pmt-other')?.value)||0
    };
  }
}

// ==================== NEW LOAN ====================
let _nlCustId = null;
function searchExistingCustomer() {
  const q=document.getElementById('nl-cust-search').value.trim().toLowerCase();
  const el=document.getElementById('nl-cust-results');
  if (!q) { el.classList.add('hidden'); return; }
  const db=getDB();
  const res=db.customers.filter(c=>c.name.toLowerCase().includes(q)||(c.mobile||'').includes(q)||c.account.toLowerCase().includes(q));
  if (!res.length) { el.innerHTML='<div style="padding:12px;color:var(--text3)">No customer found</div>'; el.classList.remove('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML=res.map(c=>`<div class="customer-result-item" onclick="fillCust('${c.id}')"><strong>${c.name}</strong><span>${c.account} · ${c.mobile||'—'}</span></div>`).join('');
}
function fillCust(id) {
  const c=getDB().customers.find(x=>x.id===id); if (!c) return;
  _nlCustId=c.id;
  document.getElementById('nl-name').value=c.name; document.getElementById('nl-mobile').value=c.mobile||'';
  document.getElementById('nl-account').value=c.account; document.getElementById('nl-address').value=c.address||'';
  document.getElementById('nl-notes').value=c.notes||'';
  document.getElementById('nl-cust-results').classList.add('hidden');
  document.getElementById('nl-cust-search').value=c.name;
  const h=document.getElementById('nl-cust-hint'); h.textContent='✓ Adding new loan to: '+c.name+' ('+c.account+')'; h.classList.remove('hidden');
}
async function saveNewLoan() {
  const name=document.getElementById('nl-name').value.trim();
  const mobile=document.getElementById('nl-mobile').value.trim();
  const amount=parseFloat(document.getElementById('nl-amount').value);
  const rate=parseFloat(document.getElementById('nl-rate').value);
  const startDate=document.getElementById('nl-start-date').value;
  const acctIn=document.getElementById('nl-account').value.trim();
  if (!name||!amount||!rate||!startDate) { alert('Fill: Name, Amount, Rate, Start Date'); return; }
  if (mobile && !/^\d{10}$/.test(mobile)) { alert('Mobile must be 10 digits or blank'); return; }
  const db=getDB(); let cust;
  if (_nlCustId) {
    cust=db.customers.find(c=>c.id===_nlCustId);
    if (cust) { cust.name=name; cust.mobile=mobile||cust.mobile; cust.address=document.getElementById('nl-address').value.trim()||cust.address; cust.notes=document.getElementById('nl-notes').value.trim()||cust.notes; }
  }
  if (!cust) {
    let account=acctIn;
    if (account) { if (db.customers.find(c=>c.account.toLowerCase()===account.toLowerCase())) { alert(`Account "${account}" already exists.`); return; } }
    else { account=genAccNo(db); }
    cust={id:genId(),name,mobile,account,address:document.getElementById('nl-address').value.trim(),notes:document.getElementById('nl-notes').value.trim(),createdAt:new Date().toISOString()};
    db.customers.push(cust);
  }
  const viaSk=document.getElementById('nl-via-sk').value;
  if (viaSk==='other'&&!document.getElementById('nl-other-name').value.trim()) { alert('Enter mediator name'); return; }
  const trackDate=document.getElementById('nl-track-date').value||startDate;
  const imgs=(_pimg['nl']||[]).filter(x=>x.url).map(x=>({id:x.id,url:x.url,createdAt:x.createdAt}));
  const payment = getPaymentObj('nl', amount);
  const loan={id:genId(),customerId:cust.id,amount,rate,startDate,trackingStartDate:trackDate,goldWeight:document.getElementById('nl-gold-weight').value||'',goldDesc:document.getElementById('nl-gold-desc').value.trim(),viaSk,viaOtherName:viaSk==='other'?document.getElementById('nl-other-name').value.trim():'',images:imgs,payment,status:'active',createdAt:new Date().toISOString()};
  db.loans.push(loan);
  db.transactions.push({id:genId(),type:'loan',loanId:loan.id,customerId:cust.id,amount,date:startDate,note:'New loan for '+name,payment,mediatorName:viaSk==='other'?loan.viaOtherName:'',createdAt:new Date().toISOString()});
  await saveDB(db);
  const msg=document.getElementById('nl-msg'); msg.innerHTML=`<i class="fas fa-check-circle"></i> Loan saved! Account: <strong>${cust.account}</strong>${imgs.length?' · '+imgs.length+' photo(s)':''}`; msg.classList.remove('hidden'); setTimeout(()=>msg.classList.add('hidden'),5000);
  _pimg['nl']=[]; renderPendingImgs('nl'); clearNewLoan();
}
function clearNewLoan() {
  _nlCustId=null;
  ['nl-name','nl-mobile','nl-account','nl-address','nl-notes','nl-amount','nl-gold-weight','nl-gold-desc','nl-cust-search','nl-track-date','nl-other-name'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('nl-rate').value='1';
  document.getElementById('nl-start-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('nl-via-sk').value='sk';
  const og=document.getElementById('nl-other-name-group'); if(og) og.classList.add('hidden');
  document.getElementById('nl-cust-results').classList.add('hidden');
  document.getElementById('nl-cust-hint').classList.add('hidden');
}

// ==================== EDIT MODAL ====================
function injectEditModal() {
  if (document.getElementById('edit-modal')) return;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-overlay hidden" id="edit-modal"><div class="modal-box"><div class="modal-header"><h2 id="edit-modal-title"><i class="fas fa-edit"></i> Edit</h2><button onclick="closeEditModal()" class="modal-close"><i class="fas fa-times"></i></button></div><div id="edit-modal-body" class="form-grid"></div><div class="form-actions" style="margin-top:16px"><button class="btn-primary" id="edit-save-btn"><i class="fas fa-save"></i> Save</button><button class="btn-ghost" onclick="closeEditModal()">Cancel</button></div></div></div>`);
}
function closeEditModal() { document.getElementById('edit-modal').classList.add('hidden'); }

function editCustomer(id) {
  const db=getDB(); const c=db.customers.find(x=>x.id===id);
  document.getElementById('edit-modal-title').innerHTML='<i class="fas fa-user-edit"></i> Edit Customer';
  document.getElementById('edit-modal-body').innerHTML=`<div class="form-group"><label>Name</label><input type="text" id="ed-name" class="input-field" value="${c.name}"></div><div class="form-group"><label>Mobile</label><input type="text" id="ed-mob" class="input-field" value="${c.mobile||''}"></div><div class="form-group"><label>Account</label><input type="text" id="ed-acc" class="input-field" value="${c.account||''}"></div><div class="form-group"><label>Address</label><input type="text" id="ed-add" class="input-field" value="${c.address||''}"></div><div class="form-group full-width"><label>Notes</label><input type="text" id="ed-note" class="input-field" value="${c.notes||''}"></div>`;
  document.getElementById('edit-save-btn').onclick=async()=>{ c.name=document.getElementById('ed-name').value.trim(); c.mobile=document.getElementById('ed-mob').value.trim(); c.account=document.getElementById('ed-acc').value.trim()||c.account; c.address=document.getElementById('ed-add').value.trim(); c.notes=document.getElementById('ed-note').value.trim(); await saveDB(db); closeEditModal(); renderCustomers(); };
  document.getElementById('edit-modal').classList.remove('hidden');
}
function deleteCustomer(id) {
  const db=getDB(); if (db.loans.some(l=>l.customerId===id)) { alert('Delete their loans first.'); return; }
  if (!confirm('Delete this customer permanently?')) return;
  db.customers=db.customers.filter(c=>c.id!==id); saveDB(db); renderCustomers();
}
function editLoan(id) {
  const db=getDB(); const l=db.loans.find(x=>x.id===id);
  document.getElementById('edit-modal-title').innerHTML='<i class="fas fa-edit"></i> Edit Loan';
  document.getElementById('edit-modal-body').innerHTML=`
    <div class="form-group"><label>Amount (₹)</label><input type="number" id="ed-amt" class="input-field" value="${l.amount}"></div>
    <div class="form-group"><label>Rate (%/mo)</label><input type="number" id="ed-rate" step="0.1" class="input-field" value="${l.rate}"></div>
    <div class="form-group"><label>Start Date</label><input type="date" id="ed-date" class="input-field" value="${l.startDate}"></div>
    <div class="form-group"><label>Source</label><select id="ed-sk" class="input-field" onchange="toggleOtherSourceField('ed')"><option value="sk" ${isSkLoan(l)?'selected':''}>SK Gold</option><option value="direct" ${isDirectLoan(l)?'selected':''}>Direct Customer</option><option value="other" ${isOtherLoan(l)?'selected':''}>Other Mediator</option></select></div>
    <div class="form-group ${isOtherLoan(l)?'':'hidden'}" id="ed-other-name-group"><label>Mediator Name</label><input type="text" id="ed-other-name" class="input-field" value="${l.viaOtherName||''}"></div>
    <div class="form-group"><label>Gold Weight (g)</label><input type="number" id="ed-wt" step="0.01" class="input-field" value="${l.goldWeight||''}"></div>
    <div class="form-group full-width"><label>Gold Description</label><input type="text" id="ed-desc" class="input-field" value="${l.goldDesc||''}"></div>
    <div class="form-group full-width" style="background:var(--gold-faint);border-radius:8px;padding:12px;border:1px solid var(--border)"><label style="color:var(--gold)">Interest Tracking From</label><input type="date" id="ed-track" class="input-field" value="${l.trackingStartDate||l.startDate}"><small style="color:var(--text3);margin-top:4px;display:block">Interest calculated from this date.</small></div>`;
  document.getElementById('edit-save-btn').onclick=async()=>{
    l.amount=parseFloat(document.getElementById('ed-amt').value); l.rate=parseFloat(document.getElementById('ed-rate').value);
    l.startDate=document.getElementById('ed-date').value; l.viaSk=document.getElementById('ed-sk').value;
    l.viaOtherName=l.viaSk==='other'?document.getElementById('ed-other-name').value.trim():'';
    l.goldWeight=document.getElementById('ed-wt').value; l.goldDesc=document.getElementById('ed-desc').value.trim();
    l.trackingStartDate=document.getElementById('ed-track').value||l.startDate;
    const t=db.transactions.find(t=>t.loanId===l.id&&t.type==='loan'); if(t){t.amount=l.amount;t.date=l.startDate;}
    await saveDB(db); closeEditModal(); openLoanModal(id); renderLiveLoans();
  };
  document.getElementById('edit-modal').classList.remove('hidden');
}
function deleteLoan(id) {
  if (!confirm('DELETE this loan and ALL its history?')) return;
  const db=getDB(); db.loans=db.loans.filter(l=>l.id!==id); db.transactions=db.transactions.filter(t=>t.loanId!==id);
  saveDB(db); closeLoanModal(); renderLiveLoans(); renderDashboard();
}
function deleteTransaction(id) {
  const db=getDB(); const txn=db.transactions.find(t=>t.id===id); if(!txn) return;
  if (txn.type==='loan') { alert('To remove, delete the Loan from Live Loans.'); return; }
  if (!confirm('Delete this transaction?')) return;
  if (txn.type==='closure'&&txn.loanId) { const l=db.loans.find(x=>x.id===txn.loanId); if(l){l.status='active';delete l.closureDate;} }
  if (txn.type==='sk_payment') db.sk_payments=db.sk_payments.filter(p=>p.txnId!==txn.id);
  db.transactions=db.transactions.filter(t=>t.id!==id); saveDB(db); renderHistory(); renderDashboard();
  if(document.getElementById('page-live-loans').classList.contains('active')) renderLiveLoans();
}

// ==================== LOAN SEARCH ====================
let _selLoanId=null;
function searchActiveLoans(prefix) {
  const q=document.getElementById(prefix+'-search').value.trim().toLowerCase();
  const db=getDB(); const active=db.loans.filter(l=>l.status==='active');
  const res=q?active.filter(l=>{const c=db.customers.find(x=>x.id===l.customerId);return c&&(c.name.toLowerCase().includes(q)||(c.mobile||'').includes(q)||c.account.toLowerCase().includes(q));}):active;
  const el=document.getElementById(prefix+'-loan-results');
  if(!res.length||!q){el.classList.add('hidden');return;}
  el.classList.remove('hidden');
  el.innerHTML=res.map(l=>{const c=db.customers.find(x=>x.id===l.customerId);return `<div class="customer-result-item" onclick="selectLoan('${l.id}','${prefix}')"><strong>${c.name}</strong><span>${c.account} · ${fmtMoney(getLoanTotal(l))} · ${fmtDate(l.startDate)}</span></div>`;}).join('');
}
function selectLoan(loanId, prefix) {
  _selLoanId=loanId;
  const db=getDB(); const l=db.loans.find(x=>x.id===loanId); const c=db.customers.find(x=>x.id===l.customerId);
  const tot=getLoanTotal(l); const part=getLoanPartial(l);
  document.getElementById(prefix+'-loan-results').classList.add('hidden');
  document.getElementById(prefix+'-search').value='';
  const card=document.getElementById(prefix+'-selected-loan'); card.classList.remove('hidden');
  card.innerHTML=`<div class="selected-loan-card"><div><div class="slc-name">${c.name}</div><div class="slc-meta">${c.account} · ${c.mobile||'—'} · ${fmtDate(l.startDate)} · ${l.rate}%/mo · ${srcLabel(l)}</div>${part>0?`<div class="slc-meta" style="color:var(--green)">Partial repaid: ${fmtMoney(part)}</div>`:''}</div><div class="slc-amount">${fmtMoney(tot)}</div></div>`;
  document.getElementById(prefix+'-form').classList.remove('hidden');
  if (prefix==='tu') document.getElementById('tu-date').value=new Date().toISOString().split('T')[0];
  if (prefix==='pr') { document.getElementById('pr-date').value=new Date().toISOString().split('T')[0]; document.getElementById('pr-outstanding').value=tot; document.getElementById('pr-amount').value=''; document.getElementById('pr-remaining').value=''; }
  if (prefix==='ir') {
    const today=new Date().toISOString().split('T')[0];
    document.getElementById('ir-date').value=today;
    document.getElementById('ir-from-date').value=getLastIntDate(loanId);
    document.getElementById('ir-to-date').value=today;
    recalcInterest();
  }
}

// ==================== TOP-UP ====================
async function saveTopUp() {
  if(!_selLoanId) return;
  const amount=parseFloat(document.getElementById('tu-amount').value); const date=document.getElementById('tu-date').value;
  if(!amount||!date){alert('Fill Amount and Date');return;}
  const db=getDB(); const l=db.loans.find(x=>x.id===_selLoanId);
  const imgs=(_pimg['tu']||[]).filter(x=>x.url).map(x=>({id:x.id,url:x.url,createdAt:x.createdAt}));
  db.transactions.push({id:genId(),type:'topup',loanId:_selLoanId,customerId:l.customerId,amount,date,note:document.getElementById('tu-notes').value.trim(),images:imgs,createdAt:new Date().toISOString()});
  await saveDB(db);
  const msg=document.getElementById('tu-msg'); msg.innerHTML=`<i class="fas fa-check-circle"></i> Top-up ${fmtMoney(amount)} saved.`; msg.classList.remove('hidden'); setTimeout(()=>msg.classList.add('hidden'),3000);
  document.getElementById('tu-amount').value=''; document.getElementById('tu-notes').value='';
  _pimg['tu']=[]; renderPendingImgs('tu');
  document.getElementById('tu-form').classList.add('hidden'); document.getElementById('tu-selected-loan').classList.add('hidden'); _selLoanId=null;
}

// ==================== PARTIAL REPAYMENT ====================
function calcPrRemaining() { const o=parseFloat(document.getElementById('pr-outstanding').value)||0; const a=parseFloat(document.getElementById('pr-amount').value)||0; document.getElementById('pr-remaining').value=Math.max(0,o-a); }
async function savePartialRepayment() {
  if(!_selLoanId) return;
  const amount=parseFloat(document.getElementById('pr-amount').value); const date=document.getElementById('pr-date').value;
  if(!amount||!date){alert('Fill Amount and Date');return;}
  const db=getDB(); const l=db.loans.find(x=>x.id===_selLoanId); const out=getLoanTotal(l);
  if(amount>=out){if(!confirm(`Amount equals/exceeds outstanding (${fmtMoney(out)}). Continue?`))return;}
  db.transactions.push({id:genId(),type:'partial_repayment',loanId:_selLoanId,customerId:l.customerId,amount,date,note:document.getElementById('pr-notes').value.trim(),createdAt:new Date().toISOString()});
  await saveDB(db);
  const msg=document.getElementById('pr-msg'); msg.innerHTML=`<i class="fas fa-check-circle"></i> ${fmtMoney(amount)} recorded. Remaining: ${fmtMoney(Math.max(0,out-amount))}`; msg.classList.remove('hidden'); setTimeout(()=>msg.classList.add('hidden'),5000);
  document.getElementById('pr-amount').value=''; document.getElementById('pr-notes').value=''; document.getElementById('pr-remaining').value='';
  document.getElementById('pr-form').classList.add('hidden'); document.getElementById('pr-selected-loan').classList.add('hidden'); _selLoanId=null; renderDashboard();
}

// ==================== INTEREST RECEIVED ====================
function recalcInterest() {
  if(!_selLoanId) return;
  const from=document.getElementById('ir-from-date').value; const to=document.getElementById('ir-to-date').value;
  if(!from||!to) return;
  const db=getDB(); const l=db.loans.find(x=>x.id===_selLoanId);
  const {totalInterest,segments,rate}=calcSegInt(_selLoanId,from,to);
  const pend=getLoanPending(l); const grand=totalInterest+pend;
  document.getElementById('ir-calculated').value=grand;
  let html='<div class="ir-breakdown">';
  if(pend>0) html+=`<div class="ir-pending-banner"><i class="fas fa-clock"></i> <strong>${fmtMoney(pend)}</strong> carried forward</div>`;
  if(segments.length>1) {
    html+=`<table class="ir-table"><thead><tr><th>Period</th><th>Principal</th><th>Months</th><th>Interest</th></tr></thead><tbody>`;
    segments.forEach(s=>html+=`<tr><td>${fmtDate(s.from)} → ${fmtDate(s.to)}</td><td style="color:var(--gold)">${fmtMoney(s.principal)}</td><td>${s.months}</td><td style="font-weight:700">${fmtMoney(s.interest)}</td></tr>`);
    html+=`</tbody></table><div class="ir-total-row"><span>Rate: ${rate}%/mo</span><span>Total Due: <strong style="color:var(--gold);font-size:1.1rem">${fmtMoney(grand)}</strong></span></div>`;
  } else {
    const s=segments[0];
    html+=`<div class="calc-summary"><div class="calc-item"><span>Principal</span><strong>${fmtMoney(s.principal)}</strong></div><div class="calc-item"><span>Rate</span><strong>${rate}%/mo</strong></div><div class="calc-item"><span>Months</span><strong>${s.months}</strong></div><div class="calc-item"><span>This Period</span><strong>${fmtMoney(totalInterest)}</strong></div>${pend>0?`<div class="calc-item"><span>Carried</span><strong style="color:var(--gold)">${fmtMoney(pend)}</strong></div>`:''}<div class="calc-item highlight"><span>Total Due</span><strong>${fmtMoney(grand)}</strong></div></div>`;
  }
  html+='</div>'; document.getElementById('ir-calc-box').innerHTML=html; calcDiscount();
}
function calcDiscount() {
  const calc=parseFloat(document.getElementById('ir-calculated').value)||0;
  const rcvd=parseFloat(document.getElementById('ir-received').value)||0;
  const gap=Math.max(0,calc-rcvd); const warn=document.getElementById('ir-gap-warn');
  if(gap>0&&rcvd>0){ warn.classList.remove('hidden'); document.getElementById('ir-gap-amt').textContent=fmtMoney(gap); setGapType(document.querySelector('input[name="ir-gap"]:checked')?.value||'paylater'); }
  else { warn.classList.add('hidden'); document.getElementById('ir-discount').value=0; document.getElementById('ir-shortfall').value=0; }
}
function setGapType(type) {
  const calc=parseFloat(document.getElementById('ir-calculated').value)||0;
  const rcvd=parseFloat(document.getElementById('ir-received').value)||0;
  const gap=Math.max(0,calc-rcvd);
  if(type==='discount'){ document.getElementById('ir-discount').value=gap; document.getElementById('ir-shortfall').value=0; }
  else { document.getElementById('ir-discount').value=0; document.getElementById('ir-shortfall').value=gap; }
}
async function saveInterestReceived() {
  if(!_selLoanId) return;
  const date=document.getElementById('ir-date').value; const rcvd=parseFloat(document.getElementById('ir-received').value);
  const calc=parseFloat(document.getElementById('ir-calculated').value)||0;
  const disc=parseFloat(document.getElementById('ir-discount').value)||0;
  const short=parseFloat(document.getElementById('ir-shortfall').value)||0;
  if(!date||isNaN(rcvd)||rcvd<=0){alert('Fill Payment Date and Amount Received');return;}
  const db=getDB(); const l=db.loans.find(x=>x.id===_selLoanId);
  const irPayment = getPaymentObj('ir', rcvd);
  db.transactions.push({id:genId(),type:'interest',loanId:_selLoanId,customerId:l.customerId,calculated:calc,received:rcvd,discount:disc,shortfall:short,fromDate:document.getElementById('ir-from-date').value,toDate:document.getElementById('ir-to-date').value,date,note:document.getElementById('ir-notes').value.trim(),viaSk:l.viaSk,payment:irPayment,mediatorName:l.viaSk==='other'?l.viaOtherName:'',createdAt:new Date().toISOString()});
  await saveDB(db);
  const msg=document.getElementById('ir-msg');
  const parts=[`<i class="fas fa-check-circle"></i> ${fmtMoney(rcvd)} recorded.`];
  if(disc>0) parts.push('Discount: '+fmtMoney(disc));
  if(short>0) parts.push(`<span style="color:var(--gold)">₹${short.toLocaleString('en-IN')} to collect later</span>`);
  msg.innerHTML=parts.join(' · '); msg.classList.remove('hidden'); setTimeout(()=>msg.classList.add('hidden'),5000);
  ['ir-received','ir-calculated','ir-discount','ir-shortfall','ir-notes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('ir-form').classList.add('hidden'); document.getElementById('ir-selected-loan').classList.add('hidden');
  document.getElementById('ir-gap-warn').classList.add('hidden'); document.getElementById('ir-calc-box').innerHTML=''; _selLoanId=null;
}

// ==================== LIVE LOANS ====================
function renderLiveLoans() {
  const db=getDB(); const today=new Date().toISOString().split('T')[0];
  const q=document.getElementById('ll-search').value.toLowerCase();
  const skF=document.getElementById('ll-filter-sk').value;
  let loans=db.loans.filter(l=>l.status==='active');
  if(skF==='sk') loans=loans.filter(l=>isSkLoan(l));
  else if(skF==='direct') loans=loans.filter(l=>isDirectLoan(l));
  else if(skF==='other') loans=loans.filter(l=>isOtherLoan(l));
  const llSort=(document.getElementById('ll-sort')||{value:'account'}).value;
  loans=loans.filter(l=>{const c=db.customers.find(x=>x.id===l.customerId);return c&&(!q||c.name.toLowerCase().includes(q)||(c.mobile||'').includes(q)||c.account.toLowerCase().includes(q));});
  loans.sort((a,b)=>{
    const ca=db.customers.find(c=>c.id===a.customerId); const cb=db.customers.find(c=>c.id===b.customerId);
    const pa=getLoanTotal(a); const pb=getLoanTotal(b);
    const lia=getLastIntDate(a.id); const lib=getLastIntDate(b.id);
    const tdy=new Date().toISOString().split('T')[0];
    const ida=calcSegInt(a.id,lia,tdy).totalInterest+getLoanPending(a);
    const idb=calcSegInt(b.id,lib,tdy).totalInterest+getLoanPending(b);
    switch(llSort) {
      case 'account': return (ca?.account||'').localeCompare(cb?.account||'', undefined, {numeric:true});
      case 'name': return (ca?.name||'').localeCompare(cb?.name||'');
      case 'amount_high': return pb-pa;
      case 'amount_low': return pa-pb;
      case 'int_high': return idb-ida;
      case 'int_low': return ida-idb;
      case 'date_new': return new Date(b.startDate)-new Date(a.startDate);
      case 'date_old': return new Date(a.startDate)-new Date(b.startDate);
      case 'rate_high': return b.rate-a.rate;
      case 'favourites': return (b.favourite?1:0)-(a.favourite?1:0);
      default: return (ca?.account||'').localeCompare(cb?.account||'', undefined, {numeric:true});
    }
  });
  const grid=document.getElementById('live-loans-grid');
  if(!loans.length){grid.innerHTML='<div class="empty-state"><i class="fas fa-bolt"></i><p>No active loans</p></div>';return;}
  grid.innerHTML=loans.map(l=>{
    const c=db.customers.find(x=>x.id===l.customerId);
    const tot=getLoanTotal(l); const li=getLastIntDate(l.id);
    const est=calcSegInt(l.id,li,today).totalInterest;
    const rcvd=getLoanIntReceived(l); const disc=getLoanDiscount(l); const pend=getLoanPending(l); const part=getLoanPartial(l);
    const dur=fmtDuration(l.startDate,today);
    const sk=isSkLoan(l); const oth=isOtherLoan(l);
    return `<div class="loan-card ${sk?'via-sk':oth?'via-other':''}" onclick="openLoanModal('${l.id}')">
      <div class="loan-card-header">
        <div><div class="loan-card-name">${c.name}</div><div class="loan-card-account" style="color:#a0a0c0">${c.account} · ${c.mobile||'—'}</div></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div style="display:flex;align-items:center;gap:6px"><button class="fav-star ${l.favourite?'active':''}" onclick="toggleFav('${l.id}',event)"><i class="${l.favourite?'fas':'far'} fa-star"></i></button><span class="badge badge-active">Active</span></div>
          ${sk?'<span class="badge badge-sk">SK Gold</span>':oth?`<span class="badge badge-other">${l.viaOtherName||'Other'}</span>`:''}
        </div>
      </div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Principal</span><span class="val gold">${fmtMoney(tot)}</span></div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Rate</span><span class="val">${l.rate}% / month</span></div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Started</span><span class="val">${fmtDate(l.startDate)} <span style="color:var(--text3)">(${dur})</span></span></div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Est. Due</span><span class="val gold">${fmtMoney(est)}</span></div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Int. Received</span><span class="val text-green">${fmtMoney(rcvd)}</span></div>
      ${disc>0?`<div class="loan-card-row"><span class="lbl text-red">Discount</span><span class="val text-red">−${fmtMoney(disc)}</span></div>`:''}
      ${pend>0?`<div class="loan-card-row"><span class="lbl" style="color:var(--gold)">Pay Later</span><span class="val" style="color:var(--gold)">${fmtMoney(pend)}</span></div>`:''}
      ${part>0?`<div class="loan-card-row"><span class="lbl" style="color:#4f8ef7">Partial Repaid</span><span class="val" style="color:#4f8ef7">${fmtMoney(part)}</span></div>`:''}
      ${l.goldDesc?`<div class="loan-card-row"><span class="lbl"><i class="fas fa-gem"></i> Gold</span><span class="val">${l.goldDesc}</span></div>`:''}
      <div class="loan-card-actions">
        <button class="btn-primary btn-sm" onclick="event.stopPropagation();quickInt('${l.id}')"><i class="fas fa-coins"></i> Interest</button>
        <button class="btn-ghost btn-sm" onclick="event.stopPropagation();quickPart('${l.id}')"><i class="fas fa-arrow-down"></i> Repay</button>
        <button class="btn-ghost btn-sm" onclick="event.stopPropagation();openLoanModal('${l.id}')"><i class="fas fa-eye"></i></button>
        <button class="btn-danger btn-sm" onclick="event.stopPropagation();openCloseModal('${l.id}')"><i class="fas fa-lock"></i></button>
      </div>
    </div>`;
  }).join('');
}
function quickInt(id){navigateTo('interest-received');setTimeout(()=>selectLoan(id,'ir'),50);}
function quickPart(id){navigateTo('partial-repayment');setTimeout(()=>selectLoan(id,'pr'),50);}
function preselectTopup(id){navigateTo('topup-loan');setTimeout(()=>selectLoan(id,'tu'),50);}

// ==================== FAVOURITES ====================
function toggleFav(loanId, e) {
  e.stopPropagation();
  const db=getDB(); const l=db.loans.find(x=>x.id===loanId); if(!l) return;
  l.favourite=!l.favourite; saveDB(db);
  if(document.getElementById('page-live-loans').classList.contains('active')) renderLiveLoans();
  if(document.getElementById('page-favourites').classList.contains('active')) renderFavourites();
}
function renderFavourites() {
  const db=getDB(); const today=new Date().toISOString().split('T')[0];
  const loans=db.loans.filter(l=>l.status==='active'&&l.favourite);
  const el=document.getElementById('fav-grid');
  const cnt=document.getElementById('fav-count');
  if(!loans.length){el.innerHTML='<div class="empty-state"><i class="fas fa-star"></i><p>No favourites yet.<br>Press ⭐ on any loan card to add it here.</p></div>';if(cnt)cnt.textContent='';return;}
  if(cnt) cnt.textContent=loans.length+' starred';
  el.innerHTML=loans.map(l=>{
    const c=db.customers.find(x=>x.id===l.customerId);
    const tot=getLoanTotal(l); const li=getLastIntDate(l.id);
    const est=calcSegInt(l.id,li,today).totalInterest; const rcvd=getLoanIntReceived(l); const dur=fmtDuration(l.startDate,today);
    return `<div class="loan-card ${isSkLoan(l)?'via-sk':isOtherLoan(l)?'via-other':''}" onclick="openLoanModal('${l.id}')">
      <div class="loan-card-header"><div><div class="loan-card-name">${c.name}</div><div class="loan-card-account" style="color:#a0a0c0">${c.account} · ${c.mobile||'—'}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><button class="fav-star active" onclick="toggleFav('${l.id}',event)"><i class="fas fa-star"></i></button>${isSkLoan(l)?'<span class="badge badge-sk">SK</span>':''}</div></div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Principal</span><span class="val gold">${fmtMoney(tot)}</span></div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Rate</span><span class="val">${l.rate}%/mo</span></div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Started</span><span class="val">${fmtDate(l.startDate)} (${dur})</span></div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Est. Due</span><span class="val gold">${fmtMoney(est)}</span></div>
      <div class="loan-card-row"><span class="lbl" style="color:#b0b0cc">Int. Received</span><span class="val text-green">${fmtMoney(rcvd)}</span></div>
      <div class="loan-card-actions"><button class="btn-primary btn-sm" onclick="event.stopPropagation();quickInt('${l.id}')"><i class="fas fa-coins"></i> Interest</button><button class="btn-ghost btn-sm" onclick="event.stopPropagation();openLoanModal('${l.id}')"><i class="fas fa-eye"></i></button></div>
    </div>`;
  }).join('');
}

// ==================== LOAN MODAL ====================
function openLoanModal(loanId) {
  const db=getDB(); const loan=db.loans.find(l=>l.id===loanId); if(!loan) return;
  const cust=db.customers.find(c=>c.id===loan.customerId);
  const txns=db.transactions.filter(t=>t.loanId===loanId).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const tot=getLoanTotal(loan); const rcvd=getLoanIntReceived(loan); const disc=getLoanDiscount(loan);
  const part=getLoanPartial(loan); const pend=getLoanPending(loan);
  const today=new Date().toISOString().split('T')[0]; const li=getLastIntDate(loanId);
  const est=loan.status==='active'?calcSegInt(loanId,li,today).totalInterest:0;
  const totalOwed=tot+est+pend;
  const imap={loan:'fas fa-plus',topup:'fas fa-arrow-up',interest:'fas fa-coins',closure:'fas fa-lock',partial_repayment:'fas fa-rotate-left'};
  const lmap={loan:'New Loan',topup:'Top-Up',interest:'Interest Received',closure:'Loan Closed',partial_repayment:'Partial Repayment'};
  // Build images section
  const allImgs=[...(loan.images||[]),...db.transactions.filter(t=>t.loanId===loanId&&t.type==='topup'&&t.images?.length).flatMap(t=>t.images.map(img=>({...img,_topupDate:t.date})))];
  const imgsHtml=allImgs.length?`<div class="loan-images-grid">${allImgs.map(img=>{const src=img.url||img.data||'';return `<div class="img-thumb-wrap"><img src="${src}" class="img-thumb" onclick="viewImgFull('${src}')"/>${img._topupDate?`<div class="img-label">Top-Up ${fmtDate(img._topupDate)}</div>`:''}<button class="img-delete-btn" onclick="deleteLoanImg('${loanId}','${img.id}')"><i class="fas fa-times"></i></button></div>`;}).join('')}<div class="img-thumb-wrap img-add-btn" onclick="addMoreImgs('${loanId}')"><i class="fas fa-plus" style="font-size:1.5rem;color:var(--text3)"></i><div style="font-size:0.72rem;color:var(--text3);margin-top:4px">Add Photo</div></div></div>`:`<div style="color:var(--text3);font-size:0.85rem;padding:8px 0">No photos. <button class="btn-ghost btn-sm" onclick="addMoreImgs('${loanId}')"><i class="fas fa-camera"></i> Add</button></div>`;
  document.getElementById('loan-modal-content').innerHTML=`
    <div class="modal-header"><h2><i class="fas fa-file-invoice"></i> Loan Profile</h2><button onclick="closeLoanModal()" class="modal-close"><i class="fas fa-times"></i></button></div>
    <div class="modal-profile-block">
      <div class="mpb-name">${cust.name} <span class="badge badge-${loan.status}">${loan.status}</span>${isSkLoan(loan)?'<span class="badge badge-sk" style="margin-left:4px">SK Gold</span>':isOtherLoan(loan)?`<span class="badge badge-other" style="margin-left:4px">${loan.viaOtherName||'Other'}</span>`:''}</div>
      <div class="mpb-meta">${cust.account} · ${cust.mobile||'—'}${cust.address?' · '+cust.address:''}</div>
      <div class="mpb-stats">
        <div class="mpb-stat"><span>Principal</span><strong style="color:var(--gold)">${fmtMoney(tot)}</strong></div>
        <div class="mpb-stat"><span>Rate</span><strong>${loan.rate}%/mo</strong></div>
        <div class="mpb-stat"><span>Started</span><strong>${fmtDate(loan.startDate)}</strong></div>
        ${loan.status==='active'?`<div class="mpb-stat"><span>Est. Due Today</span><strong style="color:var(--gold)">${fmtMoney(est)}</strong></div>`:''}
        <div class="mpb-stat"><span>Int. Received</span><strong style="color:var(--green)">${fmtMoney(rcvd)}</strong></div>
        ${disc>0?`<div class="mpb-stat"><span>Discount</span><strong class="text-red">−${fmtMoney(disc)}</strong></div>`:''}
        ${pend>0?`<div class="mpb-stat" style="background:var(--gold-faint);border:1px solid var(--border)"><span style="color:var(--gold)"><i class="fas fa-clock"></i> Pay Later</span><strong style="color:var(--gold)">${fmtMoney(pend)}</strong></div>`:''}
        ${part>0?`<div class="mpb-stat"><span>Partial Repaid</span><strong style="color:#4f8ef7">${fmtMoney(part)}</strong></div>`:''}
        <div class="mpb-stat" style="background:var(--gold-faint);border:1px solid var(--border)"><span style="color:var(--gold)"><i class="fas fa-calculator"></i> Total Owed</span><strong style="color:var(--gold)">${fmtMoney(totalOwed)}</strong></div>
        ${loan.goldDesc?`<div class="mpb-stat"><span><i class="fas fa-gem"></i> Gold</span><strong>${loan.goldDesc}${loan.goldWeight?' · '+loan.goldWeight+'g':''}</strong></div>`:''}
        ${loan.status==='closed'?`<div class="mpb-stat"><span>Closed</span><strong>${fmtDate(loan.closureDate)}</strong></div>`:''}
      </div>
    </div>
    <div class="modal-section-title"><i class="fas fa-camera"></i> Gold Photos</div>
    ${imgsHtml}
    <div class="modal-section-title">Transaction History</div>
    <div class="timeline">${txns.map(t=>{
      let amt; if(t.type==='interest'){amt=fmtMoney(t.received);if(t.discount>0)amt+=` <span class="hist-tag disc">Disc:${fmtMoney(t.discount)}</span>`;if(t.shortfall>0)amt+=` <span class="hist-tag paylater">PayLater:${fmtMoney(t.shortfall)}</span>`;if(t.fromDate&&t.toDate)amt+=`<br><span style="color:var(--text3);font-size:0.78rem">${fmtDate(t.fromDate)}→${fmtDate(t.toDate)}</span>`;}else{amt=fmtMoney(t.amount);}
      const pmtStr = t.payment ? `<div style="font-size:0.75rem;color:#8888aa;margin-top:2px"><i class="fas fa-wallet"></i> ${fmtPayment(t.payment)}</div>` : '';
      return `<div class="timeline-item"><div class="activity-icon ${t.type==='partial_repayment'?'partial_repayment':t.type}"><i class="${imap[t.type]||'fas fa-circle'}"></i></div><div class="tl-body"><div class="tl-title">${lmap[t.type]||t.type}</div><div class="tl-meta">${fmtDate(t.date)}${t.note?' · '+t.note:''}</div><div class="tl-amount">${amt}</div>${pmtStr}</div></div>`;
    }).join('')||'<p style="color:var(--text3);padding:8px 0">No records</p>'}</div>
    <div class="modal-actions">
      ${loan.status==='active'?`<button class="btn-primary" onclick="closeLoanModal();quickInt('${loanId}')"><i class="fas fa-coins"></i> Interest</button><button class="btn-ghost" onclick="closeLoanModal();quickPart('${loanId}')"><i class="fas fa-arrow-down"></i> Repay</button><button class="btn-ghost" onclick="closeLoanModal();preselectTopup('${loanId}')"><i class="fas fa-arrow-up"></i> Top-Up</button><button class="btn-ghost" onclick="editLoan('${loanId}')"><i class="fas fa-edit"></i> Edit</button><button class="btn-danger" onclick="closeLoanModal();openCloseModal('${loanId}')"><i class="fas fa-lock"></i> Close</button>`:`<button class="btn-ghost" onclick="editLoan('${loanId}')"><i class="fas fa-edit"></i> Edit</button>`}
      <button class="btn-ghost" onclick="genPDF('${loanId}')"><i class="fas fa-file-pdf" style="color:var(--red)"></i> PDF</button>
      <button class="btn-ghost" onclick="shareWhatsApp('${loanId}')" style="color:#25D366;border-color:rgba(37,211,102,0.3)"><i class="fab fa-whatsapp"></i> WhatsApp</button>
      <button class="btn-ghost" style="margin-left:auto" onclick="deleteLoan('${loanId}')"><i class="fas fa-trash" style="color:var(--red)"></i></button>
    </div>`;
  document.getElementById('loan-modal').classList.remove('hidden');
}
function closeLoanModal(){document.getElementById('loan-modal').classList.add('hidden');}

// ==================== CLOSE LOAN ====================
let _closingId=null;
function openCloseModal(id) {
  _closingId=id; const today=new Date().toISOString().split('T')[0];
  document.getElementById('cl-date').value=today; document.getElementById('cl-gold-return').value=today;
  document.getElementById('cl-final-interest').value=''; document.getElementById('cl-notes').value='';
  document.getElementById('cl-repayment').value=getLoanTotal(getDB().loans.find(l=>l.id===id));
  document.getElementById('close-modal').classList.remove('hidden');
}
function closeCloseModal(){document.getElementById('close-modal').classList.add('hidden');_closingId=null;}
async function confirmCloseLoan(){
  if(!_closingId) return; const db=getDB(); const l=db.loans.find(x=>x.id===_closingId);
  l.status='closed'; l.closureDate=document.getElementById('cl-date').value;
  l.finalRepayment=parseFloat(document.getElementById('cl-repayment').value)||0;
  l.finalInterest=parseFloat(document.getElementById('cl-final-interest').value)||0;
  l.capitalReceived=parseFloat(document.getElementById('cl-capital').value)||0;
  l.goldReturnDate=document.getElementById('cl-gold-return').value;
  l.closureNotes=document.getElementById('cl-notes').value.trim();
  const clPayment = getPaymentObj('cl', l.finalRepayment+l.finalInterest);
  db.transactions.push({id:genId(),type:'closure',loanId:_closingId,customerId:l.customerId,amount:l.finalRepayment,finalInterest:l.finalInterest,capitalReceived:l.capitalReceived,date:l.closureDate,note:'Loan closed.',payment:clPayment,mediatorName:l.viaSk==='other'?l.viaOtherName:'',createdAt:new Date().toISOString()});
  await saveDB(db); closeCloseModal(); renderLiveLoans(); renderDashboard(); showToast('<i class="fas fa-check-circle"></i> Loan closed!');
}

// ==================== CLOSED LOANS ====================
function renderClosedLoans() {
  const db=getDB(); const q=(document.getElementById('cl-search-inp')||{value:''}).value.toLowerCase();
  let loans=db.loans.filter(l=>l.status==='closed');
  if(q) loans=loans.filter(l=>{const c=db.customers.find(x=>x.id===l.customerId);return c&&(c.name.toLowerCase().includes(q)||(c.mobile||'').includes(q)||c.account.toLowerCase().includes(q));});
  loans.sort((a,b)=>new Date(b.closureDate||b.createdAt)-new Date(a.closureDate||a.createdAt));
  const el=document.getElementById('closed-loans-grid'); const cnt=document.getElementById('closed-count');
  if(cnt) cnt.textContent=loans.length+' closed loan'+(loans.length!==1?'s':'');
  if(!loans.length){el.innerHTML='<div class="empty-state"><i class="fas fa-lock"></i><p>No closed loans yet</p></div>';return;}
  el.innerHTML=loans.map(l=>{
    const c=db.customers.find(x=>x.id===l.customerId);
    const ri=getLoanIntReceived(l); const disc=getLoanDiscount(l);
    const dur=l.startDate&&l.closureDate?fmtDuration(l.startDate,l.closureDate).replace(' ago',''):'—';
    return `<div class="closed-loan-card" onclick="openLoanModal('${l.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div class="clc-name">${c?.name||'Unknown'}</div><div class="clc-meta">${c?.account||''} · ${c?.mobile||'—'}</div></div><span class="badge badge-closed">Closed</span></div>
      <div class="clc-row"><span>Principal</span><span style="color:var(--gold)">${fmtMoney(l.amount)}</span></div>
      <div class="clc-row"><span>Interest Collected</span><span style="color:var(--green)">${fmtMoney(ri)}</span></div>
      ${disc>0?`<div class="clc-row"><span>Discount</span><span style="color:var(--red)">−${fmtMoney(disc)}</span></div>`:''}
      <div class="clc-row"><span>Duration</span><span>${dur}</span></div>
      <div class="clc-row"><span>Opened</span><span>${fmtDate(l.startDate)}</span></div>
      <div class="clc-row"><span>Closed</span><span>${fmtDate(l.closureDate)}</span></div>
    </div>`;
  }).join('');
}

// ==================== SK GOLD ====================
function renderSkGold() {
  const db=getDB();
  const today=new Date().toISOString().split('T')[0];
  const skL=db.loans.filter(l=>isSkLoan(l)&&l.status==='active');
  const skCap=skL.reduce((s,l)=>s+getLoanTotal(l),0);
  // Interest collected from SK loan customers
  const skIntTxns=db.transactions.filter(t=>t.type==='interest'&&isSkLoan(db.loans.find(l=>l.id===t.loanId)||{}));
  const skIntCollected=skIntTxns.reduce((s,t)=>s+(t.received||0),0);
  // Settlements received from SK
  const skSettlements=db.sk_payments.reduce((s,p)=>s+p.amount,0);
  // Payments received via SK outstanding (interest/closure paid TO SK by borrower)
  const skViaPmt=db.transactions.filter(t=>t.payment&&(t.payment.sk_outstanding||0)>0).reduce((s,t)=>s+(t.payment.sk_outstanding||0),0);
  // Capital given via SK outstanding (SK paid borrower on our behalf — SK owes us less)
  const skCapGiven=db.transactions.filter(t=>t.type==='loan'&&t.payment&&(t.payment.sk_outstanding||0)>0).reduce((s,t)=>s+(t.payment.sk_outstanding||0),0);
  // Outstanding = what SK owes us
  // SK owes us: interest collected by SK customers + payments made to SK - capital SK gave on our behalf - settlements received
  const outstanding = skIntCollected + skViaPmt - skCapGiven - skSettlements;
  const skR=skSettlements;

  document.getElementById('sk-stats').innerHTML=`
    <div class="stat-card"><div class="stat-icon" style="color:#a07af5"><i class="fas fa-coins"></i></div><div class="stat-label">Interest via SK</div><div class="stat-value" style="color:#a07af5">${fmtMoney(skIntCollected)}</div><div class="stat-sub">Collected from SK customers</div></div>
    <div class="stat-card"><div class="stat-icon" style="color:var(--green)"><i class="fas fa-check-circle"></i></div><div class="stat-label">Received from SK</div><div class="stat-value" style="color:var(--green)">${fmtMoney(skR)}</div><div class="stat-sub">Settlements recorded</div></div>
    <div class="stat-card clickable" onclick="navigateTo('payment-info')" style="border-color:rgba(232,190,90,0.3)"><i class="fas fa-arrow-right stat-arrow"></i><div class="stat-icon" style="color:${outstanding>0?'var(--red)':'var(--green)'}"><i class="fas fa-scale-balanced"></i></div><div class="stat-label">Outstanding</div><div class="stat-value" style="color:${outstanding>0?'var(--red)':'var(--green)'}">${fmtMoney(Math.abs(outstanding))}</div><div class="stat-sub">${outstanding>0?'SK owes you':'You owe SK'}</div></div>
    <div class="stat-card"><div class="stat-icon" style="color:var(--gold)"><i class="fas fa-arrow-up-right-dots"></i></div><div class="stat-label">Via SK Payments</div><div class="stat-value" style="color:var(--gold)">${fmtMoney(skViaPmt)}</div><div class="stat-sub">Interest/closure paid to SK</div></div>
    <div class="stat-card"><div class="stat-icon" style="color:#4f8ef7"><i class="fas fa-arrow-down-right-dots"></i></div><div class="stat-label">Capital via SK</div><div class="stat-value" style="color:#4f8ef7">${fmtMoney(skCapGiven)}</div><div class="stat-sub">SK paid borrowers for you</div></div>
    <div class="stat-card"><div class="stat-icon"><i class="fas fa-layer-group"></i></div><div class="stat-label">SK Active Loans</div><div class="stat-value">${skL.length}</div><div class="stat-sub">Capital: ${fmtMoney(skCap)}</div></div>`;
  document.getElementById('sk-date').value=new Date().toISOString().split('T')[0];

  // Settlement history
  const hist=[...db.sk_payments].sort((a,b)=>new Date(b.date)-new Date(a.date));
  document.getElementById('sk-history').innerHTML=hist.length?hist.map(p=>`<div class="activity-item"><div class="activity-icon sk_payment"><i class="fas fa-handshake"></i></div><div class="activity-text"><div class="activity-name">Settlement from SK</div><div class="activity-meta">${fmtDate(p.date)}${p.note?' · '+p.note:''}</div></div><div class="activity-amount text-green">${fmtMoney(p.amount)}</div></div>`).join(''):'<div class="empty-state"><i class="fas fa-handshake"></i><p>No settlements yet</p></div>';

  // Full transaction history for SK
  const imap2={loan:'fas fa-plus',topup:'fas fa-arrow-up',interest:'fas fa-coins',closure:'fas fa-lock',partial_repayment:'fas fa-rotate-left',sk_payment:'fas fa-handshake'};
  const lmap2={loan:'New Loan',topup:'Top-Up',interest:'Interest Received',closure:'Loan Closed',partial_repayment:'Partial Repayment',sk_payment:'SK Settlement'};

  // All SK-related transactions
  const skTxns = [...db.transactions].filter(t => {
    if (t.type === 'sk_payment') return true;
    const loan = db.loans.find(l=>l.id===t.loanId);
    if (!loan) return false;
    // Any transaction on a SK loan
    if (isSkLoan(loan)) return true;
    // Any transaction where payment involved SK outstanding
    if (t.payment && (t.payment.sk_outstanding||0) > 0) return true;
    return false;
  }).sort((a,b)=>new Date(b.createdAt||b.date)-new Date(a.createdAt||a.date));

  const skTxnEl = document.getElementById('sk-txn-history');
  if (skTxnEl) {
    skTxnEl.innerHTML = skTxns.length ? skTxns.map(t => {
      const loan = db.loans.find(l=>l.id===t.loanId);
      const cust = loan ? db.customers.find(c=>c.id===loan.customerId) : null;
      const name = t.type==='sk_payment' ? 'SK Gold' : (cust?cust.name:'—');
      const amt = t.type==='interest' ? fmtMoney(t.received||0) : fmtMoney(t.amount||0);
      const pmtTag = t.payment && (t.payment.sk_outstanding||0)>0 ? `<span class="hist-tag" style="background:rgba(160,122,245,0.15);color:#a07af5">SK: ${fmtMoney(t.payment.sk_outstanding)}</span>` : '';
      const typeColor = t.type==='sk_payment'?'var(--green)':t.type==='loan'?'#4f8ef7':t.type==='interest'?'#a07af5':t.type==='closure'?'var(--red)':'var(--text2)';
      return `<div class="activity-item">
        <div class="activity-icon ${t.type==='sk_payment'?'sk_payment':t.type==='partial_repayment'?'partial_repayment':t.type}"><i class="${imap2[t.type]||'fas fa-circle'}"></i></div>
        <div class="activity-text">
          <div class="activity-name">${name} <span style="font-size:0.75rem;font-weight:600;color:${typeColor};background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:4px">${lmap2[t.type]||t.type}</span></div>
          <div class="activity-meta">${fmtDate(t.date)}${cust?' · '+cust.account:''}</div>
          ${pmtTag?`<div class="tl-tags" style="margin-top:4px">${pmtTag}</div>`:''}
        </div>
        <div class="activity-amount" style="color:${typeColor}">${amt}</div>
      </div>`;
    }).join('') : '<div class="empty-state"><i class="fas fa-clock-rotate-left"></i><p>No SK transactions yet</p></div>';
  }
}
async function saveSkPayment() {
  const amount=parseFloat(document.getElementById('sk-amount').value); const date=document.getElementById('sk-date').value;
  if(!amount||!date){alert('Fill Amount and Date');return;}
  const db=getDB(); const txnId=genId();
  db.sk_payments.push({id:genId(),txnId,amount,date,note:document.getElementById('sk-notes').value.trim()});
  db.transactions.push({id:txnId,type:'sk_payment',amount,date,note:'Settlement from SK Gold',createdAt:new Date().toISOString()});
  await saveDB(db); document.getElementById('sk-amount').value=''; document.getElementById('sk-notes').value='';
  const msg=document.getElementById('sk-msg'); msg.innerHTML=`<i class="fas fa-check-circle"></i> ${fmtMoney(amount)} recorded.`; msg.classList.remove('hidden'); setTimeout(()=>msg.classList.add('hidden'),3000);
  renderSkGold(); renderDashboard();
}

// ==================== HISTORY ====================
function renderHistory() {
  const q=document.getElementById('hist-search').value.toLowerCase(); const filter=document.getElementById('hist-filter').value; const db=getDB();
  let txns=[...db.transactions].sort((a,b)=>new Date(b.createdAt||b.date)-new Date(a.createdAt||a.date));
  if(filter!=='all') txns=txns.filter(t=>t.type===filter);
  if(q) txns=txns.filter(t=>{const l=db.loans.find(x=>x.id===t.loanId);const c=l?db.customers.find(x=>x.id===l.customerId):null;return (c&&(c.name.toLowerCase().includes(q)||(c.mobile||'').includes(q)||c.account.toLowerCase().includes(q)))||(t.note||'').toLowerCase().includes(q)||String(t.amount||'').includes(q)||String(t.received||'').includes(q);});
  const el=document.getElementById('hist-timeline');
  if(!txns.length){el.innerHTML='<div class="empty-state"><i class="fas fa-search"></i><p>No history found</p></div>';return;}
  const imap={loan:'fas fa-plus',topup:'fas fa-arrow-up',interest:'fas fa-coins',closure:'fas fa-lock',sk_payment:'fas fa-handshake',partial_repayment:'fas fa-rotate-left'};
  const lmap={loan:'New Loan',topup:'Top-Up',interest:'Interest',closure:'Closed',sk_payment:'SK Payment',partial_repayment:'Partial Repayment'};
  el.innerHTML=txns.map(t=>{
    const l=db.loans.find(x=>x.id===t.loanId); const c=l?db.customers.find(x=>x.id===l.customerId):null;
    const name=t.type==='sk_payment'?'SK Gold':(c?c.name:'—');
    const amt=t.type==='interest'?fmtMoney(t.received):fmtMoney(t.amount);
    let tags=''; if(t.type==='interest'){if(t.discount>0)tags+=`<span class="hist-tag disc">Discount: ${fmtMoney(t.discount)}</span>`;if(t.shortfall>0)tags+=`<span class="hist-tag paylater">Pay Later: ${fmtMoney(t.shortfall)}</span>`;if(t.fromDate&&t.toDate)tags+=`<span class="hist-tag period">${fmtDate(t.fromDate)} → ${fmtDate(t.toDate)}</span>`;}
    const pmtTag = t.payment ? `<div style="font-size:0.75rem;color:#8888aa;margin-top:3px"><i class="fas fa-wallet"></i> ${fmtPayment(t.payment)}</div>` : '';
    const editBtn=`<button class="btn-ghost btn-sm" onclick="editTxn('${t.id}')"><i class="fas fa-pen"></i></button>`;
    return `<div class="timeline-item"><div class="activity-icon ${t.type==='partial_repayment'?'partial_repayment':t.type}"><i class="${imap[t.type]||'fas fa-circle'}"></i></div><div class="tl-body"><div class="tl-title">${lmap[t.type]||t.type} · ${name}</div><div class="tl-meta">${fmtDate(t.date)}${t.note?' · '+t.note:''}</div><div class="tl-amount">${amt}</div>${tags?`<div class="tl-tags">${tags}</div>`:''} ${pmtTag}</div><div style="display:flex;gap:4px;align-self:center;flex-shrink:0">${editBtn}<button class="btn-danger btn-sm" onclick="deleteTransaction('${t.id}')"><i class="fas fa-trash"></i></button></div></div>`;
  }).join('');
}
function editTxn(id) {
  const db=getDB(); const t=db.transactions.find(x=>x.id===id); if(!t) return;
  const typeLabels={loan:'New Loan',topup:'Top-Up',interest:'Interest',closure:'Closure',partial_repayment:'Partial Repayment',sk_payment:'SK Payment',mediator_payment:'Mediator Payment'};
  document.getElementById('edit-modal-title').innerHTML=`<i class="fas fa-pen"></i> Edit ${typeLabels[t.type]||t.type}`;
  // For interest entries show full editor
  if (t.type !== 'interest') {
    // Generic editor for non-interest transactions
    document.getElementById('edit-modal-body').innerHTML=`
      <div class="form-group"><label>Date</label><input type="date" id="et-date" class="input-field" value="${t.date||''}"></div>
      <div class="form-group"><label>Amount (₹)</label><input type="number" id="et-amt" class="input-field" value="${t.amount||0}"></div>
      <div class="form-group full-width"><label>Notes</label><input type="text" id="et-note" class="input-field" value="${t.note||''}"></div>`;
    document.getElementById('edit-save-btn').onclick=async()=>{
      t.date=document.getElementById('et-date').value;
      t.amount=parseFloat(document.getElementById('et-amt').value)||0;
      t.note=document.getElementById('et-note').value.trim();
      await saveDB(db); closeEditModal(); renderHistory(); renderDashboard();
    };
    document.getElementById('edit-modal').classList.remove('hidden');
    return;
  }
  document.getElementById('edit-modal-title').innerHTML='<i class="fas fa-coins"></i> Edit Interest Entry';
  document.getElementById('edit-modal-body').innerHTML=`<div class="form-group"><label>Date</label><input type="date" id="et-date" class="input-field" value="${t.date}"></div><div class="form-group"><label>From Date</label><input type="date" id="et-from" class="input-field" value="${t.fromDate||''}"></div><div class="form-group"><label>To Date</label><input type="date" id="et-to" class="input-field" value="${t.toDate||''}"></div><div class="form-group"><label>Calculated (₹)</label><input type="number" id="et-calc" class="input-field" value="${t.calculated||0}"></div><div class="form-group"><label>Received (₹)</label><input type="number" id="et-rcvd" class="input-field" value="${t.received||0}" oninput="etGap()"></div><div class="form-group"><label>Discount (₹)</label><input type="number" id="et-disc" class="input-field" value="${t.discount||0}"></div><div class="form-group"><label>Pay Later (₹)</label><input type="number" id="et-short" class="input-field" value="${t.shortfall||0}"></div><div class="form-group full-width"><label>Notes</label><input type="text" id="et-note" class="input-field" value="${t.note||''}"></div>`;
  document.getElementById('edit-save-btn').onclick=async()=>{t.date=document.getElementById('et-date').value;t.fromDate=document.getElementById('et-from').value;t.toDate=document.getElementById('et-to').value;t.calculated=parseFloat(document.getElementById('et-calc').value)||0;t.received=parseFloat(document.getElementById('et-rcvd').value)||0;t.discount=parseFloat(document.getElementById('et-disc').value)||0;t.shortfall=parseFloat(document.getElementById('et-short').value)||0;t.note=document.getElementById('et-note').value.trim();await saveDB(db);closeEditModal();renderHistory();renderDashboard();};
  document.getElementById('edit-modal').classList.remove('hidden');
}
function etGap(){const c=parseFloat(document.getElementById('et-calc').value)||0;const r=parseFloat(document.getElementById('et-rcvd').value)||0;document.getElementById('et-short').value=Math.max(0,c-r);document.getElementById('et-disc').value=0;}

// ==================== CUSTOMERS ====================
let _selCusts=new Set();
function renderCustomers() {
  const q=document.getElementById('cust-search').value.toLowerCase(); const db=getDB();
  let custs=[...db.customers]; if(q) custs=custs.filter(c=>c.name.toLowerCase().includes(q)||(c.mobile||'').includes(q)||c.account.toLowerCase().includes(q));
  const el=document.getElementById('customers-list');
  if(!custs.length){el.innerHTML='<div class="empty-state"><i class="fas fa-users"></i><p>No customers found</p></div>';return;}
  el.innerHTML=custs.map(c=>{
    const all=db.loans.filter(l=>l.customerId===c.id); const act=all.filter(l=>l.status==='active');
    const cap=act.reduce((s,l)=>s+getLoanTotal(l),0); const ri=all.reduce((s,l)=>s+getLoanIntReceived(l),0); const disc=all.reduce((s,l)=>s+getLoanDiscount(l),0);
    return `<div class="customer-row"><input type="checkbox" ${_selCusts.has(c.id)?'checked':''} onchange="toggleCustSel('${c.id}',this.checked)" style="width:18px;height:18px;accent-color:var(--gold);cursor:pointer;flex-shrink:0"/><div class="cust-info" onclick="openCustLoans('${c.id}')" style="cursor:pointer;flex:1"><div class="cust-name">${c.name}</div><div class="cust-meta">${c.account} · ${c.mobile||'—'}${c.address?' · '+c.address:''}</div></div><div class="cust-stats"><div class="cust-stat"><span class="clbl">Active</span><span class="cval">${act.length}</span></div><div class="cust-stat"><span class="clbl">Capital</span><span class="cval">${fmtMoney(cap)}</span></div><div class="cust-stat"><span class="clbl">Interest</span><span class="cval" style="color:var(--green)">${fmtMoney(ri)}</span></div>${disc>0?`<div class="cust-stat"><span class="clbl">Discount</span><span class="cval text-red">${fmtMoney(disc)}</span></div>`:''}</div><div style="display:flex;gap:6px;flex-shrink:0"><button class="btn-ghost btn-sm" onclick="editCustomer('${c.id}')"><i class="fas fa-edit"></i></button><button class="btn-danger btn-sm" onclick="deleteCustomer('${c.id}')"><i class="fas fa-trash"></i></button></div></div>`;
  }).join('');
}
function openCustLoans(id){const db=getDB();const loans=db.loans.filter(l=>l.customerId===id);if(!loans.length)return;const act=loans.filter(l=>l.status==='active');openLoanModal((act.length?act[0]:loans[0]).id);}
function toggleCustSel(id,checked){checked?_selCusts.add(id):_selCusts.delete(id);}
function selectAllCustomers(){const q=document.getElementById('cust-search').value.toLowerCase();const db=getDB();let c=db.customers;if(q)c=c.filter(x=>x.name.toLowerCase().includes(q)||(x.mobile||'').includes(q));c.forEach(x=>_selCusts.add(x.id));renderCustomers();}
function exportCSV(){
  if(!_selCusts.size){alert('Select customers first.');return;}
  const db=getDB(); const today=new Date().toISOString().split('T')[0];
  const rows=[['Account','Name','Date of Loan','Duration','Rate','Principal','Int. Due','Total Owed','Int. Collected','Top-Up History','Partial Repaid','Source']];
  _selCusts.forEach(cid=>{
    const c=db.customers.find(x=>x.id===cid); if(!c) return;
    const al=db.loans.filter(l=>l.customerId===cid&&l.status==='active');
    if(!al.length){rows.push([c.account,c.name,'','','','','','','','','','']);return;}
    al.forEach(l=>{
      const p=getLoanTotal(l); const tu=db.transactions.filter(t=>t.type==='topup'&&t.loanId===l.id);
      const tuT=tu.reduce((s,t)=>s+t.amount,0); const part=getLoanPartial(l);
      const li=getLastIntDate(l.id); const id=calcSegInt(l.id,li,today).totalInterest; const pend=getLoanPending(l);
      const due=id+pend; const owed=p+due; const ri=getLoanIntReceived(l);
      const dur=fmtDuration(l.startDate,today).replace(' ago','');
      const tuStr=tu.length?tu.map(t=>`${fmtMoney(t.amount)} on ${fmtDate(t.date)}`).join('; '):'None';
      rows.push([c.account,c.name,fmtDate(l.startDate),dur,l.rate+'%/mo',p,due,owed,ri,tuT>0?tuStr:'None',part>0?part:'None',srcLabel(l)]);
    });
  });
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})); a.download='MahavirFinance_'+today+'.csv'; a.click();
  _selCusts.clear(); renderCustomers();
}

// ==================== IMAGES ====================
function showImgOptions(prefix) {
  // Remove any existing popup
  const existing = document.getElementById('img-opts-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'img-opts-popup';
  popup.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:var(--bg2);border-top:1px solid var(--border);border-radius:16px 16px 0 0;padding:20px;z-index:9998;animation:slideUp .25s ease;';
  popup.innerHTML = `
    <div style="text-align:center;font-size:0.8rem;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:16px">Add Gold Photo</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button onclick="openImgInput('${prefix}','camera')" style="background:var(--gold);color:#000;border:none;border-radius:10px;padding:14px;font-size:1rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px"><i class="fas fa-camera"></i> Take Photo</button>
      <button onclick="openImgInput('${prefix}','gallery')" style="background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:10px;padding:14px;font-size:1rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px"><i class="fas fa-images"></i> Choose from Gallery</button>
      <button onclick="document.getElementById('img-opts-popup').remove()" style="background:none;color:var(--text3);border:none;padding:10px;font-size:0.95rem;cursor:pointer">Cancel</button>
    </div>`;
  document.body.appendChild(popup);
  // Close on backdrop tap
  setTimeout(() => {
    document.addEventListener('click', function closePopup(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', closePopup); }
    });
  }, 100);
}

function openImgInput(prefix, mode) {
  const input = document.getElementById(prefix + '-img-input');
  if (!input) return;
  document.getElementById('img-opts-popup')?.remove();
  if (mode === 'camera') {
    input.removeAttribute('multiple');
    input.setAttribute('capture', 'environment');
  } else {
    input.setAttribute('multiple', 'true');
    input.removeAttribute('capture');
  }
  input.click();
}

function compressImg(file, maxW, maxH, quality) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        // Scale down if larger than max
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW/w, maxH/h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadImgToStorage(base64data, path) {
  try {
    console.log('Uploading to Storage path:', path);
    const imgRef = ref(storage, path);
    const snapshot = await uploadString(imgRef, base64data, 'data_url');
    console.log('Upload successful:', snapshot);
    const url = await getDownloadURL(imgRef);
    console.log('Download URL:', url);
    return url;
  } catch(e) {
    console.error('Storage upload error:', e.code, e.message);
    throw e;
  }
}

async function deleteImgFromStorage(url) {
  try {
    let imgRef;
    if (url.startsWith('https://firebasestorage')) {
      // Extract path from full Firebase Storage URL
      const urlObj = new URL(url);
      const path = decodeURIComponent(urlObj.pathname.split('/o/')[1].split('?')[0]);
      imgRef = ref(storage, path);
    } else {
      imgRef = ref(storage, url);
    }
    await deleteObject(imgRef);
    console.log('Deleted from storage:', url);
  } catch(e) {
    console.warn('Could not delete from storage:', e.code, e.message);
  }
}

function handleImgSelect(prefix, input) {
  if(!input.files.length) return;
  if(!_pimg[prefix]) _pimg[prefix]=[];
  Array.from(input.files).forEach(async file=>{
    const id = genId();
    _pimg[prefix].push({id, data:null, url:null, uploading:true, createdAt:new Date().toISOString()});
    renderPendingImgs(prefix);
    try {
      const compressed = await compressImg(file, 800, 800, 0.70);
      const path = 'images/' + _uid + '/' + id + '.jpg';
      const url = await uploadImgToStorage(compressed, path);
      const item = _pimg[prefix].find(x=>x.id===id);
      if (item) { item.url = url; item.uploading = false; }
    } catch(e) {
      console.error('Upload failed:', e);
      showToast('⚠️ Photo upload failed — check Storage rules');
      _pimg[prefix] = _pimg[prefix].filter(x=>x.id!==id);
    }
    renderPendingImgs(prefix);
  });
  input.value='';
}
function renderPendingImgs(prefix) {
  const grid=document.getElementById(prefix+'-img-preview'); if(!grid) return;
  const imgs=_pimg[prefix]||[];
  grid.innerHTML=imgs.map((img,i)=>{
    const src = img.url || img.data || '';
    if (img.uploading) {
      return `<div class="img-thumb-wrap" style="display:flex;align-items:center;justify-content:center;background:var(--bg3)"><i class="fas fa-spinner fa-spin" style="color:var(--gold);font-size:1.2rem"></i></div>`;
    }
    return `<div class="img-thumb-wrap"><img src="${src}" class="img-thumb" onclick="viewImgFull('${src}')"/><button class="img-delete-btn" onclick="removePendingImg('${prefix}',${i})"><i class="fas fa-times"></i></button></div>`;
  }).join('');
}
async function removePendingImg(prefix,idx){
  if(!_pimg[prefix]) return;
  const img = _pimg[prefix][idx];
  // Delete from Firebase Storage if already uploaded
  if(img && img.url) await deleteImgFromStorage(img.url);
  _pimg[prefix].splice(idx,1);
  renderPendingImgs(prefix);
}
function viewImgFull(src) {
  let o=document.getElementById('img-overlay');
  if(!o){o=document.createElement('div');o.id='img-overlay';o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.96);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:20px;';o.onclick=()=>o.remove();document.body.appendChild(o);}
  o.innerHTML=`<img src="${src}" style="max-width:100%;max-height:90vh;border-radius:10px;object-fit:contain"/><button style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:1.1rem;cursor:pointer;" onclick="document.getElementById('img-overlay').remove()"><i class="fas fa-times"></i></button>`;
  o.style.display='flex';
}
function addMoreImgs(loanId) {
  // Show photo options popup for loan modal
  const existing = document.getElementById('img-opts-popup');
  if (existing) existing.remove();
  const popup = document.createElement('div');
  popup.id = 'img-opts-popup';
  popup.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:var(--bg2);border-top:1px solid var(--border);border-radius:16px 16px 0 0;padding:20px;z-index:9998;animation:slideUp .25s ease;';
  popup.innerHTML = `<div style="text-align:center;font-size:0.8rem;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:16px">Add Gold Photo</div><div style="display:flex;flex-direction:column;gap:10px"><button onclick="_doAddImg('${loanId}','camera')" style="background:var(--gold);color:#000;border:none;border-radius:10px;padding:14px;font-size:1rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px"><i class="fas fa-camera"></i> Take Photo</button><button onclick="_doAddImg('${loanId}','gallery')" style="background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:10px;padding:14px;font-size:1rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px"><i class="fas fa-images"></i> Choose from Gallery</button><button onclick="document.getElementById('img-opts-popup').remove()" style="background:none;color:var(--text3);border:none;padding:10px;font-size:0.95rem;cursor:pointer">Cancel</button></div>`;
  document.body.appendChild(popup);
}

async function _doAddImg(loanId, mode) {
  document.getElementById('img-opts-popup')?.remove();
  const input = document.createElement('input'); input.type='file'; input.accept='image/*';
  if (mode === 'camera') { input.setAttribute('capture','environment'); }
  else { input.multiple = true; }
  input.onchange=async e=>{
    const db=getDB(); const l=db.loans.find(x=>x.id===loanId); if(!l) return;
    if(!l.images) l.images=[];
    showToast('<i class="fas fa-spinner fa-spin"></i> Uploading photos...');
    await Promise.all(Array.from(e.target.files).map(async file=>{
      const id=genId();
      const compressed=await compressImg(file,800,800,0.70);
      const path=`images/${_uid}/${id}.jpg`;
      const url=await uploadImgToStorage(compressed, path);
      l.images.push({id,url,createdAt:new Date().toISOString()});
    }));
    await saveDB(db);
    showToast('<i class="fas fa-check-circle"></i> Photos saved!');
    openLoanModal(loanId);
  };
  input.click();
}
async function deleteLoanImg(loanId,imgId) {
  if(!confirm('Delete this photo?')) return;
  const db=getDB(); const l=db.loans.find(x=>x.id===loanId);
  // Find the URL before deleting
  let imgUrl = null;
  if(l?.images) { const img=l.images.find(i=>i.id===imgId); if(img) imgUrl=img.url||img.data; l.images=l.images.filter(i=>i.id!==imgId); }
  db.transactions.forEach(t=>{if(t.images){const img=t.images.find(i=>i.id===imgId);if(img)imgUrl=img.url||img.data;t.images=t.images.filter(i=>i.id!==imgId);}});
  // Delete from Firebase Storage if it's a storage URL
  if(imgUrl && imgUrl.startsWith('https://firebasestorage')) await deleteImgFromStorage(imgUrl);
  await saveDB(db); openLoanModal(loanId);
}

// ==================== PDF ====================
function genPDF(loanId) {
  const db=getDB(); const loan=db.loans.find(l=>l.id===loanId); const cust=db.customers.find(c=>c.id===loan.customerId);
  const txns=db.transactions.filter(t=>t.loanId===loanId).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const tot=getLoanTotal(loan); const rcvd=getLoanIntReceived(loan); const disc=getLoanDiscount(loan);
  const today=new Date().toISOString().split('T')[0]; const li=getLastIntDate(loanId);
  const est=loan.status==='active'?calcSegInt(loanId,li,today).totalInterest:0; const pend=getLoanPending(loan);
  const owed=tot+est+pend;
  const lmap={loan:'New Loan',topup:'Top-Up',interest:'Interest Received',closure:'Loan Closed',partial_repayment:'Partial Repayment'};
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#1a1a1a;font-size:13px;}.header{display:flex;justify-content:space-between;border-bottom:2px solid #c49b2e;padding-bottom:12px;margin-bottom:16px;}.co{font-size:20px;font-weight:900;color:#c49b2e;}.title{font-size:15px;font-weight:800;margin-bottom:10px;}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;}.box{background:#f9f6ee;border:1px solid #e8d98a;border-radius:5px;padding:9px 12px;}.lbl{font-size:10px;color:#888;text-transform:uppercase;font-weight:700;letter-spacing:.05em;margin-bottom:2px;}.val{font-size:13px;font-weight:700;}.hl{background:#fff8e8;border-color:#c49b2e;}.hl .val{color:#c49b2e;font-size:15px;}table{width:100%;border-collapse:collapse;margin-top:12px;}th{background:#c49b2e;color:#fff;padding:7px 9px;text-align:left;font-size:11px;text-transform:uppercase;}td{padding:7px 9px;border-bottom:1px solid #f0ead8;font-size:12px;}tr:nth-child(even) td{background:#fdfaf3;}.footer{margin-top:16px;padding-top:10px;border-top:1px solid #e8d98a;font-size:10px;color:#aaa;display:flex;justify-content:space-between;}.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;}.active-b{background:#d4edda;color:#1a7a3c;}.closed-b{background:#f8d7da;color:#a71d2a;}@media print{body{padding:12px;}}</style></head><body>
  <div class="header"><div><div class="co">Mahavir Finance</div><div style="font-size:11px;color:#888">mahavirloan.com</div></div><div style="font-size:11px;color:#888;text-align:right">Generated: ${fmtDate(today)}</div></div>
  <div class="title">Loan Statement — ${cust.name} <span class="badge ${loan.status==='active'?'active-b':'closed-b'}">${loan.status.toUpperCase()}</span></div>
  <div class="grid">
    <div class="box"><div class="lbl">Customer</div><div class="val">${cust.name}</div></div>
    <div class="box"><div class="lbl">Account</div><div class="val">${cust.account}</div></div>
    <div class="box"><div class="lbl">Mobile</div><div class="val">${cust.mobile||'—'}</div></div>
    <div class="box"><div class="lbl">Source</div><div class="val">${srcLabel(loan)}</div></div>
    <div class="box"><div class="lbl">Start Date</div><div class="val">${fmtDate(loan.startDate)}</div></div>
    <div class="box"><div class="lbl">Rate</div><div class="val">${loan.rate}% / month</div></div>
    <div class="box"><div class="lbl">Outstanding Principal</div><div class="val">₹${tot.toLocaleString('en-IN')}</div></div>
    <div class="box"><div class="lbl">Interest Collected</div><div class="val" style="color:#1a7a3c">₹${rcvd.toLocaleString('en-IN')}</div></div>
    ${disc>0?`<div class="box"><div class="lbl">Discount Given</div><div class="val" style="color:#a71d2a">₹${disc.toLocaleString('en-IN')}</div></div>`:''}
    ${loan.status==='active'?`<div class="box hl"><div class="lbl">Total Owed (Today)</div><div class="val">₹${owed.toLocaleString('en-IN')}</div></div>`:''}
    ${loan.goldDesc?`<div class="box"><div class="lbl">Gold</div><div class="val">${loan.goldDesc}${loan.goldWeight?' · '+loan.goldWeight+'g':''}</div></div>`:''}
  </div>
  <div class="title">Transaction History</div>
  <table><thead><tr><th>Date</th><th>Type</th><th>Details</th><th style="text-align:right">Amount</th></tr></thead><tbody>
    ${txns.map(t=>{const type=lmap[t.type]||t.type;const amt=t.type==='interest'?`₹${(t.received||0).toLocaleString('en-IN')} received`:`₹${(t.amount||0).toLocaleString('en-IN')}`;const det=t.type==='interest'?`${fmtDate(t.fromDate||t.date)}→${fmtDate(t.toDate||t.date)}${t.discount>0?' · Disc:₹'+t.discount.toLocaleString('en-IN'):''}${t.shortfall>0?' · PayLater:₹'+t.shortfall.toLocaleString('en-IN'):''}`:t.note||'';return `<tr><td>${fmtDate(t.date)}</td><td>${type}</td><td>${det}</td><td style="font-weight:700;text-align:right">${amt}</td></tr>`;}).join('')}
  </tbody></table>
  <div class="footer"><span>Mahavir Finance · mahavirloan.com</span><span>Computer-generated statement.</span></div>
  </body></html>`;
  const w=window.open('','_blank'); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600);
}

// ==================== WHATSAPP ====================
function shareWhatsApp(loanId) {
  const db=getDB(); const l=db.loans.find(x=>x.id===loanId); const c=db.customers.find(x=>x.id===l.customerId);
  const tot=getLoanTotal(l); const today=new Date().toISOString().split('T')[0];
  const li=getLastIntDate(loanId); const est=l.status==='active'?calcSegInt(loanId,li,today).totalInterest:0;
  const pend=getLoanPending(l); const rcvd=getLoanIntReceived(l); const owed=tot+est+pend;
  const msg=`*Mahavir Finance — Loan Statement*\n━━━━━━━━━━━━━━━━━\n👤 *Customer:* ${c.name}\n🆔 *Account:* ${c.account}\n📱 *Mobile:* ${c.mobile||'—'}\n\n💰 *Principal:* ₹${tot.toLocaleString('en-IN')}\n📊 *Rate:* ${l.rate}% / month\n📅 *Started:* ${fmtDate(l.startDate)}\n🏷️ *Source:* ${srcLabel(l)}\n${l.goldDesc?`💎 *Gold:* ${l.goldDesc}\n`:''}\n━━━━━━━━━━━━━━━━━\n✅ *Interest Paid:* ₹${rcvd.toLocaleString('en-IN')}\n⏳ *Interest Due:* ₹${(est+pend).toLocaleString('en-IN')}\n🔢 *Total Owed:* ₹${owed.toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━━\n_Mahavir Finance · mahavirloan.com_`;
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
}

// ==================== OTHER MEDIATOR PAGE ====================
function renderOtherMediator() {
  const db = getDB();
  const mediators = getAllMediators(db);
  const el = document.getElementById('om-content');
  if (!mediators.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-user-tie"></i><p>No other mediator loans yet.<br>Create a loan with "Other Mediator" source to see it here.</p></div>';
    return;
  }
  el.innerHTML = mediators.map(name => {
    const key = name.replace(/[^a-zA-Z0-9]/g,'_');
    const loans = db.loans.filter(l=>l.viaSk==='other'&&l.viaOtherName===name&&l.status==='active');
    const capital = loans.reduce((s,l)=>s+getLoanTotal(l),0);
    // Interest collected from this mediator's customers
    const medIntTxns = db.transactions.filter(t=>t.type==='interest'&&t.mediatorName===name);
    const intCollected = medIntTxns.reduce((s,t)=>s+(t.received||0),0);
    // Settlements received from mediator
    const settlements = db.transactions.filter(t=>t.type==='mediator_payment'&&t.mediatorName===name).reduce((s,t)=>s+t.amount,0);
    // Payments made TO mediator (interest/closure via other_outstanding)
    const viaPmt = db.transactions.filter(t=>t.payment&&(t.payment.other_outstanding||0)>0&&t.mediatorName===name).reduce((s,t)=>s+(t.payment.other_outstanding||0),0);
    // Capital given via this mediator
    const capGiven = db.transactions.filter(t=>t.type==='loan'&&t.payment&&(t.payment.other_outstanding||0)>0&&t.mediatorName===name).reduce((s,t)=>s+(t.payment.other_outstanding||0),0);
    // Outstanding = mediator owes you
    const outstanding = intCollected + viaPmt - capGiven - settlements;
    const history = db.transactions.filter(t=>t.mediatorName===name&&t.type==='mediator_payment').sort((a,b)=>new Date(b.date)-new Date(a.date));

    return `
      <div style="margin-bottom:8px;font-size:1.2rem;font-weight:800;color:var(--gold);padding:4px 0">${name}</div>
      <div class="sk-stats-row" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-icon" style="color:#f39c12"><i class="fas fa-coins"></i></div><div class="stat-label">Interest via ${name}</div><div class="stat-value" style="color:#f39c12">${fmtMoney(intCollected)}</div><div class="stat-sub">Collected from customers</div></div>
        <div class="stat-card"><div class="stat-icon" style="color:var(--green)"><i class="fas fa-check-circle"></i></div><div class="stat-label">Received from ${name}</div><div class="stat-value" style="color:var(--green)">${fmtMoney(settlements)}</div><div class="stat-sub">Settlements recorded</div></div>
        <div class="stat-card" style="border-color:rgba(232,190,90,0.3)"><div class="stat-icon" style="color:${outstanding>0?'var(--red)':'var(--green)'}"><i class="fas fa-scale-balanced"></i></div><div class="stat-label">Outstanding</div><div class="stat-value" style="color:${outstanding>0?'var(--red)':'var(--green)'}">${fmtMoney(Math.abs(outstanding))}</div><div class="stat-sub">${outstanding>0?name+' owes you':'You owe '+name}</div></div>
        <div class="stat-card"><div class="stat-icon" style="color:#4f8ef7"><i class="fas fa-arrow-down-right-dots"></i></div><div class="stat-label">Capital via ${name}</div><div class="stat-value" style="color:#4f8ef7">${fmtMoney(capGiven)}</div><div class="stat-sub">${name} paid borrowers for you</div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fas fa-layer-group"></i></div><div class="stat-label">Active Loans</div><div class="stat-value">${loans.length}</div><div class="stat-sub">Capital: ${fmtMoney(capital)}</div></div>
      </div>
      <div class="form-card" style="margin-bottom:24px">
        <div class="form-section-title"><i class="fas fa-plus"></i> Record Settlement from ${name}</div>
        <div class="form-grid">
          <div class="form-group"><label>Amount Received (₹) *</label><input type="number" id="om-amt-${key}" class="input-field" placeholder="0"/></div>
          <div class="form-group"><label>Date *</label><input type="date" id="om-date-${key}" class="input-field" value="${new Date().toISOString().split('T')[0]}"/></div>
          <div class="form-group full-width"><label>Notes</label><input type="text" id="om-notes-${key}" class="input-field" placeholder="Optional"/></div>
        </div>
        <div class="form-actions"><button class="btn-primary" onclick="saveMediatorPayment('${name}')"><i class="fas fa-save"></i> Record Settlement</button></div>
        <div class="form-section-title" style="margin-top:20px"><i class="fas fa-list"></i> Settlement History</div>
        <div>${history.length ? history.map(p=>`<div class="activity-item"><div class="activity-icon sk_payment"><i class="fas fa-handshake"></i></div><div class="activity-text"><div class="activity-name">Settlement from ${name}</div><div class="activity-meta">${fmtDate(p.date)}${p.note?' · '+p.note:''}</div></div><div class="activity-amount text-green">${fmtMoney(p.amount)}</div></div>`).join('') : '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No settlements yet</div>'}</div>
        <div class="form-section-title" style="margin-top:20px"><i class="fas fa-clock-rotate-left"></i> All Transactions</div>
        <div>${(()=>{
          const imap3={loan:'fas fa-plus',topup:'fas fa-arrow-up',interest:'fas fa-coins',closure:'fas fa-lock',partial_repayment:'fas fa-rotate-left',mediator_payment:'fas fa-handshake'};
          const lmap3={loan:'New Loan',topup:'Top-Up',interest:'Interest Received',closure:'Loan Closed',partial_repayment:'Partial Repayment',mediator_payment:'Settlement'};
          const medTxns = db.transactions.filter(t=>{
            if(t.type==='mediator_payment'&&t.mediatorName===name) return true;
            const loan2=db.loans.find(l=>l.id===t.loanId);
            if(!loan2) return false;
            if(loan2.viaSk==='other'&&loan2.viaOtherName===name) return true;
            if(t.payment&&(t.payment.other_outstanding||0)>0&&t.mediatorName===name) return true;
            return false;
          }).sort((a,b)=>new Date(b.createdAt||b.date)-new Date(a.createdAt||a.date));
          if(!medTxns.length) return '<div style="color:var(--text3);font-size:0.85rem;padding:8px">No transactions yet</div>';
          return medTxns.map(t=>{
            const loan2=db.loans.find(l=>l.id===t.loanId);
            const cust2=loan2?db.customers.find(c=>c.id===loan2.customerId):null;
            const tname=t.type==='mediator_payment'?name:(cust2?cust2.name:'—');
            const amt2=t.type==='interest'?fmtMoney(t.received||0):fmtMoney(t.amount||0);
            const pmtTag2=t.payment&&(t.payment.other_outstanding||0)>0?`<span class="hist-tag" style="background:rgba(243,156,18,0.15);color:#f39c12">Mediator: ${fmtMoney(t.payment.other_outstanding)}</span>`:'';
            const tc=t.type==='mediator_payment'?'var(--green)':t.type==='loan'?'#4f8ef7':t.type==='interest'?'#f39c12':t.type==='closure'?'var(--red)':'var(--text2)';
            return \`<div class="activity-item">
              <div class="activity-icon \${t.type==='mediator_payment'?'sk_payment':t.type==='partial_repayment'?'partial_repayment':t.type}"><i class="\${imap3[t.type]||'fas fa-circle'}"></i></div>
              <div class="activity-text">
                <div class="activity-name">\${tname} <span style="font-size:0.75rem;font-weight:600;color:\${tc};background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:4px">\${lmap3[t.type]||t.type}</span></div>
                <div class="activity-meta">\${fmtDate(t.date)}\${cust2?' · '+cust2.account:''}</div>
                \${pmtTag2?\`<div class="tl-tags" style="margin-top:4px">\${pmtTag2}</div>\`:''}
              </div>
              <div class="activity-amount" style="color:\${tc}">\${amt2}</div>
            </div>\`;
          }).join('');
        })()}</div>
      </div>
      <hr style="border:none;border-top:1px solid var(--border2);margin:8px 0 20px"/>`;
  }).join('');
}

async function saveMediatorPayment(mediatorName) {
  const key = mediatorName.replace(/[^a-zA-Z0-9]/g,'_');
  const amount = parseFloat(document.getElementById('om-amt-'+key)?.value);
  const date = document.getElementById('om-date-'+key)?.value;
  if (!amount||!date) { alert('Fill Amount and Date'); return; }
  const db = getDB();
  db.transactions.push({id:genId(),type:'mediator_payment',amount,date,mediatorName,note:document.getElementById('om-notes-'+key)?.value.trim()||'',createdAt:new Date().toISOString()});
  await saveDB(db);
  showToast('<i class="fas fa-check-circle"></i> Settlement recorded!');
  renderOtherMediator();
}

// ==================== PAYMENT INFO PAGE ====================
function renderPaymentInfo() {
  const db = getDB();
  const today = new Date().toISOString().split('T')[0];
  // Aggregate all payments by method
  let totals = {cash:0, bank:0, sk_outstanding:0, other_outstanding:0};
  let monthly = {};
  db.transactions.forEach(t => {
    if (!t.payment) return;
    const p = t.payment;
    const amt = t.type==='interest' ? (t.received||0) : (t.amount||0);
    const month = (t.date||'').substring(0,7);
    if (!monthly[month]) monthly[month] = {cash:0,bank:0,sk_outstanding:0,other_outstanding:0};
    ['cash','bank','sk_outstanding','other_outstanding'].forEach(k=>{
      if(p[k]>0){ totals[k]+=(p[k]||0); monthly[month][k]+=(p[k]||0); }
    });
  });
  const totalAll = totals.cash+totals.bank+totals.sk_outstanding+totals.other_outstanding;
  const skOut = calcSkOutstanding(db);
  const mediators = getAllMediators(db);
  document.getElementById('pi-content').innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card"><div class="stat-icon" style="color:#22d87a"><i class="fas fa-money-bill-wave"></i></div><div class="stat-label">Cash Total</div><div class="stat-value" style="color:#22d87a">${fmtMoney(totals.cash)}</div><div class="stat-sub">All time</div></div>
      <div class="stat-card"><div class="stat-icon" style="color:#4f8ef7"><i class="fas fa-building-columns"></i></div><div class="stat-label">Bank Transfer Total</div><div class="stat-value" style="color:#4f8ef7">${fmtMoney(totals.bank)}</div><div class="stat-sub">All time</div></div>
      <div class="stat-card"><div class="stat-icon" style="color:#a07af5"><i class="fas fa-handshake"></i></div><div class="stat-label">Via SK Outstanding</div><div class="stat-value" style="color:#a07af5">${fmtMoney(totals.sk_outstanding)}</div><div class="stat-sub">SK net: ${fmtMoney(skOut)}</div></div>
      <div class="stat-card"><div class="stat-icon" style="color:#f39c12"><i class="fas fa-user-tie"></i></div><div class="stat-label">Via Other Mediator</div><div class="stat-value" style="color:#f39c12">${fmtMoney(totals.other_outstanding)}</div><div class="stat-sub">${mediators.length} mediator${mediators.length!==1?'s':''}</div></div>
    </div>
    <div class="form-card">
      <div class="form-section-title"><i class="fas fa-calendar"></i> Monthly Breakdown</div>
      ${Object.entries(monthly).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12).map(([month,p])=>`
        <div class="sk-sum-row" style="flex-direction:column;align-items:flex-start;gap:4px">
          <div style="font-weight:700;color:var(--text);margin-bottom:4px">${month}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.85rem">
            ${p.cash>0?`<span><i class="fas fa-money-bill-wave" style="color:#22d87a"></i> Cash: ${fmtMoney(p.cash)}</span>`:''}
            ${p.bank>0?`<span><i class="fas fa-building-columns" style="color:#4f8ef7"></i> Bank: ${fmtMoney(p.bank)}</span>`:''}
            ${p.sk_outstanding>0?`<span><i class="fas fa-handshake" style="color:#a07af5"></i> SK: ${fmtMoney(p.sk_outstanding)}</span>`:''}
            ${p.other_outstanding>0?`<span><i class="fas fa-user-tie" style="color:#f39c12"></i> Mediator: ${fmtMoney(p.other_outstanding)}</span>`:''}
          </div>
        </div>`).join('')}
    </div>`;
}

// ==================== EXPORT / IMPORT / RESET ====================
function exportData() {
  const db=getDB(); const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='MahavirFinance_Backup_'+new Date().toISOString().split('T')[0]+'.json'; a.click();
  URL.revokeObjectURL(a.href); showToast('Data exported!');
}
async function importData() {
  if(!confirm('⚠️ IMPORT DATA\n\nThis will COMPLETELY REPLACE all current data.\n\nExport first if needed.\n\nOK to continue?')) return;
  const input=document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange=async e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try {
        const d=JSON.parse(ev.target.result);
        if(!d.customers||!d.loans||!d.transactions){alert('Invalid backup file.');return;}
        if(!d.sk_payments) d.sk_payments=[];
        await setDoc(userDoc(), d);
        _cache=d; showToast('Imported! '+d.customers.length+' customers, '+d.loans.length+' loans.'); renderDashboard();
      } catch(err){alert('Failed: '+err.message);}
    };
    reader.readAsText(file);
  };
  input.click();
}
async function resetSoftware() {
  if(!confirm('⚠️ RESET ALL DATA?\n\nThis will permanently delete everything.\n\nThis CANNOT be undone.')) return;
  if(!confirm('Are you absolutely sure?')) return;
  const empty={customers:[],loans:[],transactions:[],sk_payments:[]};
  await setDoc(userDoc(), empty); _cache=empty; showToast('All data reset.'); renderDashboard();
}

// ==================== EXPOSE ====================
Object.assign(window,{
  navigateTo,goBack,renderDashboard,renderIndex,renderLiveLoans,renderClosedLoans,renderFavourites,renderHistory,renderCustomers,renderSkGold,
  saveNewLoan,clearNewLoan,searchExistingCustomer,fillCust,searchActiveLoans,selectLoan,
  saveTopUp,savePartialRepayment,calcPrRemaining,saveInterestReceived,recalcInterest,calcDiscount,setGapType,
  openLoanModal,closeLoanModal,openCloseModal,closeCloseModal,confirmCloseLoan,
  editCustomer,deleteCustomer,editLoan,deleteLoan,deleteTransaction,editTxn,etGap,closeEditModal,
  toggleFav,openCustLoans,toggleCustSel,selectAllCustomers,exportCSV,
  saveSkPayment,exportData,importData,resetSoftware,
  handleImgSelect,renderPendingImgs,removePendingImg,viewImgFull,addMoreImgs,deleteLoanImg,
  genPDF,shareWhatsApp,toggleOtherSourceField,preselectTopup,quickInt,quickPart,
  showImgOptions,openImgInput,_doAddImg,
  renderOtherMediator,renderPaymentInfo,saveMediatorPayment,
  toggleSplitPayment,updateSplitPayment,updateSimplePayment
});
