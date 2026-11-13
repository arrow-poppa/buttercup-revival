// Minimal ZIP writer for extension build artifacts, using only Node.js APIs.
// Stored entries avoid platform-specific external zip tools and dependencies.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    return crc >>> 0;
});
function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
}
export async function zipDirectory(directory, destination) {
    const files = [];
    async function walk(relative = '') {
        const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) await walk(name);
            else if (entry.isFile()) files.push(name);
            else throw new Error('Extension archives cannot contain symbolic links');
        }
    }
    await walk();
    const local = [], central = [];
    let offset = 0;
    for (const file of files) {
        const name = Buffer.from(file.split(path.sep).join('/')), data = await readFile(path.join(directory, file));
        const crc = crc32(data), header = Buffer.alloc(30), record = Buffer.alloc(46);
        header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
        header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
        record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8);
        record.writeUInt16LE(0x21, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
        local.push(header, name, data); central.push(record, name); offset += header.length + name.length + data.length;
    }
    const index = Buffer.concat(central), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
    await writeFile(destination, Buffer.concat([...local, index, end]));
}
