// js/member.js
import { supabase, BUCKET } from './supabase.js'
import { requireAuth } from './auth.js'

const PR = 20, FEE = 50;
const PLANS = {
  starter:  { p: 0,  cap: 500,      d: 3, n: 'Starter'  },
  standard: { p: 1,  cap: 1000,     d: 5, n: 'Standard' },
  pro:      { p: 2,  cap: Infinity, d: 7, n: 'Pro'      }
};

const $ = id => document.getElementById(id)
const kes = n => 'KES ' + Math.round(n).toLocaleString('en-KE')
const day = t => new Date(t || Date.now()).toISOString().slice(0, 10)
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
const fd  = t => new Date(t).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })

let ME   = { id: null, email: null, plan: null, package_start: null, is_admin: false, referrer_code: null, earned: 0 }
let L    = []
let T    = []
let unlocksToday = []
let subs  = []
let pays  = []
let tab   = 'ad'
let shotDataUrl = null

function toast(m) {
  const t = $('toast'); t.textContent = m; t.hidden = false
  clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2600)
}

const DAY = 864e5, CYC = 7;
const used = () => ME.package_start ? Math.floor((Date.now() - new Date(ME.package_start).getTime()) / DAY) : 0;
const cyc = () => !ME.plan || used() >= CYC;
const active = () => !!ME.plan && used() < PLANS[ME.plan].d;
const left = () => { if(!active()) return 0; const c = PLANS[ME.plan].cap; return c === Infinity ? Infinity : Math.max(0, c - today()); }

const today = () => subs.filter(s => s.created_at.slice(0, 10) === day() && s.status !== 'rejected').reduce((a, s) => a + Number(s.amount), 0)
const isUn = id => unlocksToday.includes(id)

function banner() {
  let s = '';
  if (!ME.plan) s = 'Choose a package to start earning.';
  else if (used() >= CYC) s = 'Your 7-day cycle is complete and your payout is due. Buy a package to start a new cycle.';
  else if (!active()) s = 'Your ' + PLANS[ME.plan].n + ' package has ended after ' + PLANS[ME.plan].d + ' working days. Upgrade to keep earning.';
  return s ? `<div class="card" style="border-color:var(--gold)"><div class="row" style="border:0;padding:0"><b>${s}</b><button class="btn gold" data-t="pl">See packages</button></div></div>` : '';
}

function render() {
  const cap = ME.plan ? PLANS[ME.plan].cap : 0;
  const t = today();
  const v = subs.filter(s => s.status === 'approved').reduce((a,s)=>a+Number(s.views),0);

  $('pb').textContent = ME.plan ? PLANS[ME.plan].n : 'No package';
  $('ban').innerHTML = banner();

  $('kpis').innerHTML = [
    ['Earned today', kes(t)],
    ['Daily limit', ME.plan ? (cap === Infinity ? 'No limit' : kes(cap)) : '—'],
    ['Working days left', active() ? PLANS[ME.plan].d - used() : 0],
    ['Total earned', kes(ME.earned || 0)],
    ['Total views', v.toLocaleString()]
  ].map(k => `<div class="card kpi" style="margin:0"><small>${k[0]}</small><b>${k[1]}</b></div>`).join('')

  const tabs = [['ad','Ads and images'],['tk','Tasks'],['sb','Submit views'],['hs','Earnings & Withdraw'],['pl','Packages'],['rf','Refer and earn']]
  if (ME.is_admin) tabs.push(['ow','Add listings'])

  $('nav').innerHTML = tabs.map(x => `<button role="tab" data-t="${x[0]}" aria-selected="${x[0]===tab}">${x[1]}</button>`).join('')

  if (document.activeElement && /^(at|vw|ak|sl|wamt|wphone)$/.test(document.activeElement.id)) return
  
  if (tab === 'ad') $('main').innerHTML = V.ad();
  else if (tab === 'tk') $('main').innerHTML = V.tk();
  else if (tab === 'sb') $('main').innerHTML = V.sb();
  else if (tab === 'hs') $('main').innerHTML = V.hs();
  else if (tab === 'pl') $('main').innerHTML = V.pl();
  else if (tab === 'rf') $('main').innerHTML = V.rf();
  else if (tab === 'ow') $('main').innerHTML = V.ow();
}

