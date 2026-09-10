import { downloadJson, readTextFile, shareOrDownloadJson } from '../files';

function fileWithText(body: string, name = 'pilot-logbook-backup.json'): File {
  const file = new File([body], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => body });
  return file;
}

describe('browser file adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('reads the selected file as text', async () => {
    await expect(readTextFile(fileWithText('{"app":"pilot-logbook"}'))).resolves.toBe(
      '{"app":"pilot-logbook"}',
    );
  });

  test('downloads JSON through a temporary object URL and revokes it', () => {
    const createObjectURL = vi.fn<(object: Blob | MediaSource) => string>(
      () => 'blob:pilot-logbook-backup',
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    let clickedAnchor: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      clickedAnchor = this;
    });

    downloadJson('backup.json', '{"entries":[]}');

    expect(clickedAnchor?.download).toBe('backup.json');
    expect(clickedAnchor?.href).toBe('blob:pilot-logbook-backup');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe('application/json');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pilot-logbook-backup');
  });

  test('shares a JSON file when the browser accepts file sharing', async () => {
    const file = fileWithText('{"entries":[]}');
    const canShare = vi.fn(() => true);
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { canShare, share });

    await expect(shareOrDownloadJson(file)).resolves.toBe('shared');
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Pilot Logbook backup' });
  });

  test('downloads the JSON file when sharing is rejected', async () => {
    const file = fileWithText('{"entries":[]}');
    const createObjectURL = vi.fn<(object: Blob | MediaSource) => string>(
      () => 'blob:fallback-download',
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: async () => Promise.reject(new Error('share cancelled')),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await expect(shareOrDownloadJson(file)).resolves.toBe('downloaded');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fallback-download');
  });
});
