import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

// A realistic upload key: getObjectEntityUploadURL produces /objects/uploads/<uuid>.
const UUID = "123e4567-e89b-12d3-a456-426614174000";

// deleteObjectEntity must accept the object path in every form the app stores or
// serves it as. The frontend persists photo URLs as `/api/storage/objects/...`,
// so if deletion only recognized the internal `/objects/...` form it would
// silently no-op and orphaned files would pile up again. It must also refuse any
// path outside the uploads/<uuid> namespace, since photo URLs come from a
// user-controllable field.
describe("ObjectStorageService.deleteObjectEntity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes the frontend `/api/storage/objects/...` form to the internal key", async () => {
    const svc = new ObjectStorageService();
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const spy = vi
      .spyOn(svc, "getObjectEntityFile")
      .mockResolvedValue({ delete: deleteFn } as never);

    const result = await svc.deleteObjectEntity(`/api/storage/objects/uploads/${UUID}`);

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith(`/objects/uploads/${UUID}`);
    expect(deleteFn).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it("normalizes the `/storage/objects/...` form to the internal key", async () => {
    const svc = new ObjectStorageService();
    const spy = vi
      .spyOn(svc, "getObjectEntityFile")
      .mockResolvedValue({ delete: vi.fn() } as never);

    await svc.deleteObjectEntity(`/storage/objects/uploads/${UUID}`);

    expect(spy).toHaveBeenCalledWith(`/objects/uploads/${UUID}`);
  });

  it("accepts the internal `/objects/uploads/<uuid>` form directly", async () => {
    const svc = new ObjectStorageService();
    const spy = vi
      .spyOn(svc, "getObjectEntityFile")
      .mockResolvedValue({ delete: vi.fn() } as never);

    await svc.deleteObjectEntity(`/objects/uploads/${UUID}`);

    expect(spy).toHaveBeenCalledWith(`/objects/uploads/${UUID}`);
  });

  it("returns false for non-object paths without touching storage", async () => {
    const svc = new ObjectStorageService();
    const spy = vi.spyOn(svc, "getObjectEntityFile");

    const result = await svc.deleteObjectEntity("https://example.com/photo.jpg");

    expect(result).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses object paths outside the uploads/<uuid> namespace", async () => {
    const svc = new ObjectStorageService();
    const spy = vi.spyOn(svc, "getObjectEntityFile");

    const crafted = [
      "/objects/.private/acl", // storage internals
      "/objects/uploads/not-a-uuid", // not a real upload key
      `/objects/uploads/${UUID}/../../secret`, // path traversal attempt
      `/objects/other/${UUID}`, // outside the uploads dir
      `/api/storage/objects/uploads/${UUID}extra`, // trailing junk
    ];

    for (const path of crafted) {
      expect(await svc.deleteObjectEntity(path)).toBe(false);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("treats an already-missing object as successfully deleted", async () => {
    const svc = new ObjectStorageService();
    vi.spyOn(svc, "getObjectEntityFile").mockRejectedValue(new ObjectNotFoundError());

    const result = await svc.deleteObjectEntity(`/objects/uploads/${UUID}`);

    expect(result).toBe(true);
  });

  it("propagates unexpected storage errors to the caller", async () => {
    const svc = new ObjectStorageService();
    vi.spyOn(svc, "getObjectEntityFile").mockRejectedValue(new Error("storage exploded"));

    await expect(svc.deleteObjectEntity(`/objects/uploads/${UUID}`)).rejects.toThrow(
      "storage exploded",
    );
  });
});
