// Rendert PDF-Seiten als Base64-PNG für OCR
// Uses dynamic import to avoid crashing if pdfjs-dist has issues

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

export async function renderPdfPageToBase64(
  pdfBuffer: ArrayBuffer,
  pageNumber: number,
  scale: number = 2.0
): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  const page = await pdf.getPage(pageNumber);
  
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const context = canvas.getContext('2d')!;
  await page.render({ canvasContext: context, viewport, canvas } as any).promise;
  
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

export async function getPdfPageCount(pdfBuffer: ArrayBuffer): Promise<number> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  return pdf.numPages;
}
