import { calendlyRequest } from "./calendly.js";
import { appointmentTypes, TIMEZONE, type AppointmentType } from "./config.js";
export async function availability(type:AppointmentType,date:string){
  const eventTypeUri=appointmentTypes[type].eventTypeUri; if(!eventTypeUri) throw new Error(`Missing event type URI for ${type}`);
  const start=new Date(`${date}T00:00:00.000Z`); const end=new Date(start.getTime()+24*60*60*1000);
  const data=await calendlyRequest<{collection?:Array<{status?:string;start_time?:string;invitees_remaining?:number}>("/event_type_available_times",{query:{event_type:eventTypeUri,start_time:start.toISOString(),end_time:end.toISOString()}});
  return {success:true,appointmentType:type,label:appointmentTypes[type].label,date,timezone:TIMEZONE,slots:(data.collection??[]).filter(x=>!x.status||x.status==="available").map(x=>({start:x.start_time,inviteesRemaining:x.invitees_remaining}))};
}
