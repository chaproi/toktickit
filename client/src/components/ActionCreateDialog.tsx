import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ApiRequestError, createAction, getStaffAssignees, getStaffTicketDetail,
  type ActionCreateInput, type ActionMutationResponse, type AuthUser, type EligibleAssignee,
} from "../api.js";

type Draft = {
  description: string; result: string; assigneeId: string;
  followUpRequired: boolean; followUpNote: string; attachmentNotes: string;
};
const editableParents = new Set(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]);
const count = (value: string) => Array.from(value.trim()).length;
const nullable = (value: string) => value.trim() || null;
const safeFailure = "Unable to load eligible workers. Please try again.";

function validate(draft: Draft, workers: EligibleAssignee[]): Record<string, string> {
  const fields: Record<string, string> = {};
  if (count(draft.description) < 5 || count(draft.description) > 2000) fields.description = "Description must contain 5–2000 code points.";
  if (count(draft.result) > 2000) fields.result = "Result must contain 1–2000 code points when provided.";
  if (count(draft.attachmentNotes) > 2000) fields.attachmentNotes = "Attachment Notes must contain at most 2000 code points.";
  if (draft.followUpRequired && (count(draft.followUpNote) < 1 || count(draft.followUpNote) > 2000)) fields.followUpNote = "A follow-up note of 1–2000 code points is required.";
  const assigneeId = Number(draft.assigneeId);
  if (!Number.isSafeInteger(assigneeId) || assigneeId <= 0 || !workers.some((worker) => worker.id === assigneeId)) fields.assigneeId = "Choose an active IT Staff member or Administrator.";
  return fields;
}

