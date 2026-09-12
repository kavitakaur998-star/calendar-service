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
  timezone: string;
}) {
  const eventType =
    await getEventType(input.appointmentType);

  console.log(
    "Sending booking to Calendly:",
    {
      eventType: eventType.uri,
      eventTypeName: eventType.name,
      startTime: input.startTime,
      name: input.name,
      email: input.email,
      timezone: input.timezone,
    },
  );

  try {
    const data =
      await calendlyRequest<{
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
            timezone: input.timezone,
          },
        },
      });

    console.log(
      "Calendly booking response:",
      JSON.stringify(data, null, 2),
    );

    return {
      success: true,
      message:
        "Your appointment has been booked.",
      appointmentType:
        input.appointmentType,
      startTime:
        input.startTime,
      calendlyEventUri:
        data.resource?.event,
      inviteeUri:
        data.resource?.uri,
    };
  } catch (e) {
    console.error(
      "Calendly booking failed:",
      JSON.stringify(
        e instanceof CalendlyError
          ? {
              status: e.status,
              details: e.details,
              appointmentType:
                input.appointmentType,
              eventTypeUri:
                eventType.uri,
              eventTypeName:
                eventType.name,
              startTime:
                input.startTime,
              name:
                input.name,
              email:
                input.email,
              timezone:
                input.timezone,
            }
          : e,
        null,
        2,
      ),
    );

    throw e;
  }
}
