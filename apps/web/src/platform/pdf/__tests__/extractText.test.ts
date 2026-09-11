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
  beforeEach(() => {
    getDocument.mockReset();
  });

  test('normalizes cropped and rotated PDF.js coordinates through each page viewport', async () => {
    let loadedData: Uint8Array | undefined;
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const destroy = vi.fn().mockResolvedValue(undefined);
    const pages = [
      {
        getViewport: () => ({
          width: 540,
          height: 720,
          convertToViewportPoint: (x: number, y: number) => [x - 36, 756 - y],
        }),
        getTextContent: async () => ({
          items: [
            textItem('DATE', 72, 720, 28),
            { type: 'beginMarkedContent', id: 'section-1' },
            textItem('01.09.2026', 120, 700, 64),
          ],
        }),
      },
      {
        getViewport: () => ({
          width: 842,
          height: 595,
          convertToViewportPoint: (x: number, y: number) => [842 - y, x],
        }),
        getTextContent: async () => ({
          items: [textItem('TOTAL', 48, 80, 36)],
        }),
      },
    ];

    getDocument.mockImplementation(({ data }: { data: Uint8Array }) => {
      loadedData = data;
      return {
        destroy,
        promise: Promise.resolve({
          cleanup,
          numPages: pages.length,
          getPage: async (pageNumber: number) => pages[pageNumber - 1],
        }),
      };
    });

    await expect(extractPdfText(pdfFile([37, 80, 68, 70]))).resolves.toEqual([
      {
        width: 540,
        height: 720,
        items: [
          { str: 'DATE', x: 36, y: 36, width: 28 },
          { str: '01.09.2026', x: 84, y: 56, width: 64 },
        ],
      },
      {
        width: 842,
        height: 595,
        items: [{ str: 'TOTAL', x: 762, y: 48, width: 36 }],
      },
    ]);
    expect(Array.from(loadedData ?? [])).toEqual([37, 80, 68, 70]);
    expect(workerOptions.workerSrc).toBe('/assets/pdf.worker.min.mjs');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  test('releases the document and loading task when page extraction fails', async () => {
    const extractionError = new Error('broken text stream');
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({
      destroy,
      promise: Promise.resolve({
        cleanup,
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({
            width: 612,
            height: 792,
            convertToViewportPoint: (x: number, y: number) => [x, 792 - y],
          }),
          getTextContent: async () => { throw extractionError; },
        }),
      }),
    });

    await expect(extractPdfText(pdfFile([37, 80, 68, 70]))).rejects.toBe(extractionError);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  test('destroys the loading task when document loading fails', async () => {
    const loadingError = new Error('encrypted document');
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({
      destroy,
      promise: Promise.reject(loadingError),
    });

    await expect(extractPdfText(pdfFile([37, 80, 68, 70]))).rejects.toBe(loadingError);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
