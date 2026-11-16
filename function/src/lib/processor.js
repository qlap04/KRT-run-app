'use strict';
const { validateImage, validateMessage } = require('./validation');
const { appendAudit } = require('./audit');

async function streamToBuffer(readable) {
  const chunks = [];
  for await (const c of readable) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

// deps: { storage: {incoming, proofs, runs, audit}, log }
async function processMessage(msg, { storage, log = () => {} }) {
  const bad = validateMessage(msg);
  if (bad) {
    log(`Ignoring invalid message: ${bad}`);
    await appendAudit(storage.audit, { action: 'PROCESSED', actor: 'function', result: 'REJECTED_INVALID', detail: `bad message: ${bad}` });
    return { status: 'ignored' };
  }
  const { runId, month, employeeCode, blobName } = msg;
  let run;
  try {
    run = await storage.runs.getEntity(month, runId);
  } catch (e) {
    if (e.statusCode === 404) { log(`Run ${runId} does not exist`); return { status: 'ignored' }; }
    throw e;
  }
  // Idempotent: the queue may deliver the same message twice
  if (run.status !== 'PENDING_PROCESSING') return { status: 'already-processed' };

  const src = storage.incoming.getBlobClient(blobName);
  let buf;
  try {
    buf = await streamToBuffer((await src.download()).readableStreamBody);
  } catch (e) {
    if (e.statusCode !== 404) throw e; // transient error -> let the queue retry
    return finish('REJECTED_INVALID', 'Image not found');
  }
  const img = validateImage(buf);
  if (img.error) {
    await src.deleteIfExists();
    return finish('REJECTED_INVALID', img.error);
  }

  const destPath = `${month}/${employeeCode}/${runId}.${img.ext}`;
  await storage.proofs.getBlockBlobClient(destPath).uploadData(buf, { blobHTTPHeaders: { blobContentType: img.contentType } });
  await src.deleteIfExists();
  return finish('PENDING_REVIEW', '', { blobContainer: storage.proofs.containerName, blobPath: destPath, contentType: img.contentType });

  async function finish(status, reason, extra = {}) {
    await storage.runs.updateEntity({
      partitionKey: month, rowKey: runId, status, rejectReason: reason, processedUtc: new Date().toISOString(), ...extra,
    }, 'Merge');
    await appendAudit(storage.audit, {
      action: 'PROCESSED', actor: 'function', runId, km: run.km, runDate: run.runDate,
      result: status === 'PENDING_REVIEW' ? 'OK' : 'REJECTED_INVALID', detail: reason || `stored ${extra.blobPath}`,
    });
    return { status };
  }
}

module.exports = { processMessage, streamToBuffer };
