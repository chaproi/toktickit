import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ApiRequestError, changeActionStatus, editAction, getStaffAssignees, getStaffTicketDetail, getTicketAction,
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
const editableParents = new Set(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]);
type Draft = { description: string; result: string; attachmentNotes: string; followUpRequired: boolean; followUpNote: string; assigneeId: string; reason: string };

function validateText(draft: Draft, operation: ActionOperation): Record<string, string> {
  const fields: Record<string, string> = {};
  if (operation === "edit") {
    if (!bounded(draft.description, 5, 2000)) fields.description = "Description must contain 5–2000 code points.";
    if (length(draft.result) > 2000) fields.result = "Result must contain 1–2000 code points when provided.";
    if (length(draft.attachmentNotes) > 2000) fields.attachmentNotes = "Attachment Notes must contain at most 2000 code points.";
    if (draft.followUpRequired && !bounded(draft.followUpNote, 1, 2000)) fields.followUpNote = "A follow-up note of 1–2000 code points is required.";
  }
  if (operation === "complete" && !bounded(draft.result, 1, 2000)) fields.result = "Result must contain 1–2000 code points.";
  if (operation === "cancel" && !bounded(draft.reason, 5, 500)) fields.reason = "Cancellation reason must contain 5–500 code points.";
  return fields;
}

