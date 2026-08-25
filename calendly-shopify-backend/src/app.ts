import express from "express";
import crypto from "crypto";

import {
  calendlyRequest,
  getEventTypes,
} from "./calendly.js";

import {
  appointmentTypes,
  TIMEZONE,
} from "./config.js";

import {
  availability,
  availabilityForDateRange,
} from "./availability.js";

import { book } from "./booking.js";

import {
  isAppointmentType,
  isDate,
  isEmail,
  isIsoDateTime,
  requiredText,
} from "./validation.js";


const app = express();


// ==================================================
// CORS
// ==================================================

app.use((req, res, next) => {
  const allowedOrigins = [
    "https://www.marcelagiocanti.com",
    "https://marcelagiocanti.com",
  ];

  const origin = req.headers.origin;

  if (
    origin &&
    allowedOrigins.includes(origin)
  ) {
    res.header(
      "Access-Control-Allow-Origin",
      origin,
    );
  }

  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS",
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type,X-Shopify-Hmac-Sha256",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


// ==================================================
// SHOPIFY WEBHOOK
//
// IMPORTANT:
// This MUST come before express.json()
// because Shopify's HMAC signature is calculated
// from the raw request body.
// ==================================================

app.post(
  "/api/webhooks/orders-paid",
  express.raw({
    type: "application/json",
    limit: "256kb",
  }),
  async (req, res) => {
    try {

      // --------------------------------------------------
      // Verify Shopify webhook
      // --------------------------------------------------

      const hmacHeader =
        req.headers[
          "x-shopify-hmac-sha256"
        ];

      if (
        typeof hmacHeader !== "string"
      ) {
        console.error(
          "Shopify webhook missing HMAC.",
        );

        return res.sendStatus(401);
      }

      const secret =
        process.env.SHOPIFY_WEBHOOK_SECRET;

      if (!secret) {
        console.error(
          "SHOPIFY_WEBHOOK_SECRET is not configured.",
        );

        return res.sendStatus(500);
      }

      const digest =
        crypto
          .createHmac(
            "sha256",
            secret,
          )
          .update(req.body)
          .digest("base64");

      const received =
        Buffer.from(
          hmacHeader,
          "utf8",
        );

      const calculated =
        Buffer.from(
          digest,
          "utf8",
        );

      if (
        received.length !==
        calculated.length ||
        !crypto.timingSafeEqual(
          received,
          calculated,
        )
      ) {
        console.error(
          "Shopify webhook HMAC verification failed.",
        );

        return res.sendStatus(401);
      }

      // --------------------------------------------------
      // Parse Shopify order
      // --------------------------------------------------

      const order =
        JSON.parse(
          req.body.toString("utf8"),
        );

      console.log(
        "Received Shopify paid order:",
        order.id,
      );

      // --------------------------------------------------
      // Find the appointment line item
      //
      // We only care about the appointment-related
      // properties. Everything else in the Shopify
      // order is ignored.
      // --------------------------------------------------

      const lineItems =
        order.line_items || [];

      const appointmentItem =
        lineItems.find(
          (item: any) => {
            const properties =
              item.properties || [];

            const hasDate =
              properties.some(
                (property: any) =>
                  property.name ===
                    "Appointment Date" &&
                  property.value,
              );

            const hasTime =
              properties.some(
                (property: any) =>
                  property.name ===
                    "Appointment Time" &&
                  property.value,
              );

            return (
              hasDate &&
              hasTime
            );
          },
        );

      // --------------------------------------------------
      // This wasn't an appointment order
      //
      // We acknowledge the webhook so Shopify doesn't
      // keep retrying it.
      // --------------------------------------------------

      if (!appointmentItem) {
        console.log(
          "Paid order does not contain an appointment.",
        );

        return res.status(200).json({
          success: true,
          message:
            "Order does not contain an appointment.",
        });
      }

      // --------------------------------------------------
      // Extract ONLY the appointment properties
      // --------------------------------------------------

      const properties =
        appointmentItem.properties || [];

      const getProperty =
        (name: string) => {
          const property =
            properties.find(
              (item: any) =>
                item.name === name,
            );

          return property?.value
            ? String(
                property.value,
              ).trim()
            : "";
        };

      const appointmentDate =
        getProperty(
          "Appointment Date",
        );

      const appointmentTime =
        getProperty(
          "Appointment Time",
        );

      // --------------------------------------------------
      // Determine appointment type
      //
      // We use the consultation type already stored
      // on the Shopify appointment.
      // --------------------------------------------------

      const consultationType =
        getProperty(
          "Consultation Type",
        );

      let appointmentType:
        | "virtual"
        | "atelier";

      const consultationLower =
        consultationType.toLowerCase();

      if (
        consultationLower.includes(
          "virtual",
        )
      ) {
        appointmentType =
          "virtual";
      } else if (
        consultationLower.includes(
          "atelier",
        ) ||
        consultationLower.includes(
          "in-person",
        ) ||
        consultationLower.includes(
          "in person",
        )
      ) {
        appointmentType =
          "atelier";
      } else {

        console.error(
          "Could not determine appointment type:",
          consultationType,
        );

        return res.status(400).json({
          success: false,
          error:
            "INVALID_APPOINTMENT_TYPE",
          message:
            "Could not determine the appointment type from the Shopify order.",
        });
      }

      // --------------------------------------------------
      // Convert date + time into the ISO datetime
      // expected by Calendly.
      //
      // Shopify gives us something like:
      //
      // Appointment Date: 2026-08-29
      // Appointment Time: 10:00 am
      //
      // We need to turn that into a proper ISO time.
      // --------------------------------------------------

      const startTime =
        convertLondonDateTimeToISO(
          appointmentDate,
          appointmentTime,
        );

      // --------------------------------------------------
      // Customer details
      //
      // We use Shopify's order/customer information.
      //
      // We DO NOT send the other form properties
      // to the backend/Calendly.
      // --------------------------------------------------

      const email =
        String(
          order.email ||
            order.contact_email ||
            order.customer?.email ||
            "",
        ).trim();

      const firstName =
        String(
          order.customer?.first_name ||
            "",
        ).trim();

      const lastName =
        String(
          order.customer?.last_name ||
            "",
        ).trim();

      const name =
        `${firstName} ${lastName}`
          .trim();

      if (
        !name ||
        !isEmail(email)
      ) {
        console.error(
          "Could not determine customer details.",
        );

        return res.status(400).json({
          success: false,
          error:
            "INVALID_CUSTOMER",
          message:
            "Could not determine the customer's name and email.",
        });
      }

      // --------------------------------------------------
      // Book the appointment in Calendly
      // --------------------------------------------------

      console.log(
        "Creating Calendly appointment:",
        {
          orderId: order.id,
          appointmentType,
          startTime,
          name,
          email,
        },
      );

      const result =
        await book({
          name,
          email,
          appointmentType,
          startTime,
        });

      console.log(
        "Calendly appointment created:",
        result,
      );

      // --------------------------------------------------
      // Tell Shopify the webhook was successfully handled
      // --------------------------------------------------

      return res.status(200).json({
        success: true,
        message:
          "Appointment booked successfully.",
        orderId: order.id,
        calendlyEventUri:
          result.calendlyEventUri,
        inviteeUri:
          result.inviteeUri,
      });

    } catch (error) {

      console.error(
        "Shopify paid-order webhook failed:",
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          "SHOPIFY_WEBHOOK_FAILED",
        message:
          "Could not process the paid order.",
      });
    }
  },
);


// ==================================================
// JSON BODY PARSER
//
// This comes AFTER the Shopify webhook because the
// webhook needs the raw body for HMAC verification.
// ==================================================

app.use(
  express.json({
    limit: "32kb",
  }),
);


// ==================================================
// ERROR HELPER
// ==================================================

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


// ==================================================
// HEALTH
// ==================================================

app.get(
  "/api/health",
  (_req, res) => {
    res.json({
      status: "ok",
    });
  },
);


// ==================================================
// CALENDLY TEST
// ==================================================

app.get(
  "/api/calendly-test",
  async (_req, res) => {
    try {

      const user =
        await calendlyRequest<any>(
          "/users/me",
        );

      res.json({
        success: true,
        message:
          "Calendly connection successful",
        user: {
          name:
            user.resource?.name,
          email:
            user.resource?.email,
        },
      });

    } catch (e) {

      console.error(
        "Calendly connection failed:",
        e,
      );

      err(
        res,
        500,
        "CALENDLY_CONNECTION_FAILED",
        "Could not connect to Calendly.",
      );
    }
  },
);


// ==================================================
// APPOINTMENT TYPES
// ==================================================

app.get(
  "/api/appointment-types",
  (_req, res) => {

    res.json({
      appointmentTypes:
        Object.values(
          appointmentTypes,
        ).map(
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
  },
);


// ==================================================
// CALENDLY EVENT TYPES
// ==================================================

app.get(
  "/api/calendly-event-types",
  async (_req, res) => {

    try {

      const calendlyEvents =
        await getEventTypes();

      const results =
        Object.values(
          appointmentTypes,
        ).map(
          (appointment) => {

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
                id:
                  appointment.id,

                label:
                  appointment.label,

                publicUrl:
                  appointment.publicUrl,

                configured:
                  false,
              };
            }

            return {
              id:
                appointment.id,

              label:
                appointment.label,

              publicUrl:
                appointment.publicUrl,

              configured:
                true,

              uri:
                match.uri,

              calendlyName:
                match.name,

              slug:
                match.slug,

              duration:
                match.duration,

              active:
                match.active,

              schedulingUrl:
                match.scheduling_url,
            };
          },
        );

      res.json({
        eventTypes:
          results,
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


// ==================================================
// ALL CALENDLY EVENT TYPES
// ==================================================

app.get(
  "/api/calendly-all-event-types",
  async (_req, res) => {

    try {

      const eventTypes =
        await getEventTypes();

      res.json({
        success: true,
        count:
          eventTypes.length,
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


// ==================================================
// AVAILABILITY
// ==================================================

app.get(
  "/api/availability",
  async (req, res) => {

    const type =
      req.query.appointmentType;

    const date =
      req.query.date;

    if (
      !isAppointmentType(type)
    ) {

      return err(
        res,
        400,
        "INVALID_APPOINTMENT_TYPE",
        "appointmentType must be virtual, atelier, fitting, or fitting_studio.",
      );
    }

    if (
      !isDate(date)
    ) {

      return err(
        res,
        400,
        "INVALID_DATE",
        "date must use YYYY-MM-DD.",
      );
    }

    try {

      res.json(
        await availability(
          type,
          date,
        ),
      );

    } catch (e) {

      console.error(
        "Availability failed:",
        e,
      );

      err(
        res,
        500,
        "AVAILABILITY_FAILED",
        "Could not retrieve appointment availability.",
      );
    }
  },
);


// ==================================================
// AVAILABILITY DATES
// ==================================================

app.get(
  "/api/availability-dates",
  async (req, res) => {

    const type =
      req.query.appointmentType;

    const startDate =
      req.query.startDate;

    const endDate =
      req.query.endDate;

    if (
      !isAppointmentType(type)
    ) {

      return err(
        res,
        400,
        "INVALID_APPOINTMENT_TYPE",
        "appointmentType must be virtual, atelier, fitting, or fitting_studio.",
      );
    }

    if (
      typeof startDate !==
        "string" ||
      typeof endDate !==
        "string" ||
      !isDate(startDate) ||
      !isDate(endDate)
    ) {

      return err(
        res,
        400,
        "INVALID_DATE_RANGE",
        "startDate and endDate must use YYYY-MM-DD.",
      );
    }

    try {

      res.json(
        await availabilityForDateRange(
          type,
          startDate,
          endDate,
        ),
      );

    } catch (e) {

      console.error(
        "Availability dates failed:",
        e,
      );

      err(
        res,
        500,
        "AVAILABILITY_DATES_FAILED",
        "Could not retrieve available appointment dates.",
      );
    }
  },
);


// ==================================================
// MANUAL BOOKING ENDPOINT
//
// Keep this for testing.
// ==================================================

app.post(
  "/api/book",
  async (req, res) => {

    const b =
      req.body;

    const keys = [
      "name",
      "email",
      "appointmentType",
      "startTime",
    ];

    if (
      !b ||
      typeof b !== "object" ||
      Object.keys(b).length !==
        4 ||
      Object.keys(b).some(
        (x: string) =>
          !keys.includes(x),
      ) ||
      !requiredText(b.name) ||
      !isEmail(b.email) ||
      !isAppointmentType(
        b.appointmentType,
      ) ||
      !isIsoDateTime(
        b.startTime,
      )
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
          name:
            b.name.trim(),

          email:
            b.email.trim(),

          appointmentType:
            b.appointmentType,

          startTime:
            b.startTime,
        }),
      );

    } catch (e) {

      console.error(
        "Booking failed:",
        e,
      );

      if (
        e instanceof Error &&
        (e as any).code ===
          "SLOT_UNAVAILABLE"
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
  },
);


// ==================================================
// ROOT
// ==================================================

app.get(
  "/",
  (_req, res) => {

    res.json({
      name:
        "Calendly Shopify Backend",

      status:
        "running",

      timezone:
        TIMEZONE,
    });
  },
);


// ==================================================
// HELPER
//
// Converts the date/time stored in Shopify into
// a London ISO datetime for Calendly.
//
// Example:
//
// 2026-08-29
// 10:00 am
//
// → 2026-08-29T10:00:00+01:00
// ==================================================

function convertLondonDateTimeToISO(
  date: string,
  time: string,
): string {

  const match =
    time
      .trim()
      .match(
        /^(\d{1,2}):(\d{2})\s*(am|pm)$/i,
      );

  if (!match) {

    throw new Error(
      `Invalid appointment time: ${time}`,
    );
  }

  let hour =
    Number(match[1]);

  const minute =
    Number(match[2]);

  const period =
    match[3].toLowerCase();

  if (
    hour < 1 ||
    hour > 12 ||
    minute < 0 ||
    minute > 59
  ) {

    throw new Error(
      `Invalid appointment time: ${time}`,
    );
  }

  if (period === "pm" && hour !== 12) {
    hour += 12;
  }

  if (period === "am" && hour === 12) {
    hour = 0;
  }

  const londonTime =
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

  // --------------------------------------------------
  // Europe/London is UTC+1 during British Summer Time
  // and UTC+0 during GMT.
  //
  // Calculate the correct offset for this date.
  // --------------------------------------------------

  const testDate =
    new Date(
      `${londonTime}Z`,
    );

  const january =
    new Date(
      Date.UTC(
        testDate.getUTCFullYear(),
        0,
        1,
      ),
    );

  const july =
    new Date(
      Date.UTC(
        testDate.getUTCFullYear(),
        6,
        1,
      ),
    );

  const januaryOffset =
    getUKOffset(january);

  const julyOffset =
    getUKOffset(july);

  const offset =
    Math.max(
      januaryOffset,
      julyOffset,
    );

  const utcDate =
    new Date(
      testDate.getTime() -
        offset * 60 * 60 * 1000,
    );

  return utcDate.toISOString();
}


function getUKOffset(
  date: Date,
): number {

  const year =
    date.getUTCFullYear();

  const marchLastSunday =
    getLastSunday(
      year,
      2,
    );

  const octoberLastSunday =
    getLastSunday(
      year,
      9,
    );

  const summerStart =
    Date.UTC(
      year,
      2,
      marchLastSunday,
      1,
      0,
      0,
    );

  const summerEnd =
    Date.UTC(
      year,
      9,
      octoberLastSunday,
      1,
      0,
      0,
    );

  const timestamp =
    date.getTime();

  if (
    timestamp >= summerStart &&
    timestamp < summerEnd
  ) {
    return 1;
  }

  return 0;
}


function getLastSunday(
  year: number,
  month: number,
): number {

  const lastDay =
    new Date(
      Date.UTC(
        year,
        month + 1,
        0,
      ),
    );

  return lastDay.getUTCDate() -
    lastDay.getUTCDay();
}


// ==================================================
// EXPORT
// ==================================================

export default app;
