// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { _resetCache, invalidate, useOptimisticFlags, useResource } from "./_api";

const fetchMock = vi.fn();

beforeEach(() => {
  _resetCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}
function fails(status: number, body: unknown) {
  return { ok: false, status, json: async () => body } as Response;
}

function Reader({ path = "/watchlist" }: { path?: string }) {
  const { data, loading, error } = useResource<{ n: number }>(path);
  return (
    <div>
      <span data-testid="state">{loading ? "loading" : error ? `error:${error}` : `n=${data?.n}`}</span>
    </div>
  );
}

describe("useResource caching", () => {
  it("fetches once on first mount", async () => {
    fetchMock.mockResolvedValue(ok({ n: 1 }));
    await act(async () => {
      render(<Reader />);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state").textContent).toBe("n=1");
  });

  it("paints from cache on remount without a skeleton or a second request", async () => {
    // The whole point: dashboard → watchlist → dashboard should not refetch,
    // and should not flash a loading state over data already in memory.
    fetchMock.mockResolvedValue(ok({ n: 1 }));
    await act(async () => {
      render(<Reader />);
    });
    cleanup();

    fetchMock.mockClear();
    render(<Reader />);
    expect(screen.getByTestId("state").textContent).toBe("n=1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares one request between two components mounting on the same path", async () => {
    fetchMock.mockResolvedValue(ok({ n: 7 }));
    await act(async () => {
      render(
        <>
          <Reader />
          <Reader />
        </>,
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("state").map((n) => n.textContent)).toEqual(["n=7", "n=7"]);
  });

  it("keeps different paths apart", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      ok({ n: url.endsWith("/positions") ? 2 : 1 }),
    );
    await act(async () => {
      render(
        <>
          <Reader path="/watchlist" />
          <Reader path="/positions" />
        </>,
      );
    });
    expect(screen.getAllByTestId("state").map((n) => n.textContent)).toEqual(["n=1", "n=2"]);
  });

  it("refetches every mounted reader when a write invalidates", async () => {
    fetchMock.mockResolvedValue(ok({ n: 1 }));
    await act(async () => {
      render(<Reader />);
    });

    fetchMock.mockResolvedValue(ok({ n: 99 }));
    await act(async () => {
      invalidate();
    });
    expect(screen.getByTestId("state").textContent).toBe("n=99");
  });

  it("surfaces a failure instead of showing a stale value forever", async () => {
    fetchMock.mockResolvedValue(fails(500, { error: "พัง", code: "internal" }));
    await act(async () => {
      render(<Reader />);
    });
    expect(screen.getByTestId("state").textContent).toContain("error:");
  });

  it("does not wedge a path after a failed request", async () => {
    // The in-flight entry is cleared in finally; if it were cleared only on
    // success, one network blip would leave the path permanently pending.
    fetchMock.mockResolvedValue(fails(500, { error: "พัง" }));
    await act(async () => {
      render(<Reader />);
    });
    cleanup();

    fetchMock.mockResolvedValue(ok({ n: 5 }));
    await act(async () => {
      render(<Reader />);
    });
    expect(screen.getByTestId("state").textContent).toBe("n=5");
  });

  it("holds off entirely when the path is null", () => {
    render(<Reader path={null as unknown as string} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useOptimisticFlags", () => {
  function Toggle({ onWrite }: { onWrite: () => Promise<unknown> }) {
    const flags = useOptimisticFlags();
    return (
      <input
        type="checkbox"
        aria-label="ทำเครื่องหมาย"
        checked={flags.valueOf("x", false)}
        onChange={(e) => void flags.toggle("x", e.target.checked, onWrite)}
      />
    );
  }

  it("moves the moment it is clicked, before the write resolves", async () => {
    let release: (() => void) | null = null;
    const pending = new Promise<void>((r) => {
      release = r;
    });

    render(<Toggle onWrite={() => pending} />);
    const box = screen.getByLabelText("ทำเครื่องหมาย") as HTMLInputElement;

    fireEvent.click(box);
    // Still in flight — and the box has already moved.
    expect(box.checked).toBe(true);

    await act(async () => {
      release?.();
      await pending;
    });
  });

  it("flips back when the server refuses", async () => {
    render(
      <Toggle
        onWrite={async () => {
          throw new Error("ไม่สำเร็จ");
        }}
      />,
    );
    const box = screen.getByLabelText("ทำเครื่องหมาย") as HTMLInputElement;
    await act(async () => {
      fireEvent.click(box);
    });
    expect(box.checked).toBe(false);
  });

  it("drops the local override once the write settles", async () => {
    // Otherwise the predicted value outlives the truth it was predicting.
    render(<Toggle onWrite={async () => undefined} />);
    const box = screen.getByLabelText("ทำเครื่องหมาย") as HTMLInputElement;
    await act(async () => {
      fireEvent.click(box);
    });
    // The server value is still false (this harness never changes it), so once
    // the override clears the box must follow the server, not the click.
    expect(box.checked).toBe(false);
  });
});
