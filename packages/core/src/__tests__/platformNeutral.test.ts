describe('core runtime boundary', () => {
  test('runs without a browser document', () => {
    const runtime = globalThis as Record<string, unknown>;

    expect(runtime.document).toBeUndefined();
  });
});
