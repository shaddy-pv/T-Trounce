import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface PdfExportOptions {
  filename?: string;
  studentName?: string;
}

/**
 * Generates and downloads a clean, publication-grade standalone A4 PDF document.
 * Eliminates all browser navigation, URLs, headers, and webpage layout artifacts.
 */
export async function downloadReportPdf(
  elementId: string,
  options?: PdfExportOptions,
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Report element with ID "${elementId}" not found`);
  }

  // Temporary style adjustments for optimal print rasterization
  const originalShadow = element.style.boxShadow;
  element.style.boxShadow = "none";

  try {
    const canvas = await html2canvas(element, {
      scale: 2.5, // High DPI for crisp text and slender audio bars
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 1024,
    });

    const imgData = canvas.toDataURL("image/png", 1.0);

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

    const margin = 10; // 10mm border margin
    const contentWidth = pageWidth - margin * 2; // 190mm
    const contentHeight = (canvas.height * contentWidth) / canvas.width;

    // Center vertically if it fits cleanly on a single A4 page
    const yOffset =
      contentHeight < pageHeight - margin * 2
        ? margin + (pageHeight - margin * 2 - contentHeight) / 2
        : margin;

    pdf.addImage(
      imgData,
      "PNG",
      margin,
      Math.max(margin, yOffset),
      contentWidth,
      Math.min(contentHeight, pageHeight - margin * 2),
      undefined,
      "FAST",
    );

    const safeName =
      (options?.studentName || "Student")
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 40) || "Student";

    const fileName = options?.filename || `Trounce-Progress-Report-${safeName}.pdf`;
    pdf.save(fileName);
  } finally {
    element.style.boxShadow = originalShadow;
  }
}

/**
 * Prints ONLY the report document inside an isolated hidden iframe.
 * Avoids printing the entire webpage, browser navbar, or sidebar.
 */
export function printIsolatedDocument(elementId: string): void {
  const element = document.getElementById(elementId);
  if (!element) return;

  // Convert any canvas inside element (like the waveform) to image data URLs
  // so they print identically in the iframe
  const cloned = element.cloneNode(true) as HTMLElement;
  const originalCanvases = element.querySelectorAll("canvas");
  const clonedCanvases = cloned.querySelectorAll("canvas");

  originalCanvases.forEach((orig, idx) => {
    try {
      const target = clonedCanvases[idx];
      if (target) {
        const img = document.createElement("img");
        img.src = orig.toDataURL("image/png");
        img.style.width = "100%";
        img.style.height = `${orig.clientHeight || 110}px`;
        img.style.display = "block";
        target.parentNode?.replaceChild(img, target);
      }
    } catch {
      // Fallback to original
    }
  });

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  // Extract all page styles so the document inherits crisp typography and styling
  const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
    .map((el) => el.outerHTML)
    .join("\n");

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Trounce Official Progress Report</title>
        ${styles}
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background: #ffffff !important;
            color: #0f172a !important;
            margin: 0 !important;
            padding: 0 !important;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          }
          .isolated-doc-wrapper {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
          }
        </style>
      </head>
      <body>
        <div class="isolated-doc-wrapper">
          ${cloned.outerHTML}
        </div>
      </body>
    </html>
  `);
  doc.close();

  // Allow iframe layout engine to compute fonts and images
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1500);
  }, 400);
}
