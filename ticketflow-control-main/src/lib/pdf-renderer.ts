let pdfjsLoaded: any = null;

async function getPdfjs() {
  if (!pdfjsLoaded) {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    pdfjsLoaded = pdfjsLib;
  }
  return pdfjsLoaded;
}

// Buffer kopieren damit er nicht "detached" wird
function copyBuffer(buffer: ArrayBuffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(new Uint8Array(buffer));
  return copy;
}

export async function renderPdfPageToBase64(
  pdfBuffer: ArrayBuffer,
  pageIndex: number,
  scale: number = 2.0
): Promise<string> {
  const pdfjsLib = await getPdfjs();
  // WICHTIG: Immer eine Kopie nutzen!
  const pdf = await pdfjsLib.getDocument({ data: copyBuffer(pdfBuffer) }).promise;
  const page = await pdf.getPage(pageIndex + 1); // pdfjs ist 1-basiert
  
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const context = canvas.getContext('2d')!;
  await page.render({ canvasContext: context, viewport }).promise;
  
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

export async function getPdfPageCount(pdfBuffer: ArrayBuffer): Promise<number> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: copyBuffer(pdfBuffer) }).promise;
  return pdf.numPages;
}
