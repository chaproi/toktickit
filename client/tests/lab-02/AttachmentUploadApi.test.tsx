import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadAttachment } from "../../src/api.js";

describe("Attachment Upload API", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("UI-04 uploads one file using FormData and Requester header", async () => {
        const responseBody = {
            id: 501,
            ticketId: 101,
            originalFilename: "evidence.png",
            mimeType: "image/png",
            sizeBytes: 4,
            uploadedByRequesterId: 1,
            isRemoved: false,
            createdAt: "2026-09-04T00:00:00.000Z",
            removedAt: null,
            removedByRequesterId: null,
            removalReason: null,
        };

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(responseBody), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            }),
        );

        vi.stubGlobal("fetch", fetchMock);

        const file = new File(
            [new Uint8Array([137, 80, 78, 71])],
            "evidence.png",
            { type: "image/png" },
        );

        const result = await uploadAttachment(1, 101, file);

        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, options] = fetchMock.mock.calls[0] as [
            string,
            RequestInit,
        ];

        expect(url).toBe(
            "http://localhost:3000/api/tickets/101/attachments",
        );
        expect(options.method).toBe("POST");
        expect(options.headers).toEqual({
            "X-Development-Requester-Id": "1",
        });
        expect(options.body).toBeInstanceOf(FormData);
        expect((options.body as FormData).get("file")).toBe(file);
        expect(result).toEqual(responseBody);
    });
});