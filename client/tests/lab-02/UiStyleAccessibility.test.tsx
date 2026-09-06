import "@testing-library/jest-dom";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";
import AttachmentSelector from "../../src/components/AttachmentSelector.js";

const REQUESTER = {
  id: 1,
  name: "Accessibility Requester",
  email: "accessibility@example.test",
};

const TICKET = {
  id: 101,
  ticketNumber: "TKT-2026-21001",
  ticketDate: "2026-09-06T08:00:00.000Z",
  summary: "Tablet-width layout verification",
  category: { id: 11, name: "Hardware" },
  relatedSystem: { id: 21, name: "Corporate Laptop" },
  requestedPriority: "MEDIUM",
  currentStatus: "NEW",
  createdAt: "2026-09-06T08:00:00.000Z",
  updatedAt: "2026-09-06T09:00:00.000Z",
};

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const maximumWidth = /max-width:\s*([\d.]+)px/u.exec(query)?.[1];
      const matches = maximumWidth
        ? width <= Number(maximumWidth)
        : false;

      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } satisfies MediaQueryList;
    }),
  );
}

function installApplicationApi(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/development-requesters") {
        return jsonResponse([REQUESTER]);
      }

      if (url.pathname === "/api/categories") {
        return jsonResponse([TICKET.category]);
      }

      if (url.pathname === "/api/related-systems") {
        return jsonResponse([TICKET.relatedSystem]);
      }

      if (url.pathname === "/api/tickets") {
        return jsonResponse({
          items: [TICKET],
          pagination: {
            page: 1,
            pageSize: 10,
            totalItems: 1,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        });
      }

      throw new Error(`Unexpected request: ${url.toString()}`);
    }),
  );
}

describe("UI-07 responsive and accessible behavior", () => {
  beforeEach(() => {
    sessionStorage.setItem("developmentRequesterId", "1");
    window.history.replaceState({}, "", "/tickets");
    installApplicationApi();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts mobile navigation collapsed and supports keyboard open, close, and destination activation", async () => {
    setViewportWidth(390);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "My Tickets" });
    const toggle = screen.getByRole("button", {
      name: "Toggle primary navigation",
    });
    const controlledNavigationId = toggle.getAttribute("aria-controls");
    const navigation = document.getElementById(controlledNavigationId!);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(controlledNavigationId).toBe("primary-navigation");
    expect(navigation).toHaveAttribute("aria-label", "Primary navigation");
    expect(navigation).not.toBeVisible();

    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(navigation).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(navigation).not.toBeVisible();

    await user.click(toggle);
    await user.click(
      within(navigation!).getByRole("link", { name: "Create Ticket" }),
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps primary navigation directly available at 768 pixels and wider", async () => {
    setViewportWidth(768);
    render(<App />);

    await screen.findByRole("heading", { name: "My Tickets" });
    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });

    expect(navigation).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "My Tickets" }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "Create Ticket" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Toggle primary navigation",
      }),
    ).not.toBeInTheDocument();
  });

  it("provides a keyboard-reachable bounded Ticket table at the 820 pixel tablet width", async () => {
    setViewportWidth(820);
    render(<App />);

    const table = await screen.findByRole("table", {
      name: "My Tickets",
    });
    const scrollRegion = screen.getByRole("region", {
      name: "Scrollable My Tickets table",
    });

    expect(scrollRegion).toHaveAttribute("tabindex", "0");
    expect(scrollRegion).toContainElement(table);
  });

  it("announces the exact approved invalid attachment type message", async () => {
    setViewportWidth(1024);
    const user = userEvent.setup({ applyAccept: false });
    const onFilesChange = vi.fn();
    render(
      <AttachmentSelector files={[]} onFilesChange={onFilesChange} />,
    );

    await user.upload(
      screen.getByLabelText("Attachments"),
      new File(["not allowed"], "blocked.txt", {
        type: "text/plain",
      }),
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("blocked.txt");
    expect(
      within(alert).getByText("This file type is not allowed.", {
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(onFilesChange).toHaveBeenCalledWith([]);
  });
});
