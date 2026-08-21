import type { AppointmentType } from "./config.js";
export const isAppointmentType=(v:unknown):v is AppointmentType=>typeof v==="string" && ["virtual","atelier","fitting","fitting_studio"].includes(v);
export const isDate=(v:unknown):v is string=>typeof v==="string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+"T00:00:00Z"));
export const isEmail=(v:unknown):v is string=>typeof v==="string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const isIsoDateTime=(v:unknown):v is string=>typeof v==="string" && !Number.isNaN(Date.parse(v)) && v.includes("T");
export const requiredText=(v:unknown):v is string=>typeof v==="string" && v.trim().length>0;
