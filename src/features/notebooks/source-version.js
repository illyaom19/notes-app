import { fingerprintNoteEntry, fingerprintReferenceEntry } from './library-fingerprint.js';
export function sourceVersion(kind, source) {
  if (!source) return null;
  const content = kind === 'note' ? fingerprintNoteEntry(source) : kind === 'reference' ? fingerprintReferenceEntry(source) : `${source.pdfAssetId}:${source.pdfRasterAssetId}:${JSON.stringify(source.inkStrokes ?? [])}`;
  return `${source.title}:${source.sourceLabel ?? ''}:${content}`;
}
export function sourceProvenance(kind, source) {
  return { kind, id: source.id, version: sourceVersion(kind, source), dismissedVersion: null, neverNotify: false };
}
export function isStaleCopy(metadata, source) {
  const origin = metadata?.sourceProvenance;
  const version = origin && sourceVersion(origin.kind, source);
  return Boolean(metadata?.independentCopy && source && source.status !== 'deleted' && !origin.neverNotify && version !== origin.version && version !== origin.dismissedVersion);
}
