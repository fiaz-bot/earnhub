import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1. CORS Headers (Required for the browser to talk to the function)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 2. Load Secrets from Supabase (These are injected automatically by Supabase)
const CONSUMER_KEY = Deno.env.get('MPESA_CONSUMER_KEY')!
const CONSUMER_SECRET = Deno.env.get('MPESA_CONSUMER_SECRET')!
const PASSKEY = Deno.env.get('MPESA_PASSKEY')!
const SHORTCODE = Deno.env.get('MPESA_SHORTCODE')!

// 3. Load Supabase credentials (Provided automatically by Supabase)
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ==========================================
  // PART 1: HANDLE SAFARICOM CALLBACK
  // ==========================================
  if (req.method === 'POST' && new URL(req.url).searchParams.get('action') === 'callback') {
    try {
      const body = await req.json()
      const stkCallback = body.Body.stkCallback
      
      if (stkCallback.ResultCode === 0) {
        const meta = stkCallback.CallbackMetadata.Item
        const amount = meta.find((i: any) => i.Name === 'Amount').Value
        const receipt = meta.find((i: any) => i.Name === 'MpesaReceiptNumber').Value
        
        // Extract user and package from the AccountReference we sent
        const ref = stkCallback.AccountReference.split('|')
        const userId = ref[0]
        const packageName = ref[1]

        // 1. Save the payment record
        await supabase.from('payments').insert({
          user_id: userId,
          kind: `Package: ${packageName}`,
          amount: amount,
          mpesa_ref: receipt,
          status: 'success'
        })

        // 2. Upgrade the user's plan
        await supabase.from('profiles').update({ 
          plan: packageName.toLowerCase(),
          package_start: new Date().toISOString()
        }).eq('id', userId)
      }
      return new Response('OK', { status: 200, headers: corsHeaders })
    } catch (err) {
      console.error('Callback error:', err.message)
      return new Response('Callback failed', { status: 500, headers: corsHeaders })
    }
  }

  // ==========================================
  // PART 2: INITIATE STK PUSH
  // ==========================================
  try {
    const { phone, amount, userId, planName } = await req.json()
    
    // 1. Get OAuth Token from Safaricom
    const auth = btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`)
    const tokenRes = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: { Authorization: `Basic ${auth}` }
    })
    
    if (!tokenRes.ok) throw new Error('Failed to authenticate with Safaricom')
    const { access_token } = await tokenRes.json()

    // 2. Prepare STK Push Payload
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
    const password = btoa(`${SHORTCODE}${PASSKEY}${timestamp}`)
    const callbackUrl = `${SUPABASE_URL}/functions/v1/mpesa-stk?action=callback`

    // 3. Send request to Safaricom
    const stkRes = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: phone,
        PartyB: SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: `${userId}|${planName}`, // Trick to pass data to callback
        TransactionDesc: 'EarnHub Package'
      })
    })
    
    const data = await stkRes.json()

    // 4. Return the response to the frontend
    return new Response(JSON.stringify(data), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (err) {
    console.error('STK Push error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})