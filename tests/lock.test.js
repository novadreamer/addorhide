const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const sandbox = {
  crypto: webcrypto,
  TextEncoder,
  atob,
  btoa,
  console,
  location: { pathname: "/options.html", reload() {} },
  chrome: { storage: { local: { get() {}, onChanged: {} }, onChanged: { addListener() {} } } }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "lock.js"), "utf8"), sandbox);

(async () => {
  let passed = 0;
  const check = async (name, fn) => {
    try { await fn(); passed += 1; } catch (error) { console.error(`FAILED: ${name}`); throw error; }
  };
  const lock = await sandbox.HOA_LOCK.hashPassword("correct horse");
  await check("hashPassword returns the configured PBKDF2 record", () => {
    assert.equal(typeof lock.salt, "string"); assert.equal(typeof lock.hash, "string"); assert.equal(lock.iterations, 200000);
    assert.equal(Buffer.from(lock.salt, "base64").length, 16); assert.equal(Buffer.from(lock.hash, "base64").length, 32);
  });
  await check("verify accepts the original password", async () => assert.equal(await sandbox.HOA_LOCK.verify("correct horse", lock), true));
  await check("verify rejects a different password", async () => assert.equal(await sandbox.HOA_LOCK.verify("wrong password", lock), false));
  await check("hashPassword is deterministic when a salt is supplied", async () => {
    const repeated = await sandbox.HOA_LOCK.hashPassword("correct horse", lock.salt);
    assert.deepEqual(repeated, lock);
  });
  console.log(`lock.test.js: ${passed} passed, 0 failed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
