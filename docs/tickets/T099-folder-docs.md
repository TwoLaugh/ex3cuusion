# T099 — Folder documents (the organisation-system layer)

Product definition point 5: folders hold planning documents (markdown) —
protocols and plans that decompose into tasks (eczema/Clean Room
protocol, engraving plan). NOT philosophy writing.

- Document { id, folderId, title, body, createdAt, updatedAt } in state;
  CRUD mutations (undoable); docs listed in the folder view; a simple
  editor (textarea v1).
- AI: "extract tasks from this doc" — proposes create_task batch linked
  to the folder; doc edits can re-propose deltas.
- Docs are included in folder context for the AI interpreter (bounded).
- Migration helper: import existing protocol files by paste.
