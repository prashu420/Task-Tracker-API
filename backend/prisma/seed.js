/**
 * Idempotent demo seed. Runs on container start (and via `npm run seed` locally)
 * so a reviewer has known accounts immediately after `docker compose up`.
 *
 *   admin@acme.com   / Password123!   (ADMIN)
 *   manager@acme.com / Password123!   (MANAGER)
 *   member@acme.com  / Password123!   (MEMBER)
 *
 * All upserts use fixed ids/emails, so re-running never duplicates data.
 */
const { PrismaClient, Role, Priority, TaskStatus } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

const PASSWORD = 'Password123!';
const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const TASK1_ID = '33333333-3333-3333-3333-333333333333';
const TASK2_ID = '44444444-4444-4444-4444-444444444444';

async function main() {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });

  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: 'Acme Inc' },
  });

  const roles = [
    { email: 'admin@acme.com', name: 'Admin User', role: Role.ADMIN },
    { email: 'manager@acme.com', name: 'Manager User', role: Role.MANAGER },
    { email: 'member@acme.com', name: 'Member User', role: Role.MEMBER },
  ];

  const users = {};
  for (const r of roles) {
    users[r.role] = await prisma.user.upsert({
      where: { email: r.email },
      update: {},
      create: { ...r, passwordHash, organizationId: ORG_ID },
    });
  }

  await prisma.project.upsert({
    where: { id: PROJECT_ID },
    update: {},
    create: {
      id: PROJECT_ID,
      name: 'Onboarding',
      description: 'Demo project seeded for review',
      organizationId: ORG_ID,
    },
  });

  await prisma.task.upsert({
    where: { id: TASK1_ID },
    update: {},
    create: {
      id: TASK1_ID,
      title: 'Set up local environment',
      priority: Priority.HIGH,
      status: TaskStatus.TODO,
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      assigneeId: users[Role.MEMBER].id,
    },
  });

  await prisma.task.upsert({
    where: { id: TASK2_ID },
    update: {},
    create: {
      id: TASK2_ID,
      title: 'Write API documentation',
      priority: Priority.MEDIUM,
      status: TaskStatus.IN_PROGRESS,
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      assigneeId: users[Role.MEMBER].id,
    },
  });

  console.log(
    'Seed complete. Demo logins (password "Password123!"): admin@acme.com, manager@acme.com, member@acme.com',
  );
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
