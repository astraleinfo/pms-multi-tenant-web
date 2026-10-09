"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useApp, useTenant } from "@/lib/store/app-store";
import { usePatientNotes } from "@/lib/query/hooks";
import { ROLE_LABEL } from "@/lib/nav";
import { formatDate, formatTime12, pluralise } from "@/lib/format";
import type { Patient, PatientNote, Role } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Avatar, EmptyState, Kbd, ScrollArea } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/loader";
import { IconCheck, IconChevronRight, IconNote, IconX } from "@/components/ui/icons";

const MAX = 4000;

/** "Today, 10:42am", or "8 Oct 2026, 10:42am" — when a note was written. */
export function noteWhen(stamp: string, today: string) {
  const day = stamp.slice(0, 10);
  const time = formatTime12(stamp.slice(11, 16));
  return day === today ? `Today, ${time}` : `${formatDate(day, "long")}, ${time}`;
}

const roleWord = (role: string) => ROLE_LABEL[role as Role] ?? "";

/** Originals newest first, each with the corrections written against it, oldest first. */
function thread(notes: PatientNote[]) {
  const corrections = new Map<string, PatientNote[]>();
  for (const n of notes) {
    if (n.amends_id) corrections.set(n.amends_id, [...(corrections.get(n.amends_id) ?? []), n]);
  }
  for (const list of corrections.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ids = new Set(notes.map((n) => n.id));
  /* A correction whose original is somehow absent still has to be shown. */
  const roots = notes.filter((n) => !n.amends_id || !ids.has(n.amends_id));
  return roots.map((n) => ({ note: n, corrections: corrections.get(n.id) ?? [] }));
}

/**
 * The notes on a patient — what clinicians write about them outside any one
 * consultation.
 *
 * It is part of the record, so nothing here edits or removes anything: a note
 * that was wrong stays, marked corrected, with its correction beneath it. The
 * composer says so before anything is saved.
 */
export function PatientNotes({ patient }: { patient: Patient }) {
  const { today, can, addPatientNote, notify } = useApp();
  const { user } = useTenant();
  const { data: notes = [], isPending } = usePatientNotes(patient.id);
  const mayWrite = can("encounter:write");

  const [body, setBody] = React.useState("");
  const [correcting, setCorrecting] = React.useState<PatientNote | null>(null);
  const [saving, setSaving] = React.useState(false);
  const box = React.useRef<HTMLTextAreaElement>(null);
  const firstName = patient.full_name.split(" ")[0] ?? patient.full_name;
  const threads = React.useMemo(() => thread(notes), [notes]);

  const correct = (note: PatientNote) => {
    setCorrecting(note);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const save = async () => {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await addPatientNote(patient.id, { body: text, amends_id: correcting?.id });
      notify({ tone: "ok", title: correcting ? "Correction saved" : "Note saved", body: patient.full_name });
      setBody("");
      setCorrecting(null);
    } catch {
      /* The store said why; what was typed stays in the box. */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<IconNote size={15} />} tone="accent" title="Notes"
        subtitle={notes.length ? pluralise(notes.length, "note") : undefined}
        hint="Notes are part of the patient's record and print with it. A saved note is never edited: a mistake is corrected by its author with a new note, and both are kept."
      />

      {mayWrite && (
        <div className="border-b border-line px-[var(--pad-card)] pb-4">
          {correcting && (
            <div className="mb-2 flex items-start justify-between gap-3 rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2">
              <div className="min-w-0 text-label text-warn-text">
                <p className="font-medium">Correcting your note of {noteWhen(correcting.created_at, today)}</p>
                <p className="mt-0.5 line-clamp-2 text-caption">{correcting.body}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCorrecting(null)} aria-label="Stop correcting">
                <IconX size={14} /> Cancel
              </Button>
            </div>
          )}
          <label htmlFor={`note-${patient.id}`} className="sr-only">
            {correcting ? "Correction" : `Add a note about ${patient.full_name}`}
          </label>
          <Textarea
            ref={box}
            id={`note-${patient.id}`}
            rows={3}
            maxLength={MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
            }}
            placeholder={correcting ? "What should it have said?" : `Add a note about ${firstName}`}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-ink-2">
              Saved notes can’t be edited. To fix one, add a correction.
              {body.length > MAX - 400 && (
                <span className="tnum ml-2 text-warn-text">{MAX - body.length} characters left</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <span className="hidden text-caption text-ink-3 sm:inline"><Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd></span>
              <Button variant="primary" onClick={() => void save()} disabled={!body.trim() || saving}>
                {saving ? <Spinner size={14} /> : <IconCheck size={15} />}
                {saving ? "Saving…" : correcting ? "Save correction" : "Save note"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <CardBody>
        {isPending ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : threads.length === 0 ? (
          <EmptyState
            icon={<IconNote size={24} />}
            title="No notes yet"
            body={mayWrite
              ? `Anything worth knowing about ${firstName} between visits belongs here.`
              : "Notes written by clinicians about this patient appear here."}
          />
        ) : (
          <ScrollArea label={`Notes on ${patient.full_name}`} className="pr-1">
            <ol className="divide-y divide-line-soft">
              {threads.map(({ note, corrections }) => (
                <li key={note.id} className="py-4 first:pt-0 last:pb-0">
                  <NoteBlock
                    note={note}
                    today={today}
                    corrected={corrections.length > 0}
                    /* only its author corrects a note — the server holds the same rule */
                    onCorrect={mayWrite && note.author_id === user.id && !note.amends_id ? () => correct(note) : undefined}
                    active={correcting?.id === note.id}
                  />
                  {corrections.length > 0 && (
                    <ol className="ml-9 mt-3 space-y-3 border-l-2 border-warn-border pl-3.5">
                      {corrections.map((c) => (
                        <li key={c.id}>
                          <NoteBlock note={c} today={today} correction />
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </CardBody>
    </Card>
  );
}

function NoteBlock({
  note, today, corrected, correction, onCorrect, active,
}: {
  note: PatientNote;
  today: string;
  corrected?: boolean;
  correction?: boolean;
  onCorrect?: () => void;
  active?: boolean;
}) {
  const role = roleWord(note.author_role);
  return (
    <article className={cn(active && "rounded-[var(--r)] bg-warn-soft px-2 py-1.5 -mx-2")}>
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {!correction && <Avatar name={note.author_name} size="xs" tintKey={note.author_id ?? note.author_name} />}
        <p className="min-w-0 text-label">
          {correction && <span className="font-medium text-warn-text">Correction by </span>}
          <span className="font-medium text-ink">{note.author_name || "A former colleague"}</span>
          {role && <span className="text-ink-2">, {role}</span>}
        </p>
        <time className="tnum text-caption text-ink-2" dateTime={note.created_at.replace(" ", "T")}>
          {noteWhen(note.created_at, today)}
        </time>
        {corrected && <Badge tone="warn" size="sm">Corrected</Badge>}
        {onCorrect && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onCorrect}>
            Add correction
          </Button>
        )}
      </header>
      <p className={cn(
        "mt-1.5 max-w-[70ch] whitespace-pre-line break-words text-body leading-relaxed text-ink",
        !correction && "sm:pl-9",
      )}>
        {note.body}
      </p>
    </article>
  );
}

/**
 * The latest note, for the record's side rail — so a clinician opening the
 * record reads the last thing a colleague wrote before anything else.
 */
export function LatestNote({ patient, onOpen }: { patient: Patient; onOpen: () => void }) {
  const { today, can } = useApp();
  const { data: notes = [], isPending } = usePatientNotes(patient.id);
  const latest = notes[0];

  return (
    <Card>
      <CardHeader
        icon={<IconNote size={15} />} tone="accent" title="Latest note"
        subtitle={notes.length > 1 ? `${notes.length} in all` : undefined}
      />
      <CardBody className="pt-0">
        {isPending ? (
          <Spinner size={16} />
        ) : !latest ? (
          <p className="text-label text-ink-2">No notes on this patient yet.</p>
        ) : (
          <>
            <p className="text-caption text-ink-2">
              <span className="font-medium text-ink">{latest.author_name}</span>
              {latest.amends_id ? ", correcting an earlier note" : ""}
            </p>
            <p className="tnum text-caption text-ink-2">{noteWhen(latest.created_at, today)}</p>
            <p className="mt-2 line-clamp-4 whitespace-pre-line text-label leading-relaxed text-ink">{latest.body}</p>
          </>
        )}
        <Button variant="ghost" size="sm" className="-ml-2 mt-2" onClick={onOpen}>
          {latest ? "All notes" : can("encounter:write") ? "Add a note" : "Open notes"}
          <IconChevronRight size={14} />
        </Button>
      </CardBody>
    </Card>
  );
}
