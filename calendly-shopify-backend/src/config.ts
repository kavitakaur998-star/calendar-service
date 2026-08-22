export const TIMEZONE = "Europe/London";

export const CALENDLY_BASE_URL = "https://api.calendly.com";

export const appointmentTypes = {
  virtual: {
    id: "virtual",
    label: "Virtual Consultation",
    publicUrl:
      "https://calendly.com/marcela-giocanti/45min",
    calendlySlug: "45min",
    calendlyName: "VIRTUAL APPOINTMENT",
    duration: 45,
  },

  atelier: {
    id: "atelier",
    label: "In-Person Consultation",
    publicUrl:
      "https://calendly.com/marcela-giocanti/60min",
    calendlySlug: "60min",
    calendlyName: "ATELIER APPOINTMENT",
    duration: 60,
  },

  fitting: {
    id: "fitting",
    label: "Bridal Fitting Appointment",
    publicUrl:
      "https://calendly.com/marcela-giocanti/bridal-fitting-appointment",
    calendlySlug: "bridal-fitting-appointment",
    calendlyName: "BRIDAL FITTING APPOINTMENT",
    duration: 45,
  },

  fitting_studio: {
    id: "fitting_studio",
    label: "Bridal Fitting Studio Appointment",
    publicUrl:
      "https://calendly.com/marcela-giocanti/bridal-fitting-studio-appointment",
    calendlySlug: "bridal-fitting-studio-appointment",
    calendlyName: "BRIDAL FITTING STUDIO APPOINTMENT",
    duration: 45,
  },
} as const;

export type AppointmentType =
  keyof typeof appointmentTypes;

export function getToken(): string {
  const token =
    process.env.CALENDLY_ACCESS_TOKEN;

  if (!token) {
    throw new Error(
      "CALENDLY_ACCESS_TOKEN is not configured",
    );
  }

  return token;
}
