import "dotenv/config";
import prisma from "./src/prisma";

console.log("DATABASE_URL:", process.env.DATABASE_URL);
console.log("JWT_SECRET:", process.env.JWT_SECRET);

async function test() {
  try {
    console.log("Testing Prisma connection...");
    const users = await prisma.user.findMany({ take: 1 });
    console.log("Prisma connected successfully");
    console.log("Users found:", users.length);
    process.exit(0);
  } catch (error) {
    console.error("Prisma connection failed:");
    console.error(error);
    process.exit(1);
  }
}

test();
