import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../types';

interface StoredUser extends User {
  passwordHash: string;
}

// In-memory store — swap for Prisma/Postgres in production
const users = new Map<string, StoredUser>();
const emailIndex = new Map<string, string>(); // email -> id
const usernameIndex = new Map<string, string>(); // username -> id

export const userStore = {
  async create(email: string, username: string, password: string): Promise<User> {
    if (emailIndex.has(email)) throw new Error('Email already registered');
    if (usernameIndex.has(username)) throw new Error('Username already taken');

    const passwordHash = await bcrypt.hash(password, 12);
    const user: StoredUser = {
      id: uuidv4(),
      email,
      username,
      passwordHash,
    };
    users.set(user.id, user);
    emailIndex.set(email, user.id);
    usernameIndex.set(username, user.id);
    return { id: user.id, email: user.email, username: user.username };
  },

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const id = emailIndex.get(email);
    if (!id) return null;
    const user = users.get(id);
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    return { id: user.id, email: user.email, username: user.username };
  },

  findById(id: string): User | null {
    const u = users.get(id);
    if (!u) return null;
    return { id: u.id, email: u.email, username: u.username };
  },

  findByUsername(username: string): User | null {
    const id = usernameIndex.get(username);
    if (!id) return null;
    return this.findById(id);
  },
};
