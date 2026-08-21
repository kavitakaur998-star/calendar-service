import { CALENDLY_BASE_URL, getToken } from "./config.js";
export class CalendlyError extends Error { constructor(public status:number, public details:unknown){ super(`Calendly API error ${status}`); } }
export async function calendlyRequest<T>(path:string, init:{method?:string; body?:unknown; query?:Record<string,string|undefined>}={}){
  const url=new URL(path,CALENDLY_BASE_URL); for(const [k,v] of Object.entries(init.query??{})) if(v!==undefined) url.searchParams.set(k,v);
  const r=await fetch(url,{method:init.method??"GET",headers:{Authorization:`Bearer ${getToken()}`,Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},body:init.body?JSON.stringify(init.body):undefined});
  const text=await r.text(); let data:unknown; try{data=text?JSON.parse(text):undefined}catch{data=text;}
  if(!r.ok) throw new CalendlyError(r.status,data); return data as T;
}
