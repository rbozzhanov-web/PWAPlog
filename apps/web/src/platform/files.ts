export async function readTextFile(file: File): Promise<string> {
  return file.text();
}

export function downloadJson(filename: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadJson(file: File): Promise<'shared' | 'downloaded'> {
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: 'Pilot Logbook backup' });
      return 'shared';
    } catch {
      // A cancelled or failed share still leaves the user a recoverable download path.
    }
  }

  downloadJson(file.name, await readTextFile(file));
  return 'downloaded';
}
