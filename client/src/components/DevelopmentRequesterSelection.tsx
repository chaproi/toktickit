import { useEffect, useState } from "react";
import {
  getDevelopmentRequesters,
  type DevelopmentRequester,
} from "../api.js";

type LoadState = "loading" | "ready" | "empty" | "error";

interface DevelopmentRequesterSelectionProps {
  onContinue: (
    requester: DevelopmentRequester,
  ) => void | Promise<void>;
}

const REQUESTER_STORAGE_KEY = "developmentRequesterId";

export default function DevelopmentRequesterSelection({
  onContinue,
}: DevelopmentRequesterSelectionProps) {
  const [requesters, setRequesters] = useState<
    DevelopmentRequester[]
  >([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadState, setLoadState] =
    useState<LoadState>("loading");
  const [isContinuing, setIsContinuing] = useState(false);

  async function loadRequesters() {
    setLoadState("loading");

    try {
      const loadedRequesters =
        await getDevelopmentRequesters();

      setRequesters(loadedRequesters);

      const storedId = sessionStorage.getItem(
        REQUESTER_STORAGE_KEY,
      );

      if (
        storedId &&
        loadedRequesters.some(
          (requester) => requester.id === Number(storedId),
        )
      ) {
        setSelectedId(storedId);
      } else {
        setSelectedId("");

        if (storedId) {
          sessionStorage.removeItem(REQUESTER_STORAGE_KEY);
        }
      }

      setLoadState(
        loadedRequesters.length === 0 ? "empty" : "ready",
      );
    } catch (error) {
      console.error(
        "Unable to load Development Requesters:",
        error,
      );
      setRequesters([]);
      setSelectedId("");
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadRequesters();
  }, []);

  async function handleContinue() {
    const selectedRequester = requesters.find(
      (requester) => requester.id === Number(selectedId),
    );

    if (!selectedRequester) {
      return;
    }

    sessionStorage.setItem(
      REQUESTER_STORAGE_KEY,
      String(selectedRequester.id),
    );
    setIsContinuing(true);

    try {
      await onContinue(selectedRequester);
    } finally {
      setIsContinuing(false);
    }
  }

  return (
    <main className="container py-5" style={{ maxWidth: 720 }}>
      <section className="card border-success shadow-sm">
        <div className="card-body p-4 p-md-5">
          <p className="text-success fw-semibold mb-2">
            TokTickIT
          </p>

          <h1 className="h3 mb-3">
            Select Development Requester
          </h1>

          <p className="text-secondary">
            Select a Development Requester to test
            requester-specific ticket behavior. This is not a
            login screen. Authentication and role-based access
            will be introduced in Lab 3.
          </p>

          {loadState === "loading" && (
            <p role="status" className="text-secondary">
              Loading Development Requesters…
            </p>
          )}

          {loadState === "empty" && (
            <div className="alert alert-warning" role="status">
              No active Development Requesters are available.
            </div>
          )}

          {loadState === "error" && (
            <div className="alert alert-danger" role="alert">
              <p>
                Unable to load Development Requesters. Please try
                again.
              </p>

              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => void loadRequesters()}
              >
                Try Again
              </button>
            </div>
          )}

          <div className="mb-4">
            <label
              className="form-label fw-semibold"
              htmlFor="development-requester"
            >
              Development Requester
            </label>

            <select
              id="development-requester"
              className="form-select"
              value={selectedId}
              disabled={
                loadState !== "ready" || isContinuing
              }
              onChange={(event) =>
                setSelectedId(event.target.value)
              }
            >
              <option value="">
                Select a Development Requester
              </option>

              {requesters.map((requester) => (
                <option
                  key={requester.id}
                  value={requester.id}
                >
                  {requester.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-success w-100"
            disabled={
              loadState !== "ready" ||
              selectedId === "" ||
              isContinuing
            }
            onClick={() => void handleContinue()}
          >
            {isContinuing ? "Continuing…" : "Continue"}
          </button>
        </div>
      </section>
    </main>
  );
}