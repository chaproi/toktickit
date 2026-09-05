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
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.js";

function jsonResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => body,
    } as Response;
}

describe("Create Ticket", () => {
    beforeEach(() => {
        sessionStorage.setItem(
            "developmentRequesterId",
            "1",
        );

        window.history.pushState(
            {},
            "",
            "/tickets/new",
        );

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);

                if (
                    url.endsWith(
                        "/api/development-requesters",
                    )
                ) {
                    return jsonResponse([
                        {
                            id: 1,
                            name: "Development Requester 1",
                            email: "requester1@example.test",
                        },
                    ]);
                }

                if (url.endsWith("/api/categories")) {
                    return jsonResponse([
                        {
                            id: 2,
                            name: "Hardware",
                        },
                    ]);
                }

                if (url.endsWith("/api/related-systems")) {
                    return jsonResponse([
                        {
                            id: 1,
                            name: "Email",
                        },
                    ]);
                }

                if (url.endsWith("/api/tickets")) {
                    return jsonResponse({
                        ticket: {
                            id: 101,
                            ticketNumber: "TKT-2026-00001",
                            ticketDate:
                                "2026-09-04T16:00:00.000Z",
                            requester: {
                                id: 1,
                                name: "Development Requester 1",
                            },
                            category: {
                                id: 2,
                                name: "Hardware",
                            },
                            relatedSystem: {
                                id: 1,
                                name: "Email",
                            },
                            requestedPriority: "MEDIUM",
                            currentStatus: "NEW",
                            summary: "Laptop battery problem",
                            description:
                                "The laptop battery drains within one hour.",
                            createdAt:
                                "2026-09-04T16:00:00.000Z",
                            updatedAt:
                                "2026-09-04T16:00:00.000Z",
                        },
                        replayed: false,
                    });
                }

                throw new Error(
                    `Unexpected request: ${url}`,
                );
            }),
        );
    });

    afterEach(() => {
        sessionStorage.clear();
        vi.unstubAllGlobals();
        window.history.pushState({}, "", "/");
    });

    it("UI-02 loads reference data and displays the selected Requester", async () => {
        render(<App />);

        expect(
            await screen.findByText(
                "Development Requester 1",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByRole("heading", {
                name: /create ticket/i,
            }),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "requester1@example.test",
            ),
        ).toBeInTheDocument();

        const category = screen.getByRole(
            "combobox",
            {
                name: /^category/i,
            },
        );

        expect(
            within(category).getByRole("option", {
                name: "Hardware",
            }),
        ).toBeInTheDocument();

        const relatedSystem = screen.getByRole(
            "combobox",
            {
                name: /related system/i,
            },
        );

        expect(
            within(relatedSystem).getByRole("option", {
                name: "Email",
            }),
        ).toBeInTheDocument();

        const priority = screen.getByRole(
            "combobox",
            {
                name: /priority/i,
            },
        );

        for (const value of [
            "LOW",
            "MEDIUM",
            "HIGH",
            "URGENT",
        ]) {
            expect(
                within(priority).getByRole("option", {
                    name: value,
                }),
            ).toBeInTheDocument();
        }

        expect(
            screen.getByText(
                "Generated after creation",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "Assigned by server on creation",
            ),
        ).toBeInTheDocument();
        for (const label of [
            "Current Status",
            "IT Priority",
            "Ticket Owner",
        ]) {
            expect(
                screen.getByText(label),
            ).toBeInTheDocument();
        }

        expect(
            screen.getByText("NEW after creation"),
        ).toBeInTheDocument();

        expect(
            screen.getAllByText("Not assigned"),
        ).toHaveLength(2);
    });

    it("UI-02 shows a reference-data error and retries successfully", async () => {
        const user = userEvent.setup();
        let referenceRequestCount = 0;

        vi.mocked(fetch).mockImplementation(
            async (input: RequestInfo | URL) => {
                const url = String(input);

                if (
                    url.endsWith(
                        "/api/development-requesters",
                    )
                ) {
                    return jsonResponse([
                        {
                            id: 1,
                            name: "Development Requester 1",
                            email: "requester1@example.test",
                        },
                    ]);
                }

                if (
                    url.endsWith("/api/categories") ||
                    url.endsWith("/api/related-systems")
                ) {
                    referenceRequestCount += 1;

                    if (referenceRequestCount <= 2) {
                        return {
                            ok: false,
                            status: 503,
                            json: async () => ({}),
                        } as Response;
                    }

                    if (url.endsWith("/api/categories")) {
                        return jsonResponse([
                            {
                                id: 2,
                                name: "Hardware",
                            },
                        ]);
                    }

                    return jsonResponse([
                        {
                            id: 1,
                            name: "Email",
                        },
                    ]);
                }

                throw new Error(`Unexpected request: ${url}`);
            },
        );

        render(<App />);

        expect(
            await screen.findByRole("alert"),
        ).toHaveTextContent(
            /unable to load ticket reference data/i,
        );

        await user.click(
            screen.getByRole("button", {
                name: /retry/i,
            }),
        );

        expect(
            await screen.findByRole("option", {
                name: "Hardware",
            }),
        ).toBeInTheDocument();

        expect(
            screen.getByRole("option", {
                name: "Email",
            }),
        ).toBeInTheDocument();
    });

    it("UI-02 marks required fields accessibly", async () => {
        render(<App />);

        await screen.findByRole("option", {
            name: "Hardware",
        });

        for (const fieldName of [
            "Category",
            "Related System",
            "Priority",
            "Summary",
            "Description",
        ]) {
            expect(
                screen.getByLabelText(
                    new RegExp(
                        `${fieldName}.*required`,
                        "i",
                    ),
                ),
            ).toBeRequired();
        }
    });
    it("UI-03 clears entered values and selected Attachments", async () => {
        const user = userEvent.setup({
            applyAccept: false,
        });

        render(<App />);

        const category = await screen.findByRole(
            "combobox",
            {
                name: /^category/i,
            },
        );

        const relatedSystem = screen.getByRole(
            "combobox",
            {
                name: /related system/i,
            },
        );

        const priority = screen.getByRole(
            "combobox",
            {
                name: /priority/i,
            },
        );

        const summary = screen.getByRole("textbox", {
            name: /^summary/i,
        });

        const description = screen.getByRole("textbox", {
            name: /^description/i,
        });

        await user.selectOptions(category, "2");
        await user.selectOptions(relatedSystem, "1");
        await user.selectOptions(priority, "HIGH");
        await user.type(summary, "Clear this summary");
        await user.type(
            description,
            "Clear this description from the form.",
        );

        const file = new File(
            [new Uint8Array([137, 80, 78, 71])],
            "clear-evidence.png",
            {
                type: "image/png",
            },
        );

        const invalidFile = new File(
            ["plain text is not permitted"],
            "notes.txt",
            {
                type: "text/plain",
            },
        );

        await user.upload(
            screen.getByLabelText(/attachments/i),
            [file, invalidFile],
        );

        expect(
            screen.getByText(/notes\.txt.*unsupported file type/i),
        ).toBeInTheDocument();

        expect(
            await screen.findByText("clear-evidence.png"),
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole("button", {
                name: /clear form/i,
            }),
        );

        expect(category).toHaveValue("");
        expect(relatedSystem).toHaveValue("");
        expect(priority).toHaveValue("");
        expect(summary).toHaveValue("");
        expect(description).toHaveValue("");

        expect(
            screen.queryByText("clear-evidence.png"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText(/notes\.txt.*unsupported file type/i),
        ).not.toBeInTheDocument();
    });

    it("UI-03 blocks an invalid submission and displays validation errors", async () => {
        const user = userEvent.setup();

        render(<App />);

        await screen.findByRole("option", {
            name: "Hardware",
        });

        await user.click(
            screen.getByRole("button", {
                name: /^create ticket$/i,
            }),
        );

        expect(
            await screen.findByRole("alert"),
        ).toHaveTextContent(
            /correct the highlighted fields/i,
        );

        expect(
            screen.getByText("Category is required"),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                "Related System is required",
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText("Priority is required"),
        ).toBeInTheDocument();

        expect(
            screen.getByText("Summary is required"),
        ).toBeInTheDocument();

        expect(
            screen.getByText("Description is required"),
        ).toBeInTheDocument();
    });

    it("UI-03 submits valid data and displays the generated Ticket Number", async () => {
        const user = userEvent.setup();

        render(<App />);

        await user.selectOptions(
            await screen.findByRole("combobox", {
                name: /^category/i,
            }),
            "2",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /related system/i,
            }),
            "1",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /priority/i,
            }),
            "MEDIUM",
        );

        await user.type(
            screen.getByRole("textbox", {
                name: /^summary/i,
            }),
            "Laptop battery problem",
        );

        await user.type(
            screen.getByRole("textbox", {
                name: /^description/i,
            }),
            "The laptop battery drains within one hour.",
        );

        await user.click(
            screen.getByRole("button", {
                name: /^create ticket$/i,
            }),
        );

        expect(
            await screen.findByText("TKT-2026-00001"),
        ).toBeInTheDocument();

        expect(
            screen.getByText("Ticket Date"),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                new Date(
                    "2026-09-04T16:00:00.000Z",
                ).toLocaleString(),
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(/current status:/i),
        ).toHaveTextContent("NEW");

        expect(
            screen.getByText(
                /ticket created successfully/i,
            ),
        ).toBeInTheDocument();

        const fetchMock = vi.mocked(fetch);

        const ticketRequest =
            fetchMock.mock.calls.find(([input]) =>
                String(input).endsWith("/api/tickets"),
            );

        expect(ticketRequest).toBeDefined();

        const requestOptions = ticketRequest?.[1];
        const requestBody = JSON.parse(
            String(requestOptions?.body),
        ) as Record<string, unknown>;

        expect(requestOptions?.method).toBe("POST");

        expect(requestOptions?.headers).toMatchObject({
            "Content-Type": "application/json",
            "X-Development-Requester-Id": "1",
        });

        expect(requestBody).toMatchObject({
            categoryId: 2,
            relatedSystemId: 1,
            requestedPriority: "MEDIUM",
            summary: "Laptop battery problem",
            description:
                "The laptop battery drains within one hour.",
        });

        expect(
            requestBody.clientSubmissionId,
        ).toEqual(expect.any(String));

        expect(requestBody).not.toHaveProperty(
            "requesterId",
        );
    });
    it("UI-03 preserves entered values when the Ticket API fails", async () => {
        const user = userEvent.setup();

        render(<App />);

        await user.selectOptions(
            await screen.findByRole("combobox", {
                name: /^category/i,
            }),
            "2",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /related system/i,
            }),
            "1",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /priority/i,
            }),
            "HIGH",
        );

        const summary = screen.getByRole("textbox", {
            name: /^summary/i,
        });

        const description = screen.getByRole("textbox", {
            name: /^description/i,
        });

        await user.type(
            summary,
            "Unable to access email",
        );

        await user.type(
            description,
            "The email system rejects my valid password.",
        );

        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            status: 503,
            json: async () => ({
                error: {
                    code: "SERVICE_UNAVAILABLE",
                    message:
                        "Ticket service is temporarily unavailable.",
                },
            }),
        } as Response);

        await user.click(
            screen.getByRole("button", {
                name: /^create ticket$/i,
            }),
        );

        expect(
            await screen.findByRole("alert"),
        ).toHaveTextContent(
            "Ticket service is temporarily unavailable.",
        );

        expect(summary).toHaveValue(
            "Unable to access email",
        );

        expect(description).toHaveValue(
            "The email system rejects my valid password.",
        );

        expect(
            screen.getByRole("button", {
                name: /^create ticket$/i,
            }),
        ).toBeEnabled();
    });
    it("UI-03 disables submission and sends only one request while creating", async () => {
        const user = userEvent.setup();

        render(<App />);

        await user.selectOptions(
            await screen.findByRole("combobox", {
                name: /^category/i,
            }),
            "2",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /related system/i,
            }),
            "1",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /priority/i,
            }),
            "MEDIUM",
        );

        await user.type(
            screen.getByRole("textbox", {
                name: /^summary/i,
            }),
            "Laptop battery problem",
        );

        await user.type(
            screen.getByRole("textbox", {
                name: /^description/i,
            }),
            "The laptop battery drains within one hour.",
        );

        const pendingResponse = new Promise<Response>(
            () => {
                // Keep the request pending during this test.
            },
        );

        vi.mocked(fetch).mockImplementationOnce(
            () => pendingResponse,
        );

        await user.click(
            screen.getByRole("button", {
                name: /^create ticket$/i,
            }),
        );

        const submittingButton =
            await screen.findByRole("button", {
                name: /creating/i,
            });

        expect(submittingButton).toBeDisabled();

        await user.click(submittingButton);

        const ticketRequests =
            vi.mocked(fetch).mock.calls.filter(
                ([input, options]) =>
                    String(input).endsWith("/api/tickets") &&
                    options?.method === "POST",
            );

        expect(ticketRequests).toHaveLength(1);
    });
    it("UI-04 keeps a valid Attachment and rejects an unsupported file", async () => {
        const user = userEvent.setup({
            applyAccept: false,
        });

        render(<App />);

        await screen.findByRole("option", {
            name: "Hardware",
        });

        const attachmentInput =
            screen.getByLabelText(/attachments/i);

        const validFile = new File(
            [new Uint8Array([137, 80, 78, 71])],
            "evidence.png",
            {
                type: "image/png",
            },
        );

        const invalidFile = new File(
            ["plain text is not permitted"],
            "notes.txt",
            {
                type: "text/plain",
            },
        );

        await user.upload(attachmentInput, [
            validFile,
            invalidFile,
        ]);

        expect(
            await screen.findByText("evidence.png"),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                /notes\.txt.*unsupported file type/i,
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText(/image\/png/i),
        ).toBeInTheDocument();

        const removeButton = screen.getByRole("button", {
            name: /remove evidence\.png/i,
        });

        await user.click(removeButton);

        expect(
            screen.queryByText("evidence.png"),
        ).not.toBeInTheDocument();
    });
    it("UI-04 rejects an Attachment larger than 5 MB", async () => {
        const user = userEvent.setup({
            applyAccept: false,
        });

        render(<App />);

        await screen.findByRole("option", {
            name: "Hardware",
        });

        const oversizedFile = new File(
            [new Uint8Array(5_000_001)],
            "large-evidence.png",
            {
                type: "image/png",
            },
        );

        await user.upload(
            screen.getByLabelText(/attachments/i),
            oversizedFile,
        );

        expect(
            await screen.findByText(
                /large-evidence\.png.*must not exceed 5 MB/i,
            ),
        ).toBeInTheDocument();

        expect(
            screen.queryByText(/image\/png.*5\.00 MB/i),
        ).not.toBeInTheDocument();
    });
    it("UI-04 rejects a duplicate Attachment selection", async () => {
        const user = userEvent.setup({
            applyAccept: false,
        });

        render(<App />);

        await screen.findByRole("option", {
            name: "Hardware",
        });

        const attachmentInput =
            screen.getByLabelText(/attachments/i);

        const duplicateFile = new File(
            [new Uint8Array([137, 80, 78, 71])],
            "duplicate-evidence.png",
            {
                type: "image/png",
                lastModified: 1,
            },
        );

        await user.upload(
            attachmentInput,
            duplicateFile,
        );

        await user.upload(
            attachmentInput,
            duplicateFile,
        );

        expect(
            await screen.findByText(
                /duplicate-evidence\.png.*already selected/i,
            ),
        ).toBeInTheDocument();

        const selectedAttachments =
            screen.getByRole("list", {
                name: "Selected attachments",
            });

        expect(
            within(selectedAttachments).getAllByText(
                "duplicate-evidence.png",
            ),
        ).toHaveLength(1);
    });
    it("UI-04 limits the selection to five Attachments", async () => {
        const user = userEvent.setup({
            applyAccept: false,
        });

        render(<App />);

        await screen.findByRole("option", {
            name: "Hardware",
        });

        const files = Array.from(
            { length: 6 },
            (_, index) =>
                new File(
                    [new Uint8Array([137, 80, 78, 71])],
                    `evidence-${index + 1}.png`,
                    {
                        type: "image/png",
                        lastModified: index + 1,
                    },
                ),
        );

        await user.upload(
            screen.getByLabelText(/attachments/i),
            files,
        );

        expect(
            await screen.findByText(
                /evidence-6\.png.*maximum of five files/i,
            ),
        ).toBeInTheDocument();

        const selectedAttachments =
            screen.getByRole("list", {
                name: "Selected attachments",
            });

        expect(
            within(selectedAttachments).getAllByRole(
                "listitem",
            ),
        ).toHaveLength(5);

        expect(
            within(selectedAttachments).queryByText(
                "evidence-6.png",
            ),
        ).not.toBeInTheDocument();
    });
    it("UI-04 uploads selected Attachments after the Ticket is created", async () => {
        const user = userEvent.setup();
        const fetchMock = vi.mocked(fetch);
        const originalFetchImplementation =
            fetchMock.getMockImplementation();

        fetchMock.mockImplementation(async (input, options) => {
            const url = String(input);

            if (
                url.endsWith(
                    "/api/tickets/101/attachments",
                )
            ) {
                return new Response(
                    JSON.stringify({
                        id: 501,
                        ticketId: 101,
                        originalFilename: "evidence.png",
                        mimeType: "image/png",
                        sizeBytes: 4,
                        uploadedByRequesterId: 1,
                        isRemoved: false,
                        createdAt:
                            "2026-09-04T00:00:00.000Z",
                        removedAt: null,
                        removedByRequesterId: null,
                        removalReason: null,
                    }),
                    {
                        status: 201,
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                    },
                );
            }

            if (!originalFetchImplementation) {
                throw new Error(
                    `Unexpected request: ${url}`,
                );
            }

            return originalFetchImplementation(
                input,
                options,
            );
        });

        render(<App />);

        await user.selectOptions(
            await screen.findByRole("combobox", {
                name: /^category/i,
            }),
            "2",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /related system/i,
            }),
            "1",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /priority/i,
            }),
            "MEDIUM",
        );

        await user.type(
            screen.getByRole("textbox", {
                name: /^summary/i,
            }),
            "Laptop battery problem",
        );

        await user.type(
            screen.getByRole("textbox", {
                name: /^description/i,
            }),
            "The laptop battery drains within one hour.",
        );

        const file = new File(
            [new Uint8Array([137, 80, 78, 71])],
            "evidence.png",
            {
                type: "image/png",
            },
        );

        await user.upload(
            screen.getByLabelText(/attachments/i),
            file,
        );

        await user.click(
            screen.getByRole("button", {
                name: /^create ticket$/i,
            }),
        );

        expect(
            await screen.findByText("TKT-2026-00001"),
        ).toBeInTheDocument();

        const attachmentRequest =
            fetchMock.mock.calls.find(([input]) =>
                String(input).endsWith(
                    "/api/tickets/101/attachments",
                ),
            );

        expect(attachmentRequest).toBeDefined();

        const requestOptions = attachmentRequest?.[1];

        expect(requestOptions?.method).toBe("POST");
        expect(requestOptions?.headers).toEqual({
            "X-Development-Requester-Id": "1",
        });
        expect(requestOptions?.body).toBeInstanceOf(
            FormData,
        );
        expect(
            (requestOptions?.body as FormData).get("file"),
        ).toBe(file);
    });
    it("UI-04 keeps Ticket success visible when an Attachment upload fails", async () => {
        const user = userEvent.setup();
        const fetchMock = vi.mocked(fetch);
        const originalFetchImplementation =
            fetchMock.getMockImplementation();

        fetchMock.mockImplementation(async (input, options) => {
            const url = String(input);

            if (
                url.endsWith(
                    "/api/tickets/101/attachments",
                )
            ) {
                return new Response(
                    JSON.stringify({
                        error: {
                            code: "STORAGE_UNAVAILABLE",
                            message:
                                "Attachment storage is unavailable.",
                        },
                    }),
                    {
                        status: 503,
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                    },
                );
            }

            if (!originalFetchImplementation) {
                throw new Error(
                    `Unexpected request: ${url}`,
                );
            }

            return originalFetchImplementation(
                input,
                options,
            );
        });

        render(<App />);

        await user.selectOptions(
            await screen.findByRole("combobox", {
                name: /^category/i,
            }),
            "2",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /related system/i,
            }),
            "1",
        );

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /priority/i,
            }),
            "MEDIUM",
        );

        await user.type(
            screen.getByRole("textbox", {
                name: /^summary/i,
            }),
            "Laptop battery problem",
        );

        await user.type(
            screen.getByRole("textbox", {
                name: /^description/i,
            }),
            "The laptop battery drains within one hour.",
        );

        const file = new File(
            [new Uint8Array([137, 80, 78, 71])],
            "evidence.png",
            {
                type: "image/png",
            },
        );

        await user.upload(
            screen.getByLabelText(/attachments/i),
            file,
        );

        await user.click(
            screen.getByRole("button", {
                name: /^create ticket$/i,
            }),
        );

        expect(
            await screen.findByText("TKT-2026-00001"),
        ).toBeInTheDocument();

        expect(
            screen.getByText(
                /ticket created, but some attachments could not be uploaded/i,
            ),
        ).toBeInTheDocument();

        expect(
            screen.getByText("evidence.png"),
        ).toBeInTheDocument();
    });
});