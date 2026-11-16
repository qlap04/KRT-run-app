'use strict';
const { app } = require('@azure/functions');
const { loadConfig } = require('../lib/config');
const { createStorage } = require('../lib/storage');
const { processMessage } = require('../lib/processor');

let storage;
const getStorage = () => (storage ||= createStorage(loadConfig()));

app.storageQueue('processUpload', {
  queueName: process.env.QUEUE_NAME || 'upload-jobs',
  connection: 'AzureWebJobsStorage',
  handler: async (queueItem, context) => {
    // The Functions host decodes base64; queueItem is an object when the message is JSON
    const msg = typeof queueItem === 'string' ? JSON.parse(queueItem) : queueItem;
    const result = await processMessage(msg, { storage: getStorage(), log: (m) => context.log(m) });
    context.log(`processUpload ${msg && msg.runId}: ${result.status}`);
  },
});
