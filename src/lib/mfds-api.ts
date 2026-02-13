// MFDS API proxy client - calls edge function to avoid CORS

export interface MFDSItem {
  ITEM_NAME: string;
  PRDUCT_PRMISN_NO: string;
  PRMSN_DT: string;           // normalized by edge function from ITEM_PERMIT_DATE
  ITEM_PERMIT_DATE?: string;   // raw field from API
  ITEM_INGR_NAME: string;
  ITEM_ENG_NAME?: string;
  ITEM_SEQ: string;
  [key: string]: string | undefined;
}

export async function queryMFDS(
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
  itemName: string,
  pageNo = 1,
  numOfRows = 100
): Promise<{ items: MFDSItem[]; totalCount: number }> {
  const url = `${supabaseUrl}/functions/v1/mfds-proxy`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({ serviceKey, itemName, pageNo, numOfRows }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}
