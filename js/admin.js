// js/admin.js
import { supabase } from './supabase.js'

const $ = id => document.getElementById(id)
const kes = n => 'KES ' + Math.round(n).toLocaleString('en-KE')
const fd = t => new Date(t).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
const pill = s => `<span class="pill ${['success','approved','active','completed'].includes(s)?'ok':s==='pending'?'wa':'no'}">${s}</span>`

let tab = 'ov', q = '', ft = 'all'
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
  const pend = S.A.filter(a => a.status === 'pending').length
  const wdPending = S.P.filter(p => p.kind === 'Withdrawal' && p.withdraw_status === 'pending').length
  const pkgPending = S.M.filter(m => m.package_status === 'pending').length
  
  $('now').textContent = new Date().toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short', year:'numeric' })

  $('kpis').innerHTML = [
    ['Members', S.M.length, ''],
    ['Revenue', kes(rev), 'packages'],
    ['Pending Views', pend, 'reviews'],
    ['Pending Withdrawals', wdPending, 'needs action'],
    ['Package Requests', pkgPending, 'needs approval']
  ].map(k => `<div class="card kpi"><small>${k[0]}</small><b>${k[1]}</b><em>${k[2]}</em></div>`).join('')

  const tabs = [['ov','Overview'],['rv','Review views',pend],['py','Payments'],['wd','Withdrawals', wdPending],['mb','Members'],['ct','Tasks & Listings']]
  $('nav').innerHTML = tabs.map(t => `<button role="tab" data-t="${t[0]}" aria-selected="${t[0]===tab}">${t[1]}${t[2]?`<span class="n">${t[2]}</span>`:''}</button>`).join('')
  $('main').innerHTML = V[tab]()
}

const V = {
  ov: () => `<div class="card"><h3>Overview</h3><p>Welcome to the Admin Dashboard.</p></div>`,
  rv: () => {
    const f = ft === 'all' ? 'pending' : ft
    const rows = S.A.filter(a => a.status === f).map(a => {
      const m = mem(a.user_id)
      return `<tr><td data-label="Date">${fd(a.created_at)}</td><td data-label="Member">${m?.name || '—'}</td><td data-label="Ad">${a.ad}</td><td data-label="Proof">${a.screenshot ? `<a href="${a.screenshot}" target="_blank">View</a>` : '—'}</td><td data-label="Views">${a.views}</td><td data-label="Credit"><b>${kes(a.amount)}</b></td><td data-label="Action">${a.status === 'pending' ? `<div class="act"><button class="btn" data-ap="${a.id}">Approve</button><button class="btn bad" data-rj="${a.id}">Reject</button></div>` : pill(a.status)}</td></tr>`
    }).join('')
    return `<div class="card"><div class="row"><h3>View Submissions</h3><select id="ft"><option value="pending" ${f==='pending'?'selected':''}>Pending</option><option value="approved" ${f==='approved'?'selected':''}>Approved</option></select></div><table><tbody>${rows || '<tr><td>Nothing here.</td></tr>'}</tbody></table></div>`
  },
  wd: () => {
    const rows = S.P.filter(p => p.kind === 'Withdrawal').map(p => `<tr><td data-label="Date">${fd(p.created_at)}</td><td data-label="Member">${mem(p.user_id)?.name || '—'}<br><small>${mem(p.user_id)?.phone}</small></td><td data-label="Amount"><b>${kes(p.amount)}</b></td><td data-label="Status">${pill(p.withdraw_status)}</td><td data-label="Action">${p.withdraw_status === 'pending' ? `<div class="act"><button class="btn" data-wda="${p.id}">Mark Paid</button></div>` : '—'}</td></tr>`).join('')
    return `<div class="card"><h3>Withdrawals</h3><table><tbody>${rows || '<tr><td>No requests.</td></tr>'}</tbody></table></div>`
  },
  py: () => `<div class="card"><h3>Payments</h3><p>Payment history will appear here.</p></div>`,
  mb: () => {
    const rows = S.M.filter(m => ((m.name||'')+(m.phone||'')).toLowerCase().includes(q.toLowerCase())).map(m => `<tr>
      <td data-label="Member"><b>${m.name}</b><br><small>${m.email}</small></td>
      <td data-label="Phone">${m.phone}</td>
      <td data-label="Package">${pill(m.plan)}</td>
      <td data-label="Status">${pill(m.package_status || 'none')}</td>
      <td data-label="Balance"><b>${kes(m.earned)}</b></td>
      <td data-label="Action">
        ${m.package_status === 'pending' ? `<button class="btn gold" data-approve="${m.id}">Approve Pkg</button>` : ''}
        <button class="btn ghost" data-sus="${m.id}">${m.status === 'suspended' ? 'Activate' : 'Suspend'}</button>
      </td>
    </tr>`).join('')
    return `<div class="card"><h3>Members</h3><div class="tools"><input id="q" type="search" placeholder="Search..." value="${q}"></div><table><tbody>${rows || '<tr><td>No members.</td></tr>'}</tbody></table></div>`
  },
  ct: () => `<div class="card"><h3>Tasks & Listings</h3><p>Manage your app content here.</p></div>`
}

async function reload() { await loadAll(); render() }

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return
  const d = b.dataset

  if (d.t) { tab = d.t; ft = 'pending'; q = ''; render() }
  
  if (d.ap) {
    const sub = S.A.find(x => x.id === +d.ap)
    await supabase.from('submissions').update({ status: 'approved' }).eq('id', sub.id)
    await supabase.from('profiles').update({ earned: (mem(sub.user_id)?.earned || 0) + Number(sub.amount) }).eq('id', sub.user_id)
    await reload()
  }
  if (d.rj) { await supabase.from('submissions').update({ status: 'rejected' }).eq('id', +d.rj); await reload() }

  if (d.wda) {
    if (!confirm('Mark as paid?')) return
    await supabase.from('payments').update({ withdraw_status: 'completed' }).eq('id', +d.wda)
    await reload()
  }

  if (d.approve) {
    if (!confirm('Activate this package for the user?')) return;
    const m = S.M.find(x => x.id === d.approve);
    
    // Update the pending payment to completed
    const pendPmt = S.P.find(p => p.user_id === m.id && p.withdraw_status === 'pending');
    if (pendPmt) await supabase.from('payments').update({ withdraw_status: 'completed' }).eq('id', pendPmt.id);
    
    // Activate user
    await supabase.from('profiles').update({ 
      package_status: 'active', 
      package_start: new Date().toISOString() 
    }).eq('id', m.id);
    await reload();
  }

  if (d.sus) {
    const m = S.M.find(x => x.id === d.sus);
    const newStatus = m.status === 'suspended' ? 'active' : 'suspended';
    if (!confirm(`Are you sure you want to ${newStatus} ${m.name}?`)) return;
    await supabase.from('profiles').update({ status: newStatus }).eq('id', m.id);
    await reload();
  }
})

document.addEventListener('input', e => { if (e.target.id === 'q') { q = e.target.value; render() } })

export async function init() {
  try { await loadAll(); render() } catch (err) { console.error(err) }
}