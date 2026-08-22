import express from "express";
import {
  calendlyRequest,
  getEventTypes,
} from "./calendly.js";

import {
  appointmentTypes,
  TIMEZONE,
} from "./config.js";

import { availability } from "./availability.js";
import { book } from "./booking.js";

import {
  isAppointmentType,
  isDate,
  isEmail,
  isIsoDateTime,
  requiredText,
} from "./validation.js";

const app = express();

app.use(express.json({ limit: "32kb" }));

const err = (
  res: any,
  status: number,
  error: string,
  message: string,
) =>
  res.status(status).json({
    success: false,
    error,
    message,
  });

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

app.get("/api/calendly-test", async (_req, res) => {
  try {
    const user = await calendlyRequest<any>("/users/me");

    res.json({
      success: true,
      message: "Calendly connection successful",
      user: {
        name: user.resource?.name,
        email: user.resource?.email,
      },
    });
  } catch (e) {
    console.error("Calendly connection failed:", e);

    err(
      res,
      500,
      "CALENDLY_CONNECTION_FAILED",
      "Could not connect to Calendly.",
    );
  }
});

app.get("/api/appointment-types", (_req, res) => {
  res.json({
    appointmentTypes: Object.values(appointmentTypes).map(
      ({
        id,
        label,
        publicUrl,
        duration,
      }) => ({
        id,
        label,
        publicUrl,
        duration,
      }),
    ),
  });
});

/**
 * Retrieve all active Calendly event types
 * and show which ones we recognise.
 */
app.get(
  "/api/calendly-event-types",
  async (_req, res) => {
    try {
      const calendlyEvents =
        await getEventTypes();

      const results = Object.values(
        appointmentTypes,
      ).map((appointment) => {
        const match =
          calendlyEvents.find(
            (event) =>
              event.slug ===
              appointment.calendlySlug ||
              event.name
                .trim()
                .toUpperCase() ===
                appointment.calendlyName
                  .trim()
                  .toUpperCase(),
          );

        if (!match) {
          return {
            id: appointment.id,
            label: appointment.label,
            publicUrl:
              appointment.publicUrl,
            configured: false,
          };
        }

        return {
          id: appointment.id,
          label: appointment.label,
          publicUrl:
            appointment.publicUrl,
          configured: true,
          uri: match.uri,
          calendlyName: match.name,
          slug: match.slug,
          duration: match.duration,
          active: match.active,
          schedulingUrl:
            match.scheduling_url,
        };
      });

      res.json({
        eventTypes: results,
      });
    } catch (e) {
      console.error(
        "Could not retrieve Calendly event types:",
        e,
      );

      err(
        res,
        500,
        "CALENDLY_EVENT_TYPES_FAILED",
        "Could not retrieve Calendly event types.",
      );
    }
  },
);

app.get(
  "/api/calendly-all-event-types",
  async (_req, res) => {
    try {
      const eventTypes =
        await getEventTypes();

      res.json({
        success: true,
        count: eventTypes.length,
        eventTypes,
      });
    } catch (e) {
      console.error(
        "Could not retrieve Calendly event types:",
        e,
      );

      err(
        res,
        500,
        "CALENDLY_EVENT_TYPES_FAILED",
        "Could not retrieve Calendly event types.",
      );
    }
  },
);

app.get("/api/availability", async (req, res) => {
  const type = req.query.appointmentType;
  const date = req.query.date;

  if (!isAppointmentType(type)) {
    return err(
      res,
      400,
      "INVALID_APPOINTMENT_TYPE",
      "appointmentType must be virtual, atelier, fitting, or fitting_studio.",
    );
  }

  if (!isDate(date)) {
    return err(
      res,
      400,
      "INVALID_DATE",
      "date must use YYYY-MM-DD.",
    );
  }

  try {
    res.json(
      await availability(type, date),
    );
  } catch (e) {
    console.error("Availability failed:", e);

    err(
      res,
      500,
      "AVAILABILITY_FAILED",
      "Could not retrieve appointment availability.",
    );
  }
});

app.post("/api/book", async (req, res) => {
  const b = req.body;

  const keys = [
    "name",
    "email",
    "appointmentType",
    "startTime",
  ];

  if (
    !b ||
    typeof b !== "object" ||
    Object.keys(b).length !== 4 ||
    Object.keys(b).some(
      (x: string) => !keys.includes(x),
    ) ||
    !requiredText(b.name) ||
    !isEmail(b.email) ||
    !isAppointmentType(b.appointmentType) ||
    !isIsoDateTime(b.startTime)
  ) {
    return err(
      res,
      400,
      "INVALID_BOOKING",
      "Booking requires only name, email, appointmentType, and startTime.",
    );
  }

  try {
    res.status(201).json(
      await book({
        name: b.name.trim(),
        email: b.email.trim(),
        appointmentType: b.appointmentType,
        startTime: b.startTime,
      }),
    );
  } catch (e) {
    console.error("Booking failed:", e);

    if (
      e instanceof Error &&
      (e as any).code === "SLOT_UNAVAILABLE"
    ) {
      return err(
        res,
        409,
        "SLOT_UNAVAILABLE",
        "This appointment time is no longer available.",
      );
    }

    err(
      res,
      500,
      "BOOKING_FAILED",
      "We could not complete the booking. Please try again.",
    );
  }
});

app.get("/", (_req, res) => {
  res.json({
    name: "Calendly Shopify Backend",
    status: "running",
    timezone: TIMEZONE,
  });
});

export default app;
