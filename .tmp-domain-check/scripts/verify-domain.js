"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function expect(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
async function main() {
    const projectCount = await prisma.project.count();
    await expect(projectCount >= 1, "Expected at least one project.");
    const userCount = await prisma.user.count();
    await expect(userCount >= 3, "Expected at least three users.");
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
    await expect(project, "Expected a seeded project to exist.");
    const tasks = project?.tasks ?? [];
    await expect(tasks.length >= 3, "Expected at least three seeded tasks.");
    const buildBackend = tasks.find((task) => task.title === "Build Backend");
    await expect(buildBackend, "Expected Build Backend task to exist.");
    const designApi = tasks.find((task) => task.title === "Design API");
    await expect(designApi, "Expected Design API task to exist.");
    const buildFrontend = tasks.find((task) => task.title === "Build Frontend");
    await expect(buildFrontend, "Expected Build Frontend task to exist.");
    await expect(buildBackend?.dependencies.some((dep) => dep.dependsOn.title === "Design API"), "Expected Build Backend to depend on Design API.");
    await expect(buildBackend?.assignees.length ?? 0 >= 1, "Expected Build Backend to have an assignee.");
    await expect((buildBackend?.comments.length ?? 0) >= 1, "Expected Build Backend to have a comment.");
    await expect(Boolean(buildBackend?.comments[0]?.author?.name), "Expected comment author to resolve.");
    await expect(buildBackend?.version === 1, "Expected version default to 1.");
    await expect(buildBackend?.status === "IN_PROGRESS", "Expected status default to IN_PROGRESS for seeded task.");
    await expect(buildFrontend?.priority === "MEDIUM", "Expected priority default to MEDIUM.");
    console.log("Domain model verification passed");
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
