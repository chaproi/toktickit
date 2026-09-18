import { useRef, useState, type FormEvent } from "react";
import { ApiRequestError, login, type AuthenticationResponse } from "../api.js";

export default function Login({
  onAuthenticated,
  sessionMessage,
}: {
  onAuthenticated: (response: AuthenticationResponse) => void;
  sessionMessage?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const nextErrors: Record<string, string> = {};
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) nextErrors.password = "Password is required.";
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) {
      queueMicrotask(() => summaryRef.current?.focus());
      return;
    }
    setBusy(true);
    try {
      onAuthenticated(await login(normalizedEmail, password));
    } catch (error) {
      const apiError = error instanceof ApiRequestError ? error : null;
      if (apiError?.code === "ACCOUNT_INACTIVE") {
        setMessage("This account is inactive. Contact an Administrator.");
      } else if (apiError?.code === "ORIGIN_REQUIRED" || apiError?.code === "ORIGIN_FORBIDDEN") {
        setMessage("The sign-in request could not be verified. Reload this page and try again.");
      } else if (apiError?.code === "LOGIN_THROTTLED") {
        const retry = apiError.retryAfterSeconds;
        setMessage(retry
          ? `Too many login attempts. Try again in ${retry} seconds.`
          : "Too many login attempts. Please try again later.");
      } else if (apiError?.code === "INVALID_CREDENTIALS") {
        setMessage("Email or password is incorrect.");
      } else {
        setMessage("Something went wrong. Please try again.");
      }
      setPassword("");
      queueMicrotask(() => summaryRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page container py-5">
      <section className="card border-0 shadow-sm auth-card mx-auto">
        <div className="card-body p-4 p-md-5">
          <p className="text-success fw-semibold mb-2">TokTickIT</p>
          <h1 className="h2">Sign in</h1>
          {sessionMessage && <div className="alert alert-info" role="status">{sessionMessage}</div>}
          {(message || Object.keys(errors).length > 0) && (
            <div ref={summaryRef} className="alert alert-danger" role="alert" tabIndex={-1}>
              {message || "Please correct the highlighted fields."}
            </div>
          )}
          <form onSubmit={(event) => void submit(event)} noValidate>
            <div className="mb-3">
              <label className="form-label fw-semibold" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className={`form-control ${errors.email ? "is-invalid" : ""}`}
                type="email"
                autoComplete="email"
                disabled={busy}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              {errors.email && <div className="invalid-feedback">{errors.email}</div>}
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className={`form-control ${errors.password ? "is-invalid" : ""}`}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                disabled={busy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {errors.password && <div className="invalid-feedback">{errors.password}</div>}
            </div>
            <div className="form-check mb-4">
              <input
                id="show-login-password"
                className="form-check-input"
                type="checkbox"
                checked={showPassword}
                disabled={busy}
                onChange={(event) => setShowPassword(event.target.checked)}
              />
              <label className="form-check-label" htmlFor="show-login-password">Show password</label>
            </div>
            <button className="btn btn-success w-100" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
