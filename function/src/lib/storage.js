'use strict';
const { BlobServiceClient } = require('@azure/storage-blob');
const { TableClient } = require('@azure/data-tables');
const { DefaultAzureCredential } = require('@azure/identity');

function createStorage(cfg) {
  let blobService, table;
  if (cfg.connectionString) {
    blobService = BlobServiceClient.fromConnectionString(cfg.connectionString);
    table = (n) => TableClient.fromConnectionString(cfg.connectionString, n, { allowInsecureConnection: true });
  } else {
    const cred = new DefaultAzureCredential();
    blobService = new BlobServiceClient(`https://${cfg.accountName}.blob.core.windows.net`, cred);
    table = (n) => new TableClient(`https://${cfg.accountName}.table.core.windows.net`, n, cred);
  }
  return {
    blobs: blobService.getContainerClient(cfg.blobContainer),
    runs: table(cfg.runsTable),
    audit: table(cfg.auditTable),
  };
}
module.exports = { createStorage };
