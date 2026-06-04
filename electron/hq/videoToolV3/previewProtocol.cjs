const fs = require('fs');
const fsp = require('fs/promises');
const { Readable } = require('stream');

const VIDEO_CONTENT_TYPE = 'video/mp4';

const parseByteRange = (rawRange, fileSize) => {
    if (!rawRange) {
        return null;
    }

    const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rawRange).trim());
    if (!match || (!match[1] && !match[2]) || fileSize <= 0) {
        return { invalid: true };
    }

    if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
            return { invalid: true };
        }
        return {
            start: Math.max(0, fileSize - suffixLength),
            end: fileSize - 1
        };
    }

    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
    if (
        !Number.isSafeInteger(start)
        || !Number.isSafeInteger(requestedEnd)
        || start < 0
        || requestedEnd < start
        || start >= fileSize
    ) {
        return { invalid: true };
    }

    return {
        start,
        end: Math.min(requestedEnd, fileSize - 1)
    };
};

const createPreviewFileResponse = async ({ filePath, request }) => {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size <= 0) {
        throw new Error('Preview file is empty.');
    }

    const method = String(request?.method || 'GET').toUpperCase();
    const range = parseByteRange(request?.headers?.get?.('range'), stat.size);
    const commonHeaders = {
        'accept-ranges': 'bytes',
        'content-type': VIDEO_CONTENT_TYPE
    };

    if (range?.invalid) {
        return new Response(null, {
            status: 416,
            headers: {
                ...commonHeaders,
                'content-range': `bytes */${stat.size}`
            }
        });
    }

    if (range) {
        const contentLength = range.end - range.start + 1;
        const stream = method === 'HEAD'
            ? null
            : Readable.toWeb(fs.createReadStream(filePath, { start: range.start, end: range.end }));
        return new Response(stream, {
            status: 206,
            headers: {
                ...commonHeaders,
                'content-length': String(contentLength),
                'content-range': `bytes ${range.start}-${range.end}/${stat.size}`
            }
        });
    }

    const stream = method === 'HEAD'
        ? null
        : Readable.toWeb(fs.createReadStream(filePath));
    return new Response(stream, {
        status: 200,
        headers: {
            ...commonHeaders,
            'content-length': String(stat.size)
        }
    });
};

module.exports = {
    createPreviewFileResponse,
    parseByteRange
};
