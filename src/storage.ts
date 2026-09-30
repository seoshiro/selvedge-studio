import { validateProject, type Project } from "./model";
const DB = "selvedge-studio-v1",
  KEY = "current";
type Record = { version: number; project: Project };
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("projects");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      database = undefined;
      reject(req.error);
    };
    req.onblocked = () =>
      reject(new Error("Close other SELVEDGE tabs to open storage."));
  }));
}
export async function readStored(): Promise<Record | null> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("projects").objectStore("projects").get(KEY);
    r.onsuccess = () => {
      try {
        resolve(
          r.result
            ? {
                version: r.result.version,
                project: validateProject(r.result.project),
              }
            : null,
        );
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
  });
}
export async function writeStored(
  project: Project,
  expected: number,
): Promise<number> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("projects", "readwrite"),
      store = tx.objectStore("projects"),
      r = store.get(KEY);
    let conflict = false;
    r.onsuccess = () => {
      if ((r.result?.version ?? 0) !== expected) {
        conflict = true;
        tx.abort();
      } else store.put({ version: expected + 1, project }, KEY);
    };
    tx.oncomplete = () => resolve(expected + 1);
    tx.onabort = () =>
      reject(
        new Error(
          conflict
            ? "This project changed in another tab. Export your work, then reload."
            : "Local save failed. Export your project to keep your work.",
        ),
      );
    tx.onerror = () =>
      reject(
        new Error("Local save failed. Export your project to keep your work."),
      );
  });
}
