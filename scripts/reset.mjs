import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
await p.doctorVisit.deleteMany();
await p.temperatureReading.deleteMany();
const del = await p.patient.deleteMany();
const remaining = await p.patient.count();
console.log("deleted patients:", del.count, "| remaining patients:", remaining);
await p.$disconnect();
