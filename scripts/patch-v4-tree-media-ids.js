#!/usr/bin/env node
/**
 * Automated Asset Queue with ID Feedback
 * 
 * Patcht den v4-tree.json direkt, um nackte Framer-Image-URLs durch die korrekte 
 * V4 image-src Struktur mit der hochgeladenen WordPress Media ID zu ersetzen.
 * Einhaltung von Invariant IV: Wenn 'id' gesetzt ist, wird der 'url'-Schlüssel weggelassen.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function unwrapUrl(urlValue) {
  if (typeof urlValue === 'string') return urlValue;
  if (urlValue && typeof urlValue === 'object') return urlValue.value || urlValue.url || null;
  return null;
}

function resolveMediaId(url, imageMap) {
  if (!url || !imageMap) return null;
  const filename = url.split('/').pop().split('?')[0];
  const candidates = [
    imageMap[url],
    imageMap.images?.[filename],
    imageMap.videos?.[filename],
  ].filter(Boolean);

  if (Array.isArray(imageMap.assets)) {
    candidates.push(...imageMap.assets.filter(a => a.url === url || a.filename === filename));
  }
  if (Array.isArray(imageMap.images)) {
    candidates.push(...imageMap.images.filter(a => a.url === url || a.filename === filename));
  }

  for (const entry of candidates) {
    const id = entry.wp_media_id ?? entry.media_id ?? entry.id;
    if (id !== null && id !== undefined) return id;
  }
  return null;
}

function walkAndPatch(obj, imageMap) {
  if (typeof obj !== 'object' || obj === null) return;

  // Prüfe, ob dies ein image-src Knoten ist, der gepatcht werden muss
  if (obj['$$type'] === 'image-src') {
    const value = obj.value && typeof obj.value === 'object' ? obj.value : obj;
    // Suche nach einer URL im value-Objekt, die wir mappen können
    const urlValue = unwrapUrl(value.url);
    const wpMediaId = resolveMediaId(urlValue, imageMap);
    if (wpMediaId) {
      // Invariant IV: id MUSS als { $$type: "image-attachment-id", value: <number> } gewrappt sein.
      // url-Key DARF NICHT existieren (nicht mal als null) - PHP array_filter strippt null-Werte.
      obj.value = { id: { '$$type': 'image-attachment-id', value: wpMediaId } };
      // Sauber: alle alten Felder auf oberster Ebene entfernen
      delete obj.id;
      delete obj.url;
      delete obj._url;
      return; // Weiteres Walking nicht noetig
    }
  }

  // Rekursives Walking für alle anderen Objekte/Arrays
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      walkAndPatch(obj[key], imageMap);
    }
  }
}

async function main() {
  const treePath = process.argv[2] || path.join(rootDir, 'v4-tree.json');
  const mapPath = process.argv[3] || path.join(rootDir, 'image-map.json');
  const outputPath = process.argv[4] || treePath;

  if (!fs.existsSync(treePath)) {
    console.error(`❌ Tree nicht gefunden: ${treePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(mapPath)) {
    console.error(`❌ Image-Map nicht gefunden: ${mapPath}. Führe zuerst den Media-Upload durch.`);
    process.exit(1);
  }

  console.log(`▶️  Lade Tree von: ${treePath}`);
  const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));

  console.log(`▶️  Lade Image-Map von: ${mapPath}`);
  const imageMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

  console.log('▶️  Patche v4-tree.json mit WordPress Media IDs...');
  walkAndPatch(tree, imageMap);

  fs.writeFileSync(outputPath, JSON.stringify(tree, null, 2), 'utf8');
  console.log(`✅ Tree erfolgreich gepatcht und gespeichert unter: ${outputPath}`);
}

main();
