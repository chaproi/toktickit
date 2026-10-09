import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ApiRequestError, changeActionStatus, editAction, getStaffAssignees, getTicketAction,
  type ActionDTO, type ActionDetailResponse, type ActionEditFields, type ActionMutationResponse,
  type ActionStatusInput, type ActionTokens, type EligibleAssignee,
} from "../api.js";

export type ActionOperation = "edit" | "reassign" | "start" | "complete" | "cancel";
const titles: Record<ActionOperation, string> = {
  edit: "Edit Action", reassign: "Reassign Action", start: "Start Action", complete: "Complete Action", cancel: "Cancel Action",
};
const buttons: Record<ActionOperation, string> = {
  edit: "Save changes", reassign: "Save assignment", start: "Start action", complete: "Confirm completion", cancel: "Confirm cancellation",
};
const safeFailure = "Something went wrong. Please try again.";
const length = (value: string) => Array.from(value.trim()).length;
const bounded = (value: string, min: number, max: number) => length(value) >= min && length(value) <= max;
const nullable = (value: string) => value.trim() || null;
type Draft = { description: string; result: string; attachmentNotes: string; followUpRequired: boolean; followUpNote: string; assigneeId: string; reason: string };

export default function ActionOperationDialog({ ticketId, action, operation, trigger, editable, onClose, onSaved }: {
  ticketId: number; action: ActionDTO; operation: ActionOperation; trigger: HTMLElement | null;
  editable: boolean; onClose: () => void; onSaved: (response: ActionMutationResponse) => Promise<void>;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const live = useRef(true);
  const sending = useRef(false);
  const command = useRef<{ identity: string; input: ActionTokens & ActionEditFields | ActionStatusInput } | null>(null);
  const [current, setCurrent] = useState<ActionDetailResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [assignees, setAssignees] = useState<EligibleAssignee[]>([]);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [reading, setReading] = useState(true);

  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    void Promise.all([
      getTicketAction(ticketId, action.id, controller.signal),
      operation === "reassign" ? getStaffAssignees(controller.signal) : Promise.resolve([]),
    ]).then(([detail, workers]) => {
      if (!live.current) return;
      setCurrent(detail); setAssignees(workers);
      setDraft({ description: detail.action.description, result: detail.action.result ?? "", attachmentNotes: detail.action.attachmentNotes ?? "",
        followUpRequired: detail.action.followUpRequired, followUpNote: detail.action.followUpNote ?? "", assigneeId: String(detail.action.assignee.id), reason: "" });
    }).catch((caught: unknown) => {
      if (!live.current || controller.signal.aborted) return;
      setError(caught instanceof ApiRequestError && caught.status === 404 ? "Action not found." : safeFailure);
      if (caught instanceof ApiRequestError && ["PASSWORD_CHANGE_REQUIRED", "ROLE_FORBIDDEN"].includes(caught.code ?? "")) window.dispatchEvent(new Event("toktickit:auth-refresh"));
    }).finally(() => { if (live.current) setReading(false); });
    return () => { live.current = false; controller.abort(); };
  }, [action.id, operation, ticketId]);

  useEffect(() => {
    // Inert siblings at every ancestor, including content inside the Ticket page.
    const targets: HTMLElement[] = [];
    let branch: HTMLElement | null = dialogRef.current;
    while (branch?.parentElement && branch !== document.body) {
      const parent: HTMLElement = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) targets.push(sibling);
      }
      branch = parent;
    }
    const previous = targets.map((target) => ({ target, inert: target.hasAttribute("inert") }));
    previous.forEach(({ target }) => target.setAttribute("inert", ""));
    return () => { previous.forEach(({ target, inert }) => { if (!inert) target.removeAttribute("inert"); }); trigger?.focus(); };
  }, [trigger]);

  useEffect(() => {
    if (error && !busy) errorRef.current?.focus();
    else if (!reading) dialogRef.current?.querySelector<HTMLElement>("textarea, select, button")?.focus();
  }, [reading, clearing, error, busy]);

  function close() { if (!sending.current) { if (clearing) setClearing(false); else onClose(); } }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)") ?? []);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function update(values: Partial<Draft>) { setDraft((old) => old ? { ...old, ...values } : old); command.current = null; setFields({}); }
  const permitted = editable && current && ["PLANNED", "IN_PROGRESS"].includes(current.action.status) &&
    (operation !== "complete" || current.action.status === "IN_PROGRESS") && (operation !== "start" || current.action.status === "PLANNED");
  const valid = draft && permitted && (
    operation === "complete" ? bounded(draft.result, 1, 2000) :
    operation === "cancel" ? bounded(draft.reason, 5, 500) :
    operation === "reassign" ? assignees.some((worker) => worker.id === Number(draft.assigneeId)) && Number(draft.assigneeId) !== current.action.assignee.id :
    operation === "edit" ? bounded(draft.description, 5, 2000) && (draft.result.trim() === "" || bounded(draft.result, 1, 2000)) && length(draft.attachmentNotes) <= 2000 && (!draft.followUpRequired || bounded(draft.followUpNote, 1, 2000)) : true
  );

  async function refresh() {
    if (sending.current) return;
    setReading(true); setError("");
    try {
      const [detail, workers] = await Promise.all([getTicketAction(ticketId, action.id), operation === "reassign" ? getStaffAssignees() : Promise.resolve(assignees)]);
      if (!live.current) return;
      setCurrent(detail); setAssignees(workers); setConflict(false); command.current = null;
    } catch { if (live.current) setError(safeFailure); }
    finally { if (live.current) setReading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !draft || !current || sending.current || conflict) return;
    const changes: ActionEditFields = {};
    if (operation === "edit") {
      if (draft.description.trim() !== current.action.description) changes.description = draft.description.trim();
      if (nullable(draft.result) !== current.action.result) changes.result = nullable(draft.result);
      if (nullable(draft.attachmentNotes) !== current.action.attachmentNotes) changes.attachmentNotes = nullable(draft.attachmentNotes);
      if (draft.followUpRequired !== current.action.followUpRequired) {
        changes.followUpRequired = draft.followUpRequired;
        changes.followUpNote = draft.followUpRequired ? draft.followUpNote.trim() : null;
      } else if (draft.followUpRequired && draft.followUpNote.trim() !== current.action.followUpNote) changes.followUpNote = draft.followUpNote.trim();
      if (Object.keys(changes).length === 0) { setError("No changes to save."); return; }
    }
    if (operation === "reassign") changes.assigneeId = Number(draft.assigneeId);
    const payload = operation === "edit" || operation === "reassign" ? changes : operation === "start" ? { targetStatus: "IN_PROGRESS" as const } :
      operation === "complete" ? { targetStatus: "COMPLETED" as const, confirm: true as const, result: draft.result.trim() } : { targetStatus: "CANCELLED" as const, confirm: true as const, reason: draft.reason.trim() };
    const tokens = { expectedVersion: current.action.version, expectedTicketUpdatedAt: current.ticketUpdatedAt };
    const identity = JSON.stringify({ ...tokens, ...payload });
    if (!command.current || command.current.identity !== identity) command.current = { identity, input: { ...tokens, ...payload, clientMutationId: crypto.randomUUID() } };
    sending.current = true; setBusy(true); setError(""); setFields({});
    try {
      const response = operation === "edit" || operation === "reassign" ? await editAction(ticketId, action.id, command.current.input) :
        await changeActionStatus(ticketId, action.id, command.current.input as ActionStatusInput);
      if (live.current) await onSaved(response);
    } catch (caught) {
      if (!live.current) return;
      if (caught instanceof ApiRequestError && ["PASSWORD_CHANGE_REQUIRED", "ROLE_FORBIDDEN"].includes(caught.code ?? "")) window.dispatchEvent(new Event("toktickit:auth-refresh"));
      if (caught instanceof ApiRequestError && caught.status === 400) setFields(caught.fields ?? {});
      const stale = caught instanceof ApiRequestError && caught.status === 409;
      setConflict(stale);
      setError(stale ? "The Action changed. Refresh and review it before trying again." : safeFailure);
    } finally { sending.current = false; if (live.current) setBusy(false); }
  }

  const title = clearing ? "Clear follow-up note?" : titles[operation];
  function textarea(name: keyof Draft, label: string, required = false) {
    const value = draft?.[name];
    return <div className="mb-3"><label className="form-label" htmlFor={`${id}-${name}`}>{label}</label>
      <textarea id={`${id}-${name}`} className="form-control" required={required} disabled={busy} value={typeof value === "string" ? value : ""}
        aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `${id}-${name}-error` : undefined}
        onChange={(event) => update({ [name]: event.target.value })} />
      {fields[name] && <p id={`${id}-${name}-error`} className="text-danger">{fields[name]}</p>}</div>;
  }
  return <div className="attachment-dialog-backdrop"><div ref={dialogRef} className="attachment-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-explanation`} onKeyDown={keyDown}>
    <h2 id={`${id}-title`} className="h4">{title}</h2>
    <p id={`${id}-explanation`}>{clearing ? "Clearing removes the current note. Its previous value remains in history." : "Changes are confirmed by the server. Created by and Action Date/Time remain unchanged."}</p>
    {reading && <p role="status">Loading Action…</p>}
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="alert alert-danger">{error}{conflict && <button type="button" className="btn btn-outline-success" disabled={busy} onClick={() => void refresh()}>Refresh Action</button>}</div>}
    {!reading && current && !permitted && <p role="alert">This Action is no longer editable. Close and refresh the Ticket.</p>}
    {clearing ? <div className="d-flex gap-2 justify-content-end"><button type="button" className="btn btn-outline-secondary" onClick={() => setClearing(false)}>Keep note</button>
      <button type="button" className="btn btn-danger" onClick={() => { update({ followUpRequired: false, followUpNote: "" }); setClearing(false); }}>Clear note</button></div> :
      <form noValidate onSubmit={(event) => void submit(event)}>
        {draft && !reading && <fieldset disabled={busy}>
          {operation === "edit" && <>{textarea("description", "Description", true)}{textarea("result", "Result")}{textarea("attachmentNotes", "Attachment Notes")}
            <div className="form-check mb-3"><input id={`${id}-followUpRequired`} className="form-check-input" type="checkbox" checked={draft.followUpRequired} onChange={(event) => {
              if (!event.target.checked && (draft.followUpNote.trim() || current?.action.followUpRequired && current.action.followUpNote !== null)) setClearing(true);
              else update({ followUpRequired: event.target.checked, followUpNote: event.target.checked ? draft.followUpNote : "" });
            }} /><label className="form-check-label" htmlFor={`${id}-followUpRequired`}>Follow-up required</label></div>
            {draft.followUpRequired && textarea("followUpNote", "Follow-up note", true)}
            <p className="form-text">Description: 5–2000 code points. Result and required follow-up note: 1–2000. Attachment Notes: up to 2000. Text is retained literally.</p>
          </>}
          {operation === "reassign" && <><label className="form-label" htmlFor={`${id}-assigneeId`}>Assigned to</label>
            <select id={`${id}-assigneeId`} className="form-select" value={draft.assigneeId} onChange={(event) => update({ assigneeId: event.target.value })}>
              {!assignees.some((worker) => worker.id === Number(draft.assigneeId)) && <option value={draft.assigneeId} disabled>Unavailable — {current?.action.assignee.name}</option>}
              {assignees.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
            </select><p className="form-text">Only active IT Staff and Administrators are eligible. Ticket Owner is unchanged.</p>{fields.assigneeId && <p className="text-danger" role="alert">{fields.assigneeId}</p>}</>}
          {operation === "complete" && <>{textarea("result", "Result", true)}<p className="form-text">Result: 1–2000 code points. You will be recorded as Performed by. Existing follow-up information remains.</p></>}
          {operation === "cancel" && <>{textarea("reason", "Cancellation reason", true)}<p className="form-text">Reason: 5–500 code points. Existing content and draft result remain.</p></>}
        </fieldset>}
        <div className="d-flex gap-2 justify-content-end mt-3"><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={close}>Cancel</button>
          <button type="submit" className={`btn ${operation === "cancel" ? "btn-danger" : "btn-success"}`} disabled={busy || reading || !valid || conflict}>{busy ? "Saving…" : buttons[operation]}</button></div>
      </form>}
  </div></div>;
}