export default function ActionCreateDialog({ ticketId, ticketUpdatedAt, user, trigger, editable, onClose, onCreated }: {
  ticketId: number; ticketUpdatedAt: string; user: AuthUser; trigger: HTMLElement;
  editable: boolean; onClose: () => void; onCreated: (response: ActionMutationResponse) => Promise<void>;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const live = useRef(true);
  const sending = useRef(false);
  const reads = useRef(new Set<AbortController>());
  const workerNames = useRef(new Map<number, string>([[user.id, user.name]]));
  const command = useRef<ActionCreateInput | null>(null);
  const [draft, setDraft] = useState<Draft>({ description: "", result: "", assigneeId: String(user.id), followUpRequired: false, followUpNote: "", attachmentNotes: "" });
  const [workers, setWorkers] = useState<EligibleAssignee[]>([]);
  const [token, setToken] = useState(ticketUpdatedAt);
  const [reading, setReading] = useState(true);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [assigneeRecovery, setAssigneeRecovery] = useState(false);
  const [stale, setStale] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [committed, setCommitted] = useState(false);
  const permitted = editable && !frozen && user.role !== "REQUESTER" && !user.mustChangePassword;

  function handleAuth(caught: unknown) {
    if (caught instanceof ApiRequestError && ["PASSWORD_CHANGE_REQUIRED", "ROLE_FORBIDDEN"].includes(caught.code ?? "")) window.dispatchEvent(new Event("toktickit:auth-refresh"));
  }
  function remember(available: EligibleAssignee[]) {
    for (const worker of available) workerNames.current.set(worker.id, worker.name);
    setWorkers(available);
  }

  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    reads.current.add(controller);
    void getStaffAssignees(controller.signal).then((available) => {
      if (!controller.signal.aborted && live.current) {
        remember(available);
        if (!available.some((worker) => worker.id === user.id)) setFields({ assigneeId: "Your account is unavailable for assignment. Choose an active worker." });
      }
    }).catch((caught: unknown) => {
      if (controller.signal.aborted || !live.current) return;
      handleAuth(caught); setError(safeFailure); setLookupFailed(true);
    }).finally(() => { reads.current.delete(controller); if (!controller.signal.aborted && live.current) setReading(false); });
    return () => { live.current = false; for (const read of reads.current) read.abort(); reads.current.clear(); };
  }, [ticketId, user.id]);

  useEffect(() => {
    // Match the existing Action dialog: inert every sibling branch and restore prior state/focus.
    const previous: Array<{ target: HTMLElement; inert: boolean }> = [];
    let branch: HTMLElement | null = dialogRef.current;
    while (branch?.parentElement && branch !== document.body) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          previous.push({ target: sibling, inert: sibling.hasAttribute("inert") });
          sibling.setAttribute("inert", "");
        }
      }
      branch = branch.parentElement;
    }
    dialogRef.current?.focus();
    return () => { for (const { target, inert } of previous) if (!inert) target.removeAttribute("inert"); trigger.focus(); };
  }, [trigger]);

  useEffect(() => {
    if (busy) return;
    if (error) (dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? errorRef.current)?.focus();
    else if (!reading) dialogRef.current?.querySelector<HTMLElement>("textarea, select, button")?.focus();
  }, [busy, reading, error]);

  function close() { if (!sending.current) onClose(); }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)") ?? []);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function update(values: Partial<Draft>) {
    if (sending.current || uncertain || committed) return;
    setDraft((previous) => ({ ...previous, ...values }));
    // Editing the draft is a new intentional request; a lost response keeps its exact command instead.
    command.current = null; setError("");
    setFields((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !(key in values))));
    if (values.assigneeId !== undefined) setAssigneeRecovery(false);
  }

  async function reload(refreshTicket = false) {
    if (sending.current || uncertain || committed) return;
    const controller = new AbortController(); reads.current.add(controller);
    setReading(true); setError("");
    try {
      const [available, ticket] = await Promise.all([
        getStaffAssignees(controller.signal), refreshTicket ? getStaffTicketDetail(ticketId, controller.signal) : Promise.resolve(null),
      ]);
      if (!live.current || controller.signal.aborted) return;
      remember(available); setLookupFailed(false);
      // Never change the selected ID or draft when eligibility changes.
      const eligible = available.some((worker) => worker.id === Number(draft.assigneeId));
      setAssigneeRecovery(!eligible);
      setFields((previous) => ({ ...previous, assigneeId: eligible ? "" : "This selected worker is unavailable. Choose an active worker." }));
      if (ticket) { setToken(ticket.updatedAt); setFrozen(!editableParents.has(ticket.currentStatus)); setStale(false); }
      command.current = null;
    } catch (caught) {
      if (!live.current || controller.signal.aborted) return;
      handleAuth(caught); setError(safeFailure); setLookupFailed(true);
    } finally { reads.current.delete(controller); if (!controller.signal.aborted && live.current) setReading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || reading || !permitted || stale || committed) return;
    if (!uncertain) {
      const errors = validate(draft, workers);
      setFields(errors);
      if (Object.keys(errors).length > 0 || assigneeRecovery) {
        setError("Please correct the highlighted fields and choose an eligible worker.");
        return;
      }
      if (!command.current) command.current = {
        description: draft.description.trim(), result: nullable(draft.result), assigneeId: Number(draft.assigneeId),
        followUpRequired: draft.followUpRequired, followUpNote: draft.followUpRequired ? draft.followUpNote.trim() : null,
        attachmentNotes: nullable(draft.attachmentNotes), expectedTicketUpdatedAt: token, clientMutationId: crypto.randomUUID(),
      };
    }
    if (!command.current) return;
    sending.current = true; setBusy(true); setError(""); setFields({});
    let response: ActionMutationResponse;
    try {
      response = await createAction(ticketId, command.current);
    } catch (caught) {
      if (!live.current) return;
      handleAuth(caught);
      const knownRejection = caught instanceof ApiRequestError && [400, 401, 403, 404, 409, 429].includes(caught.status);
      if (knownRejection) { command.current = null; setUncertain(false); }
      else setUncertain(true);
      if (caught instanceof ApiRequestError && (caught.code === "ASSIGNEE_INELIGIBLE" || caught.code === "INVALID_ASSIGNEE")) {
        setAssigneeRecovery(true); setFields({ assigneeId: "This worker is no longer eligible. Reload assignees and choose an active worker." });
        setError("The Action was not created. Assignee eligibility changed. Reload assignees and review your selection.");
      } else if (caught instanceof ApiRequestError && caught.status === 400) {
        setFields(Object.fromEntries(Object.entries(caught.fields ?? {}).filter(([key]) => key in draft)));
        setError("Please correct the highlighted fields.");
      } else if (caught instanceof ApiRequestError && caught.code === "TICKET_ACTIONS_LOCKED") {
        setFrozen(true); setError("This Ticket no longer permits Action changes. Close and refresh the Ticket.");
      } else if (caught instanceof ApiRequestError && caught.status === 409) {
        setStale(true); setError("The request conflicted with a change. Refresh the Ticket and review your draft before trying again.");
      } else setError(knownRejection ? "The Action could not be created. Please review the request and try again." :
        "The create response could not be confirmed. Retry create sends the same request and mutation key; it does not create a second intentional request.");
      sending.current = false; setBusy(false);
      return;
    }
    if (!live.current) return;
    setCommitted(true); setUncertain(false);
    // Refresh errors after a confirmed write must never become mutation-failure/retry messages.
    try { await onCreated(response); }
    catch { if (live.current) setError("The Action was created, but refresh failed. Close and reload the Ticket before another change."); }
    finally { sending.current = false; if (live.current) setBusy(false); }
  }

  function textarea(name: "description" | "result" | "followUpNote" | "attachmentNotes", label: string, required = false) {
    return <div className="mb-3"><label className="form-label" htmlFor={`${id}-${name}`}>{label}</label>
      <textarea id={`${id}-${name}`} className="form-control" required={required} value={draft[name]} aria-invalid={Boolean(fields[name])}
        aria-describedby={fields[name] ? `${id}-${name}-error` : `${id}-bounds`} onChange={(event) => update({ [name]: event.target.value })} />
      {fields[name] && <p id={`${id}-${name}-error`} className="text-danger">{fields[name]}</p>}
    </div>;
  }
  const selectedAvailable = workers.some((worker) => worker.id === Number(draft.assigneeId));
  return <div className="attachment-dialog-backdrop"><div ref={dialogRef} tabIndex={-1} className="attachment-dialog" role="dialog" aria-modal="true"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-explanation`} onKeyDown={keyDown}>
    <h2 id={`${id}-title`} className="h4">Create Action</h2>
    <p id={`${id}-explanation`}>Description and Assigned to are required. Created by is your account; Ticket Owner is unchanged. Performed by is recorded on completion.</p>
    <p><strong>Action Date/Time:</strong> Automatic — assigned by the server when the Action is created.</p>
    {reading && <p role="status">Loading eligible workers…</p>}
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="alert alert-danger">{error}</div>}
    {!permitted && <p role="alert">This Ticket no longer permits creating Actions. Close and refresh the Ticket.</p>}
    {(lookupFailed || assigneeRecovery) && <button type="button" className="btn btn-outline-success mb-3" disabled={busy || reading || uncertain || committed} onClick={() => void reload()}>Reload assignees</button>}
    {stale && <button type="button" className="btn btn-outline-success mb-3" disabled={busy || reading} onClick={() => void reload(true)}>Refresh Ticket</button>}
    <form noValidate onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy || reading || uncertain || committed}>
        {textarea("description", "Description", true)}
        {textarea("result", "Result")}
        <div className="mb-3"><label className="form-label" htmlFor={`${id}-assigneeId`}>Assigned to</label>
          <select id={`${id}-assigneeId`} className="form-select" required value={draft.assigneeId} aria-invalid={Boolean(fields.assigneeId)}
            aria-describedby={fields.assigneeId ? `${id}-assigneeId-error` : `${id}-assignee-help`} onChange={(event) => update({ assigneeId: event.target.value })}>
            {!selectedAvailable && <option value={draft.assigneeId} disabled>Unavailable — {workerNames.current.get(Number(draft.assigneeId)) ?? "Selected worker"}</option>}
            {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
          </select>
          <p id={`${id}-assignee-help`} className="form-text">Only active IT Staff and Administrators are eligible. Assignment is independent of Ticket ownership.</p>
          {fields.assigneeId && <p id={`${id}-assigneeId-error`} className="text-danger">{fields.assigneeId}</p>}
        </div>
        <div className="form-check mb-3"><input id={`${id}-followUpRequired`} type="checkbox" className="form-check-input" checked={draft.followUpRequired}
          onChange={(event) => update({ followUpRequired: event.target.checked })} /><label className="form-check-label" htmlFor={`${id}-followUpRequired`}>Follow-up required</label></div>
        {draft.followUpRequired && textarea("followUpNote", "Follow-up note", true)}
        {textarea("attachmentNotes", "Attachment Notes")}
        <p id={`${id}-bounds`} className="form-text">Trimmed Description: 5–2000 Unicode code points. Optional Result and required follow-up note: 1–2000. Attachment Notes: up to 2000, plain text. Blank optional fields are stored as not recorded; no follow-up stores no note. Text is retained literally.</p>
      </fieldset>
      <div className="d-flex gap-2 justify-content-end mt-3"><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={close}>{committed ? "Close" : "Cancel"}</button>
        {!committed && <button type="submit" className="btn btn-success" disabled={busy || reading || !permitted || stale || lookupFailed}>{busy ? "Creating…" : uncertain ? "Retry create" : "Create action"}</button>}
      </div>
    </form>
  </div></div>;
}
