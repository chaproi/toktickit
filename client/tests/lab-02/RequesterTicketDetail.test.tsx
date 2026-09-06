import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";

const REQUESTER = {
  id: 1,
  name: "Alex Morgan",
  email: "alex.morgan@example.com",
};

const TICKET = {
  id: 101,
  ticketNumber: "TKT-2026-19001",
  ticketDate: "2026-09-06T08:30:00.000Z",
  requester: {
    id: REQUESTER.id,
    name: REQUESTER.name,
  },
  category: {
    id: 2,
    name: "Hardware",
  },
  relatedSystem: {
    id: 7,
    name: "Corporate Laptop",
  },
  requestedPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  summary: "Laptop display flickers after startup",
  description:
    "The corporate laptop display flickers for several minutes after startup.",
  createdAt: "2026-09-06T08:30:00.000Z",
  updatedAt: "2026-09-06T09:45:00.000Z",
};

const ATTACHMENTS = {
  items: [
    {
      id: 501,
      ticketId: TICKET.id,
      originalFilename: "display-photo.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      uploadedByRequesterId: REQUESTER.id,
      isRemoved: false,
      createdAt: "2026-09-06T08:35:00.000Z",
      removedAt: null,
      removedByRequesterId: null,
      removalReason: null,
    },
  ],
};

type Responder = (
  url: URL,
  options?: RequestInit,
) => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function installFetchMock({
  detail = () => jsonResponse(TICKET),
  attachments = () => jsonResponse(ATTACHMENTS),
}: {
  detail?: Responder;
  attachments?: Responder;
} = {}) {
  const fetchMock = vi.fn(
    async (
      input: RequestInfo | URL,
      options?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(input));

      if (url.pathname === "/api/development-requesters") {
        return jsonResponse([REQUESTER]);
      }

      if (
        url.pathname === `/api/tickets/${TICKET.id}` &&
        options?.method !== "POST"
      ) {
        return detail(url, options);
      }

      if (
        url.pathname ===
          `/api/tickets/${TICKET.id}/attachments` &&
        (!options?.method || options.method === "GET")
      ) {
        return attachments(url, options);
      }

      throw new Error(`Unexpected request: ${url.toString()}`);
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requesterHeader(options?: RequestInit): string | null {
  return new Headers(options?.headers).get(
    "X-Development-Requester-Id",
  );
}

describe("Requester Ticket Detail", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("developmentRequesterId", "1");
    window.history.replaceState({}, "", `/tickets/${TICKET.id}`);
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("UI-06 renders a semantic loading state and requests the owned Ticket", async () => {
    let resolveDetail!: (response: Response) => void;
    const pendingDetail = new Promise<Response>((resolve) => {
      resolveDetail = resolve;
    });
    const fetchMock = installFetchMock({
      detail: () => pendingDetail,
    });

    render(<App />);

    expect(
      await screen.findByText("Current Requester: Alex Morgan"),
    ).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /loading.*ticket/i,
    );

    const detailRequest = fetchMock.mock.calls.find(([input]) => {
      const url = new URL(String(input));
      return url.pathname === `/api/tickets/${TICKET.id}`;
    });
    expect(detailRequest).toBeDefined();
    expect(
      requesterHeader(detailRequest?.[1] as RequestInit | undefined),
    ).toBe("1");

    resolveDetail(jsonResponse(TICKET));
  });

  it("UI-06 renders all approved Ticket fields as read-only and omits prohibited workflow controls", async () => {
    const fetchMock = installFetchMock();

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Ticket Detail",
      }),
    ).toBeInTheDocument();

    const main = screen.getByRole("main");
    for (const label of [
      "Ticket Number",
      "Ticket Date",
      "Development Requester",
      "Category",
      "Related System",
      "Priority",
      "Status",
      "Summary",
      "Description",
      "Created",
      "Updated",
    ]) {
      expect(within(main).getByText(label)).toBeInTheDocument();
    }

    for (const value of [
      TICKET.ticketNumber,
      TICKET.requester.name,
      TICKET.category.name,
      TICKET.relatedSystem.name,
      TICKET.requestedPriority,
      TICKET.currentStatus,
      TICKET.summary,
      TICKET.description,
    ]) {
      expect(within(main).getByText(value)).toBeInTheDocument();
    }

    const timestamps = main.querySelectorAll("time");
    expect(
      Array.from(timestamps).map((time) =>
        time.getAttribute("datetime"),
      ),
    ).toEqual([
      TICKET.ticketDate,
      TICKET.createdAt,
      TICKET.updatedAt,
      ATTACHMENTS.items[0].createdAt,
    ]);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /status|priority|claim|assign|comment|note|action taken/i,
      }),
    ).not.toBeInTheDocument();

    const detailRequest = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith(`/api/tickets/${TICKET.id}`),
    );
    const attachmentRequest = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith(
        `/api/tickets/${TICKET.id}/attachments`,
      ),
    );
    expect(detailRequest).toBeDefined();
    expect(attachmentRequest).toBeDefined();
    expect(
      requesterHeader(detailRequest?.[1] as RequestInit | undefined),
    ).toBe("1");
    expect(
      requesterHeader(
        attachmentRequest?.[1] as RequestInit | undefined,
      ),
    ).toBe("1");
  });

  it.each(["missing", "owned by another Requester"])(
    "UI-06 gives a %s Ticket the same safe not-found state",
    async () => {
      installFetchMock({
        detail: () =>
          jsonResponse(
            {
              error: {
                code: "TICKET_NOT_FOUND",
                message: "Ticket not found.",
              },
            },
            404,
          ),
      });

      render(<App />);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Ticket not found.");
      expect(alert).not.toHaveTextContent(
        /Daniel Kim|daniel\.kim|private Ticket/i,
      );
      expect(
        screen.queryByText(TICKET.summary),
      ).not.toBeInTheDocument();
    },
  );

  it("UI-06 renders a safe failure state and retries Ticket Detail", async () => {
    const user = userEvent.setup();
    let detailCalls = 0;
    installFetchMock({
      detail: () => {
        detailCalls += 1;

        if (detailCalls === 1) {
          return jsonResponse(
            {
              error: {
                code: "INTERNAL_ERROR",
                message: "Something went wrong. Please try again.",
              },
            },
            500,
          );
        }

        return jsonResponse(TICKET);
      },
    });

    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(alert).not.toHaveTextContent(
      /Prisma|SQL|stack|storage|secret/i,
    );

    await user.click(
      screen.getByRole("button", { name: "Try Again" }),
    );

    expect(
      await screen.findByText(TICKET.ticketNumber),
    ).toBeInTheDocument();
    expect(detailCalls).toBe(2);
  });

  it("UI-06 retains the complete semantic Ticket and Attachment structure at a mobile viewport", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    window.dispatchEvent(new Event("resize"));
    installFetchMock();

    render(<App />);

    await screen.findByRole("heading", {
        name: "Ticket Detail",
    });
    const main = screen.getByRole("main");
    expect(
      within(main).getByText(TICKET.description),
    ).toBeInTheDocument();
    expect(
      within(main).getByRole("heading", {
        name: "Attachments",
      }),
    ).toBeInTheDocument();
    expect(
      within(main).getByText("display-photo.png"),
    ).toBeInTheDocument();
    expect(
      within(main).getByRole("button", {
        name: /download display-photo\.png/i,
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(window.location.pathname).toBe(`/tickets/${TICKET.id}`);
    });
  });
});
