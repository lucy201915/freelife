import { createContext, useContext, type ReactNode } from "react";
import type { PublicService, ServicePage } from "./supabase";

/** Build-time snapshot embedded in prerendered HTML so the first paint matches hydration. */
export type BootstrapData = {
  services?: PublicService[];
  servicePages?: Record<string, ServicePage>;
  serviceSlugs?: Record<string, string>;
};

const Ctx = createContext<BootstrapData>({});

export function BootstrapProvider({ value, children }: { value: BootstrapData; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBootstrap(): BootstrapData {
  return useContext(Ctx);
}

export function readBootstrap(): BootstrapData {
  if (typeof document === "undefined") return {};
  const el = document.getElementById("freeli-bootstrap");
  if (!el?.textContent) return {};
  try {
    const data = JSON.parse(el.textContent) as BootstrapData;
    if (!data || typeof data !== "object") return {};
    return data;
  } catch {
    return {};
  }
}
