/**
 * Provision the shared StageLab universe.
 *
 *   npm run db:seed:stagelab
 *
 * The app also provisions it lazily on first read, so this script exists for
 * deployments that would rather do it up front — and for refreshing the
 * bundled prices after editing lib/stagelab/seed-data.ts.
 */
import { syncUniverse } from "../lib/stagelab/bootstrap";
import { prisma } from "../lib/prisma";

async function main() {
  const count = await syncUniverse();
  console.log(`StageLab universe synced: ${count} symbols`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
