// MFDS API interaction - all calls happen client-side with user-provided key

const BASE_URL = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07';

export interface MFDSApiResponse {
  header: { resultCode: string; resultMsg: string };
  body: {
    totalCount: number;
    items: MFDSItem[];
    numOfRows: number;
    pageNo: number;
  };
}

export interface MFDSItem {
  ITEM_NAME: string;
  PRDUCT_PRMISN_NO: string;
  PRMSN_DT: string;
  ITEM_INGR_NAME: string;
  ITEM_SEQ: string;
  [key: string]: string;
}

export async function queryMFDS(
  apiKey: string,
  itemName: string,
  pageNo = 1,
  numOfRows = 100
): Promise<{ items: MFDSItem[]; totalCount: number }> {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    item_name: itemName,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    type: 'json',
  });

  const url = `${BASE_URL}?${params.toString()}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`MFDS API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Handle various response structures
  const body = data?.body;
  if (!body) {
    return { items: [], totalCount: 0 };
  }

  let items: MFDSItem[] = [];
  if (body.items) {
    if (Array.isArray(body.items)) {
      items = body.items;
    } else if (body.items.item) {
      items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
    }
  }

  return { items, totalCount: body.totalCount || 0 };
}
