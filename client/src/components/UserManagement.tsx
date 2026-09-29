import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ApiRequestError,
  createAdminUser,
  getAdminUsers,
  setAdminInitialPassword,
  updateAdminUser,
  type AdminUser,
  type AuthUser,
  type UserRole,
} from "../api.js";

const SAFE_ERROR = "Something went wrong. Please try again.";
const ROLES: ReadonlyArray<{ value: UserRole; label: string }> = [
  { value: "REQUESTER", label: "Requester" },
  { value: "IT_STAFF", label: "IT Staff" },
  { value: "ADMINISTRATOR", label: "Administrator" },
];

type UserForm = { name: string; email: string; role: UserRole; isActive: boolean };
type PasswordForm = { initialPassword: string; confirmPassword: string };
type DialogState =
  | { kind: "create" }
  | { kind: "edit"; user: AdminUser }
  | { kind: "password"; user: AdminUser }
  | null;

function roleLabel(role: UserRole): string {
  return ROLES.find(({ value }) => value === role)?.label ?? role;
}

function userForm(user?: AdminUser): UserForm {
  return {
    name: user?.name ?? "",
    email: user?.email ?? "",
    role: user?.role ?? "REQUESTER",
    isActive: user?.isActive ?? true,
  };
}

function validateUser(values: UserForm): Record<string, string> {
  const fields: Record<string, string> = {};
  const nameLength = Array.from(values.name.trim()).length;
  if (nameLength < 2 || nameLength > 120) fields.name = "Name must contain between 2 and 120 characters.";
  const email = values.email.trim();
  if (Array.from(email).length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    fields.email = "Enter a valid email address.";
  }
  return fields;
}

function validatePasswords(values: PasswordForm): Record<string, string> {
  const fields: Record<string, string> = {};
  const length = Array.from(values.initialPassword).length;
  const categories = [
    /\p{Ll}/u.test(values.initialPassword),
    /\p{Lu}/u.test(values.initialPassword),
    /\p{Nd}/u.test(values.initialPassword),
    /[^\p{L}\p{N}\s]/u.test(values.initialPassword),
  ].filter(Boolean).length;
  if (length < 12 || length > 128 || values.initialPassword.trim().length === 0 || categories < 3) {
    fields.initialPassword = "Use 12–128 characters and at least three of lowercase, uppercase, number, and symbol.";
  }
  if (values.confirmPassword !== values.initialPassword) fields.confirmPassword = "Password confirmation must match.";
  return fields;
}

function AdminDialog({
  title,
  description,
  processing,
  initialFocus,
  onClose,
  children,
}: {
  title: string;
  description: string;
  processing: boolean;
  initialFocus: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = `admin-dialog-${title.replaceAll(" ", "-").toLowerCase()}`;
  const descriptionId = `${titleId}-description`;
  useEffect(() => { initialFocus.current?.focus(); }, [initialFocus]);
  useEffect(() => {
    const element = dialog.current;
    const main = element?.closest("main");
    const shell = main?.parentElement;
    const targets = [
      shell?.querySelector<HTMLElement>(":scope > header"),
      ...Array.from(main?.children ?? []).filter((child): child is HTMLElement =>
        child instanceof HTMLElement && !child.contains(element ?? null)),
    ].filter((target): target is HTMLElement => Boolean(target));
    const previous = targets.map((target) => ({ target, inert: target.hasAttribute("inert") }));
    for (const { target } of previous) target.setAttribute("inert", "");
    return () => {
      for (const { target, inert } of previous) if (!inert) target.removeAttribute("inert");
    };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !processing) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(element.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
      ));
      if (controls.length === 0) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      const active = event.target instanceof HTMLElement && controls.includes(event.target)
        ? event.target
        : document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); first.focus();
      }
    };
    element.addEventListener("keydown", keyDown);
    return () => element.removeEventListener("keydown", keyDown);
  }, [onClose, processing]);

  return (
    <div className="attachment-dialog-backdrop">
      <div
        ref={dialog}
        className="attachment-dialog admin-user-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className="h4">{title}</h2>
        <p id={descriptionId} className="text-secondary">{description}</p>
        {children}
      </div>
    </div>
  );
}

