import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import CreateTicket from "./components/CreateTicket.js";
import DevelopmentRequesterSelection from "./components/DevelopmentRequesterSelection.js";
import {
  checkSystem,
  getDevelopmentRequesters,
  type Category,
  type DevelopmentRequester,
} from "./api.js";

const REQUESTER_STORAGE_KEY = "developmentRequesterId";

type UiState = "idle" | "loading" | "success" | "error";

interface AppShellProps {
  requester: DevelopmentRequester;
  onChangeRequester: () => void;
  children?: ReactNode;
}

function SystemCheck() {
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
    <section className="container pb-5" style={{ maxWidth: 720 }}>
      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <h2 className="h6">Development system check</h2>

          <button
            type="button"
            className="btn btn-outline-success"
            onClick={handleCheck}
            disabled={state === "loading"}
          >
            {state === "loading" ? "Loading…" : "Check System"}
          </button>

          {state === "success" && (
            <div className="mt-3">
              <p className="text-success">
                System Status: Online
              </p>

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
              <p className="text-danger">
                System Status: Offline
              </p>

              <p>
                Unable to connect to the backend or load categories.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RequesterPage({
  onContinue,
}: {
  onContinue: (requester: DevelopmentRequester) => void;
}) {
  return (
    <div className="min-vh-100 bg-body-tertiary">
      <DevelopmentRequesterSelection
        onContinue={onContinue}
      />

      <SystemCheck />
    </div>
  );
}

function RootRequesterRedirect({
  children,
}: {
  children: ReactNode;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/select-requester", { replace: true });
  }, [navigate]);

  return children;
}

function AppShell({
  requester,
  onChangeRequester,
  children,
}: AppShellProps) {
  return (
    <div className="min-vh-100 bg-body-tertiary">
      <header className="navbar navbar-expand-md bg-success navbar-dark shadow-sm">
        <div className="container">
          <Link
            className="navbar-brand fw-semibold"
            to="/tickets"
          >
            TokTickIT
          </Link>

          <nav className="d-flex align-items-center gap-3">
            <Link className="link-light" to="/tickets">
              My Tickets
            </Link>

            <Link className="link-light" to="/tickets/new">
              Create Ticket
            </Link>
          </nav>
        </div>
      </header>

      <main className="container py-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <p className="mb-0 fw-semibold">
            Current Requester: {requester.name}
          </p>

          <button
            type="button"
            className="btn btn-outline-success"
            onClick={onChangeRequester}
          >
            Change Requester
          </button>
        </div>

        {children ?? (
          <section className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <h1 className="h3">My Tickets</h1>

              <p className="text-secondary mb-0">
                Ticket features will be implemented in the next
                Lab 2 issue.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function AppRoutes() {
  const navigate = useNavigate();

  const storedRequesterId = sessionStorage.getItem(
    REQUESTER_STORAGE_KEY,
  );

  const [currentRequester, setCurrentRequester] =
    useState<DevelopmentRequester | null>(null);

  const [isRestoring, setIsRestoring] = useState(
    Boolean(storedRequesterId),
  );

  useEffect(() => {
    if (!storedRequesterId) {
      return;
    }

    let active = true;

    async function restoreRequester() {
      try {
        const requesters =
          await getDevelopmentRequesters();

        const requester = requesters.find(
          (candidate) =>
            candidate.id === Number(storedRequesterId),
        );

        if (!active) {
          return;
        }

        if (requester) {
          setCurrentRequester(requester);
        } else {
          sessionStorage.removeItem(
            REQUESTER_STORAGE_KEY,
          );
        }
      } catch (error) {
        console.error(
          "Unable to restore Development Requester:",
          error,
        );

        sessionStorage.removeItem(REQUESTER_STORAGE_KEY);
      } finally {
        if (active) {
          setIsRestoring(false);
        }
      }
    }

    void restoreRequester();

    return () => {
      active = false;
    };
  }, [storedRequesterId]);

  function selectRequester(
    requester: DevelopmentRequester,
  ) {
    setCurrentRequester(requester);
    navigate("/tickets", { replace: true });
  }

  function changeRequester() {
    sessionStorage.removeItem(REQUESTER_STORAGE_KEY);
    setCurrentRequester(null);
    navigate("/select-requester", { replace: true });
  }

  if (isRestoring) {
    return (
      <main className="container py-5">
        <h1 className="h3 text-success">TokTickIT</h1>

        <p role="status">
          Restoring Development Requester…
        </p>
      </main>
    );
  }

  const requesterPage = (
    <RequesterPage onContinue={selectRequester} />
  );

  const protectedPage = currentRequester ? (
    <AppShell
      requester={currentRequester}
      onChangeRequester={changeRequester}
    />
  ) : (
    <Navigate to="/select-requester" replace />
  );

  const createTicketPage = currentRequester ? (
    <AppShell
      requester={currentRequester}
      onChangeRequester={changeRequester}
    >
      <CreateTicket requester={currentRequester} />
    </AppShell>
  ) : (
    <Navigate to="/select-requester" replace />
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          currentRequester ? (
            <Navigate to="/tickets" replace />
          ) : (
            <RootRequesterRedirect>
              {requesterPage}
            </RootRequesterRedirect>
          )
        }
      />

      <Route
        path="/select-requester"
        element={requesterPage}
      />

      <Route
        path="/tickets"
        element={protectedPage}
      />

      <Route
        path="/tickets/new"
        element={createTicketPage}
      />

      <Route
        path="/tickets/:ticketId"
        element={protectedPage}
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppRoutes />
    </BrowserRouter>
  );
}