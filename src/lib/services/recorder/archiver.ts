// lib/services/recorder/archiver.ts

import JSZip from 'jszip';
import type { RecorderFixture } from '../../types/recorder';

const INVALID_PATH_SEGMENT = /[<>:"/\\|?*\u0000-\u001f]+/g;
const MAX_SEGMENT_LENGTH = 150;

const sanitizePathSegment = (value: string, fallback: string): string => {
  const cleaned = value
    .replace(INVALID_PATH_SEGMENT, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return fallback;
  }
  return cleaned.slice(0, MAX_SEGMENT_LENGTH);
};

const formatTimestampSegment = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown-timestamp';
  }
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    `${parsed.getUTCFullYear()}${pad(parsed.getUTCMonth() + 1)}${pad(parsed.getUTCDate())}`,
    `${pad(parsed.getUTCHours())}${pad(parsed.getUTCMinutes())}${pad(parsed.getUTCSeconds())}`,
  ].join('T');
};

const deriveDomainSegment = (url: string): string => {
  try {
    const hostname = new URL(url).hostname || 'unknown-domain';
    return sanitizePathSegment(hostname, 'unknown-domain');
  } catch {
    return 'unknown-domain';
  }
};

const stripScheme = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.href.replace(/^https?:\/\//i, '');
  } catch {
    return url;
  }
};

const buildRecorderPath = (fixture: RecorderFixture): string => {
  const domain = deriveDomainSegment(fixture.url);
  const timestamp = formatTimestampSegment(fixture.capturedAt);
  const urlSegment = sanitizePathSegment(stripScheme(fixture.url), 'page');
  const filename = `${timestamp}--${urlSegment}.html`;
  return `${domain}/${filename}`;
};

export const buildRecorderArchiveName = (fixtures: readonly RecorderFixture[]): string => {
  const mostRecent = fixtures[0]?.capturedAt ?? new Date().toISOString();
  const timestamp = formatTimestampSegment(mostRecent);
  return `recorder-fixtures-${timestamp}.zip`;
};

export const buildRecorderArchive = async (
  fixtures: readonly RecorderFixture[]
): Promise<Blob | null> => {
  const zip = new JSZip();
  for (const fixture of fixtures) {
    zip.file(buildRecorderPath(fixture), fixture.html);
  }

  try {
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/zip',
    });
    return blob;
  } catch (error) {
    console.error('Recorder zip blob generation failed', error);
    return null;
  }
};