const V = {
  ad: () => {
    if (!active()) return `<div class="card" style="text-align:center; padding: 40px 20px;"><h3 style="color:var(--brand); margin-bottom: 10px;">Packages Required</h3><p class="sub">You need an active package to view properties and start earning.</p><button class="btn gold" data-t="pl" style="margin-top: 10px;">View Packages</button></div>`;
    const rows = L.filter(l => l.on_air).map(l => {
      const u = isUn(l.id)
      return `<div class="row"><div><b>${esc(l.title)}</b><br><span class="pill">${esc(l.kind)}</span></div>${u ? `<button class="btn gold" data-dl="${l.id}">Download image</button>` : `<button class="btn" data-un="${l.id}">Unlock for ${kes(FEE)}</button>`}</div>`
    }).join('')
    return `<div class="card"><h3>Properties and cars to advertise</h3>${rows || '<p>No listings yet.</p>'}</div>`
  },
  tk: () => {
    const rows = T.filter(x => x.on_air).map(x => `<div class="row"><div><b>${esc(x.title)}</b><br><small>${esc(x.pay)}</small></div><b style="color:var(--brand)">${esc(x.pay)}</b></div>`).join('')
    return `<div class="card"><h3>Available tasks</h3>${rows || '<p>No tasks right now.</p>'}</div>`
  },
  sb: () => {
    const r = left(), un = L.filter(l => isUn(l.id)), opts = un.map(l => `<option value="${l.id}">${esc(l.title)}</option>`).join('')
    return `<div class="card"><h3>Submit your WhatsApp Status views</h3>${active() && un.length
      ? `<div class="form"><select id="sl">${opts}</select><input id="vw" type="number" min="1" placeholder="Total views" style="width:140px"><input id="fl" type="file" accept="image/*"><button class="btn" id="go">Submit</button></div><p class="sub" id="pv"></p>`
      : (active() ? '<p>Unlock and download an ad image first.</p>' : '<p>Your package is not active.</p>')}</div>`
  },
  hs: () => {
    const rows = subs.slice().reverse().map(s => `<div class="row"><div style="display:flex;gap:10px;align-items:center">${s.screenshot ? `<img class="thumb" src="${s.screenshot}">` : ''}<div><b>${esc(s.ad)}</b><br><small>${fd(s.created_at)} · ${s.views} views</small></div></div><div><b>${kes(s.amount)}</b> <span class="pill ${s.status==='approved'?'ok':'wa'}">${s.status}</span></div></div>`).join('')
    
    const localPays = pays.slice().reverse().map(p => {
      let statusPill = p.kind === 'Withdrawal' ? `<span class="pill ${p.withdraw_status==='completed'?'ok':p.withdraw_status==='rejected'?'no':'wa'}">${p.withdraw_status}</span>` : `<span class="pill">paid</span>`
      return `<div class="row"><span>${fd(p.created_at)} · ${esc(p.kind)}</span><div><b>${kes(p.amount)}</b> ${statusPill}</div></div>`
    }).join('')

    let wdBox = `<div class="card" style="background:var(--bg); border:2px solid var(--gold);">
      <h3>Withdraw Funds</h3>
      <p class="sub">Available Balance: <b>${kes(ME.earned || 0)}</b></p>
      <div class="form">
        <input id="wamt" type="number" placeholder="Amount (Min 100)" style="flex:1; min-width:120px;">
        <input id="wphone" type="tel" placeholder="M-Pesa Number (07XX...)" style="flex:1; min-width:150px;">
        <button class="btn gold" id="wd-btn">Request Withdrawal</button>
      </div>
    </div>`

    if (ME.earned < 100) {
       wdBox = `<div class="card" style="background:var(--bg);"><p class="sub" style="margin:0; text-align:center;">You need at least <b>KES 100</b> in available balance to withdraw.</p></div>`
    }

    return `${wdBox}
    <div class="card"><h3>Earnings History</h3>${rows || '<p class="sub">Nothing yet.</p>'}</div>
    <div class="card"><h3>Transactions</h3>${localPays || '<p class="sub">No transactions yet.</p>'}</div>`
  },
  pl: () => {
    const n = used(), cur = ME.plan && !cyc() ? PLANS[ME.plan].p : 0;
    return `<div class="card"><h3>Packages</h3><div class="plans">${Object.keys(PLANS).map(k => {
      const p = PLANS[k], on = ME.plan === k && !cyc(), can = cyc() || n < p.d, amt = p.p - cur;
      let btn = '';
      if (on) btn = active() ? '<span class="pill ok">Current package</span>' : '<span class="pill wa">Ended</span>';
      else if (!can) btn = '<span class="pill">Available next cycle</span>';
      else if (amt <= 0) btn = '';
      else btn = `<button class="btn gold" data-up="${k}">${cur?'Upgrade':'Buy'} for ${p.p === 0 ? 'Free' : kes(amt)}</button>`;
      return `<div class="plan${on?' on':''}"><b>${p.n}</b><p style="margin:6px 0">${p.p === 0 ? 'Free' : kes(p.p)}<br>${p.d} working days<br>${p.cap === Infinity ? 'No limit' : 'Up to ' + kes(p.cap) + '/day'}</p>${btn}</div>`
    }).join('')}</div></div>`
  },
  rf: () => {
    const c = ME.id.slice(0, 8), link = location.origin + '/?ref=' + c;
    return `<div class="card"><h3>Refer and earn</h3><div class="form"><input id="rl" readonly value="${link}" style="flex:1;min-width:220px"><button class="btn" data-copy="1">Copy Link</button></div></div>`
  },
  ow: () => {
    const rows = L.map(l => `<div class="row"><span>${esc(l.title)}</span><button class="btn ghost" data-tg="${l.id}">${l.on_air?'Off':'On'}</button></div>`).join('')
    return `<div class="card"><h3>Listings</h3>${rows}</div>`
  }
}

