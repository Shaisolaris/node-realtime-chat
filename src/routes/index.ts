import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { userStore } from '../services/user.service';
import { signToken } from '../utils/jwt';
import { connectionManager } from '../services/connection.service';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Needs upper, lower, number'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = registerSchema.parse(req.body);
    const user = await userStore.create(body.email, body.username, body.password);
    const token = signToken(user);
    res.status(201).json({ success: true, data: { user, token } });
  } catch (err) {
    const message = err instanceof z.ZodError
      ? err.issues.map((i) => i.message).join(', ')
      : (err as Error).message;
    res.status(400).json({ success: false, error: message });
  }
});

router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await userStore.verifyPassword(body.email, body.password);
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }
    const token = signToken(user);
    res.json({ success: true, data: { user, token } });
  } catch (err) {
    const message = err instanceof z.ZodError
      ? err.issues.map((i) => i.message).join(', ')
      : (err as Error).message;
    res.status(400).json({ success: false, error: message });
  }
});

router.get('/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    connections: connectionManager.getConnectionCount(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
