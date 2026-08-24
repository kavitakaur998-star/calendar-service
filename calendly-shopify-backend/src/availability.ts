```typescript
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
  // Find the actual Calendly event type
  const eventType = await getEventType(type);

  // Start of the requested range
  const start = new Date(
    `${startDate}T00:00:00.000Z`,
  );

  // End of the requested range
  //
  // We add one day because the end timestamp is
  // treated as exclusive.
  const end = new Date(
    `${endDate}T00:00:00.000Z`,
  );

  end.setUTCDate(
    end.getUTCDate() + 1,
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
    );

  // Convert every available slot into its
  // YYYY-MM-DD date.
  const availableDates = [
    ...new Set(
      slots.map((slot) => {
        const date = new Date(
          slot.start_time!,
        );

        return date.toLocaleDateString(
          "en-CA",
          {
            timeZone: TIMEZONE,
          },
        );
      }),
    ),
  ].sort();

  return {
    success: true,
    appointmentType: type,
    label: appointmentTypes[type].label,
    startDate,
    endDate,
    timezone: TIMEZONE,
    availableDates,
  };
}
```
