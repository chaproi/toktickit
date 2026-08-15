import { useState } from "react";
import { checkSystem, type Category } from "./api.js";

type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);

  async function handleCheck() {
    setState("loading");

    try {
      const systemStatus = await checkSystem();
      setCategories(systemStatus.categories);
      setState("success");
    } catch (error) {
      console.error("Error checking system:", error);
      setCategories([]);
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

      {state === "loading" && <p className="mt-3">Loading…</p>}

      {state === "success" && (
        <div className="mt-3">
          <p className="text-success">System Status: Online</p>
          <p>Supported Request Categories:</p>

          <ul>
            {categories.map((category) => (
              <li key={category.id}>{category.name}</li>
            ))}
          </ul>
        </div>
      )}

      {state === "error" && (
        <div className="mt-3">
          <p className="text-danger">System Status: Offline</p>
          <p>Unable to connect to the backend or load categories.</p>
        </div>
      )}
    </div>
  );
}