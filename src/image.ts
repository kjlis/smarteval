import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { imageArtifactSchema, type ImageArtifact } from "./schemas.js";

interface ImageStats {
  pixel_count: number;
  unique_sampled_colors: number;
  color_range: number;
  average_alpha: number;
  appears_blank: boolean;
}

export function detectMimeType(buffer: Buffer, path: string): string {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export function imageDimensions(buffer: Buffer, mimeType: string): { width?: number; height?: number } {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }
  return {};
}

function bytesPerPixel(colorType: number): number {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`Unsupported PNG color type for blankness analysis: ${colorType}`);
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function unfilterPngScanlines(raw: Buffer, width: number, height: number, pixelWidth: number): Buffer {
  const rowBytes = width * pixelWidth;
  const pixels = Buffer.alloc(rowBytes * height);
  let inputOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = raw[inputOffset];
    inputOffset += 1;
    const rowOffset = row * rowBytes;
    const previousRowOffset = rowOffset - rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const value = raw[inputOffset + column] ?? 0;
      const left = column >= pixelWidth ? pixels[rowOffset + column - pixelWidth] ?? 0 : 0;
      const above = row > 0 ? pixels[previousRowOffset + column] ?? 0 : 0;
      const upperLeft = row > 0 && column >= pixelWidth ? pixels[previousRowOffset + column - pixelWidth] ?? 0 : 0;
      let decoded: number;
      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + above;
      else if (filter === 3) decoded = value + Math.floor((left + above) / 2);
      else if (filter === 4) decoded = value + paeth(left, above, upperLeft);
      else throw new Error(`Unsupported PNG filter type: ${filter}`);
      pixels[rowOffset + column] = decoded & 0xff;
    }
    inputOffset += rowBytes;
  }
  return pixels;
}

function pngChunks(buffer: Buffer): Array<{ type: string; data: Buffer }> {
  const chunks: Array<{ type: string; data: Buffer }> = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

export function imageStats(buffer: Buffer, mimeType: string): ImageStats | undefined {
  if (mimeType !== "image/png") return undefined;
  const chunks = pngChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR")?.data;
  if (!ihdr || ihdr.length < 13) return undefined;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (bitDepth !== 8 || interlace !== 0 || width === 0 || height === 0) return undefined;

  const pixelWidth = bytesPerPixel(colorType);
  const compressed = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const pixels = unfilterPngScanlines(inflateSync(compressed), width, height, pixelWidth);
  const colors = new Set<string>();
  let minChannel = 255;
  let maxChannel = 0;
  let alphaTotal = 0;
  let allWhite = true;
  let allBlack = true;
  let allTransparent = true;

  for (let offset = 0; offset < pixels.length; offset += pixelWidth) {
    const gray = pixels[offset] ?? 0;
    const red = colorType === 0 || colorType === 4 ? gray : pixels[offset] ?? 0;
    const green = colorType === 0 || colorType === 4 ? gray : pixels[offset + 1] ?? 0;
    const blue = colorType === 0 || colorType === 4 ? gray : pixels[offset + 2] ?? 0;
    const alpha = colorType === 4 ? pixels[offset + 1] ?? 255 : colorType === 6 ? pixels[offset + 3] ?? 255 : 255;
    colors.add(`${red},${green},${blue},${alpha}`);
    minChannel = Math.min(minChannel, red, green, blue);
    maxChannel = Math.max(maxChannel, red, green, blue);
    alphaTotal += alpha;
    allTransparent = allTransparent && alpha < 8;
    allWhite = allWhite && alpha >= 8 && red > 247 && green > 247 && blue > 247;
    allBlack = allBlack && alpha >= 8 && red < 8 && green < 8 && blue < 8;
  }

  const pixelCount = width * height;
  return {
    pixel_count: pixelCount,
    unique_sampled_colors: colors.size,
    color_range: maxChannel - minChannel,
    average_alpha: pixelCount === 0 ? 0 : alphaTotal / pixelCount,
    appears_blank: allTransparent || allWhite || allBlack
  };
}

export function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export async function materializeImageArtifact(options: {
  root: string;
  runDir: string;
  exampleId: string;
  raw: unknown;
}): Promise<ImageArtifact> {
  const parsed = imageArtifactSchema.parse(options.raw);
  const source = isAbsolute(parsed.image_path)
    ? parsed.image_path
    : join(options.root, parsed.image_path);
  if (!isPathInside(options.root, source)) {
    throw new Error(`Image artifact path must stay inside repo root: ${parsed.image_path}`);
  }

  const file = await readFile(source);
  const mimeType = parsed.mime_type ?? detectMimeType(file, source);
  const dims = imageDimensions(file, mimeType);
  const stats = imageStats(file, mimeType);
  const safeName = `${options.exampleId}${extname(source) || ".img"}`;
  const destRel = join("artifacts", "images", safeName);
  const dest = join(options.runDir, destRel);
  await mkdir(join(options.runDir, "artifacts", "images"), { recursive: true });
  await copyFile(source, dest);
  const info = await stat(dest);

  return {
    ...parsed,
    example_id: options.exampleId,
    image_path: destRel,
    mime_type: mimeType,
    width: parsed.width ?? dims.width,
    height: parsed.height ?? dims.height,
    file_size_bytes: info.size,
    sha256: createHash("sha256").update(file).digest("hex"),
    metadata: {
      original_path: parsed.image_path,
      copied_filename: basename(dest),
      ...(stats ? { image_stats: stats } : {}),
      ...parsed.metadata
    }
  };
}
