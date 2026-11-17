'use strict';

const clientIp = (req) => req.ip || req.socket.remoteAddress || '';

module.exports = { clientIp };
