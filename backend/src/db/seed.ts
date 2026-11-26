import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { getDatabase } from "./client.js";
import {
  emrEncounters,
  insurancePolicies,
  invoices,
  labOrders,
  labResults,
  permissions,
  patients,
  rolePermissions,
  roles,
  sourcePatientIdentifiers,
  sourceSystems,
  userRoles,
  users,
} from "./schema.js";
import { uuid } from "../auth/tokens.js";

const roleDefinitions = [
  {
    name: "System Administrator",
    description: "Full synthetic system administration.",
    permissions: [
      "users.manage",
      "patients.read",
      "patients.write",
      "emr.read",
      "emr.write",
      "lis.read",
      "lis.write",
      "billing.read",
      "billing.write",
      "insurance.read",
      "insurance.write",
      "integrations.manage",
      "quality.manage",
      "audit.read",
      "reports.export",
    ],
  },
  {
    name: "Health Records Staff",
    description: "Synthetic patient and EMR access.",
    permissions: ["patients.read", "patients.write", "emr.read", "emr.write", "quality.manage"],
  },
  {
    name: "Laboratory Staff",
    description: "Synthetic LIS access.",
    permissions: ["patients.read", "lis.read", "lis.write", "integrations.manage", "quality.manage"],
  },
  {
    name: "Billing Staff",
    description: "Synthetic billing access.",
    permissions: ["patients.read", "billing.read", "billing.write", "quality.manage"],
  },
  {
    name: "Insurance Staff",
    description: "Synthetic insurance access.",
    permissions: ["patients.read", "insurance.read", "insurance.write", "quality.manage"],
  },
  {
    name: "Auditor",
    description: "Read-only audit and reporting access.",
    permissions: ["patients.read", "audit.read", "reports.export"],
  },
] as const;

async function seed() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed the development database.");
  }

  const db = getDatabase();

  for (const roleDefinition of roleDefinitions) {
    let [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, roleDefinition.name))
      .limit(1);

    if (!role) {
      role = {
        id: uuid(),
        name: roleDefinition.name,
        description: roleDefinition.description,
      };
      await db.insert(roles).values(role);
    }

    for (const permissionName of roleDefinition.permissions) {
      let [permission] = await db
        .select()
        .from(permissions)
        .where(eq(permissions.name, permissionName))
        .limit(1);

      if (!permission) {
        permission = {
          id: uuid(),
          name: permissionName,
          description: null,
        };
        await db.insert(permissions).values(permission);
      }

      await db
        .insert(rolePermissions)
        .values({ roleId: role.id, permissionId: permission.id })
        .onConflictDoNothing();
    }
  }

  const sourceDefinitions = [
    { code: "SIM_PATIENT", name: "Simulated Patient Registry", sourceType: "PATIENT" },
    { code: "SIM_EMR", name: "Simulated EMR", sourceType: "EMR" },
    { code: "SIM_LIS", name: "Simulated LIS", sourceType: "LIS" },
    { code: "SIM_BILLING", name: "Simulated Billing", sourceType: "BILLING" },
    { code: "SIM_INSURANCE", name: "Simulated Insurance", sourceType: "INSURANCE" },
  ] as const;
  const sourceIds: Record<string, string> = {};

  for (const definition of sourceDefinitions) {
    let [source] = await db
      .select()
      .from(sourceSystems)
      .where(eq(sourceSystems.code, definition.code))
      .limit(1);
    if (!source) {
      source = {
        id: uuid(),
        code: definition.code,
        name: definition.name,
        sourceType: definition.sourceType,
        simulated: true,
        active: true,
      };
      await db.insert(sourceSystems).values(source);
    }
    sourceIds[definition.sourceType] = source.id;
  }

  let [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.internalCode, "DEMO-001"))
    .limit(1);
  if (!patient) {
    patient = {
      id: uuid(),
      internalCode: "DEMO-001",
      firstName: "Alex",
      lastName: "Sample",
      dateOfBirth: "1988-04-12",
      sex: "Male",
      active: true,
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.insert(patients).values(patient);
  }

  const mappings = [
    ["EMR", "EMR-DEMO-001"],
    ["LIS", "LIS-DEMO-001"],
    ["BILLING", "BILL-DEMO-001"],
    ["INSURANCE", "INS-DEMO-001"],
  ] as const;
  for (const [sourceType, sourcePatientId] of mappings) {
    await db
      .insert(sourcePatientIdentifiers)
      .values({
        id: uuid(),
        sourceSystemId: sourceIds[sourceType],
        patientId: patient.id,
        sourcePatientId,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(emrEncounters)
    .values({
      id: uuid(),
      patientId: patient.id,
      sourceSystemId: sourceIds.EMR,
      sourceRecordId: "EMR-E-001",
      encounterType: "Synthetic outpatient encounter",
      encounterAt: new Date("2026-10-15T09:30:00Z"),
      status: "completed",
      sourceVersion: "1",
    })
    .onConflictDoNothing();

  let [labOrder] = await db
    .select()
    .from(labOrders)
    .where(eq(labOrders.sourceRecordId, "LIS-O-001"))
    .limit(1);
  if (!labOrder) {
    labOrder = {
      id: uuid(),
      patientId: patient.id,
      sourceSystemId: sourceIds.LIS,
      sourceRecordId: "LIS-O-001",
      testCode: "SIM-CBC",
      testName: "Synthetic complete blood count",
      specimenCollectedAt: new Date("2026-10-16T08:00:00Z"),
      sourceStatus: "final",
      importedAt: new Date(),
    };
    await db.insert(labOrders).values(labOrder);
  }
  await db
    .insert(labResults)
    .values({
      id: uuid(),
      labOrderId: labOrder.id,
      sourceRecordId: "LIS-R-001",
      valueText: "Demo value",
      unitText: "demo-unit",
      resultAt: new Date("2026-10-16T10:15:00Z"),
      sourceStatus: "final",
    })
    .onConflictDoNothing();

  await db
    .insert(invoices)
    .values({
      id: uuid(),
      patientId: patient.id,
      sourceSystemId: sourceIds.BILLING,
      sourceRecordId: "BILL-I-001",
      invoiceNumber: "DEMO-INV-001",
      currency: "PHP",
      totalAmount: "1250.00",
      paidAmount: "1250.00",
      balanceAmount: "0.00",
      status: "paid",
      issuedAt: new Date("2026-10-15T12:00:00Z"),
    })
    .onConflictDoNothing();

  await db
    .insert(insurancePolicies)
    .values({
      id: uuid(),
      patientId: patient.id,
      sourceSystemId: sourceIds.INSURANCE,
      sourceRecordId: "INS-P-001",
      payerName: "Synthetic Demo Payer",
      memberReference: "DEMO-MEMBER-001",
      coverageStatus: "imported",
      coverageStart: "2026-01-01",
      coverageEnd: "2026-12-31",
    })
    .onConflictDoNothing();

  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    return;
  }

  const email = env.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return;
  }

  const [adminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, "System Administrator"))
    .limit(1);
  if (!adminRole) {
    throw new Error("System Administrator role was not created.");
  }

  const adminId = uuid();
  await db.insert(users).values({
    id: adminId,
    email,
    displayName: env.SEED_ADMIN_NAME,
    passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12),
    active: true,
  });
  await db.insert(userRoles).values({
    userId: adminId,
    roleId: adminRole.id,
  });
}

seed()
  .then(() => console.log(JSON.stringify({ seeded: true })))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exitCode = 1;
  });
