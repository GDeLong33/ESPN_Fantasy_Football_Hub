import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

type SampleCtx = { files: string[]; report: (file: string) => void };

const Ctx = createContext<SampleCtx>({ files: [], report: () => {} });

/** Tracks which data files on the current page fell back to sample fixtures. */
export function SampleProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<string[]>([]);
  const { pathname } = useLocation();
  useEffect(() => setFiles([]), [pathname]);
  const report = useCallback(
    (file: string) => setFiles((prev) => (prev.includes(file) ? prev : [...prev, file])),
    [],
  );
  return <Ctx.Provider value={{ files, report }}>{children}</Ctx.Provider>;
}

export const useSampleFiles = () => useContext(Ctx).files;
export const useReportSample = () => useContext(Ctx).report;
