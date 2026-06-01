import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import {
  usePeople,
  usePerson,
  useCreatePerson,
  useUpdatePerson,
  useDeletePerson,
  personKeys,
} from "@/hooks/usePeople";

const mockInvoke = vi.mocked(invoke);

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
    qc,
  };
}

beforeEach(() => mockInvoke.mockReset());

const fakePerson = {
  id: 1,
  name: "Alice",
  email: "alice@example.com",
  avatar_color: "#6366f1",
  role: "Developer",
  avatar_data: null,
};

describe("usePeople", () => {
  it("fetches and returns people list", async () => {
    mockInvoke.mockResolvedValueOnce([fakePerson]);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePeople(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([fakePerson]);
    expect(mockInvoke).toHaveBeenCalledWith("list_people");
  });
});

describe("usePerson", () => {
  it("does not fetch when id is null", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePerson(null), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does not fetch when id is undefined", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePerson(undefined), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches when id is provided", async () => {
    mockInvoke.mockResolvedValueOnce(fakePerson);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePerson(1), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("get_person", { id: 1 });
  });
});

describe("useCreatePerson", () => {
  it("calls create_person and invalidates personKeys.all", async () => {
    mockInvoke.mockResolvedValueOnce(fakePerson);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreatePerson(), { wrapper });
    await result.current.mutateAsync({ name: "Alice", email: "alice@example.com" });
    expect(mockInvoke).toHaveBeenCalledWith("create_person", {
      payload: { name: "Alice", email: "alice@example.com" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: personKeys.all });
  });
});

describe("useUpdatePerson", () => {
  it("calls update_person and invalidates cache", async () => {
    mockInvoke.mockResolvedValueOnce(fakePerson);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdatePerson(), { wrapper });
    await result.current.mutateAsync({ id: 1, payload: { name: "Bob" } });
    expect(mockInvoke).toHaveBeenCalledWith("update_person", {
      id: 1,
      payload: { name: "Bob" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: personKeys.all });
  });
});

describe("useDeletePerson", () => {
  it("calls delete_person and invalidates cache", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeletePerson(), { wrapper });
    await result.current.mutateAsync(1);
    expect(mockInvoke).toHaveBeenCalledWith("delete_person", { id: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: personKeys.all });
  });
});
