import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Goat } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the component import
// ---------------------------------------------------------------------------

vi.mock("wouter", () => ({
  useParams: () => ({ id: "42" }),
  useLocation: () => ["/goats/42", vi.fn()] as const,
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/report-header", () => ({
  ReportHeader: () => null,
}));

vi.mock("@/components/goat-form", () => ({
  GoatForm: () => null,
}));

vi.mock("@/components/health-history", () => ({
  HealthHistoryCard: () => null,
}));

vi.mock("@/components/accolades", () => ({
  AccoladesCard: () => null,
}));

vi.mock("@/components/goat-sale", () => ({
  GoatSaleSection: () => null,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/settings", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/settings")>();
  return {
    ...actual,
    useFarmSettings: () => ({ usesAi: false, isLoading: false }),
  };
});

vi.mock("@/lib/auth", () => ({
  useIsManager: () => false,
}));

vi.mock("@workspace/object-storage-web", () => ({
  useUpload: () => ({ uploadFile: vi.fn(), isUploading: false, progress: 0 }),
}));

// Mutable so individual tests can swap the returned goat.
let mockGoat: Goat | undefined;

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetGoat: () => ({
      data: mockGoat,
      isLoading: false,
      isError: false,
    }),
    useListBreedings: () => ({ data: [] }),
    useUpdateGoat: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteGoat: () => ({ mutate: vi.fn(), isPending: false }),
    useSetGoatDefaultPhoto: () => ({ mutate: vi.fn(), isPending: false }),
    useAddGoatPhoto: () => ({ mutateAsync: vi.fn(), isPending: false }),
    getGetGoatQueryKey: () => ["goat", 42],
    getListGoatsQueryKey: () => ["goats"],
    getGetDashboardSummaryQueryKey: () => ["dashboard"],
    getGetBreedBreakdownQueryKey: () => ["breeds"],
    getListBreedingsQueryKey: () => ["breedings"],
  };
});

// ---------------------------------------------------------------------------
// Import the component AFTER all vi.mock() calls
// ---------------------------------------------------------------------------
import GoatDetails from "./[id]";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoat(overrides: Partial<Goat> = {}): Goat {
  return {
    id: 42,
    name: "Nanny",
    breed: "alpine",
    sex: "doe",
    status: "active",
    birthDate: undefined,
    adgaId: undefined,
    registeredName: undefined,
    imageUrl: undefined,
    imageUrls: undefined,
    defaultPhotoIndex: undefined,
    sireName: undefined,
    sireRegNo: undefined,
    damName: undefined,
    damRegNo: undefined,
    maternalGranddamName: undefined,
    maternalGranddamRegNo: undefined,
    maternalGrandsireName: undefined,
    maternalGrandsireRegNo: undefined,
    paternalGranddamName: undefined,
    paternalGranddamRegNo: undefined,
    paternalGrandsireName: undefined,
    paternalGrandsireRegNo: undefined,
    notes: undefined,
    farmId: 1,
    tattoo: undefined,
    color: undefined,
    weight: undefined,
    ...overrides,
  } as Goat;
}

function setup(goat: Goat) {
  mockGoat = goat;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <GoatDetails />
    </QueryClientProvider>,
  );
}

function queryBanner() {
  return screen.queryByText("Not Registered");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("'Not Registered' banner on the goat detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- No-photo placeholder (goat has no images) ---------------------------

  describe("no-photo placeholder", () => {
    it("shows the banner when adgaId is null", () => {
      setup(makeGoat({ adgaId: undefined, imageUrl: undefined, imageUrls: undefined }));
      expect(queryBanner()).toBeInTheDocument();
    });

    it("shows the banner when adgaId is an empty string", () => {
      setup(makeGoat({ adgaId: "", imageUrl: undefined, imageUrls: undefined }));
      expect(queryBanner()).toBeInTheDocument();
    });

    it("hides the banner when adgaId is set", () => {
      setup(makeGoat({ adgaId: "ADGA-001", imageUrl: undefined, imageUrls: undefined }));
      expect(queryBanner()).not.toBeInTheDocument();
    });
  });

  // --- Has-photo hero (goat has at least one image) ------------------------

  describe("has-photo hero", () => {
    it("shows the banner when adgaId is null and the goat has one photo", () => {
      setup(
        makeGoat({
          adgaId: undefined,
          imageUrls: ["/photos/nanny-1.jpg"],
          imageUrl: undefined,
        }),
      );
      expect(queryBanner()).toBeInTheDocument();
    });

    it("shows the banner when adgaId is an empty string and the goat has one photo", () => {
      setup(
        makeGoat({
          adgaId: "",
          imageUrls: ["/photos/nanny-1.jpg"],
          imageUrl: undefined,
        }),
      );
      expect(queryBanner()).toBeInTheDocument();
    });

    it("hides the banner when adgaId is set and the goat has one photo", () => {
      setup(
        makeGoat({
          adgaId: "ADGA-001",
          imageUrls: ["/photos/nanny-1.jpg"],
          imageUrl: undefined,
        }),
      );
      expect(queryBanner()).not.toBeInTheDocument();
    });
  });

  // --- Gallery photo switching ---------------------------------------------

  describe("gallery photo switching", () => {
    it("banner remains visible after switching to a different gallery photo", async () => {
      const user = userEvent.setup();
      setup(
        makeGoat({
          adgaId: undefined,
          imageUrls: ["/photos/nanny-1.jpg", "/photos/nanny-2.jpg"],
          imageUrl: undefined,
        }),
      );

      // Banner should be visible on initial render.
      expect(queryBanner()).toBeInTheDocument();

      // Click the second thumbnail to switch the active photo.
      const secondThumb = screen.getByRole("button", { name: "Nanny 2" });
      await user.click(secondThumb);

      // Banner must still be present after the photo switch.
      expect(queryBanner()).toBeInTheDocument();
    });

    it("banner stays hidden after switching to a different gallery photo when adgaId is set", async () => {
      const user = userEvent.setup();
      setup(
        makeGoat({
          adgaId: "ADGA-001",
          imageUrls: ["/photos/nanny-1.jpg", "/photos/nanny-2.jpg"],
          imageUrl: undefined,
        }),
      );

      expect(queryBanner()).not.toBeInTheDocument();

      const secondThumb = screen.getByRole("button", { name: "Nanny 2" });
      await user.click(secondThumb);

      expect(queryBanner()).not.toBeInTheDocument();
    });
  });
});
