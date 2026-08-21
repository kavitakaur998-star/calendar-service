export const TIMEZONE = "Europe/London";
export const CALENDLY_BASE_URL = "https://api.calendly.com";
export const appointmentTypes = {
  virtual: { id:"virtual", label:"Virtual Consultation", publicUrl:"https://calendly.com/marcela-giocanti/45min", eventTypeUri:process.env.CALENDLY_VIRTUAL_EVENT_TYPE_URI },
  atelier: { id:"atelier", label:"In-Person Consultation", publicUrl:"https://calendly.com/marcela-giocanti/60min", eventTypeUri:process.env.CALENDLY_ATELIER_EVENT_TYPE_URI },
  fitting: { id:"fitting", label:"Bridal Fitting Appointment", publicUrl:"https://calendly.com/marcela-giocanti/bridal-fitting-appointment", eventTypeUri:process.env.CALENDLY_FITTING_EVENT_TYPE_URI },
  fitting_studio: { id:"fitting_studio", label:"Bridal Fitting Studio Appointment", publicUrl:"https://calendly.com/marcela-giocanti/bridal-fitting-studio-appointment", eventTypeUri:process.env.CALENDLY_FITTING_STUDIO_EVENT_TYPE_URI }
} as const;
export type AppointmentType = keyof typeof appointmentTypes;
export function getToken(){ if(!process.env.CALENDLY_ACCESS_TOKEN) throw new Error("CALENDLY_ACCESS_TOKEN is not configured"); return process.env.CALENDLY_ACCESS_TOKEN; }
