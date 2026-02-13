import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MFDS_BASE = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { serviceKey, itemName, pageNo = 1, numOfRows = 100 } = await req.json();

    if (!serviceKey || !itemName) {
      return new Response(
        JSON.stringify({ error: 'serviceKey and itemName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const params = new URLSearchParams({
      serviceKey: serviceKey,
      item_name: itemName,
      pageNo: String(pageNo),
      numOfRows: String(numOfRows),
      type: 'json',
    });

    const url = `${MFDS_BASE}?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      return new Response(
        JSON.stringify({ error: `MFDS API error [${response.status}]: ${text}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Normalize response structure
    const body = data?.body;
    let items: any[] = [];
    let totalCount = 0;

    if (body) {
      totalCount = body.totalCount || 0;
      if (body.items) {
        if (Array.isArray(body.items)) {
          items = body.items;
        } else if (body.items.item) {
          items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
        }
      }
    }

    return new Response(
      JSON.stringify({ items, totalCount }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('MFDS proxy error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
