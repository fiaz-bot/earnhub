// js/auth.js
import { supabase } from './supabase.js'

export async function signUp({ name, phone, email, password, referrer_code }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, phone, referrer_code } }
  })
  if (error) throw error
  return data
}
export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
  location.href = 'index.html'
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (error) throw error
  return data
}

export async function requireAuth({ adminOnly = false } = {}) {
  const session = await getSession()
  if (!session) { location.href = 'index.html'; throw new Error('not signed in') }

  const profile = await getProfile()
  if (!profile) { location.href = 'index.html'; throw new Error('no profile') }

  if (adminOnly && !profile.is_admin) {
    alert('Admin access only.')
    location.href = 'index.html'
    throw new Error('not admin')
  }

  // Update last seen timestamp
  supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', profile.id)

  return { user: session.user, profile }
}