'use strict';
const crypto = require('node:crypto');
const v = require('./validation');
const { STATUS } = require('../models/Run');

function monthOrCurrent(q) {
  return v.isValidMonth(q) ? q : v.currentMonthVN();
}

function leaderboard(runs) {
  const map = new Map();
  for (const r of runs) {
    if (r.status !== STATUS.APPROVED) continue;
    const cur = map.get(r.employeeCode) || { employeeCode: r.employeeCode, fullName: r.fullName || '', km: 0, runs: 0 };
    cur.km = Math.round((cur.km + Number(r.km)) * 100) / 100;
    cur.runs += 1;
    map.set(r.employeeCode, cur);
  }
  return [...map.values()].sort((a, b) => b.km - a.km);
}

function pickRun(x) {
  return {
    runId: x.rowKey, month: x.partitionKey, employeeCode: x.employeeCode, km: Number(x.km),
    runDate: x.runDate, status: x.status, createdUtc: x.createdUtc,
  };
}

function createRunService({ cfg, storage, runs, audit }) {
  return {
    monthOrCurrent,
    todayVN: () => v.todayVN(),

    async myRuns(monthQuery, employeeCode) {
      const month = monthOrCurrent(monthQuery);
      const list = await runs.listByMonth(month, { employeeCode });
      const sum = (st) => Math.round(list.filter((x) => x.status === st).reduce((s, x) => s + Number(x.km), 0) * 100) / 100;
      return {
        month,
        list,
        approvedKm: sum(STATUS.APPROVED),
        pendingKm: sum(STATUS.PENDING_REVIEW) + sum(STATUS.PENDING_PROCESSING),
      };
    },

    async leaderboardPage(monthQuery) {
      const month = monthOrCurrent(monthQuery);
      return { month, rows: leaderboard(await runs.listByMonth(month)) };
    },

    async upload({ user, km, runDate, file, clientIp }) {
      const form = { km: String(km || ''), runDate: String(runDate || '') };
      if (!v.isValidKm(form.km)) return { ok: false, error: 'Distance must be between 0.1 and 100 km', form };
      const dateErr = v.validateRunDate(form.runDate, v.todayVN());
      if (dateErr) return { ok: false, error: dateErr, form };
      const img = v.validateImage(file && file.buffer);
      if (img.error) return { ok: false, error: img.error, form };

      const parsedKm = v.parseKm(form.km);
      const month = form.runDate.slice(0, 7);
      const runId = crypto.randomUUID();
      const blobName = `${runId}.${img.ext}`;
      // One container: new uploads go under incoming/, the function moves them under processed/
      const blobPath = `incoming/${blobName}`;

      await storage.blobs.getBlockBlobClient(blobPath).uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: img.contentType },
      });
      await runs.create({
        partitionKey: month, rowKey: runId, employeeCode: user.code, fullName: user.fullName,
        km: parsedKm, runDate: form.runDate, status: STATUS.PENDING_PROCESSING,
        originalName: String(file.originalname || '').slice(0, 100), contentType: img.contentType,
        blobContainer: cfg.names.blobContainer, blobPath, createdUtc: new Date().toISOString(),
      });
      const msg = { runId, month, employeeCode: user.code, blobName, km: parsedKm, runDate: form.runDate };
      // Base64 so the Azure Functions queue trigger can decode it
      await storage.queue.sendMessage(Buffer.from(JSON.stringify(msg), 'utf8').toString('base64'));
      await audit.append({
        action: 'UPLOAD', actor: user.code, runId, km: parsedKm, runDate: form.runDate,
        clientIp, detail: 'queued',
      });
      return { ok: true };
    },

    async openProof({ month, runId, user }) {
      if (!v.isValidMonth(month) || !/^[0-9a-f-]{36}$/.test(runId)) return { notFound: true };
      const run = await runs.get(month, runId);
      if (!run || (run.employeeCode !== user.code && user.role !== 'admin')) return { notFound: true };
      if (!run.blobPath) return { notFound: true };
      const blob = storage.container(run.blobContainer).getBlobClient(run.blobPath);
      const dl = await blob.download();
      return {
        contentType: run.contentType || 'application/octet-stream',
        stream: dl.readableStreamBody,
      };
    },

    async pendingReview(monthQuery) {
      const month = v.isValidMonth(monthQuery) ? monthQuery : v.currentMonthVN();
      const list = await runs.listByMonth(month, { status: STATUS.PENDING_REVIEW });
      return { month, list };
    },

    async review({ month, runId, newStatus, note, actor, clientIp }) {
      if (!v.isValidMonth(month)) return { notFound: true };
      const run = await runs.get(month, runId);
      if (!run) return { notFound: true };
      if (run.status !== STATUS.PENDING_REVIEW) {
        return {
          conflict: true,
          message: `This submission is in status ${run.status} and cannot be reviewed.`,
        };
      }
      await runs.merge({
        partitionKey: month, rowKey: runId, status: newStatus, reviewedBy: actor,
        reviewNote: String(note || '').slice(0, 200), reviewedUtc: new Date().toISOString(),
      });
      await audit.append({
        action: newStatus === STATUS.APPROVED ? 'APPROVED' : 'REJECTED',
        actor, runId, km: run.km, runDate: run.runDate,
        detail: `employee=${run.employeeCode}`, clientIp,
      });
      return { ok: true, month };
    },

    async apiRuns({ monthQuery, apiAll, sessionUser }) {
      const month = monthOrCurrent(monthQuery);
      const opts = apiAll || (sessionUser && sessionUser.role === 'admin')
        ? {}
        : { employeeCode: sessionUser.code };
      return { month, runs: (await runs.listByMonth(month, opts)).map(pickRun) };
    },

    async apiLeaderboard(monthQuery) {
      const month = monthOrCurrent(monthQuery);
      return {
        month,
        rows: leaderboard(await runs.listByMonth(month)).map(({ employeeCode, km, runs: n }) => ({
          employeeCode, km, runs: n,
        })),
      };
    },
  };
}

module.exports = { createRunService, leaderboard, STATUS };
