
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
  const eventType = await getEventType(type);

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
 * Requests are made concurrently instead of one
 * after another. A maximum of 5 Calendly requests
 * are made at the same time.
 */
export async function availabilityForDateRange(
  type: AppointmentType,
  startDate: string,
  endDate: string,
) {
  const start = new Date(
    `${startDate}T00:00:00Z`,
  );

  const end = new Date(
    `${endDate}T00:00:00Z`,
  );

  // --------------------------------------------------
  // Build list of dates
  // --------------------------------------------------

  const dates: string[] = [];

  for (
    let current = new Date(start);
    current <= end;
    current.setUTCDate(
      current.getUTCDate() + 1,
    )
  ) {
    dates.push(
      [
        current.getUTCFullYear(),
        String(
          current.getUTCMonth() + 1,
        ).padStart(2, "0"),
        String(
          current.getUTCDate(),
        ).padStart(2, "0"),
      ].join("-"),
    );
  }

  // --------------------------------------------------
  // Get the Calendly event type ONCE
  // --------------------------------------------------

  const eventType =
    await getEventType(type);

  // --------------------------------------------------
  // Check dates concurrently
  //
  // Maximum 5 requests at once.
  // --------------------------------------------------

  const availableDates: string[] = [];

  const concurrency = 5;

  for (
    let i = 0;
    i < dates.length;
    i += concurrency
  ) {
    const batch =
      dates.slice(
        i,
        i + concurrency,
      );

    const results =
      await Promise.all(
        batch.map(
          async (date) => {
            const dayStart =
              new Date(
                `${date}T00:00:00.000Z`,
              );

            const dayEnd =
              new Date(
                dayStart.getTime() +
                  24 *
                    60 *
                    60 *
                    1000,
              );

            try {
              const data =
                await calendlyRequest<AvailableTimesResponse>(
                  "/event_type_available_times",
                  {
                    query: {
                      event_type:
                        eventType.uri,

                      start_time:
                        dayStart.toISOString(),

                      end_time:
                        dayEnd.toISOString(),
                    },
                  },
                );

              const slots =
                (
                  data.collection ??
                  []
                )
                  .filter(
                    (slot) =>
                      !slot.status ||
                      slot.status ===
                        "available",
                  )
                  .filter(
                    (slot) =>
                      Boolean(
                        slot.start_time,
                      ),
                  );

              return {
                date,
                available:
                  slots.length > 0,
              };
            } catch (error) {
              console.error(
                `Could not check availability for ${date}:`,
                error,
              );

              return {
                date,
                available: false,
              };
            }
          },
        ),
      );

    results.forEach(
      (result) => {
        if (result.available) {
          availableDates.push(
            result.date,
          );
        }
      },
    );
  }

  return {
    success: true,
    appointmentType: type,
    timezone: TIMEZONE,
    startDate,
    endDate,
    availableDates,
  };
}
