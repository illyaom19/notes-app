import { createPdfDocumentWidget } from "./pdf-document-widget.js";

export async function createWidget(definition) {
  return createPdfDocumentWidget(definition);
}
