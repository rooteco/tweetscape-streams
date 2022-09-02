// import type { Password, User } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "~/db.server";

export type { users } from "@prisma/client";
import type { users } from "@prisma/client";

export async function getUserById(id: users["id"]) {
  return prisma.users.findUnique({ where: { id } });
}

export async function getUserByUsernameDB(username: users["username"]) {
  return prisma.users.findUnique({ where: { username } });
}

// export async function getUserByEmail(email: users["email"]) {
//   return prisma.users.findUnique({ where: { email } });
// }

export async function createUser(
  data: users,
) {
  data.username = data.username.toLowerCase();
  return prisma.users.create({
    data: data
  });
}

export async function getUsersFollowedById(id: string) {
  return prisma.follows.findMany({
    where: { followerId: id },
    include: {
      following: true,
    }

  });
}

// export async function createUser(email: users["email"], password: string) {
//   const hashedPassword = await bcrypt.hash(password, 10);

//   return prisma.users.create({
//     data: {
//       email,
//       password: {
//         create: {
//           hash: hashedPassword,
//         },
//       },
//     },
//   });
// }


export async function deleteUserByEmail(email: users["email"]) {
  return prisma.users.delete({ where: { email } });
}

export async function verifyLogin(
  email: User["email"],
  password: Password["hash"]
) {
  const userWithPassword = await prisma.users.findUnique({
    where: { email },
    include: {
      password: true,
    },
  });

  if (!userWithPassword || !userWithPassword.password) {
    return null;
  }

  const isValid = await bcrypt.compare(
    password,
    userWithPassword.password.hash
  );

  if (!isValid) {
    return null;
  }

  const { password: _password, ...userWithoutPassword } = userWithPassword;

  return userWithoutPassword;
}
