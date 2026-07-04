import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const uploadFileMock = vi.fn();

vi.mock("@workspace/object-storage-web", () => ({
  useUpload: () => ({
    uploadFile: uploadFileMock,
    isUploading: false,
    progress: 0,
    error: null,
  }),
}));

import { ImageSlots } from "./goat-form";

const PHOTOS = [
  "/api/storage/a.jpg",
  "/api/storage/b.jpg",
  "/api/storage/c.jpg",
];

function setup(value: string[] = PHOTOS) {
  const onChange = vi.fn();
  render(<ImageSlots value={value} onChange={onChange} />);
  return { onChange };
}

describe("ImageSlots photo reordering (touch-friendly)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the first photo as the cover and shows no cover badge on the others", () => {
    setup();
    // Exactly one cover badge, on the first photo.
    expect(screen.getByText("Cover")).toBeInTheDocument();
    expect(screen.getByAltText("Cover photo")).toBeInTheDocument();
    expect(screen.getByAltText("Photo 2")).toBeInTheDocument();
    expect(screen.getByAltText("Photo 3")).toBeInTheDocument();
  });

  it("makes a photo the cover by moving it to the front when 'Make cover' is tapped", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(
      screen.getByRole("button", { name: "Make photo 2 the cover" }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      "/api/storage/b.jpg",
      "/api/storage/a.jpg",
      "/api/storage/c.jpg",
    ]);
  });

  it("only offers 'Make cover' on non-cover photos", () => {
    setup();
    // The cover (first) photo has no make-cover button.
    expect(
      screen.queryByRole("button", { name: "Make photo 1 the cover" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Make photo 2 the cover" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Make photo 3 the cover" }),
    ).toBeInTheDocument();
  });

  it("removes a photo without disturbing the order of the rest", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole("button", { name: "Remove photo 2" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      "/api/storage/a.jpg",
      "/api/storage/c.jpg",
    ]);
  });

  it("keeps the drag handle from being swallowed by page scroll on touch (touch-action: none)", () => {
    setup();
    // Each photo exposes a reorder handle; on touch devices the handle must
    // disable native touch scrolling so a drag isn't hijacked into a page scroll.
    const handle = screen.getByRole("button", { name: "Reorder photo 1" });
    expect(handle.className).toContain("touch-none");
  });

  it("shows the reorder hint only when there is more than one photo", () => {
    const { onChange } = setup(["/api/storage/a.jpg"]);
    expect(screen.queryByText(/Drag to reorder/i)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the reorder hint when multiple photos are present", () => {
    setup();
    expect(screen.getByText(/Drag to reorder/i)).toBeInTheDocument();
  });
});
