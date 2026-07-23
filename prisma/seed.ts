import { PrismaClient } from "@prisma/client";
import { runSeed } from "../src/lib/seed";

const prisma = new PrismaClient();

runSeed(prisma)
  .then((result) => {
    console.log(`✅ ${result.message}`);
    console.log(`   Logins (password: ${result.password}):`);
    for (const l of result.logins) {
      console.log(`   - ${l.email}  (${l.role})`);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
