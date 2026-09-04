import { getPrisma } from "../src/prisma.js";

async function main() {
  const prisma = getPrisma();

  const categories = [
    "Account and Access",
    "Hardware",
    "Software",
    "Network",
  ];

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true },
      create: {
        name,
        isActive: true,
      },
    });
  }

  const relatedSystems = [
    "Email",
    "Campus Wi-Fi",
    "VPN",
    "LEB2 App",
    "Grade Submission App",
    "Printer",
    "Corporate Laptop",
  ];

  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true },
      create: {
        name,
        isActive: true,
      },
    });
  }

  const developmentRequesters = [
    {
      name: "Jennifer Anderson",
      email: "jennifer.anderson@example.com",
      isActive: true,
    },
    {
      name: "Alex Morgan",
      email: "alex.morgan@example.com",
      isActive: true,
    },
    {
      name: "Priya Shah",
      email: "priya.shah@example.com",
      isActive: true,
    },
    {
      name: "Daniel Kim",
      email: "daniel.kim@example.com",
      isActive: true,
    },
    {
      name: "Emily Carter",
      email: "emily.carter@example.com",
      isActive: false,
    },
  ];

  for (const requester of developmentRequesters) {
    await prisma.developmentRequester.upsert({
      where: {
        email: requester.email.toLowerCase(),
      },
      update: {
        name: requester.name,
        isActive: requester.isActive,
      },
      create: {
        name: requester.name,
        email: requester.email.toLowerCase(),
        isActive: requester.isActive,
      },
    });
  }

  console.log(
    "Seeded Categories, Related Systems, and Development Requesters.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });