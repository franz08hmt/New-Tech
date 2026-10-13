// Isolated fixture: never imports dist/main.js or invokes loadEnvironment().
import "reflect-metadata";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { Server } from "node:net";
import { syncBuiltinESMExports } from "node:module";

const originalFetch = globalThis.fetch;
const originalRequest = http.request;
const localHosts = new Set(["127.0.0.1", "::1", "[::1]"]);
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? input));
  assert.ok(
    localHosts.has(url.hostname),
    "Cloud HTTP forbidden in runtime tests",
  );
  return originalFetch(input, options);
};
http.request = (input, ...args) => {
  const hostname =
    input instanceof URL
      ? input.hostname
      : typeof input === "string"
        ? new URL(input).hostname
        : (input.hostname ?? input.host);
  assert.ok(localHosts.has(hostname), "Cloud HTTP forbidden in runtime tests");
  return originalRequest(input, ...args);
};
https.request = https.get = () => {
  throw new Error("Cloud HTTP forbidden in runtime tests");
};
syncBuiltinESMExports();

const mode = process.argv[2];
let server;
let listenCalls = 0;
const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  listenCalls++;
  return listen.apply(this, args);
};
try {
  let config;
  if (mode === "bind" || mode === "config" || mode === "startup-config") {
    const runtime = await import("../dist/config/config.js");
    config =
      mode === "startup-config"
        ? runtime.appConfig()
        : runtime.httpRuntimeConfig();
  }
  const { fakeDependencies, httpApp } = await import("./helpers.mjs");
  const { authFixture } = await import("./auth-fixture.mjs");
  const fixture = authFixture();
  const dependencies = fakeDependencies();
  const forbidden = () => {
    throw new Error("External provider forbidden in runtime tests");
  };
  if (mode === "auth-config") {
    const { AuthService } = await import("../dist/auth/auth.service.js");
    const { authConfig } = await import("../dist/auth/auth-config.js");
    const service = new AuthService(authConfig, fixture.store, fixture.adapter);
    const headers = {};
    try {
      await service.session(
        {
          method: "GET",
          path: "/api/auth/session",
          headers: {},
          socket: { remoteAddress: "127.0.0.1" },
        },
        {
          setHeader: (key, value) => {
            headers[key] = value;
          },
        },
      );
      process.send({ type: "config-response", status: 200, headers });
    } catch (error) {
      process.send({
        type: "config-response",
        status: error.getStatus(),
        body: error.getResponse(),
        headers,
        rows: fixture.rows.size,
        counters: fixture.counters.size,
        verifyCalls: fixture.state.verifyCalls,
      });
    }
    process.disconnect();
  } else {
    if (mode === "config") {
      process.send({ type: "config", config });
      process.disconnect();
    } else {
      fixture.config.loginLimits.bootstrap = 1;
      const admissions = [];
      const admission = fixture.store.admission.bind(fixture.store);
      fixture.store.admission = async (keys, seconds) => {
        admissions.push(keys);
        return admission(keys, seconds);
      };
      server = await httpApp(
        dependencies.database,
        dependencies.storage,
        { chat: forbidden },
        { process: forbidden },
        { retrieve: forbidden },
        fixture,
        { host: config?.host ?? "127.0.0.1", port: 0 },
      );
      const observed = [];
      server.app.getHttpServer().prependListener("request", (req, res) => {
        res.on("finish", () =>
          observed.push({ ip: req.ip, socket: req.socket.remoteAddress }),
        );
      });
      const express = server.app.getHttpAdapter().getInstance();
      const trust = express.get("trust proxy fn");
      process.on("message", async (message) => {
        if (message.type === "close") {
          await server.app.close();
          process.disconnect();
        } else if (message.type === "fixture-settings") {
          if (message.secure !== undefined)
            fixture.config.secure = message.secure;
          if (message.origin !== undefined)
            fixture.config.origin = message.origin;
          if (message.bootstrapLimit !== undefined)
            fixture.config.loginLimits.bootstrap = message.bootstrapLimit;
          if (message.ipLimit !== undefined)
            fixture.config.loginLimits.ip = message.ipLimit;
          process.send({ type: "fixture-settings" });
        } else if (message.type === "bootstrap" || message.type === "login") {
          const admissionBefore = admissions.length;
          const headers = {
            ...message.headers,
            ...(message.xff === undefined
              ? {}
              : { "X-Forwarded-For": message.xff }),
          };
          if (message.type === "login") {
            headers["Content-Type"] = "application/json";
            headers.Cookie = message.cookie;
            headers.Origin = message.origin ?? fixture.config.origin;
            headers["X-CSRF-Token"] = message.csrf;
          }
          const response = await server.request(
            message.type === "login" ? "/auth/login" : "/auth/session",
            {
              headers,
              ...(message.type === "login"
                ? {
                    method: "POST",
                    body: JSON.stringify({
                      email: message.email ?? "fixture@example.test",
                      password: "synthetic-password",
                    }),
                  }
                : {}),
              signal: AbortSignal.timeout(5000),
            },
          );
          process.send({
            type: "response",
            status: response.status,
            body: await response.json(),
            observed: observed.at(-1),
            keys: admissions.at(-1),
            newAdmissions: admissions.slice(admissionBefore),
            counters: [...fixture.counters.entries()],
            rows: fixture.rows.size,
            setCookie: response.headers.get("set-cookie"),
            loginCalls: fixture.state.loginCalls,
          });
        }
      });
      process.send({
        type: "ready",
        base: server.base,
        address: server.app.getHttpServer().address(),
        config,
        trust: {
          loopback: trust("127.0.0.1", 0),
          mappedLoopback: trust("::ffff:127.0.0.1", 0),
          olderLoopback: trust("127.0.0.1", 1),
          other: trust("192.0.2.10", 0),
        },
      });
    }
  }
} catch (error) {
  if (server) await server.app.close();
  const name = error.constructor.name;
  process.send?.({
    type: "startup-error",
    name,
    reason:
      name === "ConfigurationError"
        ? error.message
        : "Unexpected runtime startup error",
    listening: false,
    listenCalls,
  });
  process.exitCode = 1;
  if (process.connected) process.disconnect();
}
