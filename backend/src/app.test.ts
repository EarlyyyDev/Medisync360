import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("API foundation", () => {
  const app = createApp();

  it("reports API status at the root path", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.body.data.service).toBe("medisync360-api");
  });

  it("reports liveness", async () => {
    const response = await request(app).get("/api/v1/health/live");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("live");
  });

  it("returns a safe not-found response", async () => {
    const response = await request(app).get("/api/v1/missing");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("reports database readiness without connecting", async () => {
    const response = await request(app).get("/api/v1/health/ready");

    expect([200, 503]).toContain(response.status);
  });

  it("rejects unauthenticated access to protected auth endpoints", async () => {
    const response = await request(app).get("/api/v1/auth/admin-check");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns generic credentials failure", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "missing@example.test", password: "not-a-real-password" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("allows login POST without a CSRF token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("cookie", "medisync_session=stale-session")
      .send({ email: "missing@example.test", password: "not-a-real-password" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("allows logout POST without a CSRF token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("cookie", "medisync_session=stale-session");

    expect(response.status).toBe(200);
    expect(response.body.data.loggedOut).toBe(true);
  });

  it("denies unauthenticated patient access", async () => {
    const response = await request(app).get("/api/v1/patients");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("denies unauthenticated source access", async () => {
    const response = await request(app).get("/api/v1/sources/emr/encounters");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("denies unauthenticated CSV uploads", async () => {
    const response = await request(app)
      .post("/api/v1/integrations/batches")
      .attach("file", Buffer.from("source_record_id,source_patient_id\nr-1,p-1"), "demo.csv");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("denies unauthenticated CSRF renewal", async () => {
    const response = await request(app).post("/api/v1/auth/csrf");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("denies unauthenticated password changes", async () => {
    const response = await request(app)
      .post("/api/v1/auth/password")
      .send({ currentPassword: "old-password", newPassword: "new-password-long" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});
