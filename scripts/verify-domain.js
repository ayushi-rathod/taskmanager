const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function expectCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const projectCount = await prisma.project.count();
  await expectCondition(projectCount >= 1, 'Expected at least one project.');

  const userCount = await prisma.user.count();
  await expectCondition(userCount >= 3, 'Expected at least three users.');

  const project = await prisma.project.findFirst({
    include: {
      tasks: {
        include: {
          assignees: { include: { user: true } },
          comments: { include: { author: true } },
          dependencies: { include: { dependsOn: true } },
        },
      },
    },
  });

  await expectCondition(Boolean(project), 'Expected a seeded project to exist.');

  const tasks = project?.tasks ?? [];
  await expectCondition(tasks.length >= 3, 'Expected at least three seeded tasks.');

  const buildBackend = tasks.find((task) => task.title === 'Build Backend');
  const designApi = tasks.find((task) => task.title === 'Design API');
  const buildFrontend = tasks.find((task) => task.title === 'Build Frontend');

  await expectCondition(Boolean(buildBackend), 'Expected Build Backend task to exist.');
  await expectCondition(Boolean(designApi), 'Expected Design API task to exist.');
  await expectCondition(Boolean(buildFrontend), 'Expected Build Frontend task to exist.');

  await expectCondition(
    buildBackend?.dependencies.some((dep) => dep.dependsOn.title === 'Design API'),
    'Expected Build Backend to depend on Design API.'
  );
  await expectCondition((buildBackend?.assignees.length ?? 0) >= 1, 'Expected Build Backend to have an assignee.');
  await expectCondition((buildBackend?.comments.length ?? 0) >= 1, 'Expected Build Backend to have a comment.');
  await expectCondition(Boolean(buildBackend?.comments[0]?.author?.name), 'Expected comment author to resolve.');
  await expectCondition(buildBackend?.version === 1, 'Expected version default to 1.');
  await expectCondition(buildBackend?.status === 'IN_PROGRESS', 'Expected status default to IN_PROGRESS for seeded task.');
  await expectCondition(buildFrontend?.priority === 'MEDIUM', 'Expected priority default to MEDIUM.');

  console.log('Domain model verification passed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
