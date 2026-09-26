import { useEffect, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ApiRequestError,
  checkSystem,
  getCurrentUser,
  logout,
  type AuthenticationResponse,
  type AuthUser,
  type Category,
} from "./api.js";
import ChangePassword from "./components/ChangePassword.js";
import CreateTicket from "./components/CreateTicket.js";
import Login from "./components/Login.js";
import MyTickets from "./components/MyTickets.js";
import RequesterTicketDetail from "./components/RequesterTicketDetail.js";
import StaffTicketQueue from "./components/StaffTicketQueue.js";
import StaffTicketDetail from "./components/StaffTicketDetail.js";

const MOBILE_NAVIGATION_QUERY = "(max-width: 767.98px)";

function roleHome(user: AuthUser): string {
  if (user.role === "REQUESTER") return "/tickets";
  if (user.role === "IT_STAFF") return "/staff/tickets";
  return "/admin/users";
}

function roleLabel(user: AuthUser): string {
  if (user.role === "IT_STAFF") return "IT Staff";
  if (user.role === "ADMINISTRATOR") return "Administrator";
  return "Requester";
}

function useMediaQuery(query: string): boolean {
  const read = () => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function SystemCheck() {
  const [state, setState] = useState<"idle" | "checking" | "online" | "offline">("idle");
  const [categories, setCategories] = useState<Category[]>([]);

  async function runCheck() {
    if (state === "checking") return;
    setState("checking");
    setCategories([]);
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("online");
    } catch {
      setState("offline");
    }
  }

  return (
    <section className="card border-0 shadow-sm mb-4" aria-labelledby="system-check-heading">
      <div className="card-body p-3">
        <div className="d-flex flex-wrap align-items-center gap-3">
          <h2 id="system-check-heading" className="h5 mb-0">System Status</h2>
          <button
            type="button"
            className="btn btn-outline-success btn-sm"
            disabled={state === "checking"}
            onClick={() => void runCheck()}
          >
            {state === "checking" ? "Checking…" : "Check System"}
          </button>
          {state === "online" && <strong className="text-success" role="status">Online</strong>}
          {state === "offline" && <strong className="text-danger" role="alert">Offline</strong>}
        </div>
        {state === "online" && (
          <ul className="mb-0 mt-3" aria-label="Available support categories">
            {categories.map((category) => <li key={category.id}>{category.name}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}

function AppShell({
  user,
  notice,
  onLogout,
  children,
}: {
  user: AuthUser;
  notice: string;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const location = useLocation();
  const mobile = useMediaQuery(MOBILE_NAVIGATION_QUERY);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => setOpen(false), [location.pathname, mobile]);
  const nav = user.role === "REQUESTER"
    ? [["/tickets", "My Tickets"], ["/tickets/new", "Create Ticket"]]
    : user.role === "IT_STAFF"
      ? [["/staff/tickets", "Ticket Queue"]]
      : [["/admin/users", "User Management"], ["/staff/tickets", "Ticket Queue"]];

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await onLogout();
  }

  return (
    <div className="min-vh-100 bg-body-tertiary">
      <header className="navbar navbar-expand-md bg-success navbar-dark shadow-sm">
        <div className="container">
          <Link className="navbar-brand fw-semibold" to={roleHome(user)}>TokTickIT</Link>
          <button
            type="button"
            className="navbar-toggler app-navigation-toggle"
            hidden={!mobile}
            aria-label="Toggle primary navigation"
            aria-expanded={open}
            aria-controls="primary-navigation"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="navbar-toggler-icon" aria-hidden="true" />
          </button>
          <nav
            id="primary-navigation"
            className={`app-navigation align-items-center gap-3 ${!mobile || open ? "d-flex" : "d-none"}`}
            hidden={mobile && !open}
            aria-label="Primary navigation"
          >
            {nav.map(([to, label]) => (
              <Link
                key={to}
                className={`link-light ${location.pathname === to ? "active fw-semibold" : ""}`}
                aria-current={location.pathname === to ? "page" : undefined}
                to={to}
              >
                {label}
              </Link>
            ))}
            <Link className="link-light" to="/change-password">Change Password</Link>
          </nav>
        </div>
      </header>
      <main className="container py-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <p className="mb-0 fw-semibold">
            {user.name} <span className="badge text-bg-light">{roleLabel(user)}</span>
          </p>
          <button
            type="button"
            className="btn btn-outline-success"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
            {loggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <SystemCheck />
        {children}
      </main>
    </div>
  );
}

function Placeholder({ heading }: { heading: string }) {
  return (
    <section className="card border-0 shadow-sm">
      <div className="card-body p-4">
        <h1 className="h2">{heading}</h1>
        <p className="text-secondary mb-0">This role destination is reserved for a later Sprint 3 increment.</p>
      </div>
    </section>
  );
}

function Forbidden({ user, message = "This page is not available for your role." }: { user: AuthUser; message?: string }) {
  return (
    <section className="ticket-detail-state" role="alert">
      <div>
        <h1 className="h2">Forbidden</h1>
        <p>{message}</p>
        <Link className="btn btn-success" to={roleHome(user)}>Go to role home</Link>
      </div>
    </section>
  );
}

function AuthenticatedRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<"loading" | "signed-out" | "signed-in" | "error">("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState("");
  const [sessionMessage, setSessionMessage] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setState("loading");
    void getCurrentUser()
      .then((response) => {
        if (!active) return;
        setUser(response.user);
        setState("signed-in");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setUser(null);
        setState(error instanceof ApiRequestError && error.status === 401 ? "signed-out" : "error");
      });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    const expire = () => {
      setUser(null);
      setNotice("");
      setSessionMessage("Your session has expired. Please sign in again.");
      setState("signed-out");
      navigate("/login", { replace: true });
    };
    window.addEventListener("toktickit:auth-expired", expire);
    return () => window.removeEventListener("toktickit:auth-expired", expire);
  }, [navigate]);

  function authenticated(response: AuthenticationResponse) {
    setUser(response.user);
    setState("signed-in");
    setSessionMessage("");
    navigate(response.user.mustChangePassword ? "/change-password" : roleHome(response.user), {
      replace: true,
    });
  }

  async function endSession() {
    try {
      await logout();
    } catch {
      // Local protected state is still removed after the server response.
    } finally {
      setUser(null);
      setNotice("");
      setState("signed-out");
      navigate("/login", { replace: true });
    }
  }

  if (state === "loading") {
    return <main className="container py-5"><h1 className="h3">TokTickIT</h1><p role="status">Loading your session…</p></main>;
  }
  if (state === "error") {
    return (
      <main className="container py-5">
        <h1 className="h2">TokTickIT</h1>
        <div className="alert alert-danger" role="alert">Something went wrong. Please try again.</div>
        <button className="btn btn-success" type="button" onClick={() => setRetry((value) => value + 1)}>Try Again</button>
      </main>
    );
  }
  if (state === "signed-out" || !user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onAuthenticated={authenticated} sessionMessage={sessionMessage} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  if (user.mustChangePassword) {
    return (
      <Routes>
        <Route
          path="*"
          element={(
            <ChangePassword
              mandatory
              onLogout={() => void endSession()}
              onChanged={(response) => {
                setUser(response.user);
                setNotice("Password changed successfully.");
                navigate(roleHome(response.user), { replace: true });
              }}
            />
          )}
        />
      </Routes>
    );
  }

  const shell = (children: ReactNode) => (
    <AppShell user={user} notice={notice} onLogout={endSession}>{children}</AppShell>
  );
  return (
    <Routes>
      <Route path="/" element={<Navigate to={roleHome(user)} replace />} />
      <Route path="/login" element={<Navigate to={roleHome(user)} replace />} />
      <Route path="/select-requester" element={<Navigate to={roleHome(user)} replace />} />
      <Route
        path="/change-password"
        element={(
          <ChangePassword
            mandatory={false}
            onLogout={() => void endSession()}
            onChanged={(response) => {
              setUser(response.user);
              setNotice("Password changed successfully.");
              navigate(roleHome(response.user), { replace: true });
            }}
          />
        )}
      />
      <Route
        path="/tickets"
        element={user.role === "REQUESTER" ? shell(<MyTickets />) : shell(<Forbidden user={user} />)}
      />
      <Route
        path="/tickets/new"
        element={user.role === "REQUESTER" ? shell(<CreateTicket requester={user} />) : shell(<Forbidden user={user} />)}
      />
      <Route
        path="/tickets/:ticketId"
        element={user.role === "REQUESTER" ? shell(<RequesterTicketDetail />) : shell(<Forbidden user={user} />)}
      />
      <Route
        path="/staff/tickets"
        element={user.role !== "REQUESTER"
          ? shell(<StaffTicketQueue />)
          : shell(<Forbidden user={user} message="You do not have permission to view the Ticket Queue." />)}
      />
      <Route
        path="/staff/tickets/:ticketId"
        element={user.role !== "REQUESTER" ? shell(<StaffTicketDetail key={location.pathname} />) : shell(<Forbidden user={user} />)}
      />
      <Route
        path="/admin/users"
        element={user.role === "ADMINISTRATOR" ? shell(<Placeholder heading="User Management" />) : shell(<Forbidden user={user} />)}
      />
      <Route path="*" element={shell(<section className="ticket-detail-state"><h1 className="h2">Page not found</h1></section>)} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthenticatedRoutes />
    </BrowserRouter>
  );
}
