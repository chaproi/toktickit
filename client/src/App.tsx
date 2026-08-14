import { useState } from "react";
import { checkHealth } from "./api.js";

type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");

  async function handleCheck() {
    setState("loading");

    try {
      await checkHealth();
      setState("success");
    } catch (error) {
      console.error("Health check failed:", error);
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button
        className="btn btn-success"
        onClick={handleCheck}
        disabled={state === "loading"}
      >
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "success" && (
        <p className="mt-3 text-success">Backend Status: Online</p>
      )}

      {state === "error" && (
        <p className="mt-3 text-danger">
          Backend Status: Offline — unable to connect to the backend.
        </p>
      )}
    </div>
  );
}