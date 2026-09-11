const { getDocument, workerOptions } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: { workerSrc: '' },
}));

vi.mock('pdfjs-dist', () => ({
  getDocument,
  GlobalWorkerOptions: workerOptions,
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min.mjs',
}));

import { extractPdfText } from '../extractText';

function pdfFile(bytes: number[]): File {
  const file = new File([new Uint8Array(bytes)], 'roster.pdf', { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => Uint8Array.from(bytes).buffer,
  });
  return file;
}

function textItem(str: string, x: number, y: number, width: number) {
  return {
    str,
    dir: 'ltr',
    transform: [1, 0, 0, 1, x, y],
    width,
    height: 12,
    fontName: 'g_d0_f1',
    hasEOL: false,
  };
}

describe('browser PDF text extraction', () => {
  test('normalizes PDF.js text items into top-origin extracted pages', async () => {
    let loadedData: Uint8Array | undefined;
    const pages = [
      {
        getViewport: () => ({ width: 612, height: 792 }),
        getTextContent: async () => ({
          items: [
            textItem('DATE', 72, 720, 28),
            { type: 'beginMarkedContent', id: 'section-1' },
            textItem('01.09.2026', 120, 700, 64),
          ],
        }),
      },
      {
        getViewport: () => ({ width: 595, height: 842 }),
        getTextContent: async () => ({
          items: [textItem('TOTAL', 48, 80, 36)],
        }),
      },
    ];

    getDocument.mockImplementation(({ data }: { data: Uint8Array }) => {
      loadedData = data;
      return {
        promise: Promise.resolve({
          numPages: pages.length,
          getPage: async (pageNumber: number) => pages[pageNumber - 1],
        }),
      };
    });

    await expect(extractPdfText(pdfFile([37, 80, 68, 70]))).resolves.toEqual([
      {
        width: 612,
        height: 792,
        items: [
          { str: 'DATE', x: 72, y: 72, width: 28 },
          { str: '01.09.2026', x: 120, y: 92, width: 64 },
        ],
      },
      {
        width: 595,
        height: 842,
        items: [{ str: 'TOTAL', x: 48, y: 762, width: 36 }],
      },
    ]);
    expect(Array.from(loadedData ?? [])).toEqual([37, 80, 68, 70]);
    expect(workerOptions.workerSrc).toBe('/assets/pdf.worker.min.mjs');
  });
});
