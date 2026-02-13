import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MFDS_BASE = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07';

function normalizeItems(data: any): { items: any[]; totalCount: number } {
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
  return { items, totalCount };
}

async function fetchMFDS(params: Record<string, string>): Promise<any> {
  const url = `${MFDS_BASE}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MFDS API error [${response.status}]: ${text}`);
  }
  return response.json();
}

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

    const baseParams = {
      serviceKey,
      pageNo: String(pageNo),
      numOfRows: String(numOfRows),
      type: 'json',
    };

    // Detect if input is Korean (contains Hangul characters)
    const isKorean = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(itemName);

    let result: { items: any[]; totalCount: number };

    if (isKorean) {
      // Korean input: search by item_name (Korean product name)
      const data = await fetchMFDS({ ...baseParams, item_name: itemName });
      result = normalizeItems(data);
    } else {
      // English input: try item_eng_name first (undocumented), fallback to item_name
      // Strategy 1: Try item_eng_name parameter
      const data1 = await fetchMFDS({ ...baseParams, item_eng_name: itemName });
      result = normalizeItems(data1);

      if (result.totalCount === 0) {
        // Strategy 2: Try item_name with English (sometimes works for partial matches)
        const data2 = await fetchMFDS({ ...baseParams, item_name: itemName });
        result = normalizeItems(data2);
      }

      if (result.totalCount === 0) {
        // Strategy 3: Try searching by entp_eng_name (English company name won't help)
        // Strategy 3 actually: Search without suffix words
        // Extract the first word/brand name and try
        const firstWord = itemName.split(/[\s.]+/)[0];
        if (firstWord && firstWord !== itemName) {
          const data3 = await fetchMFDS({ ...baseParams, item_eng_name: firstWord });
          result = normalizeItems(data3);
        }
      }
    }

    console.log(`Query: "${itemName}" (${isKorean ? 'KR' : 'EN'}) => ${result.totalCount} results`);

    return new Response(
      JSON.stringify(result),
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
