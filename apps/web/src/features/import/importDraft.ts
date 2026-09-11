import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CrossCheck } from '@pilot-logbook/core';

import type { PdfImportCandidateDraft } from '../../db/repositories/pdfImport';

export interface LogbookImportDraft {
  candidates: PdfImportCandidateDraft[];
  crossChecks: CrossCheck[];
  fileName: string;
  ruleId: string;
}

interface ImportDraftContextValue {
  clearDraft(): void;
  draft?: LogbookImportDraft;
  setDraft(draft: LogbookImportDraft): void;
}

const ImportDraftContext = createContext<ImportDraftContextValue | undefined>(undefined);

export function ImportDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<LogbookImportDraft>();
  const value = useMemo<ImportDraftContextValue>(
    () => ({
      clearDraft: () => setDraftState(undefined),
      draft,
      setDraft: setDraftState,
    }),
    [draft],
  );

  return createElement(ImportDraftContext.Provider, { value }, children);
}

export function useImportDraft(): ImportDraftContextValue {
  const value = useContext(ImportDraftContext);
  if (!value) throw new Error('useImportDraft must be used inside ImportDraftProvider');
  return value;
}
