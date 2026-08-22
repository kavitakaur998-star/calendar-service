const CALENDLY_API = "https://api.calendly.com";

function getAccessToken(): string {
  const token = process.env.CALENDLY_ACCESS_TOKEN;

  if (!token) {
    throw new Error("CALENDLY_ACCESS_TOKEN is not configured");
  }

  return token;
}

async function calendlyRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${CALENDLY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();

    const error = new Error(
      `Calendly API request failed: ${response.status} ${text}`,
    );

    Object.assign(error, {
      status: response.status,
      response: text,
    });

    throw error;
  }

  return response.json() as Promise<T>;
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

/**
 * Check that the Calendly access token works.
 */
export async function getCurrentUser() {
  const data = await calendlyRequest<CalendlyUser>("/users/me");

  return {
    uri: data.resource.uri,
    name: data.resource.name,
    email: data.resource.email,
  };
}

/**
 * Retrieve all active Calendly event types belonging
 * to the authenticated user.
 */
export async function getEventTypes(): Promise<CalendlyEventType[]> {
  const user = await getCurrentUser();

  const userUuid = user.uri.split("/").pop();

  if (!userUuid) {
    throw new Error("Could not determine Calendly user UUID");
  }

  const data = await calendlyRequest<EventTypesResponse>(
    `/event_types?user=${encodeURIComponent(user.uri)}&active=true`,
  );

  return data.collection;
}

/**
 * Find one of Marcela's appointment types.
 */
export async function getEventType(
  appointmentType:
    | "virtual"
    | "atelier"
    | "fitting"
    | "fitting_studio",
): Promise<CalendlyEventType> {
  const eventTypes = await getEventTypes();

  const names: Record<typeof appointmentType, string> = {
    virtual: "VIRTUAL APPOINTMENT",
    atelier: "ATELIER APPOINTMENT",
    fitting: "BRIDAL FITTING APPOINTMENT",
    fitting_studio: "BRIDAL FITTING STUDIO APPOINTMENT",
  };

  const expectedName = names[appointmentType];

  const eventType = eventTypes.find(
    (event) =>
      event.name.trim().toUpperCase() === expectedName,
  );

  if (!eventType) {
    throw new Error(
      `Calendly event type not found: ${expectedName}`,
    );
  }

  return eventType;
}

/**
 * Return useful information about all configured appointment types.
 */
export async function getConfiguredEventTypes() {
  const types = [
    "virtual",
    "atelier",
    "fitting",
    "fitting_studio",
  ] as const;

  const results = await Promise.all(
    types.map(async (type) => {
      try {
        const event = await getEventType(type);

        return {
          id: type,
          label: event.name,
          uri: event.uri,
          slug: event.slug,
          duration: event.duration,
          schedulingUrl: event.scheduling_url,
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
