import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DevelopmentRequesterSelection from "../../src/components/DevelopmentRequesterSelection.js";
import * as api from "../../src/api.js";
import App from "../../src/App.js";

const requesters = [
  {
    id: 1,
    name: "Alex Morgan",
    email: "alex.morgan@example.com",
  },
  {
    id: 2,
    name: "Daniel Kim",
    email: "daniel.kim@example.com",
  },
];

describe("DevelopmentRequesterSelection", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the loading state while Requesters are being loaded", () => {
    vi.spyOn(api, "getDevelopmentRequesters").mockReturnValue(
      new Promise(() => undefined),
    );

    render(
      <DevelopmentRequesterSelection onContinue={vi.fn()} />,
    );

    expect(
      screen.getByText(/Loading Development Requesters/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: /Development Requester/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Continue/i }),
    ).toBeDisabled();
  });

  it("loads active Requesters and enables Continue after selection", async () => {
    const user = userEvent.setup();

    vi.spyOn(api, "getDevelopmentRequesters").mockResolvedValue(
      requesters,
    );

    render(
      <DevelopmentRequesterSelection onContinue={vi.fn()} />,
    );

    const select = await screen.findByRole("combobox", {
      name: /Development Requester/i,
    });

    expect(screen.getByText("Alex Morgan")).toBeInTheDocument();
    expect(screen.getByText("Daniel Kim")).toBeInTheDocument();
    expect(
      screen.queryByText("Emily Carter"),
    ).not.toBeInTheDocument();

    const continueButton = screen.getByRole("button", {
      name: /Continue/i,
    });

    expect(continueButton).toBeDisabled();

    await user.selectOptions(select, "1");

    expect(continueButton).toBeEnabled();
  });

  it("stores the selected Requester and continues", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    vi.spyOn(api, "getDevelopmentRequesters").mockResolvedValue(
      requesters,
    );

    render(
      <DevelopmentRequesterSelection onContinue={onContinue} />,
    );

    const select = await screen.findByRole("combobox", {
      name: /Development Requester/i,
    });

    await user.selectOptions(select, "1");
    await user.click(
      screen.getByRole("button", { name: /Continue/i }),
    );

    expect(
      sessionStorage.getItem("developmentRequesterId"),
    ).toBe("1");
    expect(onContinue).toHaveBeenCalledWith(requesters[0]);
  });

  it("restores a still-active Requester from sessionStorage", async () => {
    sessionStorage.setItem("developmentRequesterId", "2");

    vi.spyOn(api, "getDevelopmentRequesters").mockResolvedValue(
      requesters,
    );

    render(
      <DevelopmentRequesterSelection onContinue={vi.fn()} />,
    );

    const select = await screen.findByRole("combobox", {
      name: /Development Requester/i,
    });

    await waitFor(() => {
      expect(select).toHaveValue("2");
    });

    expect(
      screen.getByRole("button", { name: /Continue/i }),
    ).toBeEnabled();
  });

  it("clears an inactive or unknown stored Requester", async () => {
    sessionStorage.setItem("developmentRequesterId", "999");

    vi.spyOn(api, "getDevelopmentRequesters").mockResolvedValue(
      requesters,
    );

    render(
      <DevelopmentRequesterSelection onContinue={vi.fn()} />,
    );

    await screen.findByText("Alex Morgan");

    expect(
      sessionStorage.getItem("developmentRequesterId"),
    ).toBeNull();
  });

  it("shows the empty state when no active Requesters exist", async () => {
    vi.spyOn(api, "getDevelopmentRequesters").mockResolvedValue([]);

    render(
      <DevelopmentRequesterSelection onContinue={vi.fn()} />,
    );

    expect(
      await screen.findByText(
        "No active Development Requesters are available.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /Continue/i }),
    ).toBeDisabled();
  });

  it("shows a safe error and retries loading", async () => {
    const user = userEvent.setup();

    vi.spyOn(api, "getDevelopmentRequesters")
      .mockRejectedValueOnce(new Error("Internal database details"))
      .mockResolvedValueOnce(requesters);

    render(
      <DevelopmentRequesterSelection onContinue={vi.fn()} />,
    );

    expect(
      await screen.findByText(
        "Unable to load Development Requesters. Please try again.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Internal database details"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Try Again/i }),
    );

    expect(await screen.findByText("Alex Morgan")).toBeInTheDocument();
    expect(api.getDevelopmentRequesters).toHaveBeenCalledTimes(2);
  });
    it("redirects a protected route when no Requester is selected", async () => {
    window.history.replaceState({}, "", "/tickets");

    vi.spyOn(api, "getDevelopmentRequesters").mockResolvedValue(
      requesters,
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Select Development Requester",
      }),
    ).toBeInTheDocument();

    expect(window.location.pathname).toBe("/select-requester");
  });

  it("restores the selected Requester and supports changing Requester", async () => {
    const user = userEvent.setup();

    sessionStorage.setItem("developmentRequesterId", "1");
    window.history.replaceState({}, "", "/tickets");

    vi.spyOn(api, "getDevelopmentRequesters").mockResolvedValue(
      requesters,
    );

    render(<App />);

    expect(
      await screen.findByText("Current Requester: Alex Morgan"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Change Requester/i,
      }),
    );

    expect(
      sessionStorage.getItem("developmentRequesterId"),
    ).toBeNull();

    expect(
      await screen.findByRole("heading", {
        name: "Select Development Requester",
      }),
    ).toBeInTheDocument();

    expect(window.location.pathname).toBe("/select-requester");
  });
});