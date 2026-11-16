'use strict';
// Creates Blob/Queue/Table clients. Azure: DefaultAzureCredential. Local: connection string.
const { BlobServiceClient } = require('@azure/storage-blob');
const { QueueServiceClient } = require('@azure/storage-queue');
const { TableClient } = require('@azure/data-tables');
const { DefaultAzureCredential } = require('@azure/identity');

function createStorage(cfg) {
  const { accountName, connectionString } = cfg.storage;
  const n = cfg.names;
  let blobService, queueService, table;

  if (connectionString) {
    blobService = BlobServiceClient.fromConnectionString(connectionString);
    queueService = QueueServiceClient.fromConnectionString(connectionString);
    table = (name) =>
      TableClient.fromConnectionString(connectionString, name, { allowInsecureConnection: true });
  } else {
    const cred = new DefaultAzureCredential();
    blobService = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, cred);
    queueService = new QueueServiceClient(`https://${accountName}.queue.core.windows.net`, cred);
    table = (name) => new TableClient(`https://${accountName}.table.core.windows.net`, name, cred);
  }

  const storage = {
    blobs: blobService.getContainerClient(n.blobContainer),
    queue: queueService.getQueueClient(n.queue),
    users: table(n.usersTable),
    runs: table(n.runsTable),
    audit: table(n.auditTable),
    container(name) {
      return blobService.getContainerClient(name);
    },
  };

  storage.ensure = async () => {
    await Promise.all([
      storage.blobs.createIfNotExists(),
      storage.queue.createIfNotExists(),
      storage.users.createTable(),
      storage.runs.createTable(),
      storage.audit.createTable(),
    ]);
  };
  return storage;
}

module.exports = { createStorage };
