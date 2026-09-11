/// <reference types="vite/client" />

import type { ExtractedPage } from '@pilot-logbook/core';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Extracts positioned text from a PDF using PDF.js in the browser. */
export async function extractPdfText(file: File): Promise<ExtractedPage[]> {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await loadingTask.promise;
  const pages: ExtractedPage[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items = content.items
      .filter((item) => 'str' in item)
      .map((item) => ({
        str: item.str,
        x: item.transform[4],
        // PDF text space is bottom-origin; core expects ascending y in reading order.
        y: viewport.height - item.transform[5],
        width: item.width,
      }));

    pages.push({ items, width: viewport.width, height: viewport.height });
  }

  return pages;
}
