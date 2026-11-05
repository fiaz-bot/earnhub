// js/admin.js
import { supabase } from './supabase.js'

const PR = 20
const CAP = { starter: 500, standard: 1000, pro: 1e9 }
const $ = id => document.getElementById(id)
const kes = n => 'KES ' + Math.round(n).toLocaleString('en-KE')
const fd = t => new Date(t).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
const sameDay = t => new Date(t).toDateString() === new Date().toDateString()
const pill = s => `<span class="pill ${['success','approved','active','completed'].includes(s)?'ok':s==='pending'?'wa':'no'}">${s}</span>`

let tab = 'ov'
let q = ''
let ft = 'all'
let S = { M: [], A: [], P: [], T: [], L: [] }

function mem(id) { return S.M.find(m => m.id === id) }

async function loadAll() {
  const [m, a, p, t, l] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('submissions').select('*').order('created_at', { ascending: false }),
    supabase.from('payments').select('*').order('created_at', { ascending: false }),
    supabase.from('tasks').select('*').order('created_at', { ascending: false }),
    supabase.from('listings').select('*').order('created_at', { ascending: false })
  ])
  S.M = m.data || []; S.A = a.data || []; S.P = p.data || []; S.T = t.data || []; S.L = l.data || [];
}

function render() {
  const rev  = S.P.filter(p => p.status === 'success' && !p.kind.startsWith('Withdrawal')).reduce((a,p) => a + Number(p.amount), 0)
  const owed = S.M.reduce((a,m) => a + Number(m.earned), 0)
  const pend = S.A.filter(a => a.status === 'pending').length
  const wdPending = S.P.filter(p => p.kind === 'Withdrawal' && p.withdraw_status === 'pending').length
  
  $('now').textContent = new Date().toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short', year:'numeric' })

  $('kpis').innerHTML = [
    ['Members', S.M.length, ''],
    ['Revenue', kes(rev), 'packages'],
    ['Earnings owed', kes(owed), 'user balances'],
    ['Pending views', pend, 'reviews'],
    ['Pending Withdrawals', wdPending, 'needs action']
  ].map(k => `<div class="card kpi"><small>${k[0]}</small><b>${k[1]}</b><em>${k[2]}</em></div>`).join('')

  const tabs = [['ov','Overview'],['rv','Review views',pend],['py','Payments'],['wd','Withdrawals', wdPending],['mb','Members'],['ct','Tasks & Listings']]
  $('nav').innerHTML = tabs.map(t => `<button role="tab" data-t="${t[0]}" aria-selected="${t[0]===tab}">${t[1]}${t[2]?`<span class="n">${t[2]}</span>`:''}</button>`).join('')
  $('main').innerHTML = V[tab]()
}

