export const DEMO_MODE = !process.env.REDIS_URL;
export const DEMO_ROOMS = ["general", "tech", "random"];
export const DEMO_MESSAGES = [
  { username: "Sarah", content: "Hey everyone!", room: "general", timestamp: Date.now() },
  { username: "James", content: "Working on the new API", room: "tech", timestamp: Date.now() },
];
