

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let data = prisma.streams.findMany()
console.log(data);