export default function ActionOperationDialog({ ticketId, action, operation, trigger, editable, onClose, onSaved }: {
  ticketId: number; action: ActionDTO; operation: ActionOperation; trigger: HTMLElement | null;
  editable: boolean; onClose: () => void; onSaved: (response: ActionMutationResponse) => Promise<void>;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const live = useRef(true);
  const sending = useRef(false);
  const reads = useRef(new Set<AbortController>());
  const original = useRef<ActionDTO | null>(null);
  const touched = useRef(new Set<keyof Draft>());
  const workerNames = useRef(new Map<number, string>());
  const returnFromClear = useRef(false);
  const command = useRef<{ identity: string; input: ActionTokens & ActionEditFields | ActionStatusInput } | null>(null);
  const [current, setCurrent] = useState<ActionDetailResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [assignees, setAssignees] = useState<EligibleAssignee[]>([]);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [assigneeRecovery, setAssigneeRecovery] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [reviewLatest, setReviewLatest] = useState(false);
  const [reading, setReading] = useState(true);

  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    reads.current.add(controller);
    void Promise.all([
      getTicketAction(ticketId, action.id, controller.signal),
      operation === "reassign" ? getStaffAssignees(controller.signal) : Promise.resolve([]),
    ]).then(([detail, workers]) => {
      if (!live.current || controller.signal.aborted) return;
      original.current = detail.action;
      touched.current.clear();
      workerNames.current.set(detail.action.assignee.id, detail.action.assignee.name);
      workers.forEach((worker) => workerNames.current.set(worker.id, worker.name));
      setCurrent(detail); setAssignees(workers);
      setDraft({ description: detail.action.description, result: detail.action.result ?? "", attachmentNotes: detail.action.attachmentNotes ?? "",
        followUpRequired: detail.action.followUpRequired, followUpNote: detail.action.followUpNote ?? "", assigneeId: String(detail.action.assignee.id), reason: "" });
    }).catch((caught: unknown) => {
      if (!live.current || controller.signal.aborted) return;
      setError(caught instanceof ApiRequestError && caught.status === 404 ? "Action not found." : safeFailure);
      if (caught instanceof ApiRequestError && ["PASSWORD_CHANGE_REQUIRED", "ROLE_FORBIDDEN"].includes(caught.code ?? "")) window.dispatchEvent(new Event("toktickit:auth-refresh"));
    }).finally(() => {
      if (live.current && !controller.signal.aborted) setReading(false);
      controller.abort(); reads.current.delete(controller);
    });
    return () => { live.current = false; reads.current.forEach((read) => read.abort()); reads.current.clear(); };
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
    if (!clearing && returnFromClear.current) {
      returnFromClear.current = false;
      dialogRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
    } else if (error && !busy) errorRef.current?.focus();
    else if (!reading) dialogRef.current?.querySelector<HTMLElement>("textarea, select, button")?.focus();
  }, [reading, clearing, error, busy]);

  function dismissClear() { returnFromClear.current = true; setClearing(false); }
  function close() { if (!sending.current) { if (clearing) dismissClear(); else onClose(); } }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)") ?? []);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function fieldFeedback(next: Draft, names: string[], clearExisting = true) {
    const errors = validateText(next, operation);
    setFields((previous) => {
      const result = { ...previous };
      for (const name of names) { if (clearExisting) delete result[name]; if (errors[name]) result[name] = errors[name]; }
      return result;
    });
  }
  function update(values: Partial<Draft>) {
    if (!draft) return;
    const next = { ...draft, ...values };
    const names = Object.keys(values) as Array<keyof Draft>;
    names.forEach((name) => touched.current.add(name));
    setDraft(next); command.current = null;
    fieldFeedback(next, "followUpRequired" in values ? [...names, "followUpNote"] : names);
  }
  const permitted = editable && !frozen && current && ["PLANNED", "IN_PROGRESS"].includes(current.action.status) &&
    (operation !== "complete" || current.action.status === "IN_PROGRESS") && (operation !== "start" || current.action.status === "PLANNED");
  const valid = draft && permitted && (
    operation === "complete" ? bounded(draft.result, 1, 2000) :
    operation === "cancel" ? bounded(draft.reason, 5, 500) :
    operation === "reassign" ? assignees.some((worker) => worker.id === Number(draft.assigneeId)) && Number(draft.assigneeId) !== current.action.assignee.id :
    operation === "edit" ? bounded(draft.description, 5, 2000) && (draft.result.trim() === "" || bounded(draft.result, 1, 2000)) && length(draft.attachmentNotes) <= 2000 && (!draft.followUpRequired || bounded(draft.followUpNote, 1, 2000)) : true
  );

  async function refresh() {
    if (sending.current || reading) return;
    const controller = new AbortController();
    reads.current.add(controller);
    // Do not unlock an unresolved conflict after only a partial refresh.
    setReading(true); setConflict(true); setError("");
    try {
      const [detail, ticket, workers] = await Promise.all([
        getTicketAction(ticketId, action.id, controller.signal), getStaffTicketDetail(ticketId, controller.signal),
        operation === "reassign" ? getStaffAssignees(controller.signal) : Promise.resolve(assignees),
      ]);
      if (!live.current || controller.signal.aborted) return;
      workers.forEach((worker) => workerNames.current.set(worker.id, worker.name));
      setCurrent({ ...detail, ticketUpdatedAt: ticket.updatedAt }); setAssignees(workers);
      setFrozen(!editableParents.has(ticket.currentStatus)); setReviewLatest(true);
      setConflict(false); command.current = null;
      if (operation === "reassign" && draft) {
        const unavailable = !workers.some((worker) => worker.id === Number(draft.assigneeId));
        setAssigneeRecovery(unavailable);
        setFields((previous) => ({ ...previous, assigneeId: unavailable ? "This selected worker is unavailable. Choose an active worker." : "" }));
      }
    } catch (caught) {
      if (!live.current || controller.signal.aborted) return;
      if (caught instanceof ApiRequestError && ["PASSWORD_CHANGE_REQUIRED", "ROLE_FORBIDDEN"].includes(caught.code ?? "")) window.dispatchEvent(new Event("toktickit:auth-refresh"));
      setError("Refresh failed. Your draft is retained; refresh the Action and Ticket before another submission.");
    } finally {
      if (live.current && !controller.signal.aborted) setReading(false);
      controller.abort(); reads.current.delete(controller);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !draft || !current || sending.current || reading || conflict) return;
    const changes: ActionEditFields = {};
    if (operation === "edit") {
      // Compare user intent with the original draft baseline, not a refreshed server snapshot.
      const baseline = original.current;
      if (!baseline) return;
      if (touched.current.has("description") && draft.description.trim() !== baseline.description) changes.description = draft.description.trim();
      if (touched.current.has("result") && nullable(draft.result) !== baseline.result) changes.result = nullable(draft.result);
      if (touched.current.has("attachmentNotes") && nullable(draft.attachmentNotes) !== baseline.attachmentNotes) changes.attachmentNotes = nullable(draft.attachmentNotes);
      if (touched.current.has("followUpRequired") && draft.followUpRequired !== baseline.followUpRequired) {
        changes.followUpRequired = draft.followUpRequired;
        changes.followUpNote = draft.followUpRequired ? draft.followUpNote.trim() : null;
      } else if (touched.current.has("followUpNote") && draft.followUpRequired && draft.followUpNote.trim() !== baseline.followUpNote) changes.followUpNote = draft.followUpNote.trim();
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
      if (caught instanceof ApiRequestError && caught.code === "TICKET_ACTIONS_LOCKED") {
        setFrozen(true); setError("This Ticket no longer permits Action changes. Refresh the Action and Ticket to review the current restriction.");
      } else if (caught instanceof ApiRequestError && caught.code === "ASSIGNEE_INELIGIBLE") {
        setAssigneeRecovery(true); setError("The selected worker is no longer eligible. Reload assignees and review your selection.");
      } else setError(stale ? "The Action changed. Refresh and review it before trying again." : safeFailure);
    } finally { sending.current = false; if (live.current) setBusy(false); }
  }

  const title = clearing ? "Clear follow-up note?" : titles[operation];
  function textarea(name: keyof Draft, label: string, required = false) {
    const value = draft?.[name];
    return <div className="mb-3"><label className="form-label" htmlFor={`${id}-${name}`}>{label}</label>
      <textarea id={`${id}-${name}`} className="form-control" required={required} disabled={busy} value={typeof value === "string" ? value : ""}
        aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `${id}-${name}-error` : undefined}
        onChange={(event) => update({ [name]: event.target.value })} onBlur={() => { if (draft) fieldFeedback(draft, [name], false); }} />
      {fields[name] && <p id={`${id}-${name}-error`} className="text-danger">{fields[name]}</p>}</div>;
  }
  return <div className="attachment-dialog-backdrop"><div ref={dialogRef} className="attachment-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-explanation`} onKeyDown={keyDown}>
    <h2 id={`${id}-title`} className="h4">{title}</h2>
    <p id={`${id}-explanation`}>{clearing ? "Clearing removes the current note. Its previous value remains in history." : "Changes are confirmed by the server. Created by and Action Date/Time remain unchanged."}</p>
    {reading && <p role="status">Loading Action…</p>}
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="alert alert-danger">{error}{conflict && <button type="button" className="btn btn-outline-success" disabled={busy || reading} onClick={() => void refresh()}>{assigneeRecovery ? "Reload assignees" : "Refresh Action and Ticket"}</button>}</div>}
    {!reading && current && !permitted && !error && <p role="alert">{frozen ? "This Ticket is resolved, closed or cancelled and no longer permits Action changes. Your draft is retained." : "This Action is no longer editable. Close and refresh the Ticket."}</p>}
    {reviewLatest && !reading && current && operation === "edit" && <section aria-label="Latest server values" className="border rounded p-3 mb-3">
      <h3 className="h5">Latest server values — review alongside your retained draft</h3>
      <dl><dt>Latest server description</dt><dd>{current.action.description}</dd>
        <dt>Latest server follow-up note</dt><dd>{current.action.followUpNote ?? "Not recorded"}</dd>
        <dt>Latest Action version</dt><dd>{current.action.version}</dd></dl>
    </section>}
    {clearing ? <div className="d-flex gap-2 justify-content-end"><button type="button" className="btn btn-outline-secondary" onClick={dismissClear}>Keep note</button>
      <button type="button" className="btn btn-danger" onClick={() => { update({ followUpRequired: false, followUpNote: "" }); dismissClear(); }}>Clear note</button></div> :
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
            <select id={`${id}-assigneeId`} className="form-select" value={draft.assigneeId} aria-invalid={Boolean(fields.assigneeId)} aria-describedby={fields.assigneeId ? `${id}-assigneeId-error` : undefined} onChange={(event) => update({ assigneeId: event.target.value })}>
              {!assignees.some((worker) => worker.id === Number(draft.assigneeId)) && <option value={draft.assigneeId} disabled>Unavailable — {workerNames.current.get(Number(draft.assigneeId)) ?? "Selected worker"}</option>}
              {assignees.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
            </select><p className="form-text">Only active IT Staff and Administrators are eligible. Ticket Owner is unchanged.</p>{fields.assigneeId && <p id={`${id}-assigneeId-error`} className="text-danger" role="alert">{fields.assigneeId}</p>}</>}
          {operation === "complete" && <>{textarea("result", "Result", true)}<p className="form-text">Result: 1–2000 code points. You will be recorded as Performed by. Existing follow-up information remains.</p></>}
          {operation === "cancel" && <>{textarea("reason", "Cancellation reason", true)}<p className="form-text">Reason: 5–500 code points. Existing content and draft result remain.</p></>}
        </fieldset>}
        <div className="d-flex gap-2 justify-content-end mt-3"><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={close}>Cancel</button>
          <button type="submit" className={`btn ${operation === "cancel" ? "btn-danger" : "btn-success"}`} disabled={busy || reading || !valid || conflict}>{busy ? "Saving…" : buttons[operation]}</button></div>
      </form>}
  </div></div>;
}
