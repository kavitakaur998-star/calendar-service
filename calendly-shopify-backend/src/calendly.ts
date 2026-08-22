const CALENDLY_API = "https://api.calendly.com";

export class CalendlyError extends Error {
  constructor(
    public status: number,
    public details: unknown,
  ) {
    super(`Calendly API error ${status}`);
    this.name = "CalendlyError";
  }
}

function getAccessToken(): string {
  const token = process.env.CALENDLY_ACCESS_TOKEN;

  if (!token) {
    throw new Error(
      "CALENDLY_ACCESS_TOKEN is not configured",
    );
  }

  return token;
}

type CalendlyRequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
};

export async function calendlyRequest<T>(
  path: string,
  init: CalendlyRequestOptions = {},
): Promise<T> {
  const url = new URL(
    path,
    CALENDLY_API,
  );

  for (const [key, value] of Object.entries(
    init.query ?? {},
  )) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(
    url.toString(),
    {
      method: init.method ?? "GET",

      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        Accept: "application/json",
        ...(init.body
          ? {
              "Content-Type":
                "application/json",
            }
          : {}),
      },

      body: init.body
        ? JSON.stringify(init.body)
        : undefined,
    },
  );

  const text = await response.text();

  let data: unknown;

  try {
    data = text
      ? JSON.parse(text)
      : undefined;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new CalendlyError(
      response.status,
      data,
    );
  }

  return data as T;
}

export type CalendlyEventType = {
  uri: string;
  name: string;
  slug: string;
  active: boolean;
  duration: number;
  scheduling_url?: string;
};

type EventTypesResponse = {
  collection: CalendlyEventType[];
  pagination?: {
    next_page?: string | null;
    previous_page?: string | null;
  };
};

type CalendlyUser = {
  resource: {
    uri: string;
    name: string;
    email: string;
  };
};

export async function getCurrentUser() {
  const data =
    await calendlyRequest<CalendlyUser>(
      "/users/me",
    );

  return {
    uri: data.resource.uri,
    name: data.resource.name,
    email: data.resource.email,
  };
}

export async function getEventTypes(): Promise<
  CalendlyEventType[]
> {
  const user = await getCurrentUser();

  const data =
    await calendlyRequest<EventTypesResponse>(
      "/event_types",
      {
        query: {
          user: user.uri,
          active: "true",
        },
      },
    );

  return data.collection;
}

export async function getEventType(
  appointmentType:
    | "virtual"
    | "atelier"
    | "fitting"
    | "fitting_studio",
): Promise<CalendlyEventType> {
  const eventTypes =
    await getEventTypes();

  const names: Record<
    typeof appointmentType,
    string
  > = {
    virtual: "VIRTUAL APPOINTMENT",
    atelier: "ATELIER APPOINTMENT",
    fitting:
      "BRIDAL FITTING APPOINTMENT",
    fitting_studio:
      "BRIDAL FITTING STUDIO APPOINTMENT",
  };

  const expectedName =
    names[appointmentType];

  const eventType =
    eventTypes.find(
      (event) =>
        event.name
          .trim()
          .toUpperCase() ===
        expectedName,
    );

  if (!eventType) {
    throw new Error(
      `Calendly event type not found: ${expectedName}`,
    );
  }

  return eventType;
}

export async function getConfiguredEventTypes() {
  const types = [
    "virtual",
    "atelier",
    "fitting",
    "fitting_studio",
  ] as const;

  const results =
    await Promise.all(
      types.map(async (type) => {
        try {
          const event =
            await getEventType(type);

          return {
            id: type,
            label: event.name,
            uri: event.uri,
            slug: event.slug,
            duration:
              event.duration,
            schedulingUrl:
              event.scheduling_url,
            configured: true,
          };
        } catch {
          return {
            id: type,
            configured: false,
          };
        }
      }),
    );

  return results;
}
