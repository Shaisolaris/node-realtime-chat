import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env';
import { socketAuthMiddleware, AuthSocket } from './middleware/socketAuth';
import { registerSocketHandlers } from './handlers/socket.handler';
import routes from './routes/index';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// HTTP middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50kb' }));
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

// HTTP routes
app.use('/api', routes);

// Socket.io auth
io.use((socket, next) => socketAuthMiddleware(socket, next));

// Socket.io connections
io.on('connection', (socket) => {
  registerSocketHandlers(io, socket as AuthSocket);
});

export { httpServer, io };
