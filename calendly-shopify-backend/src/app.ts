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
      // ==================================================
      // VERIFY SHOPIFY WEBHOOK
      // ==================================================

      const hmacHeader =
        req.headers["x-shopify-hmac-sha256"];

      if (typeof hmacHeader !== "string") {
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

      // ==================================================
      // PARSE SHOPIFY ORDER
      // ==================================================

      const order =
        JSON.parse(
          req.body.toString("utf8"),
        );

      // ==================================================
      // FIND APPOINTMENT LINE ITEM
      //
      // We identify appointment products by their
      // title/name rather than a hard-coded product ID.
      //
      // Case-insensitive:
      // "Virtual Appointment"
      // "VIRTUAL APPOINTMENT"
      // "virtual appointment"
      // ==================================================

      const lineItems =
        order.line_items || [];

      const appointmentItem =
        lineItems.find(
          (item: any) => {
            const title =
              String(
                item.title || "",
              ).toLowerCase();

            const name =
              String(
                item.name || "",
              ).toLowerCase();

            return (
              title.includes("appointment") ||
              name.includes("appointment")
            );
          },
        );

      // ==================================================
      // NOT AN APPOINTMENT ORDER
      //
      // This webhook receives ALL paid orders.
      // Normal dress/product orders are therefore ignored.
      //
      // We return 200 because Shopify only needs to know
      // that we successfully received and handled the
      // webhook. Returning 200 prevents unnecessary retries.
      // ==================================================

      if (!appointmentItem) {


        return res.status(200).json({
          success: true,
          message:
            "Order does not contain an appointment.",
        });
      }


      // ==================================================
      // GET LINE ITEM PROPERTIES
      // ==================================================

      const properties =
        appointmentItem.properties || [];

      const getProperty =
        (name: string) => {
          const property =
            properties.find(
              (item: any) =>
                String(
                  item.name || "",
                ).toLowerCase() ===
                name.toLowerCase(),
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

      const consultationType =
        getProperty(
          "Consultation Type",
        );

      const appointmentTimezone =
  getProperty(
    "Appointment Timezone",
  );


      // ==================================================
      // VALIDATE APPOINTMENT INFORMATION
      // ==================================================

      if (
        !appointmentDate ||
        !appointmentTime ||
        !appointmentTimezone
      ) {
        console.error(
          "Appointment product is missing appointment date/time/timezone.",
          {
            orderId: order.id,
            appointmentDate,
            appointmentTime,
            appointmentTimezone
          },
        );

        return res.status(400).json({
          success: false,
          error:
            "INVALID_APPOINTMENT",
          message:
            "Appointment date and time are missing from the order.",
        });
      }

      // ==================================================
      // DETERMINE APPOINTMENT TYPE
      // ==================================================

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
            "Could not determine the appointment type.",
        });
      }

      const parsedAppointmentTime =
        new Date(
          appointmentTime,
        );

      if (
        Number.isNaN(
          parsedAppointmentTime.getTime(),
        )
      ) {
        console.error(
          "Invalid appointment time:",
          appointmentTime,
        );

        return res.status(400).json({
          success: false,
          error:
            "INVALID_APPOINTMENT_TIME",
          message:
            `Invalid appointment time: ${appointmentTime}`,
        });
      }

      const startTime =
        parsedAppointmentTime.toISOString();

      // ==================================================
      // CUSTOMER DETAILS
      //
      // These come from Shopify's order.
      // We do NOT use the other form properties.
      // ==================================================

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
        `${firstName} ${lastName}`.trim();

      if (
        !name ||
        !isEmail(email)
      ) {
        console.error(
          "Could not determine customer details.",
          {
            orderId: order.id,
          },
        );

        return res.status(400).json({
          success: false,
          error:
            "INVALID_CUSTOMER",
          message:
            "Could not determine the customer's name and email.",
        });
      }

      // ==================================================
      // BOOK CALENDLY APPOINTMENT
      // ==================================================

      const result =
        await book({
          name,
          email,
          appointmentType,
          startTime,
          timezone: appointmentTimezone,
        });

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
// IMPORTANT:
// This comes AFTER the Shopify webhook.
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
// This is kept for testing.
// The Shopify customer flow does NOT use this.
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
// EXPORT
// ==================================================

export default app;
