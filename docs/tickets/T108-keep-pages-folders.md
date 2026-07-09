# T108 — Keep-style pages: folders as colour-coded note spaces (Android)

User design (2026-06-11), supersedes the tree-style T106a folders screen
and absorbs T099 (folder documents) on mobile:

- The folders surface is a GRID OF PAGES like Google Keep: each folder is
  a colour-coded card, ordered by recently edited.
- A MAIN page (quick-capture inbox) sits first: anything can be jotted
  there instantly and is filed later — optionally by an AI pass at the
  end of the day (organizer-style, undoable).
- Tapping a folder shows just its notes.
- Notes are either free TEXT (thinking) or TASK LISTS (checklist notes
  whose items are real tasks in that folder). Protocols/plans (eczema,
  engraving) live here as text notes that can decompose into tasks.
- Later: the AI reads the backlog + notes to suggest for today (extends
  the existing tray intelligence).

Model: Folder gains color (nullable, palette index); Document
{ id, folderId, title?, body, kind: text|checklist, createdAt,
updatedAt }; AppState.documents. Checklist note items map to tasks
(taskId refs) so ticking in the note = ticking the task.

v1 scope: pages grid (colour, recency sort), Main quick-capture page,
folder page with notes + that folder's active tasks, text note editor,
new-note / new-task affordances. AI filing pass + checklist-note
task-binding = v1.1.
