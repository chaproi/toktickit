import { useRef, useState, type FormEvent } from "react";
import {
  ApiRequestError,
  changePassword,
  type AuthenticationResponse,
} from "../api.js";

function policyError(value: string): string | undefined {
  const categories = [/[a-z]/u, /[A-Z]/u, /\d/u, /[^\p{L}\p{N}\s]/u]
    .filter((pattern) => pattern.test(value)).length;
  if (Array.from(value).length < 12 || Array.from(value).length > 128) {
    return "Password must contain between 12 and 128 characters.";
  }
  if (/\s/u.test(value) || categories < 3) {
    return "Use at least three of lowercase, uppercase, number, and symbol, with no whitespace.";
  }
  return undefined;
}

export default function ChangePassword({
  mandatory,
  onChanged,
  onLogout,
}: {
  mandatory: boolean;
  onChanged: (response: AuthenticationResponse) => void;
  onLogout: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  function clearPasswords() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const nextErrors: Record<string, string> = {};
    if (!currentPassword) nextErrors.currentPassword = "Current Password is required.";
    const policy = policyError(newPassword);
    if (policy) nextErrors.newPassword = policy;
    else if (newPassword === currentPassword) {
      nextErrors.newPassword = "New password must be different from the current password.";
    }
    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = "New passwords must match.";
    }
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) {
      queueMicrotask(() => summaryRef.current?.focus());
      return;
    }
    setBusy(true);
    try {
      onChanged(await changePassword({ currentPassword, newPassword, confirmPassword }));
    } catch (error) {
      const apiError = error instanceof ApiRequestError ? error : null;
      if (apiError?.code === "INVALID_CURRENT_PASSWORD") {
        setErrors({ currentPassword: "Current password is incorrect." });
      } else {
        setMessage("Something went wrong. Please try again.");
      }
      clearPasswords();
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
          <h1 className="h2">{mandatory ? "Create a new password" : "Change your password"}</h1>
          {mandatory && (
            <div className="alert alert-warning" role="status">
              You must replace the initial password before using TokTickIT.
            </div>
          )}
          <p>Use 12–128 characters and at least three of lowercase, uppercase, number, and symbol.</p>
          {(message || Object.keys(errors).length > 0) && (
            <div ref={summaryRef} className="alert alert-danger" role="alert" tabIndex={-1}>
              {message || "Please correct the highlighted fields."}
            </div>
          )}
          <form onSubmit={(event) => void submit(event)} noValidate>
            {[
              ["current-password", "Current Password", currentPassword, setCurrentPassword, "currentPassword"],
              ["new-password", "New Password", newPassword, setNewPassword, "newPassword"],
              ["confirm-password", "Confirm New Password", confirmPassword, setConfirmPassword, "confirmPassword"],
            ].map(([id, label, value, setter, errorKey]) => (
              <div className="mb-3" key={String(id)}>
                <label className="form-label fw-semibold" htmlFor={String(id)}>{String(label)}</label>
                <input
                  id={String(id)}
                  className={`form-control ${errors[String(errorKey)] ? "is-invalid" : ""}`}
                  type="password"
                  autoComplete={id === "current-password" ? "current-password" : "new-password"}
                  disabled={busy}
                  value={String(value)}
                  onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                />
                {errors[String(errorKey)] && (
                  <div className="invalid-feedback">{errors[String(errorKey)]}</div>
                )}
              </div>
            ))}
            <div className="d-flex flex-wrap gap-2">
              <button className="btn btn-success" type="submit" disabled={busy}>
                {busy ? "Saving password…" : "Save Password"}
              </button>
              <button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={onLogout}>
                Logout
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
