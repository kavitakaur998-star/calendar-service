import { calendlyRequest, CalendlyError } from "./calendly.js";
import { appointmentTypes, type AppointmentType } from "./config.js";
export async function book(input:{appointmentType:AppointmentType;startTime:string;name:string;email:string}){
  const eventTypeUri=appointmentTypes[input.appointmentType].eventTypeUri; if(!eventTypeUri) throw new Error("Missing event type URI");
  try{
    const data=await calendlyRequest<{resource?:{uri?:string;event?:string;status?:string;start_time?:string}}>("/invitees",{method:"POST",body:{event_type:eventTypeUri,start_time:input.startTime,invitee:{name:input.name,email:input.email}}});
    return {success:true,message:"Your appointment has been booked.",appointmentType:input.appointmentType,startTime:input.startTime,calendlyEventUri:data.resource?.event,inviteeUri:data.resource?.uri};
  }catch(e){ if(e instanceof CalendlyError && (e.status===409||e.status===422)){const x=new Error("This appointment time is no longer available.");Object.assign(x,{code:"SLOT_UNAVAILABLE"});throw x;} throw e; }
}