const V = {
  ov: () => {
    const top = S.M.slice().sort((a,b) => b.earned - a.earned).slice(0,5).map((m,i) => `<tr><td>${i+1}. ${m.name}</td><td><b>${kes(m.earned)}</b></td></tr>`).join('')
    return `<div class="card"><h3>Top Balances</h3><table><tbody>${top}</tbody></table></div>`
  },
  rv: () => {
    const f = ft === 'all' ? 'pending' : ft
    const rows = S.A.filter(a => a.status === f).map(a => `<tr><td>${fd(a.created_at)}</td><td>${mem(a.user_id)?.name || '—'}</td><td>${a.ad}</td><td>${a.views}</td><td><b>${kes(a.amount)}</b></td><td>${a.status==='pending'?`<div class="act"><button class="btn" data-ap="${a.id}">Approve</button><button class="btn bad" data-rj="${a.id}">Reject</button></div>`:pill(a.status)}</td></tr>`).join('')
    return `<div class="card"><h3>View Submissions</h3><div class="tw"><table><thead><tr><th>Date</th><th>Member</th><th>Ad</th><th>Views</th><th>Credit</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Empty.</td></tr>'}</tbody></table></div></div>`
  },
  
  // NEW WITHDRAWALS TAB
  wd: () => {
    const rows = S.P.filter(p => p.kind === 'Withdrawal').map(p => {
      const m = mem(p.user_id)
      const isPending = p.withdraw_status === 'pending'
      return `<tr>
        <td>${fd(p.created_at)}</td>
        <td><b>${m?.name || 'Unknown'}</b><br><small>${m?.phone}</small></td>
        <td><b>${kes(p.amount)}</b></td>
        <td>${pill(p.withdraw_status)}</td>
        <td>${isPending ? `<div class="act"><button class="btn" data-wda="${p.id}">Mark Paid</button><button class="btn bad" data-wdr="${p.id}">Reject</button></div>` : '—'}</td>
      </tr>`
    }).join('')
    return `<div class="card"><h3>Withdrawal Requests</h3><p class="sub">Send the money via M-Pesa, then click Mark Paid.</p><div class="tw"><table><thead><tr><th>Date</th><th>Member</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No withdrawal requests yet.</td></tr>'}</tbody></table></div></div>`
  },

  py: () => {
    const rows = S.P.filter(p => p.kind !== 'Withdrawal').map(p => `<tr><td>${fd(p.created_at)}</td><td>${mem(p.user_id)?.name || '—'}</td><td>${p.kind}</td><td><b>${kes(p.amount)}</b></td><td>${pill(p.status)}</td></tr>`).join('')
    return `<div class="card"><h3>Incoming Payments</h3><div class="tw"><table><thead><tr><th>Date</th><th>Member</th><th>For</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
  },
  mb: () => {
    const rows = S.M.filter(m => ((m.name||'')+(m.phone||'')).toLowerCase().includes(q.toLowerCase())).map(m => `<tr><td><b>${m.name}</b><br><small>${m.email}</small></td><td>${m.phone}</td><td>${pill(m.plan)}</td><td><b>${kes(m.earned)}</b></td></tr>`).join('')
    return `<div class="card"><h3>Members</h3><div class="tools"><input id="q" type="search" placeholder="Search..." value="${q}"></div><div class="tw"><table><thead><tr><th>Member</th><th>Phone</th><th>Plan</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
  },
  ct: () => {
    const t = S.T.map(x => `<tr><td>${x.title}</td><td>${x.pay}</td><td>${pill(x.on_air?'active':'off')}</td><td><button class="btn ghost" data-tg="T:${x.id}">${x.on_air?'Off':'On'}</button></td></tr>`).join('')
    const l = S.L.map(x => `<tr><td>${x.title}</td><td>${x.kind}</td><td>${pill(x.on_air?'active':'off')}</td><td><button class="btn ghost" data-tg="L:${x.id}">${x.on_air?'Off':'On'}</button></td></tr>`).join('')
    return `<div class="card"><h3>Tasks</h3><table><tbody>${t}</tbody></table></div><div class="card"><h3>Listings</h3><table><tbody>${l}</tbody></table></div>`
  }
}

async function reload() { await loadAll(); render() }

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return
  const d = b.dataset

  if (d.t) { tab = d.t; ft = d.t === 'rv' ? 'pending' : 'all'; q = ''; render() }
  
  if (d.ap) {
    const sub = S.A.find(x => x.id === +d.ap)
    // Manually credit the user because the trigger might be missing
    await supabase.from('submissions').update({ status: 'approved' }).eq('id', sub.id)
    await supabase.from('profiles').update({ earned: (mem(sub.user_id)?.earned || 0) + Number(sub.amount) }).eq('id', sub.user_id)
    await reload()
  }
  if (d.rj) { await supabase.from('submissions').update({ status: 'rejected' }).eq('id', +d.rj); await reload() }

  // WITHDRAWAL APPROVALS
  if (d.wda) {
    if (!confirm('Have you sent the money via M-Pesa? This will mark it as paid.')) return
    await supabase.from('payments').update({ withdraw_status: 'completed' }).eq('id', +d.wda)
    await reload()
  }
  
  if (d.wdr) {
    if (!confirm('Reject this request? The money will be returned to their balance.')) return
    const p = S.P.find(x => x.id === +d.wdr)
    await supabase.from('payments').update({ withdraw_status: 'rejected' }).eq('id', p.id)
    // Refund the balance since we rejected it
    await supabase.from('profiles').update({ earned: (mem(p.user_id)?.earned || 0) + Number(p.amount) }).eq('id', p.user_id)
    await reload()
  }

  if (d.tg) {
    const [tbl, id] = d.tg.split(':')
    const arr = tbl === 'T' ? S.T : S.L
    const row = arr.find(x => x.id === id)
    await supabase.from(tbl === 'T' ? 'tasks' : 'listings').update({ on_air: !row.on_air }).eq('id', id)
    await reload()
  }
})

document.addEventListener('input', e => { if (e.target.id === 'q') { q = e.target.value; render() } })

export async function init() {
  try { await loadAll(); render() } catch (err) { console.error(err) }
}