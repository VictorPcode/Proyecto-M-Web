require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function deleteTestUser() {
  try {
    await prisma.user.delete({ where: { email: 'test@example.com' } });
    console.log('Usuario test eliminado');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

deleteTestUser();
