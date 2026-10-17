import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const directory = `${RNFS.DocumentDirectoryPath}/NorskRomLibrary`;
const indexKey = 'norsk-rom.local-library.v1';

async function readIndex() {
  try { const raw = await AsyncStorage.getItem(indexKey); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

export async function listLocalLessons() {
  const index = await readIndex();
  const lessons = await Promise.all(index.map(async ({ id, file }) => {
    try { return JSON.parse(await RNFS.readFile(`${directory}/${file}`, 'utf8')); }
    catch { return null; }
  }));
  return lessons.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function saveLocalLesson(lesson) {
  await RNFS.mkdir(directory, { NSURLIsExcludedFromBackupKey: true });
  const safeId = String(lesson.id).replace(/[^a-zA-Z0-9_-]/g, '-');
  const file = `${safeId}.json`;
  await RNFS.writeFile(`${directory}/${file}`, JSON.stringify(lesson), 'utf8');
  const index = await readIndex();
  const next = [{ id: safeId, file }, ...index.filter(entry => entry.id !== safeId)].slice(0, 40);
  const keep = new Set(next.map(entry => entry.id));
  await Promise.all(index.filter(entry => !keep.has(entry.id)).map(async entry => {
    const oldPath = `${directory}/${entry.file}`;
    if (await RNFS.exists(oldPath)) await RNFS.unlink(oldPath).catch(() => {});
  }));
  await AsyncStorage.setItem(indexKey, JSON.stringify(next));
  return lesson;
}

export async function removeLocalLesson(id) {
  const index = await readIndex();
  const item = index.find(entry => entry.id === id);
  if (item && await RNFS.exists(`${directory}/${item.file}`)) await RNFS.unlink(`${directory}/${item.file}`);
  await AsyncStorage.setItem(indexKey, JSON.stringify(index.filter(entry => entry.id !== id)));
}

export async function importLocalFile(asset) {
  await RNFS.mkdir(`${directory}/sources`, { NSURLIsExcludedFromBackupKey: true });
  const expectedBytes = Number(asset.size || 0);
  if (expectedBytes > 0) {
    const { freeSpace } = await RNFS.getFSInfo();
    if (Number(freeSpace) < expectedBytes + 100 * 1024 * 1024) throw new Error('Free more space on this phone before importing this source.');
  }
  const name = String(asset.name || 'imported-audio').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const destination = `${directory}/sources/${Date.now()}-${name}`;
  const sourceUri = asset.fileCopyUri || asset.uri;
  const sourcePath = decodeURIComponent(sourceUri.replace(/^file:\/\//, ''));
  await RNFS.copyFile(sourcePath, destination);
  return { name, path: destination, bytes: Number(asset.size || (await RNFS.stat(destination)).size) };
}

export async function readLocalText(path) { return RNFS.readFile(path, 'utf8'); }
