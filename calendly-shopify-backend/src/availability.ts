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

/**
 * Get available appointment times for one specific date.
 *
 * This is the existing function used when a customer
 * selects a date in the calendar.
 */
export async function availability(
  type: AppointmentType,
  date: string,
) {
  // Find the actual Calendly event type
  const eventType = await getEventType(type);

  // Create the start/end of the requested day.
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

/**
 * Get all available dates within a date range.
 *
 * This is used by the calendar to determine which
 * dates should be clickable before the customer
 * selects a specific date.
 */
export async function availabilityForDateRange(
  type: AppointmentType,
  startDate: string,
  endDate: string,
) {
  const results: string[] = [];

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  // Check each date individually using the
  // existing availability function.
  for (
    let current = new Date(start);
    current <= end;
    current.setDate(current.getDate() + 1)
  ) {
    const date = [
      current.getFullYear(),
      String(current.getMonth() + 1).padStart(2, "0"),
      String(current.getDate()).padStart(2, "0"),
    ].join("-");

    try {
      const result = await availability(
        type,
        date,
      );

      if (
        result.success &&
        result.slots.length > 0
      ) {
        results.push(date);
      }
    } catch (error) {
      console.error(
        `Could not check availability for ${date}:`,
        error,
      );
    }
  }

  return {
    success: true,
    appointmentType: type,
    timezone: TIMEZONE,
    startDate,
    endDate,
    availableDates: results,
  };
}


