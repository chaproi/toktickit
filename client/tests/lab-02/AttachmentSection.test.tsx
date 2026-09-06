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
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 7, name: "Corporate Laptop" },
  requestedPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  summary: "Laptop display flickers after startup",
  description:
    "The corporate laptop display flickers for several minutes after startup.",
  createdAt: "2026-09-06T08:30:00.000Z",
  updatedAt: "2026-09-06T09:45:00.000Z",
};

const ACTIVE_ATTACHMENT = {
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
};

const REMOVED_ATTACHMENT = {
  id: 502,
  ticketId: TICKET.id,
  originalFilename: "old-report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 4096,
  uploadedByRequesterId: REQUESTER.id,
  isRemoved: true,
  createdAt: "2026-09-06T08:40:00.000Z",
  removedAt: "2026-09-06T09:00:00.000Z",
  removedByRequesterId: REQUESTER.id,
  removalReason: "Uploaded the wrong document.",
};

type Attachment = typeof ACTIVE_ATTACHMENT | typeof REMOVED_ATTACHMENT;
type OverrideResponder = (
  url: URL,
  options?: RequestInit,
) => Response | Promise<Response> | undefined;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function installFetchMock(override?: OverrideResponder) {
  let attachments: Attachment[] = [
    ACTIVE_ATTACHMENT,
    REMOVED_ATTACHMENT,
  ];

  const fetchMock = vi.fn(
    async (
      input: RequestInfo | URL,
      options?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(input));
      const overridden = await override?.(url, options);

      if (overridden) {
        return overridden;
      }

      if (url.pathname === "/api/development-requesters") {
        return jsonResponse([REQUESTER]);
      }

      if (url.pathname === `/api/tickets/${TICKET.id}`) {
        return jsonResponse(TICKET);
      }

      if (
        url.pathname ===
          `/api/tickets/${TICKET.id}/attachments` &&
        (!options?.method || options.method === "GET")
      ) {
        return jsonResponse({ items: attachments });
      }

      if (
        url.pathname ===
          `/api/tickets/${TICKET.id}/attachments` &&
        options?.method === "POST"
      ) {
        const uploadedAttachment = {
          ...ACTIVE_ATTACHMENT,
          id: 503,
          originalFilename: "new-evidence.png",
          sizeBytes: 4,
          createdAt: "2026-09-06T10:00:00.000Z",
        };
        attachments = [...attachments, uploadedAttachment];
        return jsonResponse(uploadedAttachment, 201);
      }

      if (
        url.pathname ===
          `/api/tickets/${TICKET.id}/attachments/${ACTIVE_ATTACHMENT.id}/content`
      ) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Disposition": `${
              url.searchParams.get("disposition") ?? "attachment"
            }; filename="display-photo.png"`,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      if (
        url.pathname ===
          `/api/tickets/${TICKET.id}/attachments/${ACTIVE_ATTACHMENT.id}` &&
        options?.method === "DELETE"
      ) {
        const removedAttachment = {
          ...ACTIVE_ATTACHMENT,
          isRemoved: true as const,
          removedAt: "2026-09-06T10:05:00.000Z",
          removedByRequesterId: REQUESTER.id,
          removalReason: "Uploaded the wrong image.",
        };
        attachments = [removedAttachment, REMOVED_ATTACHMENT];
        return jsonResponse(removedAttachment);
      }

      throw new Error(`Unexpected request: ${url.toString()}`);
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function attachmentRequests(
  fetchMock: ReturnType<typeof vi.fn>,
  method?: string,
) {
  return fetchMock.mock.calls.filter(([input, options]) => {
    const url = new URL(String(input));
    const requestMethod =
      (options as RequestInit | undefined)?.method ?? "GET";
    return (
      url.pathname.startsWith(
        `/api/tickets/${TICKET.id}/attachments`,
      ) &&
      (method === undefined || requestMethod === method)
    );
  });
}

describe("Ticket Detail Attachment section", () => {
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

  it("UI-06 displays active and removed Attachment metadata with non-color state text", async () => {
    installFetchMock();

    render(<App />);

    const attachmentList = await screen.findByRole("list", {
      name: "Attachments",
    });
    const items = within(attachmentList).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(items[0]).toHaveTextContent("display-photo.png");
    expect(items[0]).toHaveTextContent("image/png");
    expect(items[0]).toHaveTextContent("2.0 KB");
    expect(items[0]).toHaveTextContent("Active");
    expect(
      within(items[0]).getByRole("button", { name: /preview/i }),
    ).toBeInTheDocument();
    expect(
      within(items[0]).getByRole("button", { name: /download/i }),
    ).toBeInTheDocument();
    expect(
      within(items[0]).getByRole("button", { name: /remove/i }),
    ).toBeInTheDocument();

    expect(items[1]).toHaveTextContent("old-report.pdf");
    expect(items[1]).toHaveTextContent("application/pdf");
    expect(items[1]).toHaveTextContent("4.1 KB");
    expect(items[1]).toHaveTextContent("Removed");
    expect(items[1]).toHaveTextContent(
      "Uploaded the wrong document.",
    );
    expect(
      within(items[1]).queryByRole("button", {
        name: /preview|download|remove/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("UI-06 uploads an owned Attachment with progress and success feedback", async () => {
    const user = userEvent.setup();
    let resolveUpload!: (response: Response) => void;
    const pendingUpload = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    const fetchMock = installFetchMock((url, options) => {
      if (
        url.pathname ===
          `/api/tickets/${TICKET.id}/attachments` &&
        options?.method === "POST"
      ) {
        return pendingUpload;
      }

      return undefined;
    });

    render(<App />);
    await screen.findByText("display-photo.png");

    const file = new File(
      [new Uint8Array([137, 80, 78, 71])],
      "new-evidence.png",
      { type: "image/png" },
    );
    await user.upload(
      screen.getByLabelText(/add attachment/i),
      file,
    );
    await user.click(
      screen.getByRole("button", { name: /^upload$/i }),
    );

    expect(
      await screen.findByRole("button", {
        name: /uploading attachment/i,
      }),
    ).toBeDisabled();

    const uploadRequest = attachmentRequests(fetchMock, "POST")[0];
    expect(uploadRequest).toBeDefined();
    const uploadOptions = uploadRequest[1] as RequestInit;
    expect(new Headers(uploadOptions.headers).get(
      "X-Development-Requester-Id",
    )).toBe("1");
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect((uploadOptions.body as FormData).get("file")).toBe(file);

    resolveUpload(
      jsonResponse(
        {
          ...ACTIVE_ATTACHMENT,
          id: 503,
          originalFilename: "new-evidence.png",
          sizeBytes: 4,
          createdAt: "2026-09-06T10:00:00.000Z",
        },
        201,
      ),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Attachment uploaded successfully.",
    );
    expect(
      await screen.findByText("new-evidence.png"),
    ).toBeInTheDocument();
  });

  it.each([
    {
      file: new File(["plain text"], "notes.txt", {
        type: "text/plain",
      }),
      message: "This file type is not allowed.",
    },
    {
      file: new File(
        [new Uint8Array(5_000_001)],
        "large-evidence.png",
        { type: "image/png" },
      ),
      message: "Each attachment must be 5 MB or smaller.",
    },
  ])(
    "UI-06 rejects $file.name before upload with approved feedback",
    async ({ file, message }) => {
      const user = userEvent.setup({ applyAccept: false });
      const fetchMock = installFetchMock();

      render(<App />);
      await screen.findByText("display-photo.png");

      await user.upload(
        screen.getByLabelText(/add attachment/i),
        file,
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        message,
      );
      expect(attachmentRequests(fetchMock, "POST")).toHaveLength(0);
    },
  );

  it("UI-06 provides keyboard-operable Preview and Download controls with approved requests", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock();
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:issue-19-attachment");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(
      () => undefined,
    );
    vi.stubGlobal("open", vi.fn());

    render(<App />);
    await screen.findByText("display-photo.png");

    const preview = screen.getByRole("button", {
      name: /preview display-photo\.png/i,
    });
    preview.focus();
    expect(preview).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(
        attachmentRequests(fetchMock).some(([input]) =>
          String(input).endsWith(
            `/content?disposition=inline`,
          ),
        ),
      ).toBe(true);
    });

    const download = screen.getByRole("button", {
      name: /download display-photo\.png/i,
    });
    download.focus();
    expect(download).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(
        attachmentRequests(fetchMock).some(([input]) =>
          String(input).endsWith(
            `/content?disposition=attachment`,
          ),
        ),
      ).toBe(true);
    });
    expect(createObjectUrl).toHaveBeenCalled();

    for (const [, options] of attachmentRequests(fetchMock).filter(
      ([input]) => String(input).includes("/content?"),
    )) {
      expect(
        new Headers((options as RequestInit | undefined)?.headers).get(
          "X-Development-Requester-Id",
        ),
      ).toBe("1");
    }
  });

  it("UI-06 requires a confirmed 5 to 200 character removal reason", async () => {
    const user = userEvent.setup();
    installFetchMock();

    render(<App />);
    await screen.findByText("display-photo.png");

    const removeButton = screen.getByRole("button", {
      name: /remove display-photo\.png/i,
    });
    await user.click(removeButton);

    const dialog = screen.getByRole("dialog", {
      name: /remove attachment/i,
    });
    expect(dialog).toHaveTextContent("display-photo.png");
    expect(dialog).toHaveTextContent(/soft removal/i);

    const reason = within(dialog).getByRole("textbox", {
      name: /removal reason/i,
    });
    expect(reason).toBeRequired();
    await user.type(reason, "four");
    await user.click(
      within(dialog).getByRole("button", {
        name: "Remove Attachment",
      }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /5.*200/i,
    );
    expect(screen.getByText("display-photo.png")).toBeInTheDocument();

    await user.clear(reason);
    await user.type(reason, "Uploaded the wrong image.");
    const cancel = within(dialog).getByRole("button", {
      name: "Cancel",
    });
    cancel.focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(removeButton).toHaveFocus();
  });

  it("UI-06 confirms soft removal, sends the reason, and announces the retained Removed state", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetchMock();

    render(<App />);
    await screen.findByText("display-photo.png");
    await user.click(
      screen.getByRole("button", {
        name: /remove display-photo\.png/i,
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /removal reason/i }),
      "  Uploaded the wrong image.  ",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Remove Attachment",
      }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Attachment removed successfully.",
    );

    const deleteRequest = attachmentRequests(fetchMock, "DELETE")[0];
    expect(deleteRequest).toBeDefined();
    const deleteOptions = deleteRequest[1] as RequestInit;
    expect(JSON.parse(String(deleteOptions.body))).toEqual({
      removalReason: "Uploaded the wrong image.",
    });
    expect(
      new Headers(deleteOptions.headers).get(
        "X-Development-Requester-Id",
      ),
    ).toBe("1");

    const attachmentList = screen.getByRole("list", {
      name: "Attachments",
    });
    const removedItem = within(attachmentList)
      .getByText("display-photo.png")
      .closest("li");
    expect(removedItem).not.toBeNull();
    expect(removedItem).toHaveTextContent("Removed");
    expect(removedItem).toHaveTextContent(
      "Uploaded the wrong image.",
    );
    expect(
      within(removedItem as HTMLElement).queryByRole("button", {
        name: /preview|download|remove/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("UI-06 displays a safe Attachment failure state and retries metadata loading", async () => {
    const user = userEvent.setup();
    let listCalls = 0;
    installFetchMock((url, options) => {
      if (
        url.pathname ===
          `/api/tickets/${TICKET.id}/attachments` &&
        (!options?.method || options.method === "GET")
      ) {
        listCalls += 1;

        if (listCalls === 1) {
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

        return jsonResponse({
          items: [ACTIVE_ATTACHMENT, REMOVED_ATTACHMENT],
        });
      }

      return undefined;
    });

    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(alert).not.toHaveTextContent(
      /SeaweedFS|Prisma|SQL|stack|secret|path/i,
    );

    await user.click(
      screen.getByRole("button", { name: "Try Again" }),
    );

    expect(
      await screen.findByText("display-photo.png"),
    ).toBeInTheDocument();
    expect(listCalls).toBe(2);
  });
});