function UserFields({
  values,
  errors,
  disabled,
  protectRoleAndStatus,
  onChange,
  initialFocus,
}: {
  values: UserForm;
  errors: Record<string, string>;
  disabled: boolean;
  protectRoleAndStatus: boolean;
  onChange: (values: UserForm) => void;
  initialFocus?: RefObject<HTMLInputElement>;
}) {
  return (
    <div className="admin-user-form-grid">
      <div className="admin-user-form-wide">
        <label className="form-label" htmlFor="admin-user-name">Name</label>
        <input ref={initialFocus} id="admin-user-name" className={`form-control ${errors.name ? "is-invalid" : ""}`}
          value={values.name} disabled={disabled} onChange={(event) => onChange({ ...values, name: event.target.value })} />
        {errors.name && <div className="invalid-feedback">{errors.name}</div>}
      </div>
      <div className="admin-user-form-wide">
        <label className="form-label" htmlFor="admin-user-email">Email</label>
        <input id="admin-user-email" type="email" autoComplete="email"
          className={`form-control ${errors.email ? "is-invalid" : ""}`}
          value={values.email} disabled={disabled} onChange={(event) => onChange({ ...values, email: event.target.value })} />
        {errors.email && <div className="invalid-feedback">{errors.email}</div>}
      </div>
      <div>
        <label className="form-label" htmlFor="admin-user-role">Role</label>
        <select id="admin-user-role" className="form-select" value={values.role}
          disabled={disabled || protectRoleAndStatus}
          onChange={(event) => onChange({ ...values, role: event.target.value as UserRole })}>
          {ROLES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label" htmlFor="admin-user-status">Status</label>
        <select id="admin-user-status" className="form-select" value={values.isActive ? "active" : "inactive"}
          disabled={disabled || protectRoleAndStatus}
          onChange={(event) => onChange({ ...values, isActive: event.target.value === "active" })}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
    </div>
  );
}

function PasswordFields({
  values,
  errors,
  disabled,
  onChange,
  initialFocus,
}: {
  values: PasswordForm;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (values: PasswordForm) => void;
  initialFocus?: RefObject<HTMLInputElement>;
}) {
  return (
    <>
      <div className="mb-3">
        <label className="form-label" htmlFor="admin-initial-password">Initial Password</label>
        <input ref={initialFocus} id="admin-initial-password" type="password" autoComplete="new-password"
          className={`form-control ${errors.initialPassword ? "is-invalid" : ""}`}
          value={values.initialPassword} disabled={disabled}
          onChange={(event) => onChange({ ...values, initialPassword: event.target.value })} />
        {errors.initialPassword && <div className="invalid-feedback">{errors.initialPassword}</div>}
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="admin-confirm-password">Confirm Initial Password</label>
        <input id="admin-confirm-password" type="password" autoComplete="new-password"
          className={`form-control ${errors.confirmPassword ? "is-invalid" : ""}`}
          value={values.confirmPassword} disabled={disabled}
          onChange={(event) => onChange({ ...values, confirmPassword: event.target.value })} />
        {errors.confirmPassword && <div className="invalid-feedback">{errors.confirmPassword}</div>}
      </div>
      <p className="small text-secondary">Use 12–128 characters and at least three of lowercase, uppercase, number, and symbol. The User must change this password at next login. It is not emailed or retrievable.</p>
    </>
  );
}

export default function UserManagement({ currentUser }: { currentUser: AuthUser }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [draftRole, setDraftRole] = useState<UserRole | "">("");
  const [query, setQuery] = useState<{ search?: string; role?: UserRole }>({});
  const [dialog, setDialog] = useState<DialogState>(null);
  const [values, setValues] = useState<UserForm>(userForm());
  const [passwords, setPasswords] = useState<PasswordForm>({ initialPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingFocusId, setPendingFocusId] = useState<number | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const initialFocus = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<number, HTMLElement>());
  const loadRequest = useRef(0);
  const pendingReloadId = useRef<number | null>(null);
  const focusReloadedSelection = useRef(false);
  const [mobile, setMobile] = useState(() =>
    typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767.98px)").matches);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 767.98px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const requestId = ++loadRequest.current;
    const reloadId = pendingReloadId.current;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setUsers([]);
    void getAdminUsers(query, controller.signal)
      .then((items) => {
        if (requestId !== loadRequest.current || controller.signal.aborted) return;
        setUsers(items);
        if (reloadId !== null) {
          pendingReloadId.current = null;
          setFormError("");
          const fresh = items.find(({ id }) => id === reloadId);
          if (fresh) {
            setValues(userForm(fresh)); setDialog({ kind: "edit", user: fresh });
            setNotice("Latest User details loaded.");
            focusReloadedSelection.current = true;
          } else {
            setDialog(null); setNotice("Latest User list loaded.");
            setPendingFocusId(reloadId);
          }
        }
      })
      .catch((error: unknown) => {
        if (requestId !== loadRequest.current ||
          (error instanceof DOMException && error.name === "AbortError")) return;
        if (reloadId !== null) {
          setFormError(SAFE_ERROR);
          queueMicrotask(() => alertRef.current?.focus());
        } else setLoadError(SAFE_ERROR);
      })
      .finally(() => {
        if (requestId === loadRequest.current && !controller.signal.aborted) {
          setLoading(false);
          if (reloadId !== null) setSaving(false);
        }
      });
    return () => controller.abort();
  }, [query, retry]);

  useEffect(() => {
    if (pendingFocusId === null || loading) return;
    (rowRefs.current.get(pendingFocusId) ?? searchRef.current)?.focus();
    setPendingFocusId(null);
  }, [loading, pendingFocusId, users]);

  useEffect(() => {
    if (saving || !focusReloadedSelection.current) return;
    focusReloadedSelection.current = false;
    initialFocus.current?.focus();
  }, [dialog, saving]);

  function sort(items: AdminUser[]): AdminUser[] {
    return [...items].sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.id - right.id);
  }

  function rememberTrigger(element: HTMLElement) { trigger.current = element; }
  function refreshUsers(focusId: number, reloadSelection = false) {
    pendingReloadId.current = reloadSelection ? focusId : null;
    setLoading(true);
    setUsers([]);
    setPendingFocusId(reloadSelection ? null : focusId);
    setRetry((value) => value + 1);
  }
  function closeDialog() {
    if (saving) return;
    pendingReloadId.current = null;
    setDialog(null);
    setPasswords({ initialPassword: "", confirmPassword: "" });
    setErrors({});
    setFormError("");
    queueMicrotask(() => trigger.current?.focus());
  }
  function openCreate(element: HTMLElement) {
    rememberTrigger(element);
    setValues(userForm());
    setPasswords({ initialPassword: "", confirmPassword: "" });
    setErrors({}); setFormError(""); setDialog({ kind: "create" });
  }
  function openEdit(user: AdminUser, element: HTMLElement) {
    rememberTrigger(element);
    setValues(userForm(user));
    setErrors({}); setFormError(""); setDialog({ kind: "edit", user });
  }
  function openPassword(user: AdminUser) {
    setPasswords({ initialPassword: "", confirmPassword: "" });
    setErrors({}); setFormError(""); setDialog({ kind: "password", user });
  }

  function showFormError(error: unknown) {
    const request = error instanceof ApiRequestError ? error : null;
    setErrors(request?.fields ?? {});
    if (request?.code === "EMAIL_ALREADY_EXISTS") setErrors({ email: request.message });
    const messages: Record<string, string> = {
      STALE_WRITE: "This user changed since you opened the form. Reload the latest details.",
      CONCURRENT_UPDATE: "This user changed concurrently. Reload the latest details.",
      USER_HAS_NON_TERMINAL_TICKETS: "Reassign or unassign this User's non-terminal Tickets first.",
      LAST_ACTIVE_ADMIN_REQUIRED: "At least one active Administrator is required.",
      SELF_ADMIN_CHANGE_FORBIDDEN: "You cannot deactivate your own account or change your own role.",
      EMAIL_ALREADY_EXISTS: request?.message ?? "A User with this email already exists.",
    };
    setFormError((request?.code && messages[request.code]) || request?.message || SAFE_ERROR);
    queueMicrotask(() => alertRef.current?.focus());
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const validation = { ...validateUser(values), ...validatePasswords(passwords) };
    if (Object.keys(validation).length > 0) {
      setErrors(validation); setFormError("Please correct the highlighted fields.");
      queueMicrotask(() => alertRef.current?.focus()); return;
    }
    setSaving(true); setErrors({}); setFormError("");
    try {
      const response = await createAdminUser({
        name: values.name.trim(), email: values.email.trim(), role: values.role,
        isActive: values.isActive, ...passwords,
      });
      setDialog(null); setPasswords({ initialPassword: "", confirmPassword: "" });
      setNotice(`${response.user.name} was created.`); refreshUsers(response.user.id);
    } catch (error) { showFormError(error); }
    finally { setSaving(false); }
  }

  async function submitEdit(event: FormEvent, selected: AdminUser) {
    event.preventDefault();
    if (saving) return;
    const validation = validateUser(values);
    if (Object.keys(validation).length > 0) {
      setErrors(validation); setFormError("Please correct the highlighted fields.");
      queueMicrotask(() => alertRef.current?.focus()); return;
    }
    setSaving(true); setErrors({}); setFormError("");
    try {
      const response = await updateAdminUser(selected.id, {
        name: values.name.trim(), email: values.email.trim(), role: values.role,
        isActive: values.isActive, expectedUpdatedAt: selected.updatedAt,
      });
      setDialog(null); setNotice(`${response.user.name} was saved.`); refreshUsers(response.user.id);
    } catch (error) { showFormError(error); }
    finally { setSaving(false); }
  }

  function reloadSelected(selected: AdminUser) {
    if (saving) return;
    setSaving(true); setErrors({});
    refreshUsers(selected.id, true);
  }

  async function submitPassword(event: FormEvent, selected: AdminUser) {
    event.preventDefault();
    if (saving) return;
    const validation = validatePasswords(passwords);
    if (Object.keys(validation).length > 0) {
      setErrors(validation); setFormError("Please correct the highlighted fields.");
      queueMicrotask(() => alertRef.current?.focus()); return;
    }
    setSaving(true); setErrors({}); setFormError("");
    try {
      const response = await setAdminInitialPassword(selected.id, passwords.initialPassword, passwords.confirmPassword);
      setUsers((current) => sort(current.map((item) => item.id === response.user.id ? response.user : item)));
      setPasswords({ initialPassword: "", confirmPassword: "" });
      setValues(userForm(response.user)); setDialog({ kind: "edit", user: response.user });
      setNotice("A new initial password was set. The user must change it at next login.");
      queueMicrotask(() => initialFocus.current?.focus());
    } catch (error) { setPasswords({ initialPassword: "", confirmPassword: "" }); showFormError(error); }
    finally { setSaving(false); }
  }

  const applied = Boolean(query.search || query.role);
  const selected = dialog && dialog.kind !== "create" ? dialog.user : null;
  const preservesTerminalOwnership = selected !== null && (
    (selected.isActive && !values.isActive) ||
    (selected.role !== "REQUESTER" && values.role === "REQUESTER")
  );
  return (
    <section className="card border-0 shadow-sm admin-user-management" aria-labelledby="user-management-heading">
      <div className="card-body p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div><h1 id="user-management-heading" className="h2 mb-1">User Management</h1><p className="text-secondary mb-0">Create and maintain TokTickIT user access.</p></div>
          <button type="button" className="btn btn-success" disabled={loading} onClick={(event) => openCreate(event.currentTarget)}>Create User</button>
        </div>
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <form className="admin-user-filters mb-4" onSubmit={(event) => {
          event.preventDefault();
          if (loading) return;
          setLoading(true); setUsers([]);
          setQuery({ ...(draftSearch.trim() ? { search: draftSearch.trim() } : {}), ...(draftRole ? { role: draftRole } : {}) });
        }}>
          <div><label className="form-label" htmlFor="admin-user-search">Search users</label><input ref={searchRef} id="admin-user-search" className="form-control" value={draftSearch} maxLength={100} disabled={loading} onChange={(event) => setDraftSearch(event.target.value)} /></div>
          <div><label className="form-label" htmlFor="admin-role-filter">Role</label><select id="admin-role-filter" className="form-select" value={draftRole} disabled={loading} onChange={(event) => setDraftRole(event.target.value as UserRole | "")}><option value="">All roles</option>{ROLES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="d-flex flex-wrap gap-2 align-self-end"><button type="submit" className="btn btn-success" disabled={loading}>Search</button><button type="button" className="btn btn-outline-secondary" disabled={loading} onClick={() => { setLoading(true); setUsers([]); setDraftSearch(""); setDraftRole(""); setQuery({}); }}>Clear Search</button></div>
        </form>
        {loading && <div className="my-tickets-state"><p role="status">Loading users…</p><div className="staff-queue-skeleton admin-user-skeleton" aria-hidden="true"><span /><span /><span /></div></div>}
        {!loading && loadError && <div className="alert alert-danger" role="alert"><p>{loadError}</p><button type="button" className="btn btn-outline-danger" onClick={() => setRetry((value) => value + 1)}>Try Again</button></div>}
        {!loading && !loadError && users.length === 0 && <div className="ticket-detail-state"><div><p>{applied ? "No users match the current search." : "No users are available."}</p>{!applied && <button type="button" className="btn btn-success" onClick={(event) => openCreate(event.currentTarget)}>Create User</button>}</div></div>}
        {!loading && !loadError && users.length > 0 && (
          <>
            <div className="table-responsive admin-user-table-wrap">
              <table className="table align-middle" aria-label="Users"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Edit</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><span tabIndex={-1} ref={(element) => { if (element) rowRefs.current.set(user.id, element); else rowRefs.current.delete(user.id); }}>{user.name}</span></td><td className="text-break">{user.email}</td><td>{roleLabel(user.role)}</td><td>{user.isActive ? "Active" : "Inactive"}</td><td><button type="button" className="btn btn-outline-success btn-sm" aria-label={`Edit ${user.name}`} onClick={(event) => openEdit(user, event.currentTarget)}>Edit</button></td></tr>)}</tbody></table>
            </div>
            <div className="admin-user-cards" aria-label="Users on small screens">{mobile && users.map((user) => <article key={user.id} className="card"><div className="card-body"><h2 className="h5" tabIndex={-1} ref={(element) => { if (element) rowRefs.current.set(user.id, element); }}>{user.name}</h2><dl><dt>Email</dt><dd className="text-break">{user.email}</dd><dt>Role</dt><dd>{roleLabel(user.role)}</dd><dt>Status</dt><dd>{user.isActive ? "Active" : "Inactive"}</dd></dl><button type="button" className="btn btn-outline-success" aria-label={`Edit ${user.name}`} onClick={(event) => openEdit(user, event.currentTarget)}>Edit</button></div></article>)}</div>
          </>
        )}
      </div>

      {dialog?.kind === "create" && <AdminDialog title="Create User" description="Create one User with one role and an initial password." processing={saving} initialFocus={initialFocus} onClose={closeDialog}><form onSubmit={(event) => void submitCreate(event)}>{formError && <div ref={alertRef} tabIndex={-1} className="alert alert-danger" role="alert">{formError}</div>}<UserFields values={values} errors={errors} disabled={saving} protectRoleAndStatus={false} onChange={setValues} initialFocus={initialFocus} /><div className="mt-3"><PasswordFields values={passwords} errors={errors} disabled={saving} onChange={setPasswords} /></div><div className="d-flex flex-wrap gap-2"><button type="submit" className="btn btn-success" disabled={saving}>{saving ? "Creating user…" : "Create User"}</button><button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={closeDialog}>Cancel</button></div></form></AdminDialog>}

      {dialog?.kind === "edit" && selected && <AdminDialog title={`Edit ${selected.name}`} description="Edit approved profile and access fields." processing={saving} initialFocus={initialFocus} onClose={closeDialog}><form onSubmit={(event) => void submitEdit(event, selected)}>{formError && <div ref={alertRef} tabIndex={-1} className="alert alert-danger" role="alert">{formError}</div>}{selected.id === currentUser.id && <p className="alert alert-info">You cannot change your own role or deactivate your own account here.</p>}<UserFields values={values} errors={errors} disabled={saving} protectRoleAndStatus={selected.id === currentUser.id} onChange={setValues} initialFocus={initialFocus} /><p className="mt-3 mb-2"><strong>{`Password change required: ${selected.mustChangePassword ? "Yes" : "No"}`}</strong></p>{preservesTerminalOwnership && <p className="alert alert-info">Historical owner references on CLOSED and CANCELLED Tickets remain preserved.</p>}{selected.role === "REQUESTER" && values.role !== "REQUESTER" && <p className="alert alert-warning">Current permissions will change. Existing submitted Tickets remain attributed to this historical User.</p>}<div className="d-flex flex-wrap gap-2"><button type="submit" className="btn btn-success" disabled={saving}>{saving ? "Saving user…" : "Save User"}</button>{selected.id !== currentUser.id && <button type="button" className="btn btn-outline-success" disabled={saving} onClick={() => openPassword(selected)}>Set New Initial Password</button>}{pendingReloadId.current === selected.id || ["STALE_WRITE", "CONCURRENT_UPDATE"].some((code) => formError.includes(code)) || formError.includes("changed") ? <button type="button" className="btn btn-outline-warning" disabled={saving} onClick={() => void reloadSelected(selected)}>Reload User</button> : null}<button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={closeDialog}>Cancel</button></div></form></AdminDialog>}

      {dialog?.kind === "password" && selected && <AdminDialog title="Set New Initial Password" description={`Set a new initial password for ${selected.name}. All current sessions will end.`} processing={saving} initialFocus={initialFocus} onClose={closeDialog}><form onSubmit={(event) => void submitPassword(event, selected)}>{formError && <div ref={alertRef} tabIndex={-1} className="alert alert-danger" role="alert">{formError}</div>}<PasswordFields values={passwords} errors={errors} disabled={saving} onChange={setPasswords} initialFocus={initialFocus} /><div className="d-flex flex-wrap gap-2"><button type="submit" className="btn btn-success" disabled={saving}>{saving ? "Setting password…" : "Set Initial Password"}</button><button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={closeDialog}>Cancel</button></div></form></AdminDialog>}
    </section>
  );
}
