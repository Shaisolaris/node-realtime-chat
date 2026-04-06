#!/bin/bash
set -e
echo "🚀 Setting up node-realtime-chat"
npm install
docker compose up -d 2>/dev/null || echo "⚠️ Redis not started (optional — works without it for single instance)"
echo ""
echo "✅ Setup complete!"
echo "Run: npm run dev"
echo "Open: http://localhost:3000"
echo "Open 2 browser tabs to test real-time chat"