async function loadAll() {
  const [l, t, u, s, p] = await Promise.all([
    supabase.from('listings').select('*').order('created_at'),
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('unlocks').select('listing_id').eq('day', day()),
    supabase.from('submissions').select('*').order('created_at'),
    supabase.from('payments').select('*').order('created_at')
  ])
  L = l.data || []; T = t.data || []; unlocksToday = (u.data || []).map(x => x.listing_id);
  subs = s.data || []; pays = p.data || [];
}

async function reload() { 
  const { data: prof } = await supabase.from('profiles').select('*').eq('id', ME.id).single()
  if(prof) { 
    ME.plan = prof.plan; ME.package_start = prof.package_start; ME.referral_bonus = prof.referral_bonus; ME.earned = prof.earned; 
  }
  await loadAll(); render() 
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return
  const d = b.dataset

  if (d.t) { tab = d.t; shotDataUrl = null; render() }
  if (d.copy) { navigator.clipboard.writeText($('rl').value); toast('Copied.') }

  if (b.id === 'wd-btn') {
    const amt = Number($('wamt').value)
    const phone = $('wphone').value.trim()
    if (!amt || amt < 100) return toast('Minimum withdrawal is KES 100.')
    if (amt > ME.earned) return toast('Amount exceeds available balance.')
    if (!phone || phone.length < 9) return toast('Enter a valid M-Pesa number.')

    if (!confirm(`Request withdrawal of ${kes(amt)} to ${phone}?`)) return
    b.textContent = 'Processing...'

    const { error: pErr } = await supabase.from('payments').insert({ 
      user_id: ME.id, kind: 'Withdrawal', amount: amt, withdraw_status: 'pending', phone: phone, mpesa_ref: 'PENDING', status: 'success'
    })
    if (pErr) { b.textContent = 'Request Withdrawal'; return toast('Error: ' + pErr.message) }

    await supabase.from('profiles').update({ earned: ME.earned - amt }).eq('id', ME.id)
    await reload(); toast('Withdrawal requested successfully.')
  }

  if (d.un) {
    const l = L.find(x => x.id === d.un)
    if (!active()) return toast('Buy a package first.')
    if (!confirm(`Pay ${kes(FEE)} to unlock?`)) return
    await supabase.from('payments').insert({ user_id: ME.id, kind: 'Image unlock', amount: FEE, status: 'success' })
    await supabase.from('unlocks').insert({ user_id: ME.id, listing_id: l.id, day: day() })
    await reload(); toast('Unlocked.')
  }

  if (d.dl) {
    const l = L.find(x => x.id === d.dl)
    if (!l.image_url) return toast('Image not found.')
    const a = document.createElement('a'); a.href = l.image_url; a.download = 'ad.jpg'; a.target = '_blank'; a.click()
  }

  // PAYSTACK INTEGRATION
  if (d.up) {
    const k = d.up, cur = ME.plan && !cyc() ? PLANS[ME.plan].p : 0, amt = PLANS[k].p - cur;
    
    if (amt === 0) {
      if (!confirm(`Activate ${PLANS[k].n} for free?`)) return
      await supabase.from('payments').insert({ user_id: ME.id, kind: 'Package: ' + PLANS[k].n, amount: 0, status: 'success' })
      const updates = { plan: k }; if (cyc()) updates.package_start = new Date().toISOString();
      await supabase.from('profiles').update(updates).eq('id', ME.id)
      await reload(); toast('Activated!')
      return
    }

    if (!confirm(`Pay ${kes(amt)} to buy ${PLANS[k].n}?`)) return

        const handler = PaystackPop.setup({
      key: 'YOUR_PUBLIC_KEY', // Your pk_test key
      email: ME.email || 'customer@earnhub.com',
      amount: amt * 100, 
      currency: 'KES',
      metadata: {
        custom_fields: [
          { display_name: "User ID", variable_name: "user_id", value: ME.id },
          { display_name: "Package", variable_name: "package_name", value: PLANS[k].n }
        ]
      },
      // FIXED: Changed 'callback' to 'onSuccess'
      onSuccess: async function(response) {
        toast('Payment successful! Activating...')
        await supabase.from('payments').insert({ 
          user_id: ME.id, kind: 'Package: ' + PLANS[k].n, amount: amt, mpesa_ref: response.reference, status: 'success' 
        })
        const updates = { plan: k }; 
        if (cyc()) updates.package_start = new Date().toISOString();
        await supabase.from('profiles').update(updates).eq('id', ME.id)
        await reload(); 
      },
      // FIXED: Changed 'onClose' to 'onCancel'
      onCancel: function() { 
        toast('Payment window closed.') 
      }
    });
    
    handler.openIframe();
  }

  if (b.id === 'go') {
    const v = Math.floor(+$('vw').value), r = left(), l = L.find(x => x.id === $('sl').value)
    if (!(v > 0)) return toast('Enter views.'); if (!shotDataUrl) return toast('Upload screenshot.')
    if (r < PR) return toast('Daily limit reached.')
    const ok = Math.min(v, r === Infinity ? v : Math.floor(r / PR));
    const up = await supabase.storage.from(BUCKET).upload(`${ME.id}/${Date.now()}.jpg`, dataUrlToBlob(shotDataUrl), { contentType: 'image/jpeg' })
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(up.data.path, 60 * 60 * 24 * 7)
    await supabase.from('submissions').insert({ user_id: ME.id, listing_id: l.id, ad: l.title, views: ok, amount: ok * PR, screenshot: signed.signedUrl, status: 'pending' })
    shotDataUrl = null; await reload(); toast('Submitted.')
  }
})

document.addEventListener('change', e => {
  if (e.target.id !== 'fl' || !e.target.files[0]) return
  const im = new Image(), u = URL.createObjectURL(e.target.files[0])
  im.onload = () => {
    const c = document.createElement('canvas'), s = 160 / Math.max(im.width, im.height)
    c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
    shotDataUrl = c.toDataURL('image/jpeg', 0.6); URL.revokeObjectURL(u)
    $('pv').innerHTML = `<img class="thumb" src="${shotDataUrl}"> Ready.`
  }
  im.src = u
})

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(','), mime = meta.match(/:(.*?);/)[1], bin = atob(b64), arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: mime })
}

;(async () => {
  try {
    const { profile, user } = await requireAuth() // Ensure auth.js returns user
    ME.id = profile.id; 
    ME.email = user.email; // Save email for Paystack
    ME.plan = profile.plan; ME.is_admin = profile.is_admin; ME.package_start = profile.package_start; ME.referral_bonus = profile.referral_bonus; ME.earned = profile.earned;
    $('live').hidden = false
    await loadAll(); render()
  } catch (err) { console.error(err); $('live').textContent = 'Error' }
})()