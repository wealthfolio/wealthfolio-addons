import { readFileSync } from "node:fs";

/**
 * Minimal image inspection for catalog covers.
 *
 * Reading a header is not enough: the first thirty bytes of a WebP, or a PNG's
 * signature and IHDR, are happy to describe an image whose pixel data was never
 * written. A truncated file would pass every dimension and format check and
 * then fail to render for a user. So the container is walked to its end, and a
 * file is only an image if its own declared structure is all present.
 *
 * This is a structural check, not a decode: it proves the container is whole,
 * not that the pixels are meaningful.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Walks PNG chunks from IHDR to IEND. Every chunk declares its own length, so a
 * truncated file runs off the end before IEND is reached.
 */
function readPng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;

  let offset = 8;
  let header = null;
  let sawEnd = false;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const next = offset + 12 + length; // length + type + payload + CRC

    if (length > buffer.length || next > buffer.length) return null;

    if (type === "IHDR") {
      if (length < 13) return null;
      header = { width: buffer.readUInt32BE(offset + 8), height: buffer.readUInt32BE(offset + 12) };
    }

    if (type === "IEND") {
      sawEnd = true;
      break;
    }

    offset = next;
  }

  if (!header || !sawEnd) return null;
  return { format: "png", ...header };
}

/**
 * Walks RIFF chunks. The RIFF header declares the payload size, so a truncated
 * file is caught by comparing it against the bytes actually present.
 */
function readWebp(buffer) {
  if (buffer.length < 20) return null;
  if (buffer.subarray(0, 4).toString("ascii") !== "RIFF") return null;
  if (buffer.subarray(8, 12).toString("ascii") !== "WEBP") return null;

  // The size field covers everything after it, so the file must be that long.
  const declared = buffer.readUInt32LE(4);
  if (declared + 8 > buffer.length) return null;

  let offset = 12;
  let dimensions = null;

  while (offset + 8 <= declared + 8) {
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    const payload = offset + 8;
    if (payload + size > declared + 8) return null;

    if (!dimensions) {
      if (type === "VP8X" && size >= 10) {
        dimensions = {
          width: (buffer.readUIntLE(payload + 4, 3) & 0xffffff) + 1,
          height: (buffer.readUIntLE(payload + 7, 3) & 0xffffff) + 1,
        };
      } else if (type === "VP8 " && size >= 10) {
        dimensions = {
          width: buffer.readUInt16LE(payload + 6) & 0x3fff,
          height: buffer.readUInt16LE(payload + 8) & 0x3fff,
        };
      } else if (type === "VP8L" && size >= 5) {
        const bits = buffer.readUInt32LE(payload + 1);
        dimensions = {
          width: (bits & 0x3fff) + 1,
          height: ((bits >> 14) & 0x3fff) + 1,
        };
      }
    }

    // RIFF chunks are padded to an even length.
    offset = payload + size + (size % 2);
  }

  if (!dimensions) return null;

  // An extended file promises image data in a later chunk; a header alone is
  // not a picture.
  const hasImageData =
    buffer.subarray(12, 16).toString("ascii") !== "VP8X" ||
    buffer.includes(Buffer.from("VP8 ", "ascii"), 12) ||
    buffer.includes(Buffer.from("VP8L", "ascii"), 12);
  if (!hasImageData) return null;

  return { format: "webp", ...dimensions };
}

/**
 * Returns { format, width, height } for a structurally complete PNG or WebP, or
 * null when the bytes are not a whole image of a supported type.
 */
export function inspectImage(filePath) {
  const buffer = readFileSync(filePath);
  return readPng(buffer) ?? readWebp(buffer);
}
