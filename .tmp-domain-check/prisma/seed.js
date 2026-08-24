"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const users = ["Ayushi", "Carlos", "Joaquin"];
    for (const name of users) {
        await prisma.user.upsert({
            where: { name },
            update: {},
            create: { name },
        });
    }
    let project = await prisma.project.findFirst({
        where: { name: "HappyRobot Demo" },
    });
    if (!project) {
        project = await prisma.project.create({
            data: {
                name: "HappyRobot Demo",
                description: "Demo project for the task management domain model.",
                metadata: {
                    environment: "development",
                },
            },
        });
    }
    const designApi = await prisma.task.upsert({
        where: {
            id: "00000000-0000-0000-0000-000000000001",
        },
        update: {},
        create: {
            id: "00000000-0000-0000-0000-000000000001",
            projectId: project.id,
            title: "Design API",
            status: "DONE",
            priority: "HIGH",
            description: "Design the API contract for the demo application.",
            tags: ["design", "api"],
            customFields: { sprint: "A" },
            version: 1,
        },
    });
    const buildBackend = await prisma.task.upsert({
        where: { id: "00000000-0000-0000-0000-000000000002" },
        update: {},
        create: {
            id: "00000000-0000-0000-0000-000000000002",
            projectId: project.id,
            title: "Build Backend",
            status: "IN_PROGRESS",
            priority: "HIGH",
            description: "Implement the backend foundation.",
            tags: ["backend"],
            customFields: { sprint: "A" },
            version: 1,
        },
    });
    const buildFrontend = await prisma.task.upsert({
        where: { id: "00000000-0000-0000-0000-000000000003" },
        update: {},
        create: {
            id: "00000000-0000-0000-0000-000000000003",
            projectId: project.id,
            title: "Build Frontend",
            status: "TODO",
            priority: "MEDIUM",
            description: "Build the frontend shell and task interactions.",
            tags: ["frontend"],
            customFields: { sprint: "A" },
            version: 1,
        },
    });
    const ayushi = await prisma.user.findUniqueOrThrow({ where: { name: "Ayushi" } });
    const carlos = await prisma.user.findUniqueOrThrow({ where: { name: "Carlos" } });
    const joaquin = await prisma.user.findUniqueOrThrow({ where: { name: "Joaquin" } });
    await prisma.taskAssignee.upsert({
        where: { taskId_userId: { taskId: designApi.id, userId: ayushi.id } },
        update: {},
        create: { taskId: designApi.id, userId: ayushi.id },
    });
    await prisma.taskAssignee.upsert({
        where: { taskId_userId: { taskId: buildBackend.id, userId: carlos.id } },
        update: {},
        create: { taskId: buildBackend.id, userId: carlos.id },
    });
    await prisma.taskAssignee.upsert({
        where: { taskId_userId: { taskId: buildFrontend.id, userId: ayushi.id } },
        update: {},
        create: { taskId: buildFrontend.id, userId: ayushi.id },
    });
    await prisma.taskAssignee.upsert({
        where: { taskId_userId: { taskId: buildFrontend.id, userId: joaquin.id } },
        update: {},
        create: { taskId: buildFrontend.id, userId: joaquin.id },
    });
    await prisma.taskDependency.upsert({
        where: { taskId_dependsOnTaskId: { taskId: buildBackend.id, dependsOnTaskId: designApi.id } },
        update: {},
        create: { taskId: buildBackend.id, dependsOnTaskId: designApi.id },
    });
    const backendComment = await prisma.comment.upsert({
        where: {
            id: "00000000-0000-0000-0000-000000000010",
        },
        update: {},
        create: {
            id: "00000000-0000-0000-0000-000000000010",
            taskId: buildBackend.id,
            content: "I will review the API contract.",
            authorId: joaquin.id,
        },
    });
    console.log(JSON.stringify({
        project: project.name,
        users: users.length,
        tasks: [designApi.title, buildBackend.title, buildFrontend.title],
        dependency: {
            task: buildBackend.title,
            dependsOn: designApi.title,
        },
        comment: {
            id: backendComment.id,
            taskId: backendComment.taskId,
            authorId: backendComment.authorId,
        },
    }, null, 2));
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
