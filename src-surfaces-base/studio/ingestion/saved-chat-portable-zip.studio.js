/* H2O Studio — Saved Chat Portable ZIP (Desktop / M08)
 *
 * Narrow, dependency-free ZIP container mechanics for one verified
 * `.h2ochat` package. Owns no package identity, filesystem selection, store
 * mutation, Sync, cloud, or archive publication behavior.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};
  if (H2O.Studio.ingestion.savedChatPortableZip &&
      H2O.Studio.ingestion.savedChatPortableZip.__installed) return;

  var MODULE_VERSION = '1.0.0-m08-p1';
  var ZIP_INPUT_CAP_BYTES = 128 * 1024 * 1024;
  var ZIP_ENTRY_COUNT_CAP = 1024;
  var ZIP_FILENAME_BYTE_CAP = 1024;
  var ZIP_COMPRESSED_ENTRY_CAP_BYTES = 64 * 1024 * 1024;
  var ZIP_UNCOMPRESSED_ENTRY_CAP_BYTES = 64 * 1024 * 1024;
  var ZIP_TOTAL_UNCOMPRESSED_CAP_BYTES = 256 * 1024 * 1024;
  var METHOD_STORED = 0;
  var METHOD_DEFLATE = 8;
  var UTF8_FLAG = 0x0800;
  var ALLOWED_FLAGS = UTF8_FLAG;
  var ZIP_VERSION = 20;
  var FIXED_DOS_TIME = 0;
  var FIXED_DOS_DATE = (40 << 9) | (1 << 5) | 1; /* 2020-01-01 */

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function cleanString(value) { return String(value == null ? '' : value).trim(); }

  function zipError(code, message, detail) {
    var error = new Error(message);
    error.name = 'SavedChatPortableZipError';
    error.code = code;
    if (typeof detail !== 'undefined') error.detail = detail;
    return error;
  }

  function isZipError(error) {
    return !!(error && error.name === 'SavedChatPortableZipError' &&
      /^saved-chat-zip-/.test(cleanString(error.code)));
  }

  function checkedAdd(left, right, code) {
    var result = left + right;
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) ||
        left < 0 || right < 0 || !Number.isSafeInteger(result)) {
      throw zipError(code || 'saved-chat-zip-size-overflow', 'ZIP byte accounting overflow');
    }
    return result;
  }

  function normalizeBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (value && typeof ArrayBuffer !== 'undefined' &&
        ArrayBuffer.isView && ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (Array.isArray(value)) return Uint8Array.from(value);
    throw zipError('saved-chat-zip-invalid-byte-input', 'ZIP input must be bytes');
  }

  function copyBytes(value) {
    var source = normalizeBytes(value);
    var copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return copy;
  }

  function utf8Encode(value) {
    if (typeof global.TextEncoder !== 'function') {
      throw zipError('saved-chat-zip-utf8-unavailable', 'TextEncoder is unavailable');
    }
    return new global.TextEncoder().encode(String(value));
  }

  function utf8Decode(bytes) {
    if (typeof global.TextDecoder !== 'function') {
      throw zipError('saved-chat-zip-utf8-unavailable', 'TextDecoder is unavailable');
    }
    try { return new global.TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { throw zipError('saved-chat-zip-name-utf8-invalid', 'ZIP entry name is not canonical UTF-8'); }
  }

  function sameBytes(left, right) {
    if (left.byteLength !== right.byteLength) return false;
    for (var i = 0; i < left.byteLength; i += 1) if (left[i] !== right[i]) return false;
    return true;
  }

  var CRC32_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i += 1) {
      var value = i;
      for (var bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytesInput) {
    var bytes = normalizeBytes(bytesInput);
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.byteLength; i += 1) {
      crc = (CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function u16le(value) {
    return Uint8Array.of(value & 0xFF, (value >>> 8) & 0xFF);
  }

  function u32le(value) {
    return Uint8Array.of(
      value & 0xFF,
      (value >>> 8) & 0xFF,
      (value >>> 16) & 0xFF,
      (value >>> 24) & 0xFF
    );
  }

  function concatBytes(parts, cap) {
    var total = 0;
    for (var i = 0; i < parts.length; i += 1) {
      total = checkedAdd(total, parts[i].byteLength, 'saved-chat-zip-size-overflow');
      if (typeof cap === 'number' && total > cap) {
        throw zipError('saved-chat-zip-physical-size-exceeds-cap', 'ZIP physical output exceeds its cap', { cap: cap });
      }
    }
    var out = new Uint8Array(total);
    var offset = 0;
    for (var j = 0; j < parts.length; j += 1) {
      out.set(parts[j], offset);
      offset += parts[j].byteLength;
    }
    return out;
  }

  function readU16(bytes, offset, code) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 2 > bytes.byteLength) {
      throw zipError(code || 'saved-chat-zip-truncated', 'ZIP 16-bit field is truncated');
    }
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readU32(bytes, offset, code) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > bytes.byteLength) {
      throw zipError(code || 'saved-chat-zip-truncated', 'ZIP 32-bit field is truncated');
    }
    return ((bytes[offset]) |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>> 0;
  }

  function validateEntryName(nameInput) {
    var name = String(nameInput == null ? '' : nameInput);
    var encoded = utf8Encode(name);
    if (!name || encoded.byteLength === 0) {
      throw zipError('saved-chat-zip-name-invalid', 'ZIP entry name is required');
    }
    if (encoded.byteLength > ZIP_FILENAME_BYTE_CAP) {
      throw zipError('saved-chat-zip-name-too-long', 'ZIP entry name exceeds its byte cap');
    }
    if (name.indexOf('\0') >= 0 || name.charAt(0) === '/' || name.charAt(0) === '\\' ||
        /^[A-Za-z]:/.test(name) || name.indexOf('\\') >= 0 || name.charAt(name.length - 1) === '/') {
      throw zipError('saved-chat-zip-name-unsafe', 'ZIP entry name is absolute, path-ambiguous, or directory-shaped');
    }
    var segments = name.split('/');
    if (segments.some(function (segment) {
      return !segment || segment === '.' || segment === '..' || segment.indexOf(':') >= 0;
    })) {
      throw zipError('saved-chat-zip-name-unsafe', 'ZIP entry name contains an unsafe path segment');
    }
    return { name: name, bytes: encoded };
  }

  function canonicalRoleRank(name) {
    var slash = name.indexOf('/');
    var relative = slash >= 0 ? name.slice(slash + 1) : name;
    if (relative === 'manifest.json') return 0;
    if (relative === 'snapshot.json') return 1;
    if (relative === 'chat.md') return 2;
    if (relative === 'chat.html') return 3;
    if (relative.indexOf('assets/') === 0) return 4;
    return 5;
  }

  function canonicalEntryCompare(left, right) {
    var leftRank = canonicalRoleRank(left.name);
    var rightRank = canonicalRoleRank(right.name);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.name < right.name ? -1 : (left.name > right.name ? 1 : 0);
  }

  function streamFromBytes(value) {
    if (typeof global.ReadableStream !== 'function') {
      throw zipError('saved-chat-zip-stream-unavailable', 'ReadableStream is unavailable');
    }
    var bytes = copyBytes(value);
    return new global.ReadableStream({
      start: function (controller) { controller.enqueue(bytes); controller.close(); },
    });
  }

  async function collectStreamBounded(readable, byteCap, code, message) {
    var reader = readable.getReader();
    var chunks = [];
    var total = 0;
    try {
      while (true) {
        var step = await reader.read();
        if (step.done) break;
        var incoming = normalizeBytes(step.value);
        total = checkedAdd(total, incoming.byteLength, 'saved-chat-zip-size-overflow');
        if (total > byteCap) {
          try { await reader.cancel(); } catch (_) { /* best effort */ }
          throw zipError(code, message, { byteCap: byteCap });
        }
        chunks.push(copyBytes(incoming));
      }
    } finally {
      try { reader.releaseLock(); } catch (_) { /* ignore */ }
    }
    return concatBytes(chunks, byteCap);
  }

  async function rawDeflate(value) {
    if (typeof global.CompressionStream !== 'function') {
      throw zipError('saved-chat-zip-method8-unavailable', 'CompressionStream raw DEFLATE is unavailable');
    }
    var compressor;
    try { compressor = new global.CompressionStream('deflate-raw'); }
    catch (_) { throw zipError('saved-chat-zip-method8-unavailable', 'CompressionStream raw DEFLATE is unavailable'); }
    try {
      return await collectStreamBounded(
        streamFromBytes(value).pipeThrough(compressor),
        ZIP_COMPRESSED_ENTRY_CAP_BYTES,
        'saved-chat-zip-compressed-entry-exceeds-cap',
        'Raw-DEFLATE output exceeds the compressed entry cap'
      );
    } catch (error) {
      if (isZipError(error)) throw error;
      throw zipError('saved-chat-zip-compression-failed', 'Raw-DEFLATE compression failed');
    }
  }

  async function rawInflateBounded(value, declaredLength) {
    if (typeof global.DecompressionStream !== 'function') {
      throw zipError('saved-chat-zip-method8-unavailable', 'DecompressionStream raw DEFLATE is unavailable');
    }
    var decompressor;
    try { decompressor = new global.DecompressionStream('deflate-raw'); }
    catch (_) { throw zipError('saved-chat-zip-method8-unavailable', 'DecompressionStream raw DEFLATE is unavailable'); }
    try {
      return await collectStreamBounded(
        streamFromBytes(value).pipeThrough(decompressor),
        Math.min(declaredLength, ZIP_UNCOMPRESSED_ENTRY_CAP_BYTES),
        'saved-chat-zip-decompressed-entry-exceeds-cap',
        'Raw-DEFLATE output exceeds its declared or governed cap'
      );
    } catch (error) {
      if (isZipError(error)) throw error;
      throw zipError('saved-chat-zip-decompression-failed', 'Raw-DEFLATE decompression failed');
    }
  }

  async function buildPortableZip(entriesInput, options) {
    var opts = safeObject(options);
    var method = opts.method == null ? METHOD_DEFLATE : opts.method;
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw zipError('saved-chat-zip-method-unsupported', 'ZIP writer supports only methods 0 and 8');
    }
    if (!Array.isArray(entriesInput) || entriesInput.length === 0) {
      throw zipError('saved-chat-zip-entry-set-invalid', 'ZIP writer requires at least one file entry');
    }
    if (entriesInput.length > ZIP_ENTRY_COUNT_CAP || entriesInput.length > 0xFFFF) {
      throw zipError('saved-chat-zip-entry-count-exceeds-cap', 'ZIP entry count exceeds its cap');
    }

    var seen = Object.create(null);
    var logicalTotal = 0;
    var entries = entriesInput.map(function (entryInput) {
      var entry = safeObject(entryInput);
      var validated = validateEntryName(entry.name);
      if (seen[validated.name]) throw zipError('saved-chat-zip-name-duplicate', 'ZIP entry name is duplicated');
      seen[validated.name] = true;
      var inputBytes = normalizeBytes(entry.bytes);
      if (inputBytes.byteLength > ZIP_UNCOMPRESSED_ENTRY_CAP_BYTES) {
        throw zipError('saved-chat-zip-uncompressed-entry-exceeds-cap', 'ZIP entry exceeds its uncompressed cap');
      }
      var bytes = copyBytes(inputBytes);
      logicalTotal = checkedAdd(logicalTotal, bytes.byteLength, 'saved-chat-zip-size-overflow');
      if (logicalTotal > ZIP_TOTAL_UNCOMPRESSED_CAP_BYTES) {
        throw zipError('saved-chat-zip-total-uncompressed-exceeds-cap', 'ZIP cumulative uncompressed bytes exceed their cap');
      }
      return { name: validated.name, nameBytes: validated.bytes, bytes: bytes };
    }).sort(canonicalEntryCompare);

    var builtEntries = [];
    for (var index = 0; index < entries.length; index += 1) {
      var source = entries[index];
      var compressed = method === METHOD_DEFLATE ? await rawDeflate(source.bytes) : copyBytes(source.bytes);
      if (compressed.byteLength > ZIP_COMPRESSED_ENTRY_CAP_BYTES || compressed.byteLength > 0xFFFFFFFF) {
        throw zipError('saved-chat-zip-compressed-entry-exceeds-cap', 'ZIP entry exceeds its compressed cap');
      }
      builtEntries.push({
        name: source.name,
        nameBytes: source.nameBytes,
        bytes: source.bytes,
        compressed: compressed,
        crc: crc32(source.bytes),
      });
    }

    var locals = [];
    var centrals = [];
    var offset = 0;
    for (var builtIndex = 0; builtIndex < builtEntries.length; builtIndex += 1) {
      var built = builtEntries[builtIndex];
      if (offset > 0xFFFFFFFF) throw zipError('saved-chat-zip-offset-overflow', 'ZIP local-header offset exceeds the 32-bit subset');
      var local = concatBytes([
        u32le(0x04034b50), u16le(ZIP_VERSION), u16le(UTF8_FLAG), u16le(method),
        u16le(FIXED_DOS_TIME), u16le(FIXED_DOS_DATE), u32le(built.crc),
        u32le(built.compressed.byteLength), u32le(built.bytes.byteLength),
        u16le(built.nameBytes.byteLength), u16le(0), built.nameBytes, built.compressed,
      ], ZIP_INPUT_CAP_BYTES);
      var central = concatBytes([
        u32le(0x02014b50), u16le(ZIP_VERSION), u16le(ZIP_VERSION),
        u16le(UTF8_FLAG), u16le(method), u16le(FIXED_DOS_TIME), u16le(FIXED_DOS_DATE),
        u32le(built.crc), u32le(built.compressed.byteLength), u32le(built.bytes.byteLength),
        u16le(built.nameBytes.byteLength), u16le(0), u16le(0), u16le(0), u16le(0),
        u32le(0), u32le(offset), built.nameBytes,
      ], ZIP_INPUT_CAP_BYTES);
      locals.push(local);
      centrals.push(central);
      offset = checkedAdd(offset, local.byteLength, 'saved-chat-zip-offset-overflow');
    }
    var centralBlock = concatBytes(centrals, ZIP_INPUT_CAP_BYTES);
    if (centralBlock.byteLength > 0xFFFFFFFF || offset > 0xFFFFFFFF) {
      throw zipError('saved-chat-zip-zip64-required', 'ZIP exceeds the admitted 32-bit subset');
    }
    var eocd = concatBytes([
      u32le(0x06054b50), u16le(0), u16le(0), u16le(entries.length),
      u16le(entries.length), u32le(centralBlock.byteLength), u32le(offset), u16le(0),
    ]);
    return concatBytes(locals.concat([centralBlock, eocd]), ZIP_INPUT_CAP_BYTES);
  }

  function decodeCanonicalName(nameBytes, flags) {
    var name = utf8Decode(nameBytes);
    if (!sameBytes(utf8Encode(name), nameBytes)) {
      throw zipError('saved-chat-zip-name-utf8-invalid', 'ZIP entry name is not canonical UTF-8');
    }
    if ((flags & UTF8_FLAG) === 0) {
      for (var i = 0; i < nameBytes.byteLength; i += 1) {
        if (nameBytes[i] > 0x7F) {
          throw zipError('saved-chat-zip-name-utf8-flag-missing', 'Non-ASCII ZIP name lacks the UTF-8 flag');
        }
      }
    }
    return validateEntryName(name);
  }

  function validateFlags(flags) {
    if ((flags & 0x0001) !== 0) throw zipError('saved-chat-zip-encrypted', 'Encrypted ZIP entries are not supported');
    if ((flags & 0x0008) !== 0) throw zipError('saved-chat-zip-data-descriptor-unsupported', 'ZIP data descriptors are not supported');
    if ((flags & ~ALLOWED_FLAGS) !== 0) throw zipError('saved-chat-zip-flags-unsupported', 'ZIP entry uses unsupported flags');
  }

  async function readPortableZip(zipInput) {
    var input = normalizeBytes(zipInput);
    if (input.byteLength < 22) throw zipError('saved-chat-zip-eocd-missing', 'ZIP is too short for an End of Central Directory record');
    if (input.byteLength > ZIP_INPUT_CAP_BYTES) throw zipError('saved-chat-zip-physical-size-exceeds-cap', 'ZIP input exceeds its physical cap');
    /* Copy only after the caller-provided view has passed the physical bound;
     * an attacker-declared or oversized input must never authorize a second
     * same-sized allocation before admission. */
    var bytes = copyBytes(input);
    var eocdOffset = bytes.byteLength - 22;
    if (readU32(bytes, eocdOffset) !== 0x06054b50) {
      throw zipError('saved-chat-zip-eocd-missing', 'ZIP terminal End of Central Directory record is missing');
    }
    if (readU16(bytes, eocdOffset + 20) !== 0) {
      throw zipError('saved-chat-zip-comment-unsupported', 'ZIP comments are not supported');
    }
    var diskNumber = readU16(bytes, eocdOffset + 4);
    var centralDisk = readU16(bytes, eocdOffset + 6);
    var diskEntries = readU16(bytes, eocdOffset + 8);
    var totalEntries = readU16(bytes, eocdOffset + 10);
    var centralSize = readU32(bytes, eocdOffset + 12);
    var centralOffset = readU32(bytes, eocdOffset + 16);
    if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
      throw zipError('saved-chat-zip-multidisk-unsupported', 'Multi-disk ZIP archives are not supported');
    }
    if (totalEntries === 0 || totalEntries > ZIP_ENTRY_COUNT_CAP) {
      throw zipError('saved-chat-zip-entry-count-exceeds-cap', 'ZIP entry count is empty or exceeds its cap');
    }
    if (checkedAdd(centralOffset, centralSize) !== eocdOffset) {
      throw zipError('saved-chat-zip-central-range-invalid', 'ZIP central directory range is inconsistent');
    }

    var records = [];
    var seen = Object.create(null);
    var cursor = centralOffset;
    var declaredTotal = 0;
    for (var index = 0; index < totalEntries; index += 1) {
      if (readU32(bytes, cursor) !== 0x02014b50) {
        throw zipError('saved-chat-zip-central-header-invalid', 'ZIP central-directory signature is invalid');
      }
      var versionMadeBy = readU16(bytes, cursor + 4);
      var versionNeeded = readU16(bytes, cursor + 6);
      var flags = readU16(bytes, cursor + 8);
      var method = readU16(bytes, cursor + 10);
      var expectedCrc = readU32(bytes, cursor + 16);
      var compressedSize = readU32(bytes, cursor + 20);
      var uncompressedSize = readU32(bytes, cursor + 24);
      var nameLength = readU16(bytes, cursor + 28);
      var extraLength = readU16(bytes, cursor + 30);
      var commentLength = readU16(bytes, cursor + 32);
      var diskStart = readU16(bytes, cursor + 34);
      var externalAttributes = readU32(bytes, cursor + 38);
      var localOffset = readU32(bytes, cursor + 42);
      validateFlags(flags);
      if (versionNeeded > ZIP_VERSION || method !== METHOD_STORED && method !== METHOD_DEFLATE) {
        throw zipError('saved-chat-zip-method-unsupported', 'ZIP entry requires an unsupported feature or compression method');
      }
      if (compressedSize === 0xFFFFFFFF || uncompressedSize === 0xFFFFFFFF || localOffset === 0xFFFFFFFF) {
        throw zipError('saved-chat-zip-zip64-unsupported', 'ZIP64 is not supported');
      }
      if (compressedSize > ZIP_COMPRESSED_ENTRY_CAP_BYTES) {
        throw zipError('saved-chat-zip-compressed-entry-exceeds-cap', 'ZIP entry compressed size exceeds its cap');
      }
      if (uncompressedSize > ZIP_UNCOMPRESSED_ENTRY_CAP_BYTES) {
        throw zipError('saved-chat-zip-uncompressed-entry-exceeds-cap', 'ZIP entry declared output exceeds its cap');
      }
      declaredTotal = checkedAdd(declaredTotal, uncompressedSize, 'saved-chat-zip-size-overflow');
      if (declaredTotal > ZIP_TOTAL_UNCOMPRESSED_CAP_BYTES) {
        throw zipError('saved-chat-zip-total-uncompressed-exceeds-cap', 'ZIP cumulative declared output exceeds its cap');
      }
      if (nameLength === 0 || nameLength > ZIP_FILENAME_BYTE_CAP || extraLength !== 0 || commentLength !== 0 || diskStart !== 0) {
        throw zipError('saved-chat-zip-central-feature-unsupported', 'ZIP central entry uses an unsupported name, extra, comment, or disk field');
      }
      var recordEnd = checkedAdd(cursor, checkedAdd(46, checkedAdd(nameLength, checkedAdd(extraLength, commentLength))));
      if (recordEnd > eocdOffset) throw zipError('saved-chat-zip-central-truncated', 'ZIP central entry is truncated');
      var rawName = bytes.slice(cursor + 46, cursor + 46 + nameLength);
      var validatedName = decodeCanonicalName(rawName, flags);
      if (seen[validatedName.name]) throw zipError('saved-chat-zip-name-duplicate', 'ZIP contains duplicate normalized entry paths');
      seen[validatedName.name] = true;
      var madeBySystem = versionMadeBy >>> 8;
      var unixMode = externalAttributes >>> 16;
      var unixFileType = unixMode & 0xF000;
      var dosDirectory = (externalAttributes & 0x10) !== 0;
      if (madeBySystem === 3 && unixFileType === 0xA000) {
        throw zipError('saved-chat-zip-symlink-unsupported', 'ZIP symlink or directory entries are not supported');
      }
      if (validatedName.name.charAt(validatedName.name.length - 1) === '/' || dosDirectory ||
          (madeBySystem === 3 && unixFileType !== 0 && unixFileType !== 0x8000)) {
        throw zipError('saved-chat-zip-entry-type-unsupported', 'ZIP directory or special-file entries are not supported');
      }
      records.push({
        name: validatedName.name,
        nameBytes: rawName,
        flags: flags,
        method: method,
        crc: expectedCrc,
        compressedSize: compressedSize,
        uncompressedSize: uncompressedSize,
        localOffset: localOffset,
      });
      cursor = recordEnd;
    }
    if (cursor !== eocdOffset) throw zipError('saved-chat-zip-central-range-invalid', 'ZIP central directory contains trailing or missing records');

    var localOrder = records.slice().sort(function (left, right) { return left.localOffset - right.localOffset; });
    var expectedLocalOffset = 0;
    for (var localIndex = 0; localIndex < localOrder.length; localIndex += 1) {
      var record = localOrder[localIndex];
      if (record.localOffset !== expectedLocalOffset || record.localOffset >= centralOffset) {
        throw zipError('saved-chat-zip-local-range-invalid', 'ZIP local entries overlap, contain gaps, or are out of range');
      }
      var local = record.localOffset;
      if (readU32(bytes, local) !== 0x04034b50) throw zipError('saved-chat-zip-local-header-invalid', 'ZIP local-header signature is invalid');
      var localVersion = readU16(bytes, local + 4);
      var localFlags = readU16(bytes, local + 6);
      var localMethod = readU16(bytes, local + 8);
      var localCrc = readU32(bytes, local + 14);
      var localCompressedSize = readU32(bytes, local + 18);
      var localUncompressedSize = readU32(bytes, local + 22);
      var localNameLength = readU16(bytes, local + 26);
      var localExtraLength = readU16(bytes, local + 28);
      if (localVersion > ZIP_VERSION || localExtraLength !== 0 ||
          localFlags !== record.flags || localMethod !== record.method ||
          localCrc !== record.crc || localCompressedSize !== record.compressedSize ||
          localUncompressedSize !== record.uncompressedSize || localNameLength !== record.nameBytes.byteLength) {
        throw zipError('saved-chat-zip-local-central-mismatch', 'ZIP local and central metadata disagree');
      }
      var localNameStart = local + 30;
      var dataStart = checkedAdd(localNameStart, checkedAdd(localNameLength, localExtraLength));
      var dataEnd = checkedAdd(dataStart, record.compressedSize);
      if (dataEnd > centralOffset || !sameBytes(bytes.slice(localNameStart, localNameStart + localNameLength), record.nameBytes)) {
        throw zipError('saved-chat-zip-local-central-mismatch', 'ZIP local and central names or ranges disagree');
      }
      /* The admitted archive copy remains alive through decoding, so a view is
       * sufficient here. Avoid duplicating the complete compressed payload in
       * the bounded in-memory working set. */
      record.compressedBytes = bytes.subarray(dataStart, dataEnd);
      expectedLocalOffset = dataEnd;
    }
    if (expectedLocalOffset !== centralOffset) {
      throw zipError('saved-chat-zip-local-range-invalid', 'ZIP local-entry region is not exact');
    }

    var actualTotal = 0;
    var decoded = [];
    for (var decodeIndex = 0; decodeIndex < records.length; decodeIndex += 1) {
      var item = records[decodeIndex];
      var output;
      if (item.method === METHOD_STORED) {
        if (item.compressedSize !== item.uncompressedSize) {
          throw zipError('saved-chat-zip-stored-size-mismatch', 'Stored ZIP entry has unequal compressed and uncompressed sizes');
        }
        output = copyBytes(item.compressedBytes);
      } else {
        output = await rawInflateBounded(item.compressedBytes, item.uncompressedSize);
      }
      if (output.byteLength !== item.uncompressedSize) {
        throw zipError('saved-chat-zip-uncompressed-size-mismatch', 'ZIP decoded size does not match its headers');
      }
      actualTotal = checkedAdd(actualTotal, output.byteLength, 'saved-chat-zip-size-overflow');
      if (actualTotal > ZIP_TOTAL_UNCOMPRESSED_CAP_BYTES) {
        throw zipError('saved-chat-zip-total-uncompressed-exceeds-cap', 'ZIP actual cumulative output exceeds its cap');
      }
      if (crc32(output) !== item.crc) throw zipError('saved-chat-zip-crc-mismatch', 'ZIP entry CRC-32 does not match decoded bytes');
      decoded.push(Object.freeze({
        name: item.name,
        bytes: output,
        method: item.method,
        crc32: item.crc,
        compressedByteLength: item.compressedSize,
        byteLength: item.uncompressedSize,
      }));
    }
    return Object.freeze({
      entries: Object.freeze(decoded),
      entryCount: decoded.length,
      physicalByteLength: bytes.byteLength,
      totalUncompressedBytes: actualTotal,
    });
  }

  function parseManifest(bytes) {
    var manifest;
    try { manifest = JSON.parse(utf8Decode(bytes)); }
    catch (_) { throw zipError('saved-chat-zip-package-manifest-invalid', 'Contained manifest.json is not parseable JSON'); }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw zipError('saved-chat-zip-package-manifest-invalid', 'Contained manifest.json is not an object');
    }
    return manifest;
  }

  function governedPackageInventory(manifest) {
    var schemaVersion = Number(manifest.schemaVersion);
    var files = safeObject(manifest.files);
    var expected = ['manifest.json'];
    var snapshotPath = cleanString(safeObject(files.snapshot).path) || 'snapshot.json';
    expected.push(snapshotPath);
    if (schemaVersion === 1 || schemaVersion === 2) {
      expected.push(cleanString(safeObject(files.markdown).path) || 'chat.md');
      expected.push(cleanString(safeObject(files.html).path) || 'chat.html');
    } else if (schemaVersion === 3) {
      expected.push('chat.md', 'chat.html');
    }
    var assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    for (var i = 0; i < assets.length; i += 1) expected.push(cleanString(assets[i] && assets[i].path));
    var seen = Object.create(null);
    expected.forEach(function (path) {
      validateEntryName('root/' + path);
      if (seen[path]) throw zipError('saved-chat-zip-package-inventory-invalid', 'Contained package inventory has duplicate manifest paths');
      seen[path] = true;
    });
    return expected;
  }

  function portablePackageFromEntries(decoded) {
    var entries = decoded && Array.isArray(decoded.entries) ? decoded.entries : [];
    var roots = Object.create(null);
    var relativeEntries = [];
    entries.forEach(function (entry) {
      var slash = entry.name.indexOf('/');
      if (slash <= 0 || slash === entry.name.length - 1) {
        throw zipError('saved-chat-zip-package-root-invalid', 'Every ZIP entry must live below one .h2ochat root');
      }
      var root = entry.name.slice(0, slash);
      var relative = entry.name.slice(slash + 1);
      if (!/^[A-Za-z0-9._-]+\.h2ochat$/.test(root) || root === '.h2ochat' || root.indexOf('..') >= 0) {
        throw zipError('saved-chat-zip-package-root-invalid', 'ZIP package root is not a safe .h2ochat basename');
      }
      roots[root] = true;
      /* readPortableZip already produced fresh verified output bytes. Keep
       * those owned buffers instead of making a second full decoded-package
       * copy; verifier adapters still defensively copy untrusted public input. */
      relativeEntries.push({ name: relative, bytes: entry.bytes });
    });
    var rootNames = Object.keys(roots);
    if (rootNames.length !== 1) throw zipError('saved-chat-zip-package-root-invalid', 'ZIP must contain exactly one .h2ochat root');
    var manifestEntry = relativeEntries.filter(function (entry) { return entry.name === 'manifest.json'; });
    if (manifestEntry.length !== 1) throw zipError('saved-chat-zip-package-inventory-invalid', 'ZIP package must contain exactly one manifest.json');
    var manifest = parseManifest(manifestEntry[0].bytes);
    var expected = governedPackageInventory(manifest).slice().sort();
    var actual = relativeEntries.map(function (entry) { return entry.name; }).sort();
    if (expected.length !== actual.length || expected.some(function (name, index) { return name !== actual[index]; })) {
      throw zipError('saved-chat-zip-package-inventory-invalid', 'ZIP entries do not match the exact version-aware package/export inventory', { expected: expected, actual: actual });
    }
    return Object.freeze({
      packageDirName: rootNames[0],
      manifest: manifest,
      entries: Object.freeze(relativeEntries.map(function (entry) {
        return Object.freeze({ name: entry.name, bytes: entry.bytes });
      })),
      entryCount: relativeEntries.length,
      totalUncompressedBytes: decoded.totalUncompressedBytes,
      physicalByteLength: decoded.physicalByteLength,
    });
  }

  async function readPortablePackageZip(zipBytes) {
    return portablePackageFromEntries(await readPortableZip(zipBytes));
  }

  H2O.Studio.ingestion = Object.assign({}, H2O.Studio.ingestion, {
    savedChatPortableZip: Object.freeze({
      __installed: true,
      __version: MODULE_VERSION,
      METHOD_STORED: METHOD_STORED,
      METHOD_DEFLATE: METHOD_DEFLATE,
      ZIP_INPUT_CAP_BYTES: ZIP_INPUT_CAP_BYTES,
      ZIP_ENTRY_COUNT_CAP: ZIP_ENTRY_COUNT_CAP,
      ZIP_FILENAME_BYTE_CAP: ZIP_FILENAME_BYTE_CAP,
      ZIP_COMPRESSED_ENTRY_CAP_BYTES: ZIP_COMPRESSED_ENTRY_CAP_BYTES,
      ZIP_UNCOMPRESSED_ENTRY_CAP_BYTES: ZIP_UNCOMPRESSED_ENTRY_CAP_BYTES,
      ZIP_TOTAL_UNCOMPRESSED_CAP_BYTES: ZIP_TOTAL_UNCOMPRESSED_CAP_BYTES,
      buildPortableZip: buildPortableZip,
      readPortableZip: readPortableZip,
      readPortablePackageZip: readPortablePackageZip,
      diagnose: function () {
        return {
          installed: true,
          version: MODULE_VERSION,
          methods: [METHOD_STORED, METHOD_DEFLATE],
          writerMethod: METHOD_DEFLATE,
          zip64: false,
          dataDescriptors: false,
          encryptedEntries: false,
          desktopOnly: true,
        };
      },
      _private: Object.freeze({
        crc32: crc32,
        validateEntryName: validateEntryName,
        portablePackageFromEntries: portablePackageFromEntries,
      }),
    }),
  });
})(typeof window !== 'undefined' ? window : globalThis);
