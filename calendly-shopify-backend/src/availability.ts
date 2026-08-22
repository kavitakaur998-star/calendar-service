import {
  calendlyRequest,
  getEventType,
} from "./calendly.js";

import {
  appointmentTypes,
  TIMEZONE,
  type AppointmentType,
} from "./config.js";

type AvailableTime = {
  status?: string;
  start_time?: string;
  invitees_remaining?: number;
};

type AvailableTimesResponse = {
  collection?: AvailableTime[];
};

export async function availability(
  type: AppointmentType,
  date: string,
) {
  // Find the actual Calendly event type
  const eventType = await getEventType(type);

  // Create the start/end of the requested day.
  //
  // Calendly expects ISO timestamps.
  const start = new Date(
    `${date}T00:00:00.000Z`,
  );

  const end = new Date(
    start.getTime() +
      24 * 60 * 60 * 1000,
  );

  const data =
    await calendlyRequest<AvailableTimesResponse>(
      "/event_type_available_times",
      {
        query: {
          event_type: eventType.uri,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
        },
      },
    );

  const slots = (data.collection ?? [])
    .filter(
      (slot) =>
        !slot.status ||
        slot.status === "available",
    )
    .filter(
      (slot) => Boolean(slot.start_time),
    )
    .map((slot) => ({
      start: slot.start_time!,
      inviteesRemaining:
        slot.invitees_remaining,
    }));

  return {
    success: true,
    appointmentType: type,
    label: appointmentTypes[type].label,
    date,
    timezone: TIMEZONE,
    duration: eventType.duration,
    slots,
  };
}
