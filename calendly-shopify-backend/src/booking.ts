import {
  calendlyRequest,
  CalendlyError,
  getEventType,
} from "./calendly.js";

import type { AppointmentType } from "./config.js";

export async function book(input: {
  appointmentType: AppointmentType;
  startTime: string;
  name: string;
  email: string;
}) {
  const eventType = await getEventType(input.appointmentType);

  try {
    const data = await calendlyRequest<{
      resource?: {
        uri?: string;
        event?: string;
        status?: string;
        start_time?: string;
      };
    }>("/invitees", {
      method: "POST",
      body: {
        event_type: eventType.uri,
        start_time: input.startTime,
        invitee: {
          name: input.name,
          email: input.email,
        },
      },
    });

    return {
      success: true,
      message: "Your appointment has been booked.",
      appointmentType: input.appointmentType,
      startTime: input.startTime,
      calendlyEventUri: data.resource?.event,
      inviteeUri: data.resource?.uri,
    };
  } catch (e) {
    if (
      e instanceof CalendlyError &&
      (e.status === 409 || e.status === 422)
    ) {
      console.error(
        "Calendly rejected appointment:",
        {
          status: e.status,
          details: e.details,
          appointmentType: input.appointmentType,
          eventTypeUri: eventType.uri,
          startTime: input.startTime,
        },
      );

      const x = new Error(
        "This appointment time is no longer available.",
      );

      Object.assign(x, {
        code: "SLOT_UNAVAILABLE",
      });

      throw x;
    }

    throw e;
  }
}
