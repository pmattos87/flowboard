import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import React from "react";
import {
  clientKeys,
  useClients,
  useCreateClient,
  useUpdateClient,
  useReorderClients,
} from "@/hooks/useClients";
import type { Client } from "@/types";

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

const clients: Client[] = [
  { id: 1, name: "Acme", logo_data: null, position: 0 },
  { id: 2, name: "Beta", logo_data: null, position: 1 },
  { id: 3, name: "Gamma", logo_data: null, position: 2 },
];

describe("useClients", () => {
  it("fetches the client list", async () => {
    mockInvoke.mockResolvedValueOnce(clients);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useClients(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(clients);
    expect(mockInvoke).toHaveBeenCalledWith("list_clients");
  });

  it("exposes the command's error", async () => {
    mockInvoke.mockRejectedValueOnce("boom");
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useClients(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateClient", () => {
  it("calls create_client and invalidates clientKeys.all", async () => {
    mockInvoke.mockResolvedValueOnce(clients[0]);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateClient(), { wrapper });
    await result.current.mutateAsync("Acme");
    expect(mockInvoke).toHaveBeenCalledWith("create_client", { name: "Acme" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientKeys.all });
  });
});

describe("useUpdateClient", () => {
  it("calls update_client with the name and logo and invalidates clientKeys.all", async () => {
    mockInvoke.mockResolvedValueOnce({ ...clients[1], name: "Beta Co", logo_data: "data:x" });
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateClient(), { wrapper });
    await result.current.mutateAsync({ id: 2, payload: { name: "Beta Co", logo_data: "data:x" } });
    expect(mockInvoke).toHaveBeenCalledWith("update_client", {
      id: 2,
      payload: { name: "Beta Co", logo_data: "data:x" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientKeys.all });
  });

  it("does not invalidate when the command fails", async () => {
    mockInvoke.mockRejectedValueOnce("client name cannot be blank");
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateClient(), { wrapper });
    await expect(result.current.mutateAsync({ id: 2, payload: { name: " " } })).rejects.toBe(
      "client name cannot be blank",
    );
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useReorderClients", () => {
  it("calls reorder_clients and invalidates clientKeys.all", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useReorderClients(), { wrapper });
    await result.current.mutateAsync([3, 1, 2]);
    expect(mockInvoke).toHaveBeenCalledWith("reorder_clients", { orderedIds: [3, 1, 2] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientKeys.all });
  });

  it("reorders the cached list before the command resolves", async () => {
    let resolve!: () => void;
    mockInvoke.mockReturnValueOnce(new Promise<void>((r) => { resolve = r; }));
    const { wrapper, qc } = makeWrapper();
    qc.setQueryData(clientKeys.list(), clients);
    const { result } = renderHook(() => useReorderClients(), { wrapper });
    result.current.mutate([3, 1, 2]);
    await waitFor(() =>
      expect(qc.getQueryData<Client[]>(clientKeys.list())?.map((c) => c.id)).toEqual([3, 1, 2]),
    );
    resolve();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("restores the previous order when the command fails", async () => {
    mockInvoke.mockRejectedValueOnce("db locked");
    const { wrapper, qc } = makeWrapper();
    qc.setQueryData(clientKeys.list(), clients);
    const { result } = renderHook(() => useReorderClients(), { wrapper });
    await expect(result.current.mutateAsync([3, 1, 2])).rejects.toBe("db locked");
    expect(qc.getQueryData<Client[]>(clientKeys.list())?.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("restores the order after the optimistic move once the pending command fails", async () => {
    let reject!: (e: unknown) => void;
    mockInvoke.mockReturnValueOnce(new Promise<void>((_r, j) => { reject = j; }));
    const { wrapper, qc } = makeWrapper();
    qc.setQueryData(clientKeys.list(), clients);
    const { result } = renderHook(() => useReorderClients(), { wrapper });
    result.current.mutate([2, 3, 1]);
    await waitFor(() =>
      expect(qc.getQueryData<Client[]>(clientKeys.list())?.map((c) => c.id)).toEqual([2, 3, 1]),
    );
    reject("db locked");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Client[]>(clientKeys.list())).toEqual(clients);
  });
});
