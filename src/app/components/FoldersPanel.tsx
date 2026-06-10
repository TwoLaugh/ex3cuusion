"use client";

import { Archive, Plus, Save } from "lucide-react";
import type { AppState, Folder } from "@/lib/types";
import { activeFolders, folderPath, isFolderDescendantOfClient } from "../lib/folders";
import { submitStructureForm, type PostFn } from "../lib/structure-forms";

// A <select name="folderId"> listing every active folder by full path. Used by both the task
// editor and the new-task form (folderId is canonical for grouping).
export function FolderPicker({
  state,
  ariaLabel,
  defaultValue,
  includeNone
}: {
  state: AppState;
  ariaLabel: string;
  defaultValue: string;
  includeNone?: boolean;
}) {
  const folders = activeFolders(state).slice().sort((a, b) => folderPath(state, a.id).localeCompare(folderPath(state, b.id)));
  return (
    <select name="folderId" aria-label={ariaLabel} defaultValue={defaultValue}>
      {includeNone && <option value="">No folder</option>}
      {folders.map((folder) => (
        <option value={folder.id} key={folder.id}>
          {folderPath(state, folder.id)}
        </option>
      ))}
    </select>
  );
}

export function FoldersPanel({ state, post }: { state: AppState; post: PostFn }) {
  const folders = activeFolders(state);
  const childrenOf = (parentId: string | undefined) =>
    folders.filter((folder) => (folder.parentFolderId ?? undefined) === parentId).sort((a, b) => a.name.localeCompare(b.name));
  const taskCount = (folderId: string) =>
    state.tasks.filter((task) => task.folderId === folderId && task.status !== "archived").length;

  function renderFolder(folder: Folder, depth: number) {
    const parentOptions = folders.filter(
      (candidate) => candidate.id !== folder.id && !isFolderDescendantOfClient(state, candidate.id, folder.id)
    );
    return (
      <div className="folderTreeNode" key={folder.id}>
        <article className="folderRow" style={{ marginLeft: depth * 18 }}>
          <details className="inlineEditor">
            <summary>
              <span className="folderName">{folder.name}</span>
              <span className="folderMeta">
                {taskCount(folder.id)} task{taskCount(folder.id) === 1 ? "" : "s"}
                {folder.canBlock ? ` · blocks ${folder.defaultBlockMinutes ?? 30}m` : ""}
              </span>
            </summary>
            <form onSubmit={(event) => submitStructureForm(event, post, "folder", "update", folder.id)}>
              <input name="name" defaultValue={folder.name} aria-label={`Folder name ${folder.name}`} />
              <label className="fieldLabel">
                Parent folder
                <select name="parentFolderId" defaultValue={folder.parentFolderId ?? ""} aria-label={`Parent folder ${folder.name}`}>
                  <option value="">(top level)</option>
                  {parentOptions.map((candidate) => (
                    <option value={candidate.id} key={candidate.id}>
                      {folderPath(state, candidate.id)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="compactFields">
                <label className="fieldLabel">
                  Weight
                  <input name="weight" type="number" min="1" max="10" defaultValue={folder.weight ?? 5} aria-label={`Weight ${folder.name}`} />
                </label>
                <label className="fieldLabel">
                  Block (min)
                  <input
                    name="defaultBlockMinutes"
                    type="number"
                    min="5"
                    max="480"
                    defaultValue={folder.defaultBlockMinutes ?? 30}
                    aria-label={`Default block minutes ${folder.name}`}
                  />
                </label>
              </div>
              <label className="fieldLabel folderCheckbox">
                <input type="checkbox" name="canBlock" defaultChecked={folder.canBlock ?? false} aria-label={`Can block ${folder.name}`} />
                Can block (schedule as a focus block)
              </label>
              <div className="formActions">
                <button type="submit" aria-label={`Save ${folder.name}`}>
                  <Save size={15} />
                  Save
                </button>
                <button type="button" onClick={() => post("/api/structure", { entity: "folder", action: "archive", id: folder.id })}>
                  <Archive size={15} />
                  Archive
                </button>
              </div>
            </form>
          </details>
        </article>
        {childrenOf(folder.id).map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="foldersPanel">
      <form className="structureForm" aria-label="Create folder" onSubmit={(event) => submitStructureForm(event, post, "folder", "create")}>
        <h2>New folder</h2>
        <input name="name" placeholder="Folder name" aria-label="Folder name" />
        <select name="parentFolderId" aria-label="New folder parent" defaultValue="">
          <option value="">(top level)</option>
          {folders
            .slice()
            .sort((a, b) => folderPath(state, a.id).localeCompare(folderPath(state, b.id)))
            .map((folder) => (
              <option value={folder.id} key={folder.id}>
                {folderPath(state, folder.id)}
              </option>
            ))}
        </select>
        <div className="compactFields">
          <label className="fieldLabel">
            Weight
            <input name="weight" type="number" min="1" max="10" defaultValue="5" aria-label="New folder weight" />
          </label>
          <label className="fieldLabel">
            Block (min)
            <input name="defaultBlockMinutes" type="number" min="5" max="480" defaultValue="30" aria-label="New folder block minutes" />
          </label>
        </div>
        <label className="fieldLabel folderCheckbox">
          <input type="checkbox" name="canBlock" aria-label="New folder can block" />
          Can block (schedule as a focus block)
        </label>
        <button type="submit">
          <Plus size={15} />
          Add
        </button>
      </form>
      <div className="folderTree" aria-label="Folder tree">
        {folders.length === 0 && <p className="emptyPanel">No folders yet.</p>}
        {childrenOf(undefined).map((folder) => renderFolder(folder, 0))}
      </div>
    </div>
  );
}
