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

function normalizeFieldNames(item: any): any {
  return {
    ...item,
    PRMSN_DT: item.PRMSN_DT || item.ITEM_PERMIT_DATE || '',
  };
}

async function fetchMFDS(params: Record<string, string>): Promise<any> {
  const url = `${MFDS_BASE}?${new URLSearchParams(params).toString()}`;
  console.log(`Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MFDS API error [${response.status}]: ${text}`);
  }
  return response.json();
}

function isKorean(s: string): boolean {
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(s);
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

    const baseParams: Record<string, string> = {
      serviceKey,
      pageNo: String(pageNo),
      numOfRows: String(numOfRows),
      type: 'json',
    };

    const isKoreanInput = isKorean(itemName);

    // IMPORTANT: The MFDS API's item_eng_name parameter does NOT work for filtering.
    // It gets ignored and returns ALL 44k+ results unfiltered.
    // So we ALWAYS use item_name for search.
    // - Korean input: item_name search works directly.
    // - English input: item_name search will return 0 results (expected).
    //   The client should mark these as NO_RESULT_ENG.
    baseParams['item_name'] = itemName;

    console.log(`Searching by item_name: "${itemName}" (${isKoreanInput ? 'KR' : 'EN'})`);

    const data = await fetchMFDS(baseParams);
    const normalized = normalizeItems(data);
    const items = normalized.items.map(normalizeFieldNames);

    console.log(`Search => ${normalized.totalCount} results, returned ${items.length} items`);

    return new Response(
      JSON.stringify({
        items,
        totalCount: normalized.totalCount,
        searchedAsKorean: isKoreanInput,
      }),
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
