import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { names } = await req.json();

    if (!names || !Array.isArray(names) || names.length === 0) {
      return new Response(
        JSON.stringify({ error: 'names array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Batch translate up to 50 names at once
    const batch = names.slice(0, 50);
    const prompt = `You are a pharmaceutical drug name translator. Given English drug brand/product names, return their Korean (한국어) equivalents as used in MFDS (식약처) database.

Rules:
- Return ONLY the Korean brand name (e.g., 엔브렐, 휴미라, 프라닥사)
- Do NOT include dosage form (정, 캡슐, 주, 주사 etc.) or strength
- Do NOT add spaces in the Korean name
- If you don't know the Korean name, return the original English name unchanged
- Return a JSON array of objects with "eng" and "kor" fields

Input names:
${batch.map((n: string, i: number) => `${i + 1}. ${n}`).join('\n')}

Return ONLY valid JSON array, no markdown, no explanation.
Example: [{"eng":"ENBREL","kor":"엔브렐"},{"eng":"HUMIRA","kor":"휴미라"},{"eng":"PRADAXA","kor":"프라닥사"}]`;

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI Gateway error [${aiResponse.status}]: ${errText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '[]';
    
    // Parse JSON from AI response (strip markdown if present)
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let translations: { eng: string; kor: string }[];
    try {
      translations = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse AI response:', content);
      translations = batch.map((n: string) => ({ eng: n, kor: n }));
    }

    console.log(`Translated ${translations.length} drug names`);

    return new Response(
      JSON.stringify({ translations }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Translation error:', error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: 'Translation service temporarily unavailable', code: 'TRANSLATION_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
