'use strict';

function createUserModel(table) {
  return {
    async get(code) {
      try {
        return await table.getEntity('user', code);
      } catch (e) {
        if (e.statusCode === 404) return null;
        throw e;
      }
    },
    // throws a 409 error if the employee code already exists
    async create({ code, fullName, passwordHash, role }) {
      await table.createEntity({
        partitionKey: 'user', rowKey: code, fullName, passwordHash, role,
        createdUtc: new Date().toISOString(),
      });
    },
  };
}

module.exports = { createUserModel };
