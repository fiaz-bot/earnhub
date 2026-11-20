import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ==========================================
  // HANDLE PAYSTACK VERIFICATION
  // ==========================================
  if (req.method === 'POST' && new URL(req.url).searchParams.get('action') === 'verify') {
    try {
      const { reference, expectedAmount } = await req.json()
      
      // Get your Secret Key from Supabase Secrets
      const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!

      // Ask Paystack if the payment is real
      const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
      })
      
      const data = await res.json()

      // Check if Paystack confirms it's successful and the amount matches
      if (data.status && data.data.status === 'success' && data.data.amount === (expectedAmount * 100)) {
        return new Response(JSON.stringify({ success: true, data: data.data }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }
      
      return new Response(JSON.stringify({ success: false, message: 'Payment not successful' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 
      })
      
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 
      })
    }
  }

  // ==========================================
  // OLD M-PESA LOGIC (Kept just in case)
  // ==========================================
  try {
    const body = await req.json().catch(() => ({}))
    
    // If it's a Safaricom callback
    if (req.method === 'POST' && new URL(req.url).searchParams.get('action') === 'callback') {
      return new Response('OK', { status: 200, headers: corsHeaders })
    }

    // Otherwise, return a default response
    return new Response(JSON.stringify({ message: 'Function is running. Use ?action=verify for Paystack.' }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})