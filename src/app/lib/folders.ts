import type { AppState, Folder } from "@/lib/types";

// --- Folders (T088) ---------------------------------------------------------------------------
// Folders are the canonical nested structure. These helpers/components render them as a tree and
// drive task placement via a single folder picker.

export function activeFolders(state: AppState): Folder[] {
  return (state.folders ?? []).filter((folder) => folder.status !== "archived");
}

// Full "Parent / Child / Grandchild" path for a folder, walking parentFolderId. Guards cycles.
export function folderPath(state: AppState, folderId: string): string {
  const folders = state.folders ?? [];
  const names: string[] = [];
  const seen = new Set<string>();
  let current = folders.find((folder) => folder.id === folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentFolderId ? folders.find((folder) => folder.id === current!.parentFolderId) : undefined;
  }
  return names.join(" / ");
}

// True if `nodeId` is within the subtree rooted at `ancestorId` (UI cycle guard for parent select).
export function isFolderDescendantOfClient(state: AppState, nodeId: string, ancestorId: string): boolean {
  const folders = state.folders ?? [];
  let current = folders.find((folder) => folder.id === nodeId);
  const seen = new Set<string>();
  while (current?.parentFolderId && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parentFolderId === ancestorId) return true;
    current = folders.find((folder) => folder.id === current!.parentFolderId);
  }
  return false;
}